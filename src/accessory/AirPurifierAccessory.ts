import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import { BlueAirPlatform } from '../platform';
import { BlueAirDevice } from '../device/BlueAirDevice';
import { AutoModeStrategy, getAutoModeStrategy } from '../device/AutoModeStrategy';
import { DeviceConfig } from '../platformUtils';
import { FullBlueAirDeviceState } from '../api/BlueAirAwsApi';
import { BlueAirDeviceType } from '../device/BlueAirDeviceType';
import { CoalescedControl } from '../device/CoalescedControl';

export class AirPurifierAccessory {
  private service: Service;
  private filterMaintenanceService?: Service;
  private ledService?: Service;
  private airQualityService?: Service;
  private temperatureService?: Service;
  private germShieldService?: Service;
  private nightModeService?: Service;
  private autoModeStrategy: AutoModeStrategy;
  private readonly speedControl: CoalescedControl<CharacteristicValue>;
  private queuedSpeed?: CharacteristicValue;
  private speedRequest = 0;

  constructor(
    protected readonly platform: BlueAirPlatform,
    protected readonly accessory: PlatformAccessory,
    protected readonly device: BlueAirDevice,
    protected readonly configDev: DeviceConfig,
  ) {
    this.autoModeStrategy = getAutoModeStrategy(this.device.deviceType);
    this.speedControl = new CoalescedControl(
      (value) => this.platform.executeCommand(this.device, () => this.setRotationSpeed(value)),
      this.platform.sliderBufferMs,
    );
    this.platform.api?.on('shutdown', () => {
      this.speedRequest++;
      this.queuedSpeed = undefined;
      this.speedControl.cancel();
    });

    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'BlueAir')
      .setCharacteristic(this.platform.Characteristic.Model, this.configDev.model || 'BlueAir Purifier')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.configDev.serialNumber || 'BlueAir Device');

    this.service =
      this.accessory.getService(this.platform.Service.AirPurifier) || this.accessory.addService(this.platform.Service.AirPurifier);

    this.service.setCharacteristic(this.platform.Characteristic.Name, this.configDev.name);
    this.service
      .getCharacteristic(this.platform.Characteristic.Active)
      .onGet(() => this.platform.readDevice(this.device, () => this.getActive()))
      .onSet((value) => {
        this.platform.log.debug(`[${this.device.name}] HomeKit Active request: ${value}`);
        if (value === this.platform.Characteristic.Active.INACTIVE) {
          this.speedRequest++;
          this.queuedSpeed = undefined;
          this.speedControl.cancel();
        }
        return this.platform.executeCommand(this.device, () => this.setActive(value));
      });

    this.service
      .getCharacteristic(this.platform.Characteristic.CurrentAirPurifierState)
      .onGet(() => this.platform.readDevice(this.device, () => this.getCurrentAirPurifierState()));

    this.service
      .getCharacteristic(this.platform.Characteristic.TargetAirPurifierState)
      .onGet(() => this.platform.readDevice(this.device, () => this.getTargetAirPurifierState()))
      .onSet((value) => this.platform.executeCommand(this.device, () => this.setTargetAirPurifierState(value)));

    this.service
      .getCharacteristic(this.platform.Characteristic.LockPhysicalControls)
      .onGet(() => this.platform.readDevice(this.device, () => this.getLockPhysicalControls()))
      .onSet((value) => this.platform.executeCommand(this.device, () => this.setLockPhysicalControls(value)));

    this.service
      .getCharacteristic(this.platform.Characteristic.RotationSpeed)
      .onGet(() => this.platform.readDevice(this.device, () => this.getRotationSpeed()))
      .onSet((value) => {
        // Normal polling keeps the original awaited write handler. Only the
        // opt-in path acknowledges queue acceptance before cloud execution.
        if (!this.platform.onDemand) {
          return this.setRotationSpeed(value);
        }
        this.queueRotationSpeed(value);
      });

    this.filterMaintenanceService =
      this.accessory.getService(this.platform.Service.FilterMaintenance) ||
      this.accessory.addService(this.platform.Service.FilterMaintenance);

    this.filterMaintenanceService
      .getCharacteristic(this.platform.Characteristic.FilterChangeIndication)
      .onGet(() => this.platform.readDevice(this.device, () => this.getFilterChangeIndication()));

    this.filterMaintenanceService
      .getCharacteristic(this.platform.Characteristic.FilterLifeLevel)
      .onGet(() => this.platform.readDevice(this.device, () => this.getFilterLifeLevel()));

    this.ledService = this.accessory.getServiceById(this.platform.Service.Lightbulb, 'Led');
    if (this.configDev.led) {
      this.ledService ??= this.accessory.addService(this.platform.Service.Lightbulb, `${this.device.name} Led`, 'Led');
      this.ledService.setCharacteristic(this.platform.Characteristic.Name, `${this.device.name} Led`);
      this.ledService.setCharacteristic(this.platform.Characteristic.ConfiguredName, `${this.device.name} Led`);
      this.ledService
        .getCharacteristic(this.platform.Characteristic.On)
        .onGet(() => this.platform.readDevice(this.device, () => this.getLedOn()))
        .onSet((value) => this.platform.executeCommand(this.device, () => this.setLedOn(value)));
      this.ledService
        .getCharacteristic(this.platform.Characteristic.Brightness)
        .onGet(() => this.platform.readDevice(this.device, () => this.getLedBrightness()))
        .onSet((value) => this.platform.executeCommand(this.device, () => this.setLedBrightness(value)));
    } else if (this.ledService) {
      this.accessory.removeService(this.ledService);
    }

    this.airQualityService = this.accessory.getServiceById(this.platform.Service.AirQualitySensor, 'AirQuality');
    if (this.configDev.airQualitySensor) {
      this.airQualityService ??= this.accessory.addService(
        this.platform.Service.AirQualitySensor,
        `${this.device.name} Air Quality`,
        'AirQuality',
      );
      this.airQualityService
        .getCharacteristic(this.platform.Characteristic.AirQuality)
        .onGet(() => this.platform.readDevice(this.device, () => this.getAirQuality()));
      this.airQualityService
        .getCharacteristic(this.platform.Characteristic.PM2_5Density)
        .onGet(() => this.platform.readDevice(this.device, () => this.getPM2_5Density()));
      this.airQualityService
        .getCharacteristic(this.platform.Characteristic.PM10Density)
        .onGet(() => this.platform.readDevice(this.device, () => this.getPM10Density()));
      this.airQualityService
        .getCharacteristic(this.platform.Characteristic.VOCDensity)
        .onGet(() => this.platform.readDevice(this.device, () => this.getVOCDensity()));
    } else if (this.airQualityService) {
      this.accessory.removeService(this.airQualityService);
    }

    this.temperatureService = this.accessory.getServiceById(this.platform.Service.TemperatureSensor, 'Temperature');
    if (this.configDev.temperatureSensor) {
      this.temperatureService ??= this.accessory.addService(
        this.platform.Service.TemperatureSensor,
        `${this.device.name} Temperature`,
        'Temperature',
      );
      this.temperatureService
        .getCharacteristic(this.platform.Characteristic.CurrentTemperature)
        .onGet(() => this.platform.readDevice(this.device, () => this.getCurrentTemperature()));
    } else if (this.temperatureService) {
      this.accessory.removeService(this.temperatureService);
    }

    this.germShieldService = this.accessory.getServiceById(this.platform.Service.Switch, 'GermShield');
    if (this.configDev.germShield) {
      this.germShieldService ??= this.accessory.addService(this.platform.Service.Switch, `${this.device.name} Germ Shield`, 'GermShield');
      this.germShieldService.setCharacteristic(this.platform.Characteristic.Name, `${this.device.name} Germ Shield`);
      this.germShieldService.setCharacteristic(this.platform.Characteristic.ConfiguredName, `${this.device.name} Germ Shield`);
      this.germShieldService
        .getCharacteristic(this.platform.Characteristic.On)
        .onGet(() => this.platform.readDevice(this.device, () => this.getGermShield()))
        .onSet((value) => this.platform.executeCommand(this.device, () => this.setGermShield(value)));
    } else if (this.germShieldService) {
      this.accessory.removeService(this.germShieldService);
    }

    this.nightModeService = this.accessory.getServiceById(this.platform.Service.Switch, 'NightMode');
    if (this.configDev.nightMode) {
      this.nightModeService ??= this.accessory.addService(this.platform.Service.Switch, `${this.device.name} Night Mode`, 'NightMode');
      this.nightModeService.setCharacteristic(this.platform.Characteristic.Name, `${this.device.name} Night Mode`);
      this.nightModeService.setCharacteristic(this.platform.Characteristic.ConfiguredName, `${this.device.name} Night Mode`);
      this.nightModeService
        .getCharacteristic(this.platform.Characteristic.On)
        .onGet(() => this.platform.readDevice(this.device, () => this.getNightMode()))
        .onSet((value) => this.platform.executeCommand(this.device, () => this.setNightMode(value)));
    } else if (this.nightModeService) {
      this.accessory.removeService(this.nightModeService);
    }

    this.device.on('stateUpdated', this.updateCharacteristics.bind(this));
    if (this.platform.onDemand) {
      // Without a periodic poll, publish the initial snapshot now. updateCharacteristic
      // changes HomeKit's cache without calling a SET handler or writing to Blueair.
      this.service.updateCharacteristic(this.platform.Characteristic.Active, this.getActive());
      this.service.updateCharacteristic(this.platform.Characteristic.CurrentAirPurifierState, this.getCurrentAirPurifierState());
      this.service.updateCharacteristic(this.platform.Characteristic.TargetAirPurifierState, this.getTargetAirPurifierState());
      this.service.updateCharacteristic(this.platform.Characteristic.RotationSpeed, this.getRotationSpeed());
    }
  }

  updateCharacteristics(changedStates: Partial<FullBlueAirDeviceState>) {
    for (const [k, v] of Object.entries(changedStates)) {
      this.platform.log.debug(`[${this.device.name}] ${k} changed to ${v}}`);
      let updateState = false;
      let updateAirQuality = false;
      switch (k) {
        case 'standby':
          updateState = true;
          break;
        case 'automode':
        case 'apsubmode':
          this.service.updateCharacteristic(this.platform.Characteristic.TargetAirPurifierState, this.getTargetAirPurifierState());
          break;
        case 'childlock':
          this.service.updateCharacteristic(this.platform.Characteristic.LockPhysicalControls, this.getLockPhysicalControls());
          break;
        case 'fanspeed':
          this.service.updateCharacteristic(this.platform.Characteristic.RotationSpeed, this.getRotationSpeed());
          this.service.updateCharacteristic(this.platform.Characteristic.Active, this.getActive());
          this.service.updateCharacteristic(this.platform.Characteristic.CurrentAirPurifierState, this.getCurrentAirPurifierState());
          break;
        case 'filterusage':
          this.service.updateCharacteristic(this.platform.Characteristic.FilterChangeIndication, this.getFilterChangeIndication());
          this.service.updateCharacteristic(this.platform.Characteristic.FilterLifeLevel, this.getFilterLifeLevel());
          break;
        case 'temperature':
          this.service.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.getCurrentTemperature());
          break;
        case 'brightness':
          this.ledService?.updateCharacteristic(this.platform.Characteristic.On, this.getLedOn());
          this.ledService?.updateCharacteristic(this.platform.Characteristic.Brightness, this.getLedBrightness());
          break;
        case 'pm2_5':
          this.airQualityService?.updateCharacteristic(this.platform.Characteristic.PM2_5Density, this.getPM2_5Density());
          updateAirQuality = true;
          break;
        case 'pm10':
          this.airQualityService?.updateCharacteristic(this.platform.Characteristic.PM10Density, this.getPM10Density());
          updateAirQuality = true;
          break;
        case 'voc':
          this.airQualityService?.updateCharacteristic(this.platform.Characteristic.VOCDensity, this.getVOCDensity());
          updateAirQuality = true;
          break;
        case 'germshield':
          this.germShieldService?.updateCharacteristic(this.platform.Characteristic.On, this.getGermShield());
          break;
        case 'nightmode':
          this.nightModeService?.updateCharacteristic(this.platform.Characteristic.On, this.getNightMode());
          break;
      }

      if (updateState) {
        this.service.updateCharacteristic(this.platform.Characteristic.Active, this.getActive());
        this.service.updateCharacteristic(this.platform.Characteristic.CurrentAirPurifierState, this.getCurrentAirPurifierState());
        this.service.updateCharacteristic(this.platform.Characteristic.TargetAirPurifierState, this.getTargetAirPurifierState());
        this.service.updateCharacteristic(this.platform.Characteristic.RotationSpeed, this.getRotationSpeed());
        this.ledService?.updateCharacteristic(this.platform.Characteristic.On, this.getLedOn());
        this.germShieldService?.updateCharacteristic(this.platform.Characteristic.On, this.getGermShield());
        this.nightModeService?.updateCharacteristic(this.platform.Characteristic.On, this.getNightMode());
      }

      if (updateAirQuality) {
        this.airQualityService?.updateCharacteristic(this.platform.Characteristic.AirQuality, this.getAirQuality());
      }
    }
  }

  getActive(): CharacteristicValue {
    return this.device.state.standby === false ? this.platform.Characteristic.Active.ACTIVE : this.platform.Characteristic.Active.INACTIVE;
  }

  async setActive(value: CharacteristicValue) {
    this.platform.log.debug(`[${this.device.name}] Setting active to ${value}`);
    const waking = value === this.platform.Characteristic.Active.ACTIVE && this.device.state.standby === true;
    const preset = this.device.state.apsubmode;
    await this.device.setState('standby', value === this.platform.Characteristic.Active.INACTIVE);
    if (this.platform.onDemand && waking && this.device.deviceType === BlueAirDeviceType.BLUE_SIGNATURE && preset !== undefined) {
      // Reapply the prior preset even if cloud state still reports it after waking.
      await this.device.setState('apsubmode', preset, true);
    }
  }

  getCurrentAirPurifierState(): CharacteristicValue {
    if (this.device.state.standby === false) {
      return this.autoModeStrategy.isAuto(this.device.state) && this.device.state.fanspeed === 0
        ? this.platform.Characteristic.CurrentAirPurifierState.IDLE
        : this.platform.Characteristic.CurrentAirPurifierState.PURIFYING_AIR;
    }

    return this.platform.Characteristic.CurrentAirPurifierState.INACTIVE;
  }

  getTargetAirPurifierState(): CharacteristicValue {
    return this.autoModeStrategy.isAuto(this.device.state)
      ? this.platform.Characteristic.TargetAirPurifierState.AUTO
      : this.platform.Characteristic.TargetAirPurifierState.MANUAL;
  }

  async setTargetAirPurifierState(value: CharacteristicValue) {
    this.platform.log.debug(`[${this.device.name}] Setting target air purifier state to ${value}`);
    const { attribute, value: attributeValue } = this.autoModeStrategy.setAuto(
      value === this.platform.Characteristic.TargetAirPurifierState.AUTO,
    );
    await this.device.setState(
      attribute,
      attributeValue,
      this.platform.onDemand && this.device.deviceType === BlueAirDeviceType.BLUE_SIGNATURE,
    );
  }

  getLockPhysicalControls(): CharacteristicValue {
    return this.device.state.childlock
      ? this.platform.Characteristic.LockPhysicalControls.CONTROL_LOCK_ENABLED
      : this.platform.Characteristic.LockPhysicalControls.CONTROL_LOCK_DISABLED;
  }

  async setLockPhysicalControls(value: CharacteristicValue) {
    this.platform.log.debug(`[${this.device.name}] Setting lock physical controls to ${value}`);
    await this.device.setState('childlock', value === this.platform.Characteristic.LockPhysicalControls.CONTROL_LOCK_ENABLED);
  }

  getRotationSpeed(): CharacteristicValue {
    if (!this.platform.onDemand) {
      return this.device.state.standby === false ? this.device.state.fanspeed || 0 : 0;
    }
    // Active represents power; retain the configured speed while in standby.
    return this.queuedSpeed ?? (this.device.state.fanspeed || 0);
  }

  queueRotationSpeed(value: CharacteristicValue): void {
    const request = ++this.speedRequest;
    this.queuedSpeed = value;
    this.platform.log.debug(`[${this.device.name}] Queued HomeKit speed: ${value}; waiting for slider to settle`);
    // Acknowledge queue acceptance immediately; cloud completion is handled separately.
    void this.speedControl
      .set(value)
      .then(() => {
        if (request === this.speedRequest) {
          this.queuedSpeed = undefined;
          this.service.updateCharacteristic(this.platform.Characteristic.RotationSpeed, this.getRotationSpeed());
          this.platform.log.debug(`[${this.device.name}] Queued speed completed; reported speed: ${this.device.state.fanspeed}`);
        }
      })
      .catch((error: unknown) => {
        if (request === this.speedRequest) {
          this.queuedSpeed = undefined;
          this.service.updateCharacteristic(this.platform.Characteristic.RotationSpeed, this.getRotationSpeed());
          this.platform.log.warn(
            `[${this.device.name}] Queued speed failed: ${String(error)}; restored last reported speed ${this.device.state.fanspeed}`,
          );
        }
      });
  }

  async setRotationSpeed(value: CharacteristicValue) {
    this.platform.log.debug(`[${this.device.name}] Setting rotation speed to ${value}`);

    const speed = value as number;
    const waking = speed > 0 && this.device.state.standby === true;
    if (waking) {
      await this.device.setState('standby', false);
    }

    const { attribute, value: manualValue } = this.autoModeStrategy.setAuto(false);
    const forceSignature = this.platform.onDemand && this.device.deviceType === BlueAirDeviceType.BLUE_SIGNATURE;
    const reapplyAfterWake = waking && forceSignature;
    if (speed > 0 && attribute in this.device.state && (this.device.state[attribute] !== manualValue || reapplyAfterWake)) {
      await this.device.setState(attribute, manualValue, forceSignature);
    }

    await this.device.setState('fanspeed', speed);
  }

  getFilterChangeIndication(): CharacteristicValue {
    return this.device.state.filterusage !== undefined && this.device.state.filterusage >= this.configDev.filterChangeLevel
      ? this.platform.Characteristic.FilterChangeIndication.CHANGE_FILTER
      : this.platform.Characteristic.FilterChangeIndication.FILTER_OK;
  }

  getFilterLifeLevel(): CharacteristicValue {
    return Math.min(100, Math.max(0, 100 - (this.device.state.filterusage || 0)));
  }

  getCurrentTemperature(): CharacteristicValue {
    return this.device.sensorData.temperature || 0;
  }

  getLedOn(): CharacteristicValue {
    return this.device.state.brightness !== undefined && this.device.state.brightness > 0 && this.device.state.nightmode !== true;
  }

  async setLedOn(value: CharacteristicValue) {
    this.platform.log.debug(`[${this.device.name}] Setting LED on to ${value}`);
    await this.device.setLedOn(value as boolean);
  }

  getLedBrightness(): CharacteristicValue {
    return this.device.state.brightness || 0;
  }

  async setLedBrightness(value: CharacteristicValue) {
    this.platform.log.debug(`[${this.device.name}] Setting LED brightness to ${value}`);
    await this.device.setState('brightness', value as number);
  }

  getPM2_5Density(): CharacteristicValue {
    return this.device.sensorData.pm2_5 || 0;
  }

  getPM10Density(): CharacteristicValue {
    return this.device.sensorData.pm10 || 0;
  }

  getVOCDensity(): CharacteristicValue {
    return this.device.sensorData.voc || 0;
  }

  getAirQuality(): CharacteristicValue {
    if (this.device.sensorData.aqi === undefined) {
      return this.platform.Characteristic.AirQuality.UNKNOWN;
    }

    if (this.device.sensorData.aqi <= 50) {
      return this.platform.Characteristic.AirQuality.EXCELLENT;
    } else if (this.device.sensorData.aqi <= 100) {
      return this.platform.Characteristic.AirQuality.GOOD;
    } else if (this.device.sensorData.aqi <= 150) {
      return this.platform.Characteristic.AirQuality.FAIR;
    } else if (this.device.sensorData.aqi <= 200) {
      return this.platform.Characteristic.AirQuality.INFERIOR;
    } else {
      return this.platform.Characteristic.AirQuality.POOR;
    }
  }

  getGermShield(): CharacteristicValue {
    return this.device.state.germshield === true;
  }

  async setGermShield(value: CharacteristicValue) {
    this.platform.log.debug(`[${this.device.name}] Setting germ shield to ${value}`);
    await this.device.setState('germshield', value as boolean);
  }

  getNightMode(): CharacteristicValue {
    return this.device.state.nightmode === true;
  }

  async setNightMode(value: CharacteristicValue) {
    this.platform.log.debug(`[${this.device.name}] Setting night mode to ${value}`);
    await this.device.setState('nightmode', value as boolean);
  }
}
