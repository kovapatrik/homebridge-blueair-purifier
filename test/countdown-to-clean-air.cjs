// Run after building: node --test test/countdown-to-clean-air.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const hap = require('hap-nodejs');
const { PlatformAccessory } = require('homebridge/lib/platformAccessory');
const { AirPurifierAccessory } = require('../dist/accessory/AirPurifierAccessory');
const { createCountdownToCleanAir, COUNTDOWN_TO_CLEAN_AIR_UUID } = require('../dist/accessory/CountdownToCleanAir');

const config = {
  filterChangeLevel: 10, led: false, airQualitySensor: true, temperatureSensor: false,
  humiditySensor: false, germShield: false, nightMode: false, countdownToCleanAir: true,
};

function fixture() {
  const warnings = [];
  const platform = {
    log: { debug() {}, info() {}, warn: (m) => warnings.push(m), error: (m) => warnings.push(m) },
    Service: hap.Service,
    Characteristic: hap.Characteristic,
    CountdownToCleanAir: createCountdownToCleanAir({ hap }),
  };
  return { platform, warnings };
}

function device(state) {
  return Object.assign(new EventEmitter(), { id: 'dev', name: 'Test purifier', deviceType: 'Unknown', state, sensorData: {} });
}

// Simulates a Homebridge restart: the accessory is written to the cache and restored from it.
function cacheRoundTrip(accessory) {
  return PlatformAccessory.deserialize(JSON.parse(JSON.stringify(PlatformAccessory.serialize(accessory))));
}

function countdownEntries(accessory) {
  const service = accessory.getService(hap.Service.AirQualitySensor);
  return service.optionalCharacteristics.filter((c) => c.UUID === COUNTDOWN_TO_CLEAN_AIR_UUID).length;
}

test('optional characteristic is registered once across cached restarts', () => {
  const { platform, warnings } = fixture();
  let accessory = new PlatformAccessory('Test purifier', hap.uuid.generate('dev'));
  for (let restart = 0; restart < 4; restart++) {
    const adapter = new AirPurifierAccessory(platform, accessory, device({ aireta: 42 }), config);
    assert.equal(countdownEntries(accessory), 1);
    assert.equal(adapter.getCountdownToCleanAir(), 42);
    accessory = cacheRoundTrip(accessory);
  }
  assert.deepEqual(warnings, []);
});

test('device without aireta is skipped with a warning and a cached characteristic is removed', () => {
  const { platform, warnings } = fixture();
  let accessory = new PlatformAccessory('Test purifier', hap.uuid.generate('dev'));
  new AirPurifierAccessory(platform, accessory, device({ aireta: 42 }), config);
  accessory = cacheRoundTrip(accessory);

  new AirPurifierAccessory(platform, accessory, device({ fanspeed: 11 }), config);
  const service = accessory.getService(hap.Service.AirQualitySensor);
  assert.equal(service.testCharacteristic(platform.CountdownToCleanAir), false);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /does not report it/);
});

test('value is clamped to the characteristic range', () => {
  const adapter = Object.create(AirPurifierAccessory.prototype);
  adapter.device = { state: { aireta: 99999 } };
  assert.equal(adapter.getCountdownToCleanAir(), 1440);
  adapter.device = { state: { aireta: -5 } };
  assert.equal(adapter.getCountdownToCleanAir(), 0);
  adapter.device = { state: {} };
  assert.equal(adapter.getCountdownToCleanAir(), 0);
});
