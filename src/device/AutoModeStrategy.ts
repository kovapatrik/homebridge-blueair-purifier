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
// done exclusively through `apsubmode` (1=manual_fan, 2=auto, 3=night, 4=eco).
// https://github.com/dahlb/ha_blueair issues #348/#261 (Signature owners' debug logs).
const blueSignatureStrategy: AutoModeStrategy = {
  isAuto: (state) => state.apsubmode === 2,
  setAuto: (isAuto) => ({ attribute: 'apsubmode', value: isAuto ? 2 : 1 }),
};

// 2-in-1 Purify + Humidify combos have no `automode`; presets live on the `mode`
// field (1=fan/manual, 2=auto, 3=night, 4=eco, 5=skin/DermaSense).
// https://github.com/dahlb/blueair_api device_aws.py (combo_mode).
export const COMBO_MODE = {
  MANUAL: 1,
  AUTO: 2,
  NIGHT: 3,
  ECO: 4,
  DERMASENSE: 5,
} as const;

const combo2in1Strategy: AutoModeStrategy = {
  isAuto: (state) => state.mode === COMBO_MODE.AUTO,
  setAuto: (isAuto) => ({ attribute: 'mode', value: isAuto ? COMBO_MODE.AUTO : COMBO_MODE.MANUAL }),
};

const AUTO_MODE_STRATEGIES: Partial<Record<BlueAirDeviceType, AutoModeStrategy>> = {
  [BlueAirDeviceType.BLUE_SIGNATURE]: blueSignatureStrategy,
  [BlueAirDeviceType.COMBO_2IN1]: combo2in1Strategy,
};

export function getAutoModeStrategy(deviceType: BlueAirDeviceType): AutoModeStrategy {
  return AUTO_MODE_STRATEGIES[deviceType] ?? defaultStrategy;
}
