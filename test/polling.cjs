const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Mutex } = require('async-mutex');
const { BlueAirPlatform } = require('../dist/platform');
const { BlueAirDevice } = require('../dist/device/BlueAirDevice');

function fixture(interval = 0) {
  const platform = Object.create(BlueAirPlatform.prototype);
  platform.platformConfig = { pollingInterval: interval, accountUuid: 'account' };
  platform.commandMutex = new Mutex();
  platform.lastRefresh = new Map();
  platform.pendingReads = new Map();
  platform.polling = null;
  platform.log = { warn() {} };
  const calls = [];
  let state = { standby: true };
  const device = {
    id: 'device', name: 'Purifier', state: { standby: false },
    async updateState(value) { this.state = { ...value.state }; },
  };
  platform.blueAirApi = {
    async getDeviceStatus() { calls.push('read'); return [{ id: device.id, state }]; },
    async setDeviceStatus(id, attribute, value) { calls.push('write'); state = { ...state, [attribute]: value }; },
  };
  return { platform, device, calls };
}

test('zero disables recurring timers; positive intervals schedule them', () => {
  const { platform } = fixture();
  platform.schedulePolling();
  assert.equal(platform.polling, null);
  platform.platformConfig.pollingInterval = 15000;
  platform.schedulePolling();
  assert.ok(platform.polling);
  clearTimeout(platform.polling);
});

test('refresh precedes control decisions and verification replaces cached state', async () => {
  const { platform, device, calls } = fixture();
  await platform.executeCommand(device, async () => {
    assert.equal(device.state.standby, true);
    await platform.writeAndVerify(device, 'standby', false);
  });
  assert.deepEqual(calls, ['read', 'write', 'read']);
  assert.equal(device.state.standby, false);
  assert.equal(platform.polling, null);
});

test('failed refresh prevents action', async () => {
  const { platform, device } = fixture();
  platform.blueAirApi.getDeviceStatus = async () => [];
  let executed = false;
  await assert.rejects(platform.executeCommand(device, async () => { executed = true; }), /missing/);
  assert.equal(executed, false);
});

test('concurrent actions are serialized including their initial refresh', async () => {
  const { platform, device, calls } = fixture();
  await Promise.all([1, 2].map((n) => platform.executeCommand(device, async () => {
    calls.push(`start${n}`);
    await new Promise((resolve) => setImmediate(resolve));
    calls.push(`end${n}`);
  })));
  assert.deepEqual(calls, ['read', 'start1', 'end1', 'read', 'start2', 'end2']);
});

test('unconfirmed writes fail after bounded verification without inventing state', async () => {
  const { platform, device, calls } = fixture();
  platform.blueAirApi.setDeviceStatus = async () => { calls.push('write'); };
  await assert.rejects(platform.writeAndVerify(device, 'standby', false), /Could not verify/);
  assert.deepEqual(calls, ['write', 'read', 'read', 'read']);
  assert.equal(device.state.standby, true);
});

test('positive intervals retain the existing command path', async () => {
  const { platform, device, calls } = fixture(15000);
  await platform.executeCommand(device, async () => { calls.push('action'); });
  assert.deepEqual(calls, ['action']);
});

test('device uses verified writer and propagates failures', async () => {
  const device = Object.create(BlueAirDevice.prototype);
  device.state = { standby: true };
  device.stateWriter = async () => { throw new Error('write failed'); };
  await assert.rejects(device.setState('standby', false), /write failed/);
  assert.equal(device.state.standby, true);
  await device.setState('standby', true);
});

test('concurrent reads share one refresh and reuse it for 15 seconds', async (t) => {
  let now = 100000;
  t.mock.method(Date, 'now', () => now);
  const { platform, device, calls } = fixture();
  const read = () => platform.readDevice(device, () => device.state.standby);
  assert.deepEqual(await Promise.all([read(), read(), read()]), [false, false, false]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ['read']);
  now += 14999;
  await read();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ['read']);
  now++;
  await read();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ['read', 'read']);
  assert.equal(platform.polling, null);
});

