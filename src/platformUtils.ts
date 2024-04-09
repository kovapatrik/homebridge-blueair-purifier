export type Config = {
  verboseLogging: boolean;
  oauthToken: string;
  oauthTokenSecret: string;
  region: Region;
  devices: DeviceConfig[];
};

export type DeviceConfig = {
  id: string;
  name: string;
  isAWSDevice: boolean;
  led: boolean;
  airQualitySensor: boolean;
  co2Sensor: boolean;
  temperatureSensor: boolean;
  humiditySensor: boolean;
  germShield: boolean;
  nightMode: boolean;
};

export enum Region {
  US = 'USA',
  EU = 'Europe',
  CA = 'Canada',
  CN = 'China',
}

export const RegionMap = {
  [Region.US]: 'us',
  [Region.EU]: 'eu',
  [Region.CA]: 'eu',
  [Region.CN]: 'cn',
};

export const LOGIN_EXPIRATION = 3600 * 1000 * 12; // n hours in milliseconds
export const DEVICE_UPDATE_INTERVAL = 1000 * 5; // n seconds in milliseconds
