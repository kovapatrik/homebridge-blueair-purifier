import { Logger } from 'homebridge';
import { RegionMap } from '../platformUtils';
import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { GigyaApi } from './GigyaApi';
import { BLUEAIR_API_TIMEOUT, BLUEAIR_CONFIG, BlueAirDeviceStatusResponse, LOGIN_EXPIRATION } from './Consts';

type BlueAirDeviceDiscovery = {
  mac: string;
  'mcu-firmware': string;
  name: string;
  type: string;
  'user-type': string;
  uuid: string;
  'wifi-firmware': string;
};

type BlueAirDeviceState = {
  cfv?: string;
  germshield?: boolean;
  gsnm?: boolean;
  standby?: boolean;
  fanspeed?: number;
  childlock?: boolean;
  nightmode?: boolean;
  mfv?: string;
  automode?: boolean;
  ofv?: string;
  brightness?: number;
  safetyswitch?: boolean;
  filterusage?: number;
  disinfection?: boolean;
  disinftime?: number;
};

type BlueAirDeviceSensorData = {
  fanspeed?: number;
  hcho?: number;
  humidity?: number;
  pm1?: number;
  pm10?: number;
  pm25?: number;
  temperature?: number;
  voc?: number;
};

type BlueAirDeviceStatus = {
  id: string;
  name: string;
  state: BlueAirDeviceState;
  sensorData: BlueAirDeviceSensorData;
};

export const BlueAirDeviceSensorDataMap = {
  fsp0: 'fanspeed',
  hcho: 'hcho',
  h: 'humidity',
  pm1: 'pm1',
  pm10: 'pm10',
  pm2_5: 'pm25',
  t: 'temperature',
  tVOC: 'voc',
};

export class BlueAirAwsApi {

  private readonly gigyaApi: GigyaApi;
  private readonly blueairAxios: AxiosInstance;

  private last_login: number;

  constructor(
    username: string,
    password: string,
    region: string,
    private readonly logger: Logger,
  ) {
    const config = BLUEAIR_CONFIG[RegionMap[region]].awsConfig;

    this.gigyaApi = new GigyaApi(username, password, region, logger);
    this.blueairAxios = axios.create({
      baseURL: `https://${config.restApiId}.execute-api.${config.awsRegion}.amazonaws.com/prod/c`,
      headers: {
        'Accept': '*/*',
        'Connection': 'keep-alive',
        'Accept-Encoding': 'gzip, deflate, br',
      },
      timeout: BLUEAIR_API_TIMEOUT,
    });

    this.last_login = 0;
  }

  async login(): Promise<void> {

    const { token, secret } = await this.gigyaApi.getGigyaSession();
    const { jwt } = await this.gigyaApi.getGigyaJWT(token, secret);
    const { accessToken } = await this.getAwsAccessToken(jwt);

    this.last_login = Date.now();
    this.blueairAxios.defaults.headers['Authorization'] = `Bearer ${accessToken}`;
    this.blueairAxios.defaults.headers['idtoken'] = accessToken;
  }

  async checkTokenExpiration(): Promise<void> {
    if (LOGIN_EXPIRATION < Date.now() - this.last_login) {
      return await this.login();
    }
    return;
  }

  async getDevices(): Promise<BlueAirDeviceDiscovery[]> {
    await this.checkTokenExpiration();

    const response = await this.apiCall('/registered-devices', undefined);

    if (!response.data.devices) {
      throw new Error('getDevices error: no devices in response');
    }

    const devices = response.data.devices as BlueAirDeviceDiscovery[];
    return devices;
  }

  async getDeviceStatus(accountUuid: string, uuids: string[]): Promise<BlueAirDeviceStatus[]> {
    await this.checkTokenExpiration();

    const body = {
      deviceconfigquery: uuids.map((uuid) => ({ id: uuid} )),
    };
    const response = await this.apiCall<BlueAirDeviceStatusResponse>(`/${accountUuid}/r/initial`, body);

    const { data } = response;
    if (!data.deviceInfo) {
      throw new Error('getDeviceStatus error: no deviceInfo in response');
    }

    const deviceStatuses: BlueAirDeviceStatus[] = data.deviceInfo.map(device => {
      return {
        id: device.id,
        name: device.configuration.di.name,
        sensorData: device.sensordata.reduce((acc, sensor) => {
          const key = BlueAirDeviceSensorDataMap[sensor.n];
          if (key) {
            acc[key] = sensor.v;
          }
          return acc;
        }, {} as BlueAirDeviceSensorData),
        state: device.states.reduce((acc, state) => {
          if (state.v) {
            acc[state.n] = state.v;
          } else if (state.vb) {
            acc[state.n] = state.vb;
          } else {
            this.logger.warn(`getDeviceStatus: unknown state ${JSON.stringify(state)}`);
          }
          return acc;
        }, {} as BlueAirDeviceState),
      };
    });

    return deviceStatuses;
  }

  async setDeviceStatus(uuid: string, status: Record<string, unknown>): Promise<boolean> {
    await this.checkTokenExpiration();
    this.logger.debug(`setDeviceStatus: ${uuid} ${JSON.stringify(status)}`);
    return true;
  }

  private async getAwsAccessToken(jwt: string): Promise<{accessToken: string}> {
    this.logger.debug('Getting AWS access token...');

    const response = await this.apiCall('/login', undefined, {
      'Authorization': `Bearer ${jwt}`,
      'idtoken': jwt,
    });

    if (!response.data.access_token) {
      throw new Error(`AWS access token error: ${JSON.stringify(response.data)}`);
    }

    this.logger.debug('AWS access token received');
    return {
      accessToken: response.data.access_token,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async apiCall<T = any>(
    url: string,
    data?: string | object,
    headers?: object,
    retries = 3,
  ): Promise<AxiosResponse<T>> {
    try {
      const response = await this.blueairAxios.post<T>(url, data, { headers });
      if (response.status !== 200) {
        throw new Error(`API call error with status ${response.status}: ${response.statusText}, ${JSON.stringify(response.data)}`);
      }
      return response;
    } catch (error) {
      if (retries > 0) {
        return this.apiCall(url, data, headers, retries - 1);
      } else {
        throw new Error(`API call failed after ${retries} retries`);
      }
    }
  }
}