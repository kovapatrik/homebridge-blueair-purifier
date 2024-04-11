import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import { BlueAirPlatform } from '../platform';
import { BlueAirDevice } from '../device/BlueAirDevice';
import { DeviceConfig } from '../platformUtils';

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
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'BlueAir')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.configDev.id);

    this.service = this.accessory.getService(this.platform.Service.AirPurifier) ||
                   this.accessory.addService(this.platform.Service.AirPurifier);

    this.service.setCharacteristic(this.platform.Characteristic.Name, this.configDev.name);
    this.service.getCharacteristic(this.platform.Characteristic.Active)
      .on('set', this.setActive.bind(this))
      .on('get', this.getActive.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.CurrentAirPurifierState)
      .on('get', this.getCurrentAirPurifierState.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.TargetAirPurifierState)
      .on('set', this.setTargetAirPurifierState.bind(this))
      .on('get', this.getTargetAirPurifierState.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.LockPhysicalControls)
      .on('set', this.setLockPhysicalControls.bind(this))
      .on('get', this.getLockPhysicalControls.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.RotationSpeed)
      .on('set', this.setRotationSpeed.bind(this))
      .on('get', this.getRotationSpeed.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.FilterChangeIndication)
      .on('get', this.getFilterChangeIndication.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.FilterLifeLevel)
      .on('get', this.getFilterLifeLevel.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .on('get', this.getCurrentTemperature.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
      .on('get', this.getCurrentRelativeHumidity.bind(this));
  }

  getActive(): CharacteristicValue {
    return this.device.state.standby ? this.platform.Characteristic.Active.INACTIVE : this.platform.Characteristic.Active.ACTIVE;
  }

  setActive(value: CharacteristicValue) {
    this.device.setState('standby', value === this.platform.Characteristic.Active.ACTIVE);
  }

  getCurrentAirPurifierState(): CharacteristicValue {
    return this.device.state.standby ?
      this.platform.Characteristic.CurrentAirPurifierState.PURIFYING_AIR :
      this.platform.Characteristic.CurrentAirPurifierState.IDLE;
  }

  getTargetAirPurifierState(): CharacteristicValue {
    return this.device.state.automode ?
      this.platform.Characteristic.TargetAirPurifierState.AUTO :
      this.platform.Characteristic.TargetAirPurifierState.MANUAL;
  }

  setTargetAirPurifierState(value: CharacteristicValue) {
    this.device.setState('automode', value === this.platform.Characteristic.TargetAirPurifierState.AUTO);
  }

  getLockPhysicalControls(): CharacteristicValue {
    return this.device.state.childlock ?
      this.platform.Characteristic.LockPhysicalControls.CONTROL_LOCK_ENABLED :
      this.platform.Characteristic.LockPhysicalControls.CONTROL_LOCK_DISABLED;
  }

  setLockPhysicalControls(value: CharacteristicValue) {
    this.device.setState('childlock', value === this.platform.Characteristic.LockPhysicalControls.CONTROL_LOCK_ENABLED);
  }

  getRotationSpeed(): CharacteristicValue {
    return this.device.state.fanspeed || 0;
  }

  setRotationSpeed(value: CharacteristicValue) {
    this.device.setState('fanspeed', value as number);
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