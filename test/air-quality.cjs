// Run after building: node --test test/air-quality.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { BlueAirDevice } = require('../dist/device/BlueAirDevice');
const BlueAirAwsApi = require('../dist/api/BlueAirAwsApi').default;

const silentLogger = { debug() {}, info() {}, warn() {}, error() {}, log() {} };

function device(sensorData) {
  return new BlueAirDevice({ id: 'dev1', name: 'Test purifier', sku: '112921', state: {}, sensorData });
}

function aqiFor(sensorData) {
  return device(sensorData).sensorData.aqi;
}

test('a reading past the top of the scale reports the worst air quality, not the best', () => {
  assert.equal(aqiFor({ pm2_5: 400 }), 500);
  assert.equal(aqiFor({ pm10: 900 }), 500);
  assert.equal(aqiFor({ voc: 6000 }), 500);
});

test('a reading landing between two bands is truncated into the lower band', () => {
  assert.equal(aqiFor({ pm10: 54.5 }), 50);
  assert.equal(aqiFor({ voc: 220.5 }), 50);
  assert.equal(aqiFor({ pm2_5: 9.07 }), 50);
});

test('band boundaries map to the published index values', () => {
  assert.equal(aqiFor({ pm2_5: 0 }), 0);
  assert.equal(aqiFor({ pm2_5: 9.0 }), 50);
  assert.equal(aqiFor({ pm2_5: 9.1 }), 51);
  assert.equal(aqiFor({ pm2_5: 35.4 }), 100);
  assert.equal(aqiFor({ pm2_5: 325.4 }), 500);
});

test('the worst pollutant wins and missing ones do not count as clean', () => {
  assert.equal(aqiFor({ pm2_5: 5, pm10: 300, voc: 100 }), 173);
  assert.equal(aqiFor({ voc: 3301 }), 301);
  assert.equal(aqiFor({}), undefined);
  assert.equal(aqiFor({ temperature: 21, humidity: 40 }), undefined);
});

test('air quality is recalculated from the new readings, not the previous poll', async () => {
  const purifier = device({ pm2_5: 5 });
  assert.equal(purifier.sensorData.aqi, 28);

  const changed = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no stateUpdated event')), 1000);
    purifier.once('stateUpdated', (update) => {
      clearTimeout(timer);
      resolve(update);
    });
    purifier.emit('update', { id: 'dev1', name: 'Test purifier', sku: '112921', state: {}, sensorData: { pm2_5: 400 } });
  });

  assert.equal(changed.pm2_5, 400);
  assert.equal(changed.aqi, 500);
  assert.equal(purifier.sensorData.aqi, 500);
});

test('an unchanged air quality figure is not republished', async () => {
  const purifier = device({ pm2_5: 1 });
  assert.equal(purifier.sensorData.aqi, 6);

  const changed = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no stateUpdated event')), 1000);
    purifier.once('stateUpdated', (update) => {
      clearTimeout(timer);
      resolve(update);
    });
    // 1.0 and 1.09 both truncate to 1.0, so the index does not move.
    purifier.emit('update', { id: 'dev1', name: 'Test purifier', sku: '112921', state: {}, sensorData: { pm2_5: 1.09 } });
  });

  assert.equal(changed.pm2_5, 1.09);
  assert.ok(!('aqi' in changed));
});

function stubbedApi(handler) {
  const api = new BlueAirAwsApi('user', 'pass', 'USA', silentLogger);
  const calls = [];
  api.checkTokenExpiration = async () => {};
  api.apiCall = async (url, data, method) => {
    calls.push(url);
    return handler(url, data, method);
  };
  return { api, calls };
}

function initialResponse(sensordata) {
  return {
    deviceInfo: [
      {
        id: 'dev1',
        configuration: { di: { name: 'Test purifier', sku: '112921' }, ds: { pm2_5: {}, pm10: {}, tVOC: {} } },
        sensordata,
        states: [{ n: 'standby', vb: false }],
      },
    ],
  };
}

