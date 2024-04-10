import { Logger } from 'homebridge';
import { RegionMap } from '../platformUtils';
import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { GigyaApi } from './GigyaApi';
import { BLUEAIR_API_TIMEOUT, BLUEAIR_CONFIG, LOGIN_EXPIRATION } from './Consts';

export type BlueAirDevice = {
  mac: string;
  'mcu-firmware': string;
  name: string;
  type: string;
  'user-type': string;
  uuid: string;
  'wifi-firmware': string;
};

export type BlueAirDeviceState = {
  cfv: string;
  germshield: boolean;
  gsnm: boolean;
  standby: boolean;
  fanspeed: number;
  childlock: boolean;
  nightmode: boolean;
  mfv: string;
  automode: boolean;
  ofv: string;
  brightness: number;
  safetyswitch: boolean;
  filterusage: number;
  disinfection: boolean;
  disinftime: number;
};

export type BlueAirDeviceSensorData = {
  fanspeed: number;
  hcho: number;
  humidity: number;
  pm1: number;
  pm10: number;
  pm25: number;
  temperature: number;
  tvoc: number;
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

  private last_login?: number;
  private name?: string;

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
  }

  async login(): Promise<void> {
    this.logger.debug('Logging in...');
    try {
      const { token, secret } = await this.gigyaApi.getGigyaSession();
      const { jwt } = await this.gigyaApi.getGigyaJWT(token, secret);
      const { accessToken } = await this.getAwsAccessToken(jwt);

      this.last_login = Date.now();

      this.blueairAxios.defaults.headers['Authorization'] = `Bearer ${accessToken}`;
      this.blueairAxios.defaults.headers['idtoken'] = accessToken;

      this.logger.debug('Login successful');
    } catch (error) {
      this.logger.error(`Login error: ${error}`);
    }
  }

  async checkTokenExpiration(): Promise<void> {
    if (!this.last_login) {
      this.logger.debug('No login found, logging in...');
      return await this.login();
    }
    if (LOGIN_EXPIRATION < Date.now() - this.last_login) {
      this.logger.debug('Token expired, logging in...');
      return await this.login();
    }
  }

  async getDevices(): Promise<BlueAirDevice[]> {
    await this.checkTokenExpiration();

    try {
      const response = await this.apiCall('/registered-devices', undefined);

      if (!response.data.devices) {
        throw new Error('getDevices error: no devices in response');
      }

      const devices = response.data.devices as BlueAirDevice[];

      if (devices.length === 0) {
        this.logger.warn('No devices found');
      } else {
        this.logger.debug(`Found devices: ${JSON.stringify(devices)}`);
        this.name = devices[0].name;
      }

      return devices;
    } catch (error) {
      this.logger.error(`getDevices error: ${error}`);
    }
    return [];
  }

  async getDeviceStatus(uuids: string[]): Promise<unknown> {
    await this.checkTokenExpiration();
    if (!this.name) {
      throw new Error('getDeviceStatus error: name not defined');
    }
    this.logger.debug(`getDeviceStatus: ${uuids.join(', ')}`);

    try {
      const body = {
        deviceconfigquery: uuids.map((uuid) => ({ id: uuid} )),
      };
      const response = await this.apiCall(`/${this.name}/r/initial`, body);

      const { deviceInfo } = response.data;
      if (!deviceInfo) {
        throw new Error('getDeviceStatus error: no deviceInfo in response');
      }

      if (deviceInfo.length === 0) {
        this.logger.warn('No deviceInfo found');
        return uuids;
      }

      const status = response.data.status as BlueAirDeviceStatus;
      this.logger.debug(`Device status: ${JSON.stringify(status)}`);

      return status;
    } catch (error) {
      this.logger.error(`getDeviceStatus error: ${error}`);
    }

    return uuid;
  }

  async setDeviceStatus(uuid: string, status: Record<string, unknown>): Promise<boolean> {
    await this.checkTokenExpiration();
    this.logger.debug(`setDeviceStatus: ${uuid} ${JSON.stringify(status)}`);
    return true;
  }

  private async getAwsAccessToken(jwt: string): Promise<{accessToken: string}> {
    this.logger.debug('Getting AWS access token...');
    try {
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
    } catch (error) {
      throw new Error(`AWS access token error: ${error}`);
    }
  }

  private async apiCall(url: string, data?: string | object, headers?: object, retries = 3): Promise<AxiosResponse> {
    try {
      const response = await this.blueairAxios.post(url, data, { headers });
      if (response.status !== 200) {
        throw new Error(`API call error with status ${response.status}: ${response.statusText}, ${JSON.stringify(response.data)}`);
      }
      return response;
    } catch (error) {
      this.logger.error(`API call failed: ${error}`);
      if (retries > 0) {
        this.logger.debug(`Retrying API call (${retries} retries left)...`);
        return this.apiCall(url, data, headers, retries - 1);
      } else {
        throw new Error(`API call failed after ${retries} retries`);
      }
    }
  }
}