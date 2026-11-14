const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const hap = createRequire(require.resolve('homebridge'))('hap-nodejs');
const { AirPurifierAccessory } = require('../dist/accessory/AirPurifierAccessory');
const { BlueAirDevice } = require('../dist/device/BlueAirDevice');
const { defaultDeviceConfig } = require('../dist/platformUtils');

test('startup publishes fetched manual mode over restored Auto without writing to device', () => {
  const accessory = new hap.Accessory('Test purifier', hap.uuid.generate('startup-test'));
  const service = accessory.addService(hap.Service.AirPurifier);
  service.updateCharacteristic(hap.Characteristic.TargetAirPurifierState, hap.Characteristic.TargetAirPurifierState.AUTO);
  const device = new BlueAirDevice({
    id: 'test', name: 'Test purifier', sku: '109556',
    state: { standby: false, automode: false, fanspeed: 30 }, sensorData: {},
  });
  let writes = 0;
  device.on('setState', () => { writes++; });
  const platform = {
    onDemand: true,
    Service: hap.Service, Characteristic: hap.Characteristic,
    log: { debug() {} }, executeCommand: async () => { writes++; },
  };
  new AirPurifierAccessory(platform, accessory, device, { ...defaultDeviceConfig, name: 'Test purifier' });
  assert.equal(service.getCharacteristic(hap.Characteristic.TargetAirPurifierState).value,
    hap.Characteristic.TargetAirPurifierState.MANUAL);
  assert.equal(writes, 0);
});

function signature(preset = 1, standby = true, sliderBufferMs = 2000) {
  const device = new BlueAirDevice({
    id: 'test', name: 'Signature', sku: '114952',
    state: { standby, apsubmode: preset, fanspeed: 30 }, sensorData: {},
  });
  const writes = [];
  device.stateWriter = async (attribute, value) => {
    writes.push([attribute, value]);
    device.state[attribute] = value;
  };
  const accessory = new hap.Accessory('Signature', hap.uuid.generate('signature-test'));
  const adapter = new AirPurifierAccessory({
    onDemand: true,
    Service: hap.Service, Characteristic: hap.Characteristic,
    sliderBufferMs, log: { debug() {}, info() {}, warn() {} }, executeCommand: async (device, action) => action(),
  }, accessory, device, { ...defaultDeviceConfig, name: 'Signature' });
  return { adapter, device, writes };
}

for (const preset of [1, 2, 3, 4]) {
  test(`Signature wake explicitly restores preset ${preset}`, async () => {
    const { adapter, writes } = signature(preset);
    await adapter.setActive(hap.Characteristic.Active.ACTIVE);
    assert.deepEqual(writes, [['standby', false], ['apsubmode', preset]]);
  });
}

test('Signature speed change wakes then explicitly selects Manual before setting speed', async () => {
  const { adapter, writes } = signature(2);
  await adapter.setRotationSpeed(50);
  assert.deepEqual(writes, [['standby', false], ['apsubmode', 1], ['fanspeed', 50]]);
});

test('Signature Manual command is sent even when cloud already reports Manual', async () => {
  const { adapter, writes } = signature(1, false);
  await adapter.setTargetAirPurifierState(hap.Characteristic.TargetAirPurifierState.MANUAL);
  assert.deepEqual(writes, [['apsubmode', 1]]);
});

test('Signature speed change avoids redundant Manual write when already awake in Manual', async () => {
  const { adapter, writes } = signature(1, false);
  await adapter.setRotationSpeed(50);
  assert.deepEqual(writes, [['fanspeed', 50]]);
});

test('Signature power off and redundant power on do not change preset', async () => {
  const { adapter, writes } = signature(2, false);
  await adapter.setActive(hap.Characteristic.Active.ACTIVE);
  assert.deepEqual(writes, []);
  await adapter.setActive(hap.Characteristic.Active.INACTIVE);
  assert.deepEqual(writes, [['standby', true]]);
});

test('failed wake prevents preset write', async () => {
  const { adapter, device } = signature();
  const writes = [];
  device.stateWriter = async (attribute) => { writes.push(attribute); throw new Error('offline'); };
  await assert.rejects(adapter.setActive(hap.Characteristic.Active.ACTIVE), /offline/);
  assert.deepEqual(writes, ['standby']);
});

test('standby retains the configured speed in HomeKit and power-on does not write 100', async () => {
  const { adapter, writes } = signature(1, true);
  assert.equal(adapter.getActive(), hap.Characteristic.Active.INACTIVE);
  assert.equal(adapter.getRotationSpeed(), 30);
  await adapter.setActive(hap.Characteristic.Active.ACTIVE);
  assert.equal(adapter.getRotationSpeed(), 30);
  assert.deepEqual(writes, [['standby', false], ['apsubmode', 1]]);
});

test('queued slider acknowledges immediately and rolling configured timer sends only final speed', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { adapter, writes } = signature(1, false);
  assert.equal(adapter.queueRotationSpeed(40), undefined);
  t.mock.timers.tick(1000);
  assert.equal(adapter.queueRotationSpeed(33), undefined);
  t.mock.timers.tick(1999);
  assert.deepEqual(writes, []);
  assert.equal(adapter.getRotationSpeed(), 33);
  t.mock.timers.tick(1);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(writes, [['fanspeed', 33]]);
  assert.equal(adapter.queuedSpeed, undefined);
});

test('asynchronous queued failure restores last reported speed and logs once', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { adapter, device } = signature(1, false);
  const warnings = [];
  adapter.platform.log.warn = (message) => warnings.push(message);
  device.stateWriter = async () => { throw new Error('offline'); };
  adapter.queueRotationSpeed(40);
  adapter.queueRotationSpeed(33);
  t.mock.timers.tick(5000);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(adapter.getRotationSpeed(), 30);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /offline/);
});

test('power-off cancels buffered speed before it can wake the device', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { adapter, writes } = signature(1, false);
  adapter.queueRotationSpeed(33);
  await adapter.service.getCharacteristic(hap.Characteristic.Active).handleSetRequest(hap.Characteristic.Active.INACTIVE);
  t.mock.timers.tick(5000);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(writes, [['standby', true]]);
});
