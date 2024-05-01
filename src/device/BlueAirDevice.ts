import EventEmitter from 'events';
import { BlueAirDeviceSensorData, BlueAirDeviceState, BlueAirDeviceStatus, FullBlueAirDeviceState } from '../api/BlueAirAwsApi';
import Semaphore from 'semaphore-promise';

export class BlueAirDevice extends EventEmitter {

  public state: BlueAirDeviceState;
  public sensorData: BlueAirDeviceSensorData;

  public readonly id: string;
  public readonly name: string;

  private semaphore: Semaphore;

  private currentChanges: Partial<FullBlueAirDeviceState>;

  constructor(
    device: BlueAirDeviceStatus,
  ) {
    super();
    this.id = device.id;
    this.name = device.name;

    this.state = device.state;
    this.sensorData = device.sensorData;

    this.semaphore = new Semaphore(1);
    this.currentChanges = {};

    this.on('update', this.updateState.bind(this));
  }

  private notifyStateUpdate(newState?: Partial<BlueAirDeviceState>, newSensorData?: Partial<BlueAirDeviceSensorData>) {
    this.currentChanges = {...this.currentChanges, ...newState, ...newSensorData};
    try {
      const release = this.semaphore.tryAcquire();
      this.state = {...this.state, ...newState};
      this.sensorData = {...this.sensorData, ...newSensorData};
      this.emit('stateUpdated', this.currentChanges);
      this.currentChanges = {};
      release();
    } catch {
      return;
    }
  }

  public async setState(attribute: string, value: number | boolean | string) {
    if (attribute in this.state === false) {
      throw new Error(`Invalid state: ${attribute}`);
    }

    if (this.state[attribute] === value) {
      return;
    }

    this.emit('setState', {id: this.id, name: this.name, attribute, value});

    const release = await this.semaphore.acquire();

    return new Promise<void>((resolve) => {
      this.once('setStateDone', (success) => {
        release();
        if (success) {
          // this.notifyStateUpdate({[attribute]: value});
        }
        resolve();
      });
    });
  }

  private updateState(newState: BlueAirDeviceStatus) {

    const changedState: Partial<BlueAirDeviceState> = {};
    const changedSensorData: Partial<BlueAirDeviceSensorData> = {};

    for (const [k, v] of Object.entries(newState.state)) {
      if (this.state[k] !== v) {
        changedState[k] = v;
      }
    }
    for (const [k, v] of Object.entries(newState.sensorData)) {
      if (this.sensorData[k] !== v) {
        changedSensorData[k] = v;
      }
    }
    this.notifyStateUpdate(changedState, changedSensorData);
  }
}
