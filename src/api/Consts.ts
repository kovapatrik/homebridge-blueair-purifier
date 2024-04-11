import { RegionMap } from '../platformUtils';

type AWSConfigValue = {
  restApiId: string;
  awsRegion: string;
};
type AWSConfig = { [key: string]: AWSConfigValue };

const AWS_CONFIG : AWSConfig = {
  'us': {
    restApiId: 'on1keymlmh',
    awsRegion: 'us-east-2',
  },
  'eu': {
    restApiId: 'hkgmr8v960',
    awsRegion: 'eu-west-1',
  },
  'cn': {
    restApiId: 'ftbkyp79si',
    awsRegion: 'cn-north-1',
  },
};

type GigyaConfigValue = {
  gigyaRegion: string;
  apiKey: string;
};
type GigyaConfig = { [key: string]: GigyaConfigValue };

const GIGYA_CONFIG : GigyaConfig = {
  'us': {
    gigyaRegion: 'us1',
    apiKey: '3_-xUbbrIY8QCbHDWQs1tLXE-CZBQ50SGElcOY5hF1euE11wCoIlNbjMGAFQ6UwhMY',
  },
  'eu': {
    gigyaRegion: 'eu1',
    apiKey: '3_qRseYzrUJl1VyxvSJANalu_kNgQ83swB1B9uzgms58--5w1ClVNmrFdsDnWVQQCl',
  },
  'cn': {
    gigyaRegion: 'cn1',
    apiKey: '3_h3UEfJnA-zDpFPR9L4412HO7Mz2VVeN4wprbWYafPN1gX0kSnLcZ9VSfFi7bEIIU',
  },
  'au': {
    gigyaRegion: 'au1',
    apiKey: '3_Z2N0mIFC6j2fx1z2sq76R3pwkCMaMX2y9btPb0_PgI_3wfjSJoofFnBbxbtuQksN',
  },
  'ru': {
    gigyaRegion: 'ru1',
    apiKey: '3_wYhHEBaOcS_w6idVM3mh8UjyjOP-3Dwn3w9Z6AYc0FhGf-uIwUkrcoCdsYarND2k',
  },
};

type APIConfig = { [key: string]: {
  awsConfig: AWSConfigValue;
  gigyaConfig: GigyaConfigValue;
}; };

export const BLUEAIR_CONFIG = Object.values(RegionMap).reduce((acc, region: string) => ({
  ...acc,
  [region]: {
    awsConfig: region in AWS_CONFIG ? AWS_CONFIG[region] : AWS_CONFIG['eu'],
    gigyaConfig: region in GIGYA_CONFIG ? GIGYA_CONFIG[region] : GIGYA_CONFIG['eu'],
  },
}), {} as APIConfig);

export const LOGIN_EXPIRATION = 3600 * 1000 * 24; // n hours in milliseconds
export const BLUEAIR_API_TIMEOUT = 1000 * 5; // n seconds in milliseconds

export type BlueAirDeviceStatusResponse = {
  deviceInfo: {
    id: string;
    configuration: {
      di: {
        name: string;
      };
    };
    sensordata: {
      n: string;
      t: number;
      v: number;
    }[];
    states: {
      n: string;
      t: number;
      v?: number;
      vb?: boolean;
    }[];

  }[];
};