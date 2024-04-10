export type Config = {
  verboseLogging: boolean;
  username: string;
  password: string;
  region: Region;
  devices: DeviceConfig[];
};

export type DeviceConfig = {
  id: string;
  name: string;
  led: boolean;
  airQualitySensor: boolean;
  co2Sensor: boolean;
  temperatureSensor: boolean;
  humiditySensor: boolean;
  germShield: boolean;
  nightMode: boolean;
};

export enum Region {
  EU = 'Default (all other regions)',
  US = 'USA',
  CN = 'China',
  AU = 'Australia',
  RU = 'Russia',
}

export const RegionMap = {
  [Region.US]: 'us',
  [Region.CN]: 'cn',
  [Region.EU]: 'eu',
  [Region.AU]: 'au',
  [Region.RU]: 'ru',
};
