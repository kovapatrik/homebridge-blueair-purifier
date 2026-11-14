export enum BlueAirDeviceType {
  BLUE_PURE = 'Blue Pure',
  BLUE_SIGNATURE = 'Blue Signature',
  COMBO_2IN1 = '2-in-1 Purify + Humidify',
  UNKNOWN = 'Unknown',
}

const BLUE_PURE_SKUS = [
  '109556',
  '110059',
  '110035',
  '980034',
  '980035',
  '115334',
  '115335',
  '109538',
  '110033',
  '110092',
  '110829',
  '980032',
  '109539',
  '110034',
  '110327',
  '110058',
  '113625',
  '980033',
  '109554',
  '110031',
  '110057',
  '115694',
  '111582',
  '111583',
  '112637',
  '111178',
  '111186',
  '111187',
  '111188',
  '114841',
  '114879',
  '980030',
  '980031',
  '110161',
  '110172',
  '110178',
  '110079',
  '110085',
  '110157',
  '109583',
  '110162',
  '115711',
  '110086',
  '110080',
  '110158',
  '110163',
  '110173',
  '110179',
  '110088',
  '110081',
  '110159',
  '109609',
  '114844',
  '111905',
  '110175',
  '114114',
  '110596',
  '110899',
  '109886',
  '109596',
  '115650',
  '115651',
  '115917',
];

const BLUE_SIGNATURE_SKUS = [
  '112921',
  '113079',
  '113899',
  '113900',
  '113440',
  '112931',
  '112933',
  '113774',
  '113981',
  '113439',
  '112932',
  '112934',
  '113769',
  '113982',
  '112927',
  '112929',
  '112928',
  '112930',
  '112935',
  '112936',
  '113988',
  '113994',
  '113853',
  '113857',
  '113861',
  '113865',
  '114461',
  '114467',
  '114469',
  '114645',
  '113849',
  '113855',
  '113859',
  '113863',
  '114460',
  '114466',
  '114468',
  '114644',
  '114966',
  '114883',
  '115918',
  '114950',
  '114952',
  '114954',
  '114956',
  '114958',
  '114960',
  '114962',
  '114964',
  '114949',
  '114951',
  '114953',
  '114955',
  '114957',
  '114959',
  '114961',
  '114963',
  '115830',
];

// 2-in-1 Purify + Humidify (DH3i, hw='s_cmb2in1') and Air Purifier + Humidifier
// 2-in-1 Pro (hw='cmb2in1_ii'). SKUs from dahlb/blueair_api sku_map.py.
const COMBO_2IN1_SKUS = [
  // 2-in-1 Purify + Humidify
  '111810',
  '111811',
  '112663',
  '112956',
  // 2-in-1 Pro
  '113825',
  '113826',
  '113827',
  '114614',
];

// Highest raw `fanspeed` value per device type. Devices not listed use 0-100.
// Combo devices run on a 0-91 scale (gears 11/37/64/91).
const MAX_FAN_SPEED: Partial<Record<BlueAirDeviceType, number>> = {
  [BlueAirDeviceType.COMBO_2IN1]: 91,
};

export function getMaxFanSpeed(deviceType: BlueAirDeviceType): number {
  return MAX_FAN_SPEED[deviceType] ?? 100;
}

export function getDeviceType(sku: string, state: Record<string, unknown> = {}): BlueAirDeviceType {
  if (BLUE_PURE_SKUS.includes(sku)) {
    return BlueAirDeviceType.BLUE_PURE;
  }
  if (BLUE_SIGNATURE_SKUS.includes(sku)) {
    return BlueAirDeviceType.BLUE_SIGNATURE;
  }
  if (COMBO_2IN1_SKUS.includes(sku)) {
    return BlueAirDeviceType.COMBO_2IN1;
  }
  // Unlisted regional SKUs: recognise combos by their independent humidifier
  // switch (`hummode`) plus the `mode` preset selector.
  if ('hummode' in state && 'mode' in state) {
    return BlueAirDeviceType.COMBO_2IN1;
  }
  return BlueAirDeviceType.UNKNOWN;
}
