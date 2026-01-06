import { Region } from '../platformUtils';

type AWSConfigValue = {
  restApiId: string;
  awsRegion: string;
};

type GigyaConfigValue = {
  gigyaRegion: string;
  apiKey: string;
};

const AWS_CONFIG: Partial<Record<Region, AWSConfigValue>> = {
  [Region.US]: {
    restApiId: 'on1keymlmh',
    awsRegion: 'us-east-2',
  },
  [Region.EU]: {
    restApiId: 'hkgmr8v960',
    awsRegion: 'eu-west-1',
  },
  [Region.CN]: {
    restApiId: 'ftbkyp79si',
    awsRegion: 'cn-north-1',
  },
};

const GIGYA_CONFIG: Record<Region, GigyaConfigValue> = {
  [Region.US]: {
    gigyaRegion: 'us1',
    apiKey: '3_-xUbbrIY8QCbHDWQs1tLXE-CZBQ50SGElcOY5hF1euE11wCoIlNbjMGAFQ6UwhMY',
  },
  [Region.EU]: {
    gigyaRegion: 'eu1',
    apiKey: '3_qRseYzrUJl1VyxvSJANalu_kNgQ83swB1B9uzgms58--5w1ClVNmrFdsDnWVQQCl',
  },
  [Region.CN]: {
    gigyaRegion: 'cn1',
    apiKey: '3_h3UEfJnA-zDpFPR9L4412HO7Mz2VVeN4wprbWYafPN1gX0kSnLcZ9VSfFi7bEIIU',
  },
  [Region.AU]: {
    gigyaRegion: 'au1',
    apiKey: '3_Z2N0mIFC6j2fx1z2sq76R3pwkCMaMX2y9btPb0_PgI_3wfjSJoofFnBbxbtuQksN',
  },
  [Region.RU]: {
    gigyaRegion: 'ru1',
    apiKey: '3_wYhHEBaOcS_w6idVM3mh8UjyjOP-3Dwn3w9Z6AYc0FhGf-uIwUkrcoCdsYarND2k',
  },
};

export function getAwsConfig(region: Region): AWSConfigValue {
  return AWS_CONFIG[region] ?? AWS_CONFIG[Region.EU]!;
}

export function getGigyaConfig(region: Region): GigyaConfigValue {
  return GIGYA_CONFIG[region];
}

export const LOGIN_EXPIRATION = 3600 * 1000 * 24; // n hours in milliseconds
export const BLUEAIR_API_TIMEOUT = 5 * 1000; // n seconds in milliseconds

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
