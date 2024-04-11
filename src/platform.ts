import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { Config, defaultConfig } from './platformUtils';
import { defaultsDeep } from 'lodash';
import BlueAirAwsApi, { BlueAirDeviceStatus } from './api/BlueAirAwsApi';
import { BlueAirDevice } from './device/BlueAirDevice';
import { AirPurifierAccessory } from './accessory/AirPurifierAccessory';
import EventEmitter from 'events';

export class BlueAirPlatform extends EventEmitter implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  private readonly platformConfig: Config;
  private readonly blueAirApi: BlueAirAwsApi;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    super();
    this.platformConfig = defaultsDeep(config, defaultConfig);

    if (!this.platformConfig.username || !this.platformConfig.password || !this.platformConfig.accountUuid) {
      this.log.error(`Missing required configuration options! Please do the device discovery in the configuration UI and/or check your\
      config.json file`);
    }

    this.blueAirApi = new BlueAirAwsApi(this.platformConfig.username, this.platformConfig.password, this.platformConfig.region, log);

    this.api.on('didFinishLaunching', async () => {
      await this.getInitialDeviceStates();
    });

    this.on('setState', async ({id, state, value}) => {
      this.log.info(`[${id}] Setting state: ${state} = ${value}`);
      try {
        await this.blueAirApi.setDeviceStatus(id, state, value);
      } catch (error) {
        this.log.error(`[${id}] Error setting state: ${state} = ${value}`, error);
      }
    });

  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  async getInitialDeviceStates() {
    try {
      await this.blueAirApi.login();
      let uuids = this.platformConfig.devices.map(device => device.id);
      const devices = await this.blueAirApi.getDeviceStatus(this.platformConfig.accountUuid, uuids);

      for (const device of devices) {
        this.addDevice(device);
        uuids = uuids.filter(uuid => uuid !== device.id);
      }

      for (const uuid of uuids) {
        this.log.warn(`[${uuid}] Device not found in AWS API response!`);
      }
    } catch (error) {
      this.log.error('Error getting initial device states:', error);
    }
  }

  addDevice(device: BlueAirDeviceStatus) {
    const uuid = this.api.hap.uuid.generate(device.id);
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
    const deviceConfig = this.platformConfig.devices.find(config => config.id === device.id);

    if (!deviceConfig) {
      this.log.error(`[${device.id}] Device configuration not found!`);
      return;
    }

    const blueAirDevice = new BlueAirDevice(device.id);

    if (existingAccessory) {
      this.log.info(`[${deviceConfig.name}] Restoring existing accessory from cache: ${existingAccessory.displayName}`);
      new AirPurifierAccessory(this, existingAccessory, blueAirDevice, deviceConfig);
    } else {
      this.log.info('Adding new accessory:', device.name);
      const accessory = new this.api.platformAccessory(device.name, uuid);
      new AirPurifierAccessory(this, accessory, blueAirDevice, deviceConfig);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }
}
