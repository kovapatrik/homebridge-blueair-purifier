import EventEmitter from 'events';
import { BlueAirDeviceSensorData, BlueAirDeviceState, BlueAirDeviceStatus } from '../api/BlueAirAwsApi';

export class BlueAirDevice extends EventEmitter {

  public state: BlueAirDeviceState;
  public sensorData: BlueAirDeviceSensorData;

  constructor(
    private readonly id: string,
  ) {
    super();
    this.state = {};
    this.sensorData = {};

    this.on('state', (state) => {
      this.updateState(state);
    });
  }

  public setState(state: string, value: number | boolean | string) {
    if (state in this.state === false) {
      throw new Error(`Invalid state: ${state}`);
    }
    this.state[state] = value;

    this.emit('setState', {id: this.id, state, value});
  }

  private updateState(state: BlueAirDeviceStatus) {
    this.state = state.state;
    this.sensorData = state.sensorData;
  }
}
