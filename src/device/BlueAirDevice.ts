import EventEmitter from 'events';
import {
  AQI_SENSOR_KEYS,
  BlueAirDeviceSensorData,
  BlueAirDeviceState,
  BlueAirDeviceStatus,
  FullBlueAirDeviceState,
} from '../api/BlueAirAwsApi';
import { BlueAirDeviceType, getDeviceType } from './BlueAirDeviceType';
import { Mutex } from 'async-mutex';

type AQILevels = {
  AQI_LO: number[];
  AQI_HI: number[];
  CONC_LO: number[];
  CONC_HI: number[];
  // Decimal places a reading is truncated to before the bands are applied. The bands
  // leave deliberate gaps (PM10 stops at 54 and picks up again at 55) which only close
  // once the reading is cut down to the precision the pollutant is reported at.
  DECIMALS: number;
};

// https://forum.airnowtech.org/t/the-aqi-equation-2024-valid-beginning-may-6th-2024
const AQI: { [key: string]: AQILevels } = {
  PM2_5: {
    AQI_LO: [0, 51, 101, 151, 201, 301],
    AQI_HI: [50, 100, 150, 200, 300, 500],
    CONC_LO: [0.0, 9.1, 35.5, 55.5, 125.5, 225.5],
    CONC_HI: [9.0, 35.4, 55.4, 125.4, 225.4, 325.4],
    DECIMALS: 1,
  },
  PM10: {
    AQI_LO: [0, 51, 101, 151, 201, 301],
    AQI_HI: [50, 100, 150, 200, 300, 500],
    CONC_LO: [0, 55, 155, 255, 355, 425],
    CONC_HI: [54, 154, 254, 354, 424, 604],
    DECIMALS: 0,
  },
  VOC: {
    AQI_LO: [0, 51, 101, 151, 201, 301],
    AQI_HI: [50, 100, 150, 200, 300, 500],
    CONC_LO: [0, 221, 661, 1431, 2201, 3301],
    CONC_HI: [220, 660, 1430, 2200, 3300, 5500],
    DECIMALS: 0,
  },
};

type BlueAirSensorDataWithAqi = BlueAirDeviceSensorData & { aqi?: number };

type PendingChanges = {
  state: Partial<BlueAirDeviceState>;
  sensorData: Partial<BlueAirSensorDataWithAqi>;
};

