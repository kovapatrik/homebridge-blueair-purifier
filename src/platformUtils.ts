export type Config = {
  name: string;
  username: string;
  password: string;
  region: Region;
  accountUuid: string;
  verboseLogging: boolean;
  uiDebug: boolean;
  pollingInterval: number;
  devices: DeviceConfig[];
};

export type DeviceConfig = {
  id: string;
  name: string;
  model: string;
  serialNumber: string;
  filterChangeLevel: number;
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
  AU = 'Australia',
  CN = 'China',
  RU = 'Russia',
  US = 'USA',
}

export const RegionMap = {
  [Region.US]: 'us',
  [Region.CN]: 'cn',
  [Region.EU]: 'eu',
  [Region.AU]: 'au',
  [Region.RU]: 'ru',
};

export const defaultConfig: Config = {
  name: 'BlueAir Platform',
  uiDebug: false,
  verboseLogging: false,
  username: '',
  password: '',
  accountUuid: '',
  region: Region.EU,
  pollingInterval: 5000,
  devices: [],
};

export const defaultDeviceConfig: DeviceConfig = {
  id: '',
  name: '',
  model: '',
  serialNumber: '',
  filterChangeLevel: 90,
  led: false,
  airQualitySensor: false,
  co2Sensor: false,
  temperatureSensor: false,
  humiditySensor: false,
  germShield: false,
  nightMode: false,
};
