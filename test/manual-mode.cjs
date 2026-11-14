// Run after building: node --test test/manual-mode.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AirPurifierAccessory } = require('../dist/accessory/AirPurifierAccessory');
const { getAutoModeStrategy } = require('../dist/device/AutoModeStrategy');
const { BlueAirDeviceType, getDeviceType, getMaxFanSpeed } = require('../dist/device/BlueAirDeviceType');

function fixture(state, type = BlueAirDeviceType.BLUE_SIGNATURE) {
  const adapter = Object.create(AirPurifierAccessory.prototype);
  const writes = [];
  adapter.autoModeStrategy = getAutoModeStrategy(type);
  adapter.isCombo = type === BlueAirDeviceType.COMBO_2IN1;
  adapter.maxFanSpeed = getMaxFanSpeed(type);
  adapter.platform = { log: { debug() {} }, Characteristic: { TargetAirPurifierState: { AUTO: 1, MANUAL: 0 } } };
  adapter.device = {
    name: 'Test purifier', state: { ...state },
    async setState(attribute, value) {
      assert.ok(attribute in this.state);
      writes.push([attribute, value]);
      this.state[attribute] = value;
    },
  };
  return { adapter, writes };
}

test('Signature explicit Manual uses preset 1 and Auto uses preset 2', async () => {
  const { adapter, writes } = fixture({ apsubmode: 2 });
  await adapter.setTargetAirPurifierState(0);
  assert.equal(adapter.getTargetAirPurifierState(), 0);
  await adapter.setTargetAirPurifierState(1);
  assert.equal(adapter.getTargetAirPurifierState(), 1);
  assert.deepEqual(writes, [['apsubmode', 1], ['apsubmode', 2]]);
});

for (const preset of [2, 3, 4]) {
  test(`Signature speed change exits preset ${preset} using Manual preset 1`, async () => {
    const { adapter, writes } = fixture({ standby: false, apsubmode: preset, fanspeed: 11 });
    await adapter.setRotationSpeed(33);
    assert.deepEqual(writes, [['apsubmode', 1], ['fanspeed', 33]]);
  });
}

test('Manual speed adjustment avoids redundant preset write', async () => {
  const { adapter, writes } = fixture({ standby: false, apsubmode: 1, fanspeed: 11 });
  await adapter.setRotationSpeed(33);
  assert.deepEqual(writes, [['fanspeed', 33]]);
});

test('standby speed change wakes before changing mode and speed', async () => {
  const { adapter, writes } = fixture({ standby: true, apsubmode: 2, fanspeed: 11 });
  await adapter.setRotationSpeed(33);
  assert.deepEqual(writes, [['standby', false], ['apsubmode', 1], ['fanspeed', 33]]);
});

test('zero speed does not wake device or switch preset', async () => {
  const { adapter, writes } = fixture({ standby: true, apsubmode: 2, fanspeed: 11 });
  await adapter.setRotationSpeed(0);
  assert.deepEqual(writes, [['fanspeed', 0]]);
});

test('Blue Pure keeps the boolean automode command', async () => {
  const { adapter, writes } = fixture({ standby: false, automode: true, fanspeed: 11 }, BlueAirDeviceType.BLUE_PURE);
  await adapter.setRotationSpeed(33);
  assert.deepEqual(writes, [['automode', false], ['fanspeed', 33]]);
});

test('device without a mode attribute can still change speed', async () => {
  const { adapter, writes } = fixture({ standby: false, fanspeed: 11 }, BlueAirDeviceType.UNKNOWN);
  await adapter.setRotationSpeed(33);
  assert.deepEqual(writes, [['fanspeed', 33]]);
});

test('2-in-1 Pro SKU and unlisted combos are detected as combo devices', () => {
  assert.equal(getDeviceType('113825'), BlueAirDeviceType.COMBO_2IN1);
  assert.equal(getDeviceType('999999', { mode: 2, hummode: true }), BlueAirDeviceType.COMBO_2IN1);
  assert.equal(getDeviceType('999999', { automode: true }), BlueAirDeviceType.UNKNOWN);
});

test('combo Auto/Manual uses the mode field', async () => {
  const { adapter, writes } = fixture({ standby: false, mode: 1, fanspeed: 37 }, BlueAirDeviceType.COMBO_2IN1);
  await adapter.setTargetAirPurifierState(1);
  assert.equal(adapter.getTargetAirPurifierState(), 1);
  await adapter.setTargetAirPurifierState(0);
  assert.equal(adapter.getTargetAirPurifierState(), 0);
  assert.deepEqual(writes, [['mode', 2], ['mode', 1]]);
});

test('combo speed change leaves auto and scales to the 0-91 range', async () => {
  const { adapter, writes } = fixture({ standby: false, mode: 2, fanspeed: 37 }, BlueAirDeviceType.COMBO_2IN1);
  await adapter.setRotationSpeed(100);
  assert.deepEqual(writes, [['mode', 1], ['fanspeed', 91]]);
  assert.equal(adapter.getRotationSpeed(), 100);
});

test('combo night mode and DermaSense switch the mode field', async () => {
  const { adapter, writes } = fixture({ standby: true, mode: 2 }, BlueAirDeviceType.COMBO_2IN1);
  await adapter.setNightMode(true);
  assert.equal(adapter.getNightMode(), true);
  await adapter.setDermaSense(true);
  assert.equal(adapter.getNightMode(), false);
  assert.equal(adapter.getDermaSense(), true);
  await adapter.setNightMode(false); // not in night mode: no write
  await adapter.setDermaSense(false);
  assert.deepEqual(writes, [['standby', false], ['mode', 3], ['mode', 5], ['mode', 1]]);
});
