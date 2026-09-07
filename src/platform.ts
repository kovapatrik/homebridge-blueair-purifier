import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { Config, defaultConfig } from './platformUtils';
import { defaultsDeep } from 'lodash';
import BlueAirAwsApi, { BlueAirDeviceStatus, RateLimitError } from './api/BlueAirAwsApi';
import { BlueAirDevice } from './device/BlueAirDevice';
import { AirPurifierAccessory } from './accessory/AirPurifierAccessory';
import EventEmitter from 'events';

// Absolute ceiling on the polling backoff. Prevents the plugin from going silent for
// hours at large pollingInterval bases (e.g. 5 min * 16 = 80 min without this cap).
const MAX_POLL_BACKOFF_MS = 30 * 60 * 1000;

export class BlueAirPlatform extends EventEmitter implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  private readonly platformConfig: Config;
  private readonly blueAirApi: BlueAirAwsApi;

  private existingUuids: string[] = [];

  private devices: BlueAirDevice[] = [];
  private polling: NodeJS.Timeout | null = null;
  private consecutiveRateLimitFailures = 0;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    super();
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    this.platformConfig = defaultsDeep(config, defaultConfig);
    this.log.debug('Finished initializing platform:', this.platformConfig.name);

    if (!this.platformConfig.username || !this.platformConfig.password || !this.platformConfig.accountUuid) {
      this.log.error(
        'Missing required configuration options! Please do the device discovery in the configuration UI and/or check your\
      config.json file',
      );
    }

    this.blueAirApi = new BlueAirAwsApi(
      this.platformConfig.username,
      this.platformConfig.password,
      this.platformConfig.region,
      log,
      this.platformConfig.cloudRegion ?? this.platformConfig.region,
    );

    this.api.on('didFinishLaunching', () => {
      this.initializeAndStartPolling();
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.push(accessory);
  }

  // Exponential backoff of the outer poll on repeated rate-limits: 1x, 2x, 4x, 8x, ...
  // Ceiling is the absolute MAX_POLL_BACKOFF_MS rather than a multiplier cap, so the
  // max silence is the same (~30 min) regardless of pollingInterval. Letting the counter
  // grow unbounded also makes decay-on-success a proper gradual ramp — a long jail
  // requires proportionally many successful polls to fully recover.
  private computeBackoffDelayMs(): number {
    const multiplier = 2 ** this.consecutiveRateLimitFailures;
    return Math.min(this.platformConfig.pollingInterval * multiplier, MAX_POLL_BACKOFF_MS);
  }

  private async initializeAndStartPolling() {
    try {
      await this.getInitialDeviceStates();
      // Decay on success rather than reset so a single lucky poll doesn't immediately
      // put us back at the configured cadence and re-trip the throttle.
      this.consecutiveRateLimitFailures = Math.max(0, this.consecutiveRateLimitFailures - 1);
      this.getValidDevicesStatus();
    } catch (error) {
      // Only RateLimitError bubbles out; other errors are swallowed inside getInitialDeviceStates.
      this.consecutiveRateLimitFailures++;
      const delayMs = this.computeBackoffDelayMs();
      this.log.warn(`Rate-limited during initial device fetch: ${(error as Error).message}. Retrying initialization in ${delayMs}ms...`);
      setTimeout(() => this.initializeAndStartPolling(), delayMs);
    }
  }

  async getValidDevicesStatus() {
    this.log.debug('Updating devices states...');
    let nextDelayMs = this.platformConfig.pollingInterval;
    try {
      const devices = await this.blueAirApi.getDeviceStatus(this.platformConfig.accountUuid, this.existingUuids);
      for (const device of devices) {
        const blueAirDevice = this.devices.find((d) => d.id === device.id);
        if (!blueAirDevice) {
          this.log.error(`[${device.name}] Device not found in cache!`);
          continue;
        }
        this.log.debug(`[${device.name}] Updating device state...`);
        blueAirDevice.emit('update', device);
      }
      this.log.debug('Devices states updated!');
      this.consecutiveRateLimitFailures = Math.max(0, this.consecutiveRateLimitFailures - 1);
    } catch (error) {
      const err = error as Error;
      if (error instanceof RateLimitError) {
        this.consecutiveRateLimitFailures++;
        nextDelayMs = this.computeBackoffDelayMs();
      }
      this.log.warn(`Error getting valid devices status, reason: ${err.message}. Retrying in ${nextDelayMs}ms...`);
      this.log.debug('Error stack:', err.stack);
    } finally {
      this.polling = setTimeout(this.getValidDevicesStatus.bind(this), nextDelayMs);
    }
  }

  async getInitialDeviceStates() {
    this.log.info('Getting initial device states...');
    try {
      await this.blueAirApi.login();
      let uuids = this.platformConfig.devices.map((device) => device.id);
      const devices = await this.blueAirApi.getDeviceStatus(this.platformConfig.accountUuid, uuids);

      for (const device of devices) {
        this.addDevice(device);
        uuids = uuids.filter((uuid) => uuid !== device.id);
      }

      for (const uuid of uuids) {
        const device = this.platformConfig.devices.find((device) => device.id === uuid)!;
        this.log.warn(`[${device.name}] Device not found in AWS API response!`);
      }

      this.log.info('All configured devices have been added!');
    } catch (error) {
      if (error instanceof RateLimitError) {
        // Let initializeAndStartPolling apply the outer backoff.
        throw error;
      }
      this.log.error('Error getting initial device states:', error);
    }
  }

  async addDevice(device: BlueAirDeviceStatus) {
    const uuid = this.api.hap.uuid.generate(device.id);
    const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);
    const deviceConfig = this.platformConfig.devices.find((config) => config.id === device.id);
    this.existingUuids.push(device.id);

    if (!deviceConfig) {
      this.log.error(`[${device.name}] Device configuration not found!`);
      return;
    }

    const blueAirDevice = new BlueAirDevice(device);
    this.log.info(`[${device.name}] Device type is ${blueAirDevice.deviceType}`);
    this.devices.push(blueAirDevice);

    blueAirDevice.on('setState', async ({ id, name, attribute, value }) => {
      // this.log.info(`[${name}] Setting state: ${attribute} = ${value}`);

      // Clear polling to avoid conflicts
      this.polling && clearTimeout(this.polling);
      let success = false;
      try {
        await this.blueAirApi.setDeviceStatus(id, attribute, value);
        success = true;
        this.consecutiveRateLimitFailures = Math.max(0, this.consecutiveRateLimitFailures - 1);
      } catch (error) {
        this.log.error(`[${name}] Error setting state: ${attribute} = ${value}`, error);
      } finally {
        blueAirDevice.emit('setStateDone', success);
        // Have to clear polling again to avoid conflicts
        this.polling && clearTimeout(this.polling);
        this.polling = setTimeout(this.getValidDevicesStatus.bind(this), this.platformConfig.pollingInterval);
      }
    });

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
