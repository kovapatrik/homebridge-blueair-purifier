import { Logger } from 'homebridge';
import { Region } from '../platformUtils';
import GigyaApi from './GigyaApi';
import {
  BLUEAIR_API_TIMEOUT,
  BlueAirDeviceStatusResponse,
  BlueAirTelemetryResponse,
  LOGIN_EXPIRATION,
  TELEMETRY_CACHE_TTL,
  getAwsConfig,
} from './Consts';
import { Mutex } from 'async-mutex';

type BlueAirDeviceDiscovery = {
  mac: string;
  'mcu-firmware': string;
  name: string;
  type: string;
  'user-type': string;
  uuid: string;
  'wifi-firmware': string;
};

export type FullBlueAirDeviceState = BlueAirDeviceState & BlueAirDeviceSensorData;

export type BlueAirDeviceState = {
  cfv?: string;
  germshield?: boolean;
  gsnm?: boolean;
  standby?: boolean;
  fanspeed?: number;
  childlock?: boolean;
  nightmode?: boolean;
  mfv?: string;
  automode?: boolean;
  apsubmode?: number;
  ofv?: string;
  brightness?: number;
  safetyswitch?: boolean;
  filterusage?: number;
  disinfection?: boolean;
  disinftime?: number;
  [key: string]: string | number | boolean | undefined;
};

export type BlueAirDeviceSensorData = {
  fanspeed?: number;
  hcho?: number;
  humidity?: number;
  pm1?: number;
  pm10?: number;
  pm2_5?: number;
  temperature?: number;
  voc?: number;
  [key: string]: string | number | boolean | undefined;
};

export type BlueAirDeviceStatus = {
  id: string;
  name: string;
  sku: string;
  state: BlueAirDeviceState;
  sensorData: BlueAirDeviceSensorData;
};

type BlueAirSetStateBody = {
  n: string;
  v?: number;
  vb?: boolean;
};

// The readings the HomeKit AirQuality calculation is derived from.
export const AQI_SENSOR_KEYS: (keyof BlueAirDeviceSensorData)[] = ['pm2_5', 'pm10', 'voc'];

export const BlueAirDeviceSensorDataMap: Record<string, keyof BlueAirDeviceSensorData> = {
  fsp0: 'fanspeed',
  hcho: 'hcho',
  h: 'humidity',
  pm1: 'pm1',
  pm10: 'pm10',
  pm2_5: 'pm2_5',
  t: 'temperature',
  tVOC: 'voc',
};

export default class BlueAirAwsApi {
  private readonly gigyaApi: GigyaApi;

  private last_login: number;

  private mutex: Mutex;

  private accessToken: string;
  private idToken: string;
  private userId: string;
  private blueAirApiUrl: string;

  private telemetryCache: Map<string, { fetchedAt: number; data: BlueAirDeviceSensorData }>;

  // Sensor keys each device has delivered in a snapshot at least once.
  private snapshotSensors: Map<string, Set<string>>;

  constructor(
    username: string,
    password: string,
    region: Region,
    private readonly logger: Logger,
    cloudRegion: Region = region,
  ) {
    const config = getAwsConfig(cloudRegion);
    this.blueAirApiUrl = `https://${config.restApiId}.execute-api.${config.awsRegion}.amazonaws.com/prod/c`;

    this.mutex = new Mutex();

    this.logger.debug(`Creating BlueAir API instance with config: ${JSON.stringify(config)} and username: ${username}\
    and auth region: ${region}, cloud region: ${cloudRegion}`);

    this.gigyaApi = new GigyaApi(username, password, region, logger);

    this.last_login = 0;
    this.accessToken = '';
    this.idToken = '';
    this.userId = '';
    this.telemetryCache = new Map();
    this.snapshotSensors = new Map();
  }

  async login(): Promise<void> {
    this.logger.debug('Logging in...');

    const { token, secret } = await this.gigyaApi.getGigyaSession();
    const { jwt } = await this.gigyaApi.getGigyaJWT(token, secret);
    const { accessToken, idToken, userId } = await this.getAwsAccessToken(jwt);

    this.last_login = Date.now();
    this.accessToken = accessToken;
    this.idToken = idToken;
    this.userId = userId;

    this.logger.debug('Logged in');
  }

  async checkTokenExpiration(): Promise<void> {
    if (LOGIN_EXPIRATION < Date.now() - this.last_login) {
      this.logger.debug('Token expired, logging in again');
      return await this.login();
    }
    return;
  }

  async getDevices(): Promise<BlueAirDeviceDiscovery[]> {
    await this.checkTokenExpiration();

    this.logger.debug('Getting devices...');

    const response = await this.apiCall('/registered-devices', undefined, 'GET');

    if (!response.devices) {
      throw new Error('getDevices error: no devices in response');
    }

    const devices = response.devices as BlueAirDeviceDiscovery[];
    return devices;
  }