test('read returns cached state immediately while command runs', async () => {
  const { platform, device, calls } = fixture();
  let started;
  let release;
  const ready = new Promise((resolve) => { started = resolve; });
  const blocked = new Promise((resolve) => { release = resolve; });
  const command = platform.executeCommand(device, async () => {
    started(); await blocked;
    await platform.writeAndVerify(device, 'standby', false);
  });
  await ready;
  const reading = platform.readDevice(device, () => device.state.standby);
  assert.equal(await reading, true);
  release();
  await command;
  assert.deepEqual(calls, ['read', 'write', 'read']);
});

test('failed background refresh retains cache and can be retried', async () => {
  const { platform, device, calls } = fixture();
  const original = platform.blueAirApi.getDeviceStatus;
  platform.blueAirApi.getDeviceStatus = async () => { throw new Error('cooldown'); };
  const results = await Promise.allSettled([1, 2].map(() => platform.readDevice(device, () => device.state)));
  assert.ok(results.every((r) => r.status === 'fulfilled'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(platform.pendingReads.size, 0);
  assert.equal(platform.lastRefresh.size, 0);
  platform.blueAirApi.getDeviceStatus = original;
  await platform.readDevice(device, () => device.state);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ['read']);
});

test('positive polling mode reads cache without extra cloud requests', async () => {
  const { platform, device, calls } = fixture(15000);
  assert.equal(await platform.readDevice(device, () => device.state.standby), false);
  assert.deepEqual(calls, []);
});

test('rate-limited reads retain last known state without marking it fresh', async () => {
  const { BlueAirRateLimitError } = require('../dist/api/BlueAirAwsApi');
  const { platform, device } = fixture();
  platform.blueAirApi.getDeviceStatus = async () => { throw new BlueAirRateLimitError('cooldown'); };
  assert.equal(await platform.readDevice(device, () => device.state.standby), false);
  assert.equal(platform.lastRefresh.size, 0);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(platform.pendingReads.size, 0);
});

test('rate-limited commands return a HomeKit busy error without executing', async () => {
  const { BlueAirRateLimitError } = require('../dist/api/BlueAirAwsApi');
  const { createRequire } = require('node:module');
  const hap = createRequire(require.resolve('homebridge'))('hap-nodejs');
  const { platform, device } = fixture();
  platform.api = { hap };
  platform.blueAirApi.getDeviceStatus = async () => { throw new BlueAirRateLimitError('cooldown'); };
  let executed = false;
  await assert.rejects(platform.executeCommand(device, async () => { executed = true; }),
    (error) => error instanceof hap.HapStatusError && error.hapStatus === hap.HAPStatus.RESOURCE_BUSY);
  assert.equal(executed, false);
});

test('startup retries after cooldown without another login or periodic polling in zero mode', async (t) => {
  const { BlueAirRateLimitError } = require('../dist/api/BlueAirAwsApi');
  const { platform } = fixture();
  platform.platformConfig.devices = [{ id: 'device', name: 'Purifier' }];
  platform.log = { info() {}, warn() {}, error() { assert.fail('unexpected startup error'); } };
  let callback;
  let delay;
  t.mock.method(global, 'setTimeout', (fn, ms) => { callback = fn; delay = ms; return undefined; });
  let logins = 0;
  let fetches = 0;
  let added = 0;
  platform.blueAirApi.login = async () => { logins++; };
  platform.blueAirApi.getCooldownRemaining = () => 30000;
  platform.blueAirApi.getDeviceStatus = async () => {
    if (++fetches === 1) { throw new BlueAirRateLimitError('cooldown'); }
    return [{ id: 'device' }];
  };
  platform.addDevice = () => { added++; };
  await platform.getInitialDeviceStates();
  assert.equal(delay, 31000);
  assert.equal(added, 0);
  callback();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(logins, 1);
  assert.equal(fetches, 2);
  assert.equal(added, 1);
  assert.equal(platform.polling, null);
});

test('startup does no work after shutdown', async () => {
  const { platform, calls } = fixture();
  platform.stopping = true;
  await platform.getInitialDeviceStates();
  assert.deepEqual(calls, []);
});
