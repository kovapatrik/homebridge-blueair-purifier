import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { Config, defaultConfig } from './platformUtils';
import { defaultsDeep } from 'lodash';
import BlueAirAwsApi, { BlueAirDeviceStatus, BlueAirRateLimitError } from './api/BlueAirAwsApi';
import { BlueAirDevice } from './device/BlueAirDevice';
import { AirPurifierAccessory } from './accessory/AirPurifierAccessory';
import EventEmitter from 'events';
import { Mutex } from 'async-mutex';

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
  private readonly commandMutex = new Mutex();
  private readonly lastRefresh = new Map<string, number>();
  private readonly pendingReads = new Map<string, Promise<void>>();
  private startupRetry?: NodeJS.Timeout;
  private startupAuthenticated = false;
  private stopping = false;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    super();
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    this.platformConfig = defaultsDeep(config, defaultConfig);
    if (
      !Number.isInteger(this.platformConfig.sliderBufferMs) ||
      this.platformConfig.sliderBufferMs < 0 ||
      this.platformConfig.sliderBufferMs > 30000
    ) {
      throw new Error('sliderBufferMs must be an integer from 0 to 30000 milliseconds');
    }
    if (!Number.isFinite(this.platformConfig.pollingInterval) || this.platformConfig.pollingInterval < 0) {
      throw new Error('pollingInterval must be a non-negative number');
    }
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

    this.api.on('didFinishLaunching', async () => {
      await this.getInitialDeviceStates();
    });
    this.api.on('shutdown', () => {
      this.stopping = true;
      clearTimeout(this.startupRetry);
      if (this.polling) {
        clearTimeout(this.polling);
      }
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.push(accessory);
  }

  get sliderBufferMs(): number {
    return this.platformConfig.sliderBufferMs;
  }

  // Zero is an explicit opt-in. Keep the normal polling and command paths for
  // existing configurations, including when pollingInterval is omitted.
  get onDemand(): boolean {
    return this.platformConfig.pollingInterval === 0;
  }

  async getValidDevicesStatus() {
    this.log.debug('Updating devices states...');
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
    } catch (error) {
      const err = error as Error;
      this.log.warn('Error getting valid devices status, reason:' + err.message + '. Retrying on the next polling interval.');
      this.log.debug('Error stack:', err.stack);
    } finally {
      this.schedulePolling();
    }
  }

  private schedulePolling() {
    if (!this.stopping && this.platformConfig.pollingInterval > 0) {
      this.polling = setTimeout(this.getValidDevicesStatus.bind(this), this.platformConfig.pollingInterval);
    }
  }

  private async refreshDevice(device: BlueAirDevice) {
    const states = await this.blueAirApi.getDeviceStatus(this.platformConfig.accountUuid, [device.id]);
    const state = states.find((entry) => entry.id === device.id);
    if (!state) {
      throw new Error(`[${device.name}] Device missing from status response`);
    }
    await device.updateState(state);
    this.lastRefresh.set(device.id, Date.now());
  }

  async readDevice<T>(device: BlueAirDevice, read: () => T): Promise<T> {
    if (this.platformConfig.pollingInterval !== 0) {
      return read();
    }
    // A HomeKit screen can request many characteristics together. Return the
    // current snapshot now and share one refresh, rather than making every GET
    // wait for the cloud. Check freshness inside the lock: a preceding command
    // may already have refreshed the device while this read was waiting.
    if (!this.pendingReads.has(device.id)) {
      const pending = this.commandMutex
        .runExclusive(async () => {
          const refreshed = this.lastRefresh.get(device.id);
          if (!this.stopping && (refreshed === undefined || Date.now() - refreshed >= 15000)) {
            await this.refreshDevice(device);
          }
        })
        .catch((error: unknown) => {
          if (!(error instanceof BlueAirRateLimitError)) {
            this.log.warn(`[${device.name}] Background refresh failed: ${String(error)}`);
          }
        })
        .finally(() => {
          this.pendingReads.delete(device.id);
        });
      this.pendingReads.set(device.id, pending);
    }
    return read();
  }

  async executeCommand(device: BlueAirDevice, action: () => Promise<void>) {
    if (this.platformConfig.pollingInterval !== 0) {
      return action();
    }
    // Refresh before accessory logic checks cached values or decides to skip a write.
    try {
      await this.commandMutex.runExclusive(async () => {
        if (this.stopping) {
          throw new Error('Plugin is shutting down');
        }
        await this.refreshDevice(device);
        await action();
      });
    } catch (error) {
      if (error instanceof BlueAirRateLimitError) {
        throw new this.api.hap.HapStatusError(this.api.hap.HAPStatus.RESOURCE_BUSY);
      }
      throw error;
    }
  }

  private async writeAndVerify(device: BlueAirDevice, attribute: string, value: number | boolean) {
    await this.blueAirApi.setDeviceStatus(device.id, attribute, value);
    // This callback runs under executeCommand's lock. Do not reacquire that
    // lock here. Read back each actual write, including wake/mode prerequisites,
    // before the next step makes decisions from state. Never resend a write
    // merely because the cloud has not reflected it yet.
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      await this.refreshDevice(device);
      if (device.state[attribute] === value) {
        return;
      }
    }
    throw new Error(`[${device.name}] Could not verify ${attribute} = ${value}; last reported value: ${device.state[attribute]}`);
  }

  async getInitialDeviceStates() {
    if (this.stopping) {
      return;
    }
    this.log.info('Getting initial device states...');
    try {
      if (!this.startupAuthenticated) {
        await this.blueAirApi.login();
        this.startupAuthenticated = true;
      }
      let uuids = this.platformConfig.devices.map((device) => device.id);
      const devices = await this.blueAirApi.getDeviceStatus(this.platformConfig.accountUuid, uuids);
      if (this.stopping) {
        return;
      }

      for (const device of devices) {
        this.addDevice(device);
        uuids = uuids.filter((uuid) => uuid !== device.id);
      }

      for (const uuid of uuids) {
        const device = this.platformConfig.devices.find((device) => device.id === uuid)!;
        this.log.warn(`[${device.name}] Device not found in AWS API response!`);
      }

      this.log.info('All configured devices have been added!');
      if (this.platformConfig.pollingInterval > 0) {
        this.getValidDevicesStatus();
      }
    } catch (error) {
      if (error instanceof BlueAirRateLimitError) {
        if (!this.stopping) {
          const delay = Math.max(1000, this.blueAirApi.getCooldownRemaining() + 1000);
          this.log.warn(`Startup postponed by Blueair rate limit; retrying in ${Math.ceil(delay / 1000)} seconds`);
          clearTimeout(this.startupRetry);
          this.startupRetry = setTimeout(() => void this.getInitialDeviceStates(), delay);
        }
        return;
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
    if (this.platformConfig.pollingInterval === 0) {
      blueAirDevice.stateWriter = (attribute, value) => this.writeAndVerify(blueAirDevice, attribute, value);
      this.lastRefresh.set(device.id, Date.now());
    }
    this.log.info(`[${device.name}] Device type is ${blueAirDevice.deviceType}`);
    this.log.debug(
      `[${device.name}] Startup state: standby=${device.state.standby}, automode=${device.state.automode}, ` +
        `apsubmode=${device.state.apsubmode}, fanspeed=${device.state.fanspeed}`,
    );
    this.devices.push(blueAirDevice);

    blueAirDevice.on('setState', async ({ id, name, attribute, value }) => {
      // this.log.info(`[${name}] Setting state: ${attribute} = ${value}`);

      // Clear polling to avoid conflicts
      this.polling && clearTimeout(this.polling);
      let success = false;
      try {
        await this.blueAirApi.setDeviceStatus(id, attribute, value);
        success = true;
      } catch (error) {
        this.log.error(`[${name}] Error setting state: ${attribute} = ${value}`, error);
      } finally {
        blueAirDevice.emit('setStateDone', success);
        // Have to clear polling again to avoid conflicts
        this.polling && clearTimeout(this.polling);
        this.schedulePolling();
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