  async getDeviceStatus(accountUuid: string, uuids: string[]): Promise<BlueAirDeviceStatus[]> {
    await this.checkTokenExpiration();

    const body = {
      deviceconfigquery: uuids.map((uuid) => ({ id: uuid, r: { r: ['sensors'] } })),
      includestates: true,
      eventsubscription: {
        include: uuids.map((uuid) => ({ filter: { o: `= ${uuid}` } })),
      },
    };
    const userId = this.userId || accountUuid;
    const data = await this.apiCall<BlueAirDeviceStatusResponse>(`/${userId}/r/initial`, body);

    if (!data.deviceInfo) {
      throw new Error('getDeviceStatus error: no deviceInfo in response');
    }

    const deviceStatuses: BlueAirDeviceStatus[] = data.deviceInfo.map((device) => {
      return {
        id: device.id,
        name: device.configuration.di.name,
        sku: device.configuration.di.sku,
        sensorData: device.sensordata.reduce((acc, sensor) => {
          const key = BlueAirDeviceSensorDataMap[sensor.n];
          if (key) {
            acc[key] = sensor.v;
          }
          return acc;
        }, {} as BlueAirDeviceSensorData),
        state: device.states.reduce((acc, state) => {
          if (state.v !== undefined) {
            acc[state.n] = state.v;
          } else if (state.vb !== undefined) {
            acc[state.n] = state.vb;
          } else {
            this.logger.warn(`getDeviceStatus: unknown state ${JSON.stringify(state)}`);
          }
          return acc;
        }, {} as BlueAirDeviceState),
      };
    });

    // `/r/initial` is a snapshot of whatever the device last pushed, and some models
    // (Blue 40/SP4i) never populate `sensordata` at all. Fill in the air quality sensors
    // a device advertises but has never once delivered, otherwise HomeKit reads them as
    // a hard 0 forever.
    //
    // Sensors the snapshot has delivered before are deliberately left alone. When one of
    // those is absent from a poll BlueAirDevice keeps the last value, which is fresher
    // than a telemetry bucket that can be up to 5 minutes old.
    for (const status of deviceStatuses) {
      const seenSensors = this.snapshotSensors.get(status.id) ?? new Set<string>();
      for (const key of Object.keys(status.sensorData)) {
        seenSensors.add(key);
      }
      this.snapshotSensors.set(status.id, seenSensors);

      const deviceInfo = data.deviceInfo.find((d) => d.id === status.id);
      const advertisedSensors = this.getAvailableSensorNames(deviceInfo);

      const undeliveredAqiSensor = advertisedSensors.some((name) => {
        const key = BlueAirDeviceSensorDataMap[name];
        return key !== undefined && AQI_SENSOR_KEYS.includes(key) && !seenSensors.has(key as string);
      });

      if (!undeliveredAqiSensor) {
        continue;
      }

      const telemetry = await this.getCachedTelemetry(accountUuid, status.id, advertisedSensors);
      const backfilled: BlueAirDeviceSensorData = {};

      for (const [key, value] of Object.entries(telemetry)) {
        if (!seenSensors.has(key)) {
          status.sensorData[key] = value;
          backfilled[key] = value;
        }
      }

      if (Object.keys(backfilled).length > 0) {
        this.logger.debug(`[${status.name}] Sensor data backfilled from telemetry: ${JSON.stringify(backfilled)}`);
      }
    }

    return deviceStatuses;
  }

  /**
   * Telemetry for a device, reused for {@link TELEMETRY_CACHE_TTL} so that a 15 second
   * polling interval does not turn into a telemetry call every 15 seconds. On failure
   * the previous readings are kept and the next attempt waits out the same interval,
   * which stops a rate limited account from retrying on every poll.
   */
  private async getCachedTelemetry(accountUuid: string, uuid: string, sensorNames: string[]): Promise<BlueAirDeviceSensorData> {
    const cached = this.telemetryCache.get(uuid);
    if (cached && Date.now() - cached.fetchedAt < TELEMETRY_CACHE_TTL) {
      return cached.data;
    }

    if (sensorNames.length === 0) {
      return {};
    }

    try {
      const data = await this.getDeviceTelemetry(accountUuid, uuid, sensorNames);
      this.telemetryCache.set(uuid, { fetchedAt: Date.now(), data });
      return data;
    } catch (error) {
      this.logger.debug(`Telemetry fetch failed for ${uuid}: ${(error as Error).message}`);
      this.telemetryCache.set(uuid, { fetchedAt: Date.now(), data: cached?.data ?? {} });
      return cached?.data ?? {};
    }
  }

  private getAvailableSensorNames(deviceInfo?: BlueAirDeviceStatusResponse['deviceInfo'][0]): string[] {
    if (!deviceInfo?.configuration?.ds) {
      return [];
    }
    const knownSensors = new Set(Object.keys(BlueAirDeviceSensorDataMap));
    const available = new Set<string>();
    for (const [key, entry] of Object.entries(deviceInfo.configuration.ds)) {
      if (knownSensors.has(key)) {
        available.add(key);
      }
      if (entry.sn) {
        for (const s of entry.sn) {
          if (knownSensors.has(s)) {
            available.add(s);
          }
        }
      }
    }
    return Array.from(available);
  }

