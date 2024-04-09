import { Logger } from 'homebridge';
import { RegionMap } from '../platformUtils';
import { BlueAirBase, BlueAirDevice } from './BlueAirBase';
import axios, { AxiosInstance } from 'axios';

type APIConfigValue = {
  gigyaRegion: string;
  restApiId: string;
  awsRegion: string;
  apiKey: string;
};

type APIConfig = { [key in string]: APIConfigValue };

const BLUEAIR_AWS_APIKEYS: APIConfig = {
  'us': {
    gigyaRegion: 'us1',
    restApiId: 'on1keymlmh',
    awsRegion: 'us-east-2',
    apiKey: '3_-xUbbrIY8QCbHDWQs1tLXE-CZBQ50SGElcOY5hF1euE11wCoIlNbjMGAFQ6UwhMY',
  },
  'eu': {
    gigyaRegion: 'eu1',
    restApiId: 'hkgmr8v960',
    awsRegion: 'eu-west-1',
    apiKey: '3_qRseYzrUJl1VyxvSJANalu_kNgQ83swB1B9uzgms58--5w1ClVNmrFdsDnWVQQCl',
  },
};


export class BlueAirAws implements BlueAirBase {

  private readonly API_CONFIG: APIConfigValue;
  private readonly GIGYA_API: AxiosInstance;
  private readonly AWS_API: AxiosInstance;

  private access_token?: string;

  constructor(
    private readonly username: string,
    private readonly password: string,
    region: string,
    private readonly logger: Logger,
  ) {
    this.API_CONFIG = BLUEAIR_AWS_APIKEYS[RegionMap[region]];

    this.GIGYA_API = axios.create({
      baseURL: `https://accounts.${this.API_CONFIG.gigyaRegion}.gigya.com`,
      headers: {
        'Accept': '*/*',
        'Connection': 'keep-alive',
        'Accept-Encoding': 'gzip, deflate, br',
      },
    });

    this.AWS_API = axios.create({
      baseURL: `https://${this.API_CONFIG.restApiId}.execute-api.${this.API_CONFIG.awsRegion}.amazonaws.com`,
      headers: {
        'Accept': '*/*',
        'Connection': 'keep-alive',
        'Accept-Encoding': 'gzip, deflate, br',
      },
    });
  }

  async login(): Promise<boolean> {

    if (this.access_token) {
      return true;
    }

    try {
      const { token, secret } = await this.getGigyaSession();
      const { jwt } = await this.getGigyaJWT(token, secret);
      const { accessToken } = await this.getAwsAccessToken(jwt);

      this.access_token = accessToken;
      return true;
    } catch (error) {
      this.logger.error(`Login error: ${error}`);
      return false;
    }
  }

  async getDevices(): Promise<BlueAirDevice[]> {
    return [];
  }

  async getDeviceStatus(uuid: string): Promise<unknown> {
    return uuid;
  }

  async setDeviceStatus(uuid: string, status: Record<string, unknown>): Promise<boolean> {
    this.logger.debug(`setDeviceStatus: ${uuid} ${JSON.stringify(status)}`);
    return true;
  }


  private async getGigyaSession(): Promise<{token: string; secret: string }> {

    const params = new URLSearchParams({
      apiKey: this.API_CONFIG.apiKey,
      loginID: this.username,
      password: this.password,
      targetEnv: 'mobile',
    });
    const response = await this.GIGYA_API.post('/accounts.login', params.toString());

    if (response.data.errorCode) {
      throw new Error(`Gigya login error: ${response.data.errorCode}`);
    }

    return {
      token: response.data.sessionInfo.sessionToken,
      secret: response.data.sessionInfo.sessionSecret,
    };
  }

  private async getGigyaJWT(token: string, secret: string): Promise<{jwt: string}> {

    const params = new URLSearchParams({
      oauth_token: token,
      secret: secret,
      targetEnv: 'mobile',
    });
    const response = await this.GIGYA_API.post('/accounts.getJWT', params.toString());

    if (response.data.errorCode) {
      throw new Error(`Gigya JWT error: ${response.data.errorCode}`);
    }

    return {
      jwt: response.data.id_token,
    };
  }

  private async getAwsAccessToken(jwt: string): Promise<{accessToken: string}> {

    const response = await this.AWS_API.post('/prod/c/login', undefined, {
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'idtoken': jwt,
      },
    });

    if (response.data.errorCode) {
      throw new Error(`AWS access token error: ${response.data.errorCode}`);
    }

    return {
      accessToken: response.data.access_token,
    };
  }
}