interface BlueAirDeviceEvents {
  stateUpdated: (changedStates: Partial<FullBlueAirDeviceState>) => void;
  update: (newState: BlueAirDeviceStatus) => void;
  setState: (data: { id: string; name: string; attribute: string; value: number | boolean }) => void;
  setStateDone: (success: boolean) => void;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface BlueAirDevice {
  on<K extends keyof BlueAirDeviceEvents>(event: K, listener: BlueAirDeviceEvents[K]): this;
  emit<K extends keyof BlueAirDeviceEvents>(event: K, ...args: Parameters<BlueAirDeviceEvents[K]>): boolean;
  once<K extends keyof BlueAirDeviceEvents>(event: K, listener: BlueAirDeviceEvents[K]): this;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class BlueAirDevice extends EventEmitter {
  public state: BlueAirDeviceState;
  public sensorData: BlueAirSensorDataWithAqi;

  public readonly id: string;
  public readonly name: string;
  public readonly sku: string;
  public readonly deviceType: BlueAirDeviceType;

  private mutex: Mutex;

  private currentChanges: PendingChanges;

  private last_brightness: number;

  constructor(device: BlueAirDeviceStatus) {
    super();
    this.id = device.id;
    this.name = device.name;
    this.sku = device.sku;
    this.deviceType = getDeviceType(device.sku);

    this.state = device.state;
    this.sensorData = { ...device.sensorData };
    this.sensorData.aqi = this.calculateAqi(this.sensorData);

    this.mutex = new Mutex();
    this.currentChanges = {
      state: {},
      sensorData: {},
    };

    this.last_brightness = this.state.brightness || 0;

    this.on('update', this.updateState.bind(this));
  }

  private hasChanges(changes: PendingChanges): boolean {
    return Object.keys(changes.state).length > 0 || Object.keys(changes.sensorData).length > 0;
  }

  private async notifyStateUpdate(newState?: Partial<BlueAirDeviceState>, newSensorData?: Partial<BlueAirDeviceSensorData>) {
    this.currentChanges = {
      state: {
        ...this.currentChanges.state,
        ...newState,
      },
      sensorData: {
        ...this.currentChanges.sensorData,
        ...newSensorData,
      },
    };

    // always acquire the mutex to ensure all changes are eventually applied
    const release = await this.mutex.acquire();

    const changesToApply = this.currentChanges;
    this.currentChanges = { state: {}, sensorData: {} };

    // if there is a change, emit update event
    if (this.hasChanges(changesToApply)) {
      this.state = { ...this.state, ...changesToApply.state };
      this.sensorData = { ...this.sensorData, ...changesToApply.sensorData };
      this.emit('stateUpdated', { ...changesToApply.state, ...changesToApply.sensorData });
    }

    release();
  }

  public async setState(attribute: string, value: number | boolean) {
    if (attribute in this.state === false) {
      throw new Error(`Invalid state: ${attribute}`);
    }

    if (this.state[attribute] === value) {
      return;
    }

    this.emit('setState', { id: this.id, name: this.name, attribute, value });

    const release = await this.mutex.acquire();

    return new Promise<void>((resolve) => {
      this.once('setStateDone', async (success) => {
        release();
        if (success) {
          const newState: Partial<BlueAirDeviceState> = { [attribute]: value };
          if (attribute === 'nightmode' && value === true) {
            newState['fanspeed'] = 11;
            newState['brightness'] = 0;
          }
          await this.notifyStateUpdate(newState);
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

  private async updateState(newState: BlueAirDeviceStatus) {
    const changedState: Partial<BlueAirDeviceState> = {};
    const changedSensorData: Partial<BlueAirSensorDataWithAqi> = {};

    for (const [k, v] of Object.entries(newState.state)) {
      if (this.state[k] !== v) {
        changedState[k] = v;
      }
    }
    let aqiInputChanged = false;
    for (const [k, v] of Object.entries(newState.sensorData)) {
      if (this.sensorData[k] !== v) {
        changedSensorData[k] = v;
        if (AQI_SENSOR_KEYS.includes(k)) {
          aqiInputChanged = true;
        }
      }
    }

    if (aqiInputChanged) {
      // this.sensorData still holds the previous poll until notifyStateUpdate applies
      // the changes, so the AQI has to be worked out against the merged readings.
      // Calculating it off this.sensorData left HomeKit a poll behind the sensors.
      const aqi = this.calculateAqi({ ...this.sensorData, ...changedSensorData });
      if (aqi !== this.sensorData.aqi) {
        changedSensorData.aqi = aqi;
      }
    }

    await this.notifyStateUpdate(changedState, changedSensorData);
  }

  private calculateAqi(sensorData: BlueAirSensorDataWithAqi): number | undefined {
    // A sensor the device does not report is left out rather than counted as a reading
    // of zero, so a missing pollutant cannot pull the overall figure down.
    const subIndexes = [
      this.calculateAqiForSensor(sensorData.pm2_5, 'PM2_5'),
      this.calculateAqiForSensor(sensorData.pm10, 'PM10'),
      this.calculateAqiForSensor(sensorData.voc, 'VOC'),
    ].filter((subIndex): subIndex is number => subIndex !== undefined);

    if (subIndexes.length === 0) {
      return undefined;
    }

    return Math.max(...subIndexes);
  }

  private calculateAqiForSensor(value: number | undefined, sensor: string): number | undefined {
    if (value === undefined || isNaN(value)) {
      return undefined;
    }

    const levels = AQI[sensor];
    const top = levels.AQI_LO.length - 1;

    const factor = Math.pow(10, levels.DECIMALS);
    const concentration = Math.floor(value * factor) / factor;

    if (concentration <= levels.CONC_LO[0]) {
      return levels.AQI_LO[0];
    }

    // Readings past the top band are beyond the scale and report at the top of it.
    // Falling through to a default of 0 used to show wildfire smoke as Excellent.
    if (concentration >= levels.CONC_HI[top]) {
      return levels.AQI_HI[top];
    }

    for (let i = 0; i <= top; i++) {
      if (concentration <= levels.CONC_HI[i]) {
        return Math.round(
          ((levels.AQI_HI[i] - levels.AQI_LO[i]) / (levels.CONC_HI[i] - levels.CONC_LO[i])) * (concentration - levels.CONC_LO[i]) +
            levels.AQI_LO[i],
        );
      }
    }

    return levels.AQI_HI[top];
  }
}
