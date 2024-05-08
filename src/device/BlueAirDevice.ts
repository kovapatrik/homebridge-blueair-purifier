import EventEmitter from 'events';
import { BlueAirDeviceSensorData, BlueAirDeviceState, BlueAirDeviceStatus, FullBlueAirDeviceState } from '../api/BlueAirAwsApi';
import Semaphore from 'semaphore-promise';

type AQILevels = {
  AQI_LO: number[];
  AQI_HI: number[];
  CONC_LO: number[];
  CONC_HI: number[];
};

// https://forum.airnowtech.org/t/the-aqi-equation-2024-valid-beginning-may-6th-2024
const AQI: { [key: string]: AQILevels } = {
  PM2_5: {
    AQI_LO: [0, 51, 101, 151, 201, 301],
    AQI_HI: [50, 100, 150, 200, 300, 500],
    CONC_LO: [0.0, 9.1, 35.5, 55.5, 125.5, 225.5],
    CONC_HI: [9.0, 35.4, 55.4, 125.4, 225.4, 325.4],
  },
  PM10: {
    AQI_LO: [0, 51, 101, 151, 201, 301],
    AQI_HI: [50, 100, 150, 200, 300, 500],
    CONC_LO: [0, 55, 155, 255, 355, 425],
    CONC_HI: [54, 154, 254, 354, 424, 604],
  },
  VOC: {
    AQI_LO: [0, 51, 101, 151, 201, 301],
    AQI_HI: [50, 100, 150, 200, 300, 500],
    CONC_LO: [0, 221, 661, 1431, 2201, 3301],
    CONC_HI: [220, 660, 1430, 2200, 3300, 5500],
  },
};

type BlueAirSensorDataWithAqi = BlueAirDeviceSensorData & { aqi?: number };

export class BlueAirDevice extends EventEmitter {
  public state: BlueAirDeviceState;
  public sensorData: BlueAirSensorDataWithAqi;

  public readonly id: string;
  public readonly name: string;

  private semaphore: Semaphore;

  private currentChanges: Partial<FullBlueAirDeviceState>;

  private last_brightness: number;

  constructor(device: BlueAirDeviceStatus) {
    super();
    this.id = device.id;
    this.name = device.name;

    this.state = device.state;
    this.sensorData = {
      ...device.sensorData,
      aqi: undefined,
    };
    this.sensorData.aqi = this.calculateAqi();

    this.semaphore = new Semaphore(1);
    this.currentChanges = {};

    this.last_brightness = this.state.brightness || 0;

    this.on('update', this.updateState.bind(this));
  }

  private notifyStateUpdate(newState?: Partial<BlueAirDeviceState>, newSensorData?: Partial<BlueAirDeviceSensorData>) {
    this.currentChanges = { ...this.currentChanges, ...newState, ...newSensorData };
    try {
      const release = this.semaphore.tryAcquire();
      this.state = { ...this.state, ...newState };
      this.sensorData = { ...this.sensorData, ...newSensorData };
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

    this.emit('setState', { id: this.id, name: this.name, attribute, value });

    const release = await this.semaphore.acquire();

    return new Promise<void>((resolve) => {
      this.once('setStateDone', (success) => {
        release();
        if (success) {
          // this.state[attribute] = value;
          this.notifyStateUpdate({ [attribute]: value });
        }
        resolve();
      });
    });
  }

  public async setLedOn(value: boolean) {
    if (!value) {
      this.last_brightness = this.state.brightness || 0;
    }
    const brightness = value ? this.last_brightness : 0;
    await this.setState('brightness', brightness);
  }

  private updateState(newState: BlueAirDeviceStatus) {
    const changedState: Partial<BlueAirDeviceState> = {};
    const changedSensorData: Partial<BlueAirSensorDataWithAqi> = {};

    for (const [k, v] of Object.entries(newState.state)) {
      if (this.state[k] !== v) {
        changedState[k] = v;
      }
    }
    for (const [k, v] of Object.entries(newState.sensorData)) {
      if (this.sensorData[k] !== v) {
        changedSensorData[k] = v;
        if (k === 'pm25' || k === 'pm10' || k === 'voc') {
          changedSensorData.aqi = this.calculateAqi();
        }
      }
    }
    this.notifyStateUpdate(changedState, changedSensorData);
  }

  private calculateAqi(): number | undefined {
    if (this.sensorData.pm2_5 === undefined && this.sensorData.pm10 === undefined && this.sensorData.voc === undefined) {
      return undefined;
    }

    const pm2_5 = Math.round((this.sensorData.pm2_5 || 0) * 10) / 10;
    const pm10 = this.sensorData.pm10 || 0;
    const voc = this.sensorData.voc || 0;

    const aqi_pm2_5 = this.calculateAqiForSensor(pm2_5, 'PM2_5');
    const aqi_pm10 = this.calculateAqiForSensor(pm10, 'PM10');
    const aqi_voc = this.calculateAqiForSensor(voc, 'VOC');

    return Math.max(aqi_pm2_5, aqi_pm10, aqi_voc);
  }

  private calculateAqiForSensor(value: number, sensor: string) {
    const levels = AQI[sensor];
    for (let i = 0; i < levels.AQI_LO.length; i++) {
      if (value >= levels.CONC_LO[i] && value <= levels.CONC_HI[i]) {
        return Math.round(
          ((levels.AQI_HI[i] - levels.AQI_LO[i]) / (levels.CONC_HI[i] - levels.CONC_LO[i])) * (value - levels.CONC_LO[i]) +
            levels.AQI_LO[i],
        );
      }
    }
    return 0;
  }
}