test('telemetry takes the most recent value each sensor actually reported', async () => {
  const { api } = stubbedApi(() => [
    {
      did: 'dev1',
      sensors: ['pm2_5', 'pm10', 'tVOC'],
      datapoints: [
        ['1700000000', '12', '20', '150'],
        ['1700000300', '13', null, ''],
      ],
      start: '',
      end: '',
    },
  ]);

  const telemetry = await api.getDeviceTelemetry('account', 'dev1', ['pm2_5', 'pm10', 'tVOC']);
  assert.deepEqual(telemetry, { pm2_5: 13, pm10: 20, voc: 150 });
});

test('sensors the snapshot omits are backfilled without overwriting the ones it returned', async () => {
  const { api, calls } = stubbedApi((url) => {
    if (url.includes('/r/initial')) {
      return initialResponse([{ n: 'pm10', t: 1, v: 20 }]);
    }
    return [
      {
        did: 'dev1',
        sensors: ['pm2_5', 'pm10', 'tVOC'],
        datapoints: [['1700000000', '13', '99', '150']],
        start: '',
        end: '',
      },
    ];
  });

  const [status] = await api.getDeviceStatus('account', ['dev1']);
  assert.deepEqual(status.sensorData, { pm2_5: 13, pm10: 20, voc: 150 });

  // Telemetry is aggregated in 5 minute buckets, so a second poll reuses the cache
  // rather than spending another call against the account's rate limit.
  const [second] = await api.getDeviceStatus('account', ['dev1']);
  assert.deepEqual(second.sensorData, { pm2_5: 13, pm10: 20, voc: 150 });
  assert.equal(calls.filter((url) => url.includes('/telemetry/')).length, 1);
});

test('a complete snapshot does not trigger a telemetry call at all', async () => {
  const { api, calls } = stubbedApi(() =>
    initialResponse([
      { n: 'pm2_5', t: 1, v: 12 },
      { n: 'pm10', t: 1, v: 20 },
      { n: 'tVOC', t: 1, v: 150 },
    ]),
  );

  const [status] = await api.getDeviceStatus('account', ['dev1']);
  assert.deepEqual(status.sensorData, { pm2_5: 12, pm10: 20, voc: 150 });
  assert.equal(
    calls.filter((url) => url.includes('/telemetry/')).length,
    0,
  );
});

test('a sensor the snapshot has delivered before is never replaced by telemetry', async () => {
  let snapshot = [
    { n: 'pm2_5', t: 1, v: 50 },
    { n: 'pm10', t: 1, v: 20 },
    { n: 'tVOC', t: 1, v: 150 },
  ];

  const { api, calls } = stubbedApi((url) => {
    if (url.includes('/r/initial')) {
      return initialResponse(snapshot);
    }
    return [{ did: 'dev1', sensors: ['pm2_5'], datapoints: [['1700000000', '5']], start: '', end: '' }];
  });

  await api.getDeviceStatus('account', ['dev1']);

  // The device goes quiet on PM2.5 for a poll. Telemetry still holds the older bucket,
  // so backfilling would walk the reading backwards from 50 to 5. BlueAirDevice keeps
  // the last value for a key it does not receive, which is the fresher answer.
  snapshot = [
    { n: 'pm10', t: 2, v: 21 },
    { n: 'tVOC', t: 2, v: 151 },
  ];
  const [second] = await api.getDeviceStatus('account', ['dev1']);

  assert.deepEqual(second.sensorData, { pm10: 21, voc: 151 });
  assert.equal(calls.filter((url) => url.includes('/telemetry/')).length, 0);
});

test('a failed telemetry call leaves the snapshot readings alone', async () => {
  const { api } = stubbedApi((url) => {
    if (url.includes('/r/initial')) {
      return initialResponse([{ n: 'pm10', t: 1, v: 20 }]);
    }
    throw new Error('429 rate limited');
  });

  const [status] = await api.getDeviceStatus('account', ['dev1']);
  assert.deepEqual(status.sensorData, { pm10: 20 });
});