  async getDeviceTelemetry(accountUuid: string, uuid: string, sensorNames: string[]): Promise<BlueAirDeviceSensorData> {
    const now = Math.floor(Date.now() / 1000);
    const oneHourAgo = now - 3600;

    const params = new URLSearchParams();
    params.append('did', uuid);
    params.append('from', oneHourAgo.toString());
    params.append('to', now.toString());
    for (const sensor of sensorNames) {
      params.append('s', sensor);
    }

    const data = await this.apiCall<BlueAirTelemetryResponse>(
      `/${accountUuid}/r/telemetry/5m/historical?${params.toString()}`,
      undefined,
      'GET',
    );

    if (!Array.isArray(data) || data.length === 0) {
      return {};
    }

    const entry = data.find((e) => e.did === uuid) ?? data[0];
    if (!entry.datapoints || entry.datapoints.length === 0) {
      return {};
    }

    const sensorData: BlueAirDeviceSensorData = {};

    // Datapoints run oldest to newest and each sensor is aggregated on its own, so the
    // newest row is routinely null for sensors that report less often than others.
    // Reading only that row dropped those sensors entirely; walk back per column
    // instead and take the most recent value each one actually has.
    for (let i = 0; i < entry.sensors.length; i++) {
      const key = BlueAirDeviceSensorDataMap[entry.sensors[i]];
      if (!key) {
        continue;
      }

      for (let row = entry.datapoints.length - 1; row >= 0; row--) {
        // First element is the timestamp, sensor values start at index 1
        const rawValue = entry.datapoints[row][i + 1];
        if (rawValue === null || rawValue === undefined || rawValue === '') {
          continue;
        }
        const value = parseFloat(rawValue);
        if (!isNaN(value)) {
          sensorData[key] = value;
          break;
        }
      }
    }

    return sensorData;
  }

  async setDeviceStatus(uuid: string, state: string, value: number | boolean): Promise<void> {
    await this.checkTokenExpiration();

    // this.logger.debug(`setDeviceStatus: ${uuid} ${state} ${value}`);

    const body: BlueAirSetStateBody = {
      n: state,
    };

    if (typeof value === 'number') {
      body.v = value;
    } else if (typeof value === 'boolean') {
      body.vb = value;
    } else {
      throw new Error(`setDeviceStatus: unknown value type ${typeof value}`);
    }

    // const response = await this.apiCall(`/${uuid}/a/${state}`, body);
    await this.apiCall(`/${uuid}/a/${state}`, body);
    // this.logger.debug(`setDeviceStatus response: ${JSON.stringify(response)}`);
  }

  private async getAwsAccessToken(jwt: string): Promise<{ accessToken: string; idToken: string; userId: string }> {
    this.logger.debug('Getting AWS access token...');

    const response = await this.apiCall('/login', undefined, 'POST', {
      Authorization: `Bearer ${jwt}`,
      idtoken: jwt,
    });

    if (!response.access_token) {
      throw new Error(`AWS access token error: ${JSON.stringify(response)}`);
    }

    const accessToken = response.access_token as string;
    const tokenPayload = JSON.parse(Buffer.from(accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()) as {
      username?: string;
    };

    this.logger.debug('AWS access token received');
    return {
      accessToken,
      idToken: response.id_token ?? jwt,
      userId: tokenPayload.username ?? '',
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async apiCall<T = any>(url: string, data?: string | object, method = 'POST', headers?: object, retries = 3): Promise<T> {
    const release = await this.mutex.acquire();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), BLUEAIR_API_TIMEOUT);
    this.logger.debug(`[AWS] apiCall request: ${method} ${this.blueAirApiUrl}${url}, body: ${JSON.stringify(data)}`);
    try {
      const response = await fetch(`${this.blueAirApiUrl}${url}`, {
        method: method,
        headers: {
          Accept: '*/*',
          Connection: 'keep-alive',
          'Accept-Encoding': 'gzip, deflate, br',
          Authorization: `Bearer ${this.accessToken}`,
          idtoken: this.idToken || this.accessToken,
          ...headers,
        },
        body: JSON.stringify(data),
        signal: controller.signal,
      });
      const json = await response.json();
      this.logger.debug(`[AWS] apiCall response: ${response.status} ${response.statusText}, body: ${JSON.stringify(json)}`);
      if (response.status !== 200) {
        throw new Error(`API call error with status ${response.status}: ${response.statusText}, ${JSON.stringify(json)}`);
      }
      return json as T;
    } catch (error) {
      if (retries > 0) {
        return this.apiCall(url, data, method, headers, retries - 1);
      } else {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error(`API call failed after ${3 - retries} retries with timeout.`);
        } else {
          throw new Error(`API call failed after ${3 - retries} retries with error: ${error}`);
        }
      }
    } finally {
      clearTimeout(timeout);
      release();
    }
  }
}
