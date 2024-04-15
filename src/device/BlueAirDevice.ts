import EventEmitter from 'events';
import { BlueAirDeviceSensorData, BlueAirDeviceState, BlueAirDeviceStatus } from '../api/BlueAirAwsApi';

export class BlueAirDevice extends EventEmitter {

  public state: BlueAirDeviceState;
  public sensorData: BlueAirDeviceSensorData;

  private readonly id: string;

  constructor(
    device: BlueAirDeviceStatus,
  ) {
    super();
    this.id = device.id;
    this.state = device.state;
    this.sensorData = device.sensorData;

    this.on('update', this.updateState.bind(this));
  }

  public setState(state: string, value: number | boolean | string) {
    if (state in this.state === false) {
      throw new Error(`Invalid state: ${state}`);
    }
    this.state[state] = value;

    this.emit('setState', {id: this.id, state, value});
  }

  private updateState(state: BlueAirDeviceStatus) {
    if (state.id !== this.id) {
      return;
    }
    this.state = state.state;
    this.sensorData = state.sensorData;
  }
}
