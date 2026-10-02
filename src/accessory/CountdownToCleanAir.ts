import { API, Characteristic, Formats, Perms, WithUUID } from 'homebridge';
import { BlueAirDevice } from '../device/BlueAirDevice';

export const COUNTDOWN_TO_CLEAN_AIR_UUID = '2c216842-f525-4640-b5fa-f1a0da82b8c6';

// Constructor shape the Service methods accept (getCharacteristic, testCharacteristic, ...).
export type CountdownToCleanAir = WithUUID<typeof Characteristic & { new (): Characteristic }>;

// Homebridge only re-exports Characteristic as a type, so the class has to be built from the
// API's HAP instance at runtime rather than declared at module scope.
export function createCountdownToCleanAir(api: API): CountdownToCleanAir {
  return class CountdownToCleanAir extends api.hap.Characteristic {
    static readonly UUID = COUNTDOWN_TO_CLEAN_AIR_UUID;

    constructor() {
      super('Countdown to Clean Air', COUNTDOWN_TO_CLEAN_AIR_UUID, {
        format: Formats.UINT16,
        perms: [Perms.PAIRED_READ, Perms.NOTIFY],
        unit: 'minutes',
        minValue: 0,
        maxValue: 1440,
      });
    }
  };
}

// Feature gate. The device is checked for the `aireta` state key rather than for a device type
// because it is not yet known which models report it. To gate on device type instead, change
// only this function, e.g. `return device.deviceType === BlueAirDeviceType.BLUE_PURE;`.
export function supportsCountdownToCleanAir(device: BlueAirDevice): boolean {
  return 'aireta' in device.state;
}
