// Exercise the actual HomeKit handlers, platform routing and device writer
// together. Only the cloud boundary is replaced; no Blueair account is used.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createRequire } = require('node:module');
const hap = createRequire(require.resolve('homebridge'))('hap-nodejs');
const { BlueAirPlatform } = require('../dist/platform');
const { defaultDeviceConfig } = require('../dist/platformUtils');

async function fixture(pollingInterval) {
  const api = Object.assign(new EventEmitter(), {
    hap, platformAccessory: hap.Accessory, registerPlatformAccessories() {},
  });
  const config = {
    platform: 'blueair-purifier', name: 'Test', username: 'test', password: 'test', accountUuid: 'test',
    devices: [{ ...defaultDeviceConfig, id: 'test', name: 'Test' }],
  };
  if (pollingInterval !== undefined) config.pollingInterval = pollingInterval;
  const log = { info() {}, debug() {}, warn() {}, error() {} };
  const platform = new BlueAirPlatform(log, config, api);
  const status = {
    id: 'test', name: 'Test', sku: '114952',
    state: { standby: false, apsubmode: 1, fanspeed: 30 }, sensorData: {},
  };
  const calls = [];
  platform.blueAirApi = {
    async getDeviceStatus() {
      calls.push('read');
      return [{ ...status, state: { ...status.state } }];
    },
    async setDeviceStatus(id, attribute, value) {
      calls.push([attribute, value]);
      // Yield like a real network request so the legacy event listener is ready.
      await new Promise((resolve) => setImmediate(resolve));
      status.state[attribute] = value;
    },
  };
  const accessory = new hap.Accessory('Test', hap.uuid.generate(status.id));
  platform.accessories.push(accessory);
  await platform.addDevice({ ...status, state: { ...status.state } });
  return { platform, api, calls, service: accessory.getService(hap.Service.AirPurifier) };
}

test('HomeKit slider burst acknowledges before cloud work and executes only one read/write/verify', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { platform, api, calls, service } = await fixture(0);
  t.after(() => api.emit('shutdown'));
  const speed = service.getCharacteristic(hap.Characteristic.RotationSpeed);
  await speed.handleSetRequest(66);
  t.mock.timers.tick(1000);
  await speed.handleSetRequest(41);
  t.mock.timers.tick(1000);
  await speed.handleSetRequest(33);
  assert.deepEqual(calls, []);
  assert.equal(await speed.handleGetRequest(), 33);
  t.mock.timers.tick(1999);
  assert.deepEqual(calls, []);
  t.mock.timers.tick(1);
  // Wait for the platform queue and the mocked network response to settle.
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ['read', ['fanspeed', 33], 'read']);
  assert.equal(platform.devices[0].state.fanspeed, 33);
  assert.equal(platform.polling, null);
});

for (const interval of [undefined, 15000, 30000]) {
  test(`pollingInterval=${interval ?? 'omitted'} retains immediate awaited slider writes and cached GETs`, async (t) => {
    const { platform, api, calls, service } = await fixture(interval);
    t.after(() => api.emit('shutdown'));
    assert.equal(platform.onDemand, false);
    assert.equal(platform.devices[0].stateWriter, undefined);
    const speed = service.getCharacteristic(hap.Characteristic.RotationSpeed);
    await speed.handleSetRequest(41);
    await speed.handleSetRequest(33);
    assert.deepEqual(calls, [['fanspeed', 41], ['fanspeed', 33]]);
    assert.equal(await speed.handleGetRequest(), 33);
    assert.equal(calls.length, 2);
    assert.ok(platform.polling, 'legacy write schedules the next poll');
    await service.getCharacteristic(hap.Characteristic.Active).handleSetRequest(hap.Characteristic.Active.INACTIVE);
    assert.equal(await speed.handleGetRequest(), 0, 'legacy standby speed remains zero');
    await service.getCharacteristic(hap.Characteristic.Active).handleSetRequest(hap.Characteristic.Active.ACTIVE);
    assert.deepEqual(calls.slice(2), [['standby', true], ['standby', false]], 'no opt-in preset reapply');
  });
}

test('shutdown cancels the real HomeKit slider timer without a cloud write', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { api, calls, service } = await fixture(0);
  await service.getCharacteristic(hap.Characteristic.RotationSpeed).handleSetRequest(33);
  api.emit('shutdown');
  t.mock.timers.tick(3000);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, []);
});
