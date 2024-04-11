import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { Logger } from 'homebridge';
import { BLUEAIR_CONFIG } from './Consts';
import { RegionMap } from '../platformUtils';

export class GigyaApi {

  private api_key: string;
  private readonly gigyaAxios: AxiosInstance;

  constructor(
    private readonly username: string,
    private readonly password: string,
    region: string,
    private readonly logger: Logger,
  ) {

    const config = BLUEAIR_CONFIG[RegionMap[region]].gigyaConfig;
    this.api_key = config.apiKey;

    this.gigyaAxios = axios.create({
      baseURL: `https://accounts.${config.gigyaRegion}.gigya.com`,
      headers: {
        'Accept': '*/*',
        'Connection': 'keep-alive',
        'Accept-Encoding': 'gzip, deflate, br',
      },
    });
  }

  public async getGigyaSession(): Promise<{ token: string; secret: string }> {
    const params = new URLSearchParams({
      apiKey: this.api_key,
      loginID: this.username,
      password: this.password,
      targetEnv: 'mobile',
    });

    const response = await this.apiCall('/accounts.login', params.toString());

    if (!response.data.oauth_token || !response.data.oauth_token_secret) {
      throw new Error('Gigya session error: no oauth_token or oauth_token_secret in response');
    }

    this.logger.debug('Gigya session received');
    return {
      token: response.data.oauth_token,
      secret: response.data.oauth_token_secret,
    };
  }

  public async getGigyaJWT(token: string, secret: string): Promise<{jwt: string}> {
    const params = new URLSearchParams({
      oauth_token: token,
      secret: secret,
      targetEnv: 'mobile',
    });

    const response = await this.apiCall('/accounts.getJWT', params.toString());

    if (!response.data.id_token) {
      throw new Error('Gigya JWT error: no id_token in response');
    }

    this.logger.debug('Gigya JWT received');
    return {
      jwt: response.data.id_token,
    };
  }

  private async apiCall(url: string, data: string | object, retries = 3): Promise<AxiosResponse> {
    try {
      const response = await this.gigyaAxios.post(url, data);
      if (response.status !== 200) {
        throw new Error(`API call error with status ${response.status}: ${response.statusText}, ${JSON.stringify(response.data)}`);
      }
      return response;
    } catch (error) {
      this.logger.error(`API call failed: ${error}`);
      if (retries > 0) {
        this.logger.debug(`Retrying API call (${retries} retries left)...`);
        return this.apiCall(url, data, retries - 1);
      } else {
        throw new Error(`API call failed after ${retries} retries`);
      }
    }
  }
}