import { BlueAirDeviceState } from '../api/BlueAirAwsApi';
import { BlueAirDeviceType } from './BlueAirDeviceType';

export interface AutoModeStrategy {
  isAuto(state: BlueAirDeviceState): boolean;
  setAuto(isAuto: boolean): { attribute: string; value: number | boolean };
}

const defaultStrategy: AutoModeStrategy = {
  isAuto: (state) => Boolean(state.automode),
  setAuto: (isAuto) => ({ attribute: 'automode', value: isAuto }),
};

// Blue Signature devices don't expose `automode` at all; preset switching is
// done exclusively through `apsubmode` (0=manual_fan, 2=auto, 3=night, 4=eco).
// https://github.com/dahlb/ha_blueair issues #348/#261 (Signature owners' debug logs).
const blueSignatureStrategy: AutoModeStrategy = {
  isAuto: (state) => state.apsubmode === 2,
  setAuto: (isAuto) => ({ attribute: 'apsubmode', value: isAuto ? 2 : 0 }),
};

const AUTO_MODE_STRATEGIES: Partial<Record<BlueAirDeviceType, AutoModeStrategy>> = {
  [BlueAirDeviceType.BLUE_SIGNATURE]: blueSignatureStrategy,
};

export function getAutoModeStrategy(deviceType: BlueAirDeviceType): AutoModeStrategy {
  return AUTO_MODE_STRATEGIES[deviceType] ?? defaultStrategy;
}
