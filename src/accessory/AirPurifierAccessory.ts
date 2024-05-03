import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import { BlueAirPlatform } from '../platform';
import { BlueAirDevice } from '../device/BlueAirDevice';
import { DeviceConfig } from '../platformUtils';
import { FullBlueAirDeviceState } from '../api/BlueAirAwsApi';

export class AirPurifierAccessory {

  private service: Service;

  constructor(
    protected readonly platform: BlueAirPlatform,
    protected readonly accessory: PlatformAccessory,
    protected readonly device: BlueAirDevice,
    protected readonly configDev: DeviceConfig,
  ) {
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'BlueAir');

    this.service = this.accessory.getService(this.platform.Service.AirPurifier) ||
                   this.accessory.addService(this.platform.Service.AirPurifier);

    this.service.setCharacteristic(this.platform.Characteristic.Name, this.configDev.name);
    this.service.getCharacteristic(this.platform.Characteristic.Active)
      .onGet(this.getActive.bind(this))
      .onSet(this.setActive.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.CurrentAirPurifierState)
      .onGet(this.getCurrentAirPurifierState.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.TargetAirPurifierState)
      .onGet(this.getTargetAirPurifierState.bind(this))
      .onSet(this.setTargetAirPurifierState.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.LockPhysicalControls)
      .onGet(this.getLockPhysicalControls.bind(this))
      .onSet(this.setLockPhysicalControls.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.RotationSpeed)
      .onGet(this.getRotationSpeed.bind(this))
      .onSet(this.setRotationSpeed.bind(this));

    // this.service.getCharacteristic(this.platform.Characteristic.FilterChangeIndication)
    //   .onGet(this.getFilterChangeIndication.bind(this));

    // this.service.getCharacteristic(this.platform.Characteristic.FilterLifeLevel)
    //   .onGet(this.getFilterLifeLevel.bind(this));

    // this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
    //   .onGet(this.getCurrentTemperature.bind(this));

    // this.service.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
    //   .onGet(this.getCurrentRelativeHumidity.bind(this));

    this.device.on('stateUpdated', this.updateCharacteristics.bind(this));
  }

  updateCharacteristics(changedStates: Partial<FullBlueAirDeviceState>) {
    for (const [k, v] of Object.entries(changedStates)) {
      this.platform.log.debug(`[${this.device.name}] ${k} changed to ${v}`);
      switch (k) {
        case 'standby':
          this.service.updateCharacteristic(this.platform.Characteristic.Active, this.getActive());
          this.service.updateCharacteristic(this.platform.Characteristic.CurrentAirPurifierState, this.getCurrentAirPurifierState());
          break;
        case 'automode':
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
        case 'humidity':
          this.service.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.getCurrentRelativeHumidity());
          break;
      }
    }
  }

  getActive(): CharacteristicValue {
    this.platform.log.debug(`[${this.device.name}] Active: ${!this.device.state.standby}`);
    return this.device.state.standby === false ?
      this.platform.Characteristic.Active.ACTIVE :
      this.platform.Characteristic.Active.INACTIVE;
  }

  async setActive(value: CharacteristicValue) {
    await this.device.setState('standby', value === this.platform.Characteristic.Active.INACTIVE);
  }

  getCurrentAirPurifierState(): CharacteristicValue {
    if (this.device.state.standby === false) {
      return this.device.state.automode && this.device.state.fanspeed === 0 ?
        this.platform.Characteristic.CurrentAirPurifierState.IDLE :
        this.platform.Characteristic.CurrentAirPurifierState.PURIFYING_AIR;
    }

    return this.platform.Characteristic.CurrentAirPurifierState.INACTIVE;

  }

  getTargetAirPurifierState(): CharacteristicValue {
    return this.device.state.automode ?
      this.platform.Characteristic.TargetAirPurifierState.AUTO :
      this.platform.Characteristic.TargetAirPurifierState.MANUAL;
  }

  async setTargetAirPurifierState(value: CharacteristicValue) {
    await this.device.setState('automode', value === this.platform.Characteristic.TargetAirPurifierState.AUTO);
  }

  getLockPhysicalControls(): CharacteristicValue {
    return this.device.state.childlock ?
      this.platform.Characteristic.LockPhysicalControls.CONTROL_LOCK_ENABLED :
      this.platform.Characteristic.LockPhysicalControls.CONTROL_LOCK_DISABLED;
  }

  async setLockPhysicalControls(value: CharacteristicValue) {
    await this.device.setState('childlock', value === this.platform.Characteristic.LockPhysicalControls.CONTROL_LOCK_ENABLED);
  }

  getRotationSpeed(): CharacteristicValue {
    return this.device.state.standby === false ?
      this.device.state.fanspeed || 0:
      0;
  }

  async setRotationSpeed(value: CharacteristicValue) {
    await this.device.setState('fanspeed', value as number);
  }

  getFilterChangeIndication(): CharacteristicValue {

    if (this.device.state.filterusage === undefined) {
      return this.platform.Characteristic.FilterChangeIndication.FILTER_OK;
    }

    return this.device.state.filterusage < 95 ?
      this.platform.Characteristic.FilterChangeIndication.FILTER_OK :
      this.platform.Characteristic.FilterChangeIndication.CHANGE_FILTER;
  }

  getFilterLifeLevel(): CharacteristicValue {
    return this.device.state.filterusage || 0;
  }

  getCurrentTemperature(): CharacteristicValue {
    return this.device.sensorData.temperature || 0;
  }

  getCurrentRelativeHumidity(): CharacteristicValue {
    return this.device.sensorData.humidity || 0;
  }
}
