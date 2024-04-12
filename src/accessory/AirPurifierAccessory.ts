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

  }

  getActive(): CharacteristicValue {
    return this.device.state.standby ?
      this.platform.Characteristic.Active.INACTIVE :
      this.platform.Characteristic.Active.ACTIVE;
  }

  setActive(value: CharacteristicValue) {
    this.device.setState('standby', value === this.platform.Characteristic.Active.INACTIVE);
  }

  getCurrentAirPurifierState(): CharacteristicValue {

    if (this.device.state.standby) {
      return this.platform.Characteristic.CurrentAirPurifierState.INACTIVE;
    }

    return this.device.state.automode && this.device.state.fanspeed === 0 ?
      this.platform.Characteristic.CurrentAirPurifierState.IDLE :
      this.platform.Characteristic.CurrentAirPurifierState.PURIFYING_AIR;
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
    return this.device.state.standby === false ?
      this.device.state.fanspeed || 0:
      0;
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