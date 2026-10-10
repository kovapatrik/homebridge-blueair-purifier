const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Mutex } = require('async-mutex');
const { CoalescedControl } = require('../dist/device/CoalescedControl');
const { default: BlueAirAwsApi, BlueAirRateLimitError } = require('../dist/api/BlueAirAwsApi');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('slider burst executes only the latest value and settles every caller', async () => {
  const values = [];
  const control = new CoalescedControl(async (value) => { values.push(value); }, 5);
  await Promise.all([10, 20, 30, 40].map((value) => control.set(value)));
  assert.deepEqual(values, [40]);
});

test('updates during an active command collapse into one subsequent command', async () => {
  const values = [];
  let release;
  let started;
  const ready = new Promise((resolve) => { started = resolve; });
  const blocked = new Promise((resolve) => { release = resolve; });
  const control = new CoalescedControl(async (value) => {
    values.push(value);
    if (value === 10) { started(); await blocked; }
  }, 5);
  const first = control.set(10);
  await ready;
  const rest = [20, 30, 40].map((value) => control.set(value));
  await sleep(15);
  assert.deepEqual(values, [10]);
  release();
  await Promise.all([first, ...rest]);
  assert.deepEqual(values, [10, 40]);
});

test('failed command rejects pending slider updates without replaying them', async () => {
  let release;
  let started;
  const ready = new Promise((resolve) => { started = resolve; });
  const blocked = new Promise((resolve) => { release = resolve; });
  const values = [];
  const control = new CoalescedControl(async (value) => {
    values.push(value); started(); await blocked; throw new Error('rate limited');
  }, 5);
  const first = control.set(10);
  await ready;
  const pending = control.set(20);
  const result = Promise.allSettled([first, pending]);
  release();
  assert.deepEqual((await result).map((r) => r.status), ['rejected', 'rejected']);
  await sleep(15);
  assert.deepEqual(values, [10]);
});

function api() {
  return Object.assign(Object.create(BlueAirAwsApi.prototype), {
    mutex: new Mutex(), cooldownUntil: 0, rateLimitDelay: 30000,
    blueAirApiUrl: 'https://example.invalid', accessToken: '', idToken: '',
    logger: { debug() {}, warn() {} },
  });
}

for (const status of [229, 429]) {
  test(`${status} stops retries and blocks concurrent requests during shared cooldown`, async (t) => {
    let calls = 0;
    t.mock.method(global, 'fetch', async () => {
      calls++;
      return new Response('not JSON', { status });
    });
    const client = api();
    const results = await Promise.allSettled([client.apiCall('/one'), client.apiCall('/two'), client.apiCall('/three')]);
    assert.equal(calls, 1);
    assert.ok(results.every((r) => r.status === 'rejected' && r.reason instanceof BlueAirRateLimitError));
    await assert.rejects(client.apiCall('/four'), BlueAirRateLimitError);
    assert.equal(calls, 1);
  });
}

test('cooldown expires, increases on repeated throttling, honors Retry-After, and resets after success', async (t) => {
  let now = 1000000;
  t.mock.method(Date, 'now', () => now);
  let response = () => new Response('', { status: 429 });
  t.mock.method(global, 'fetch', async () => response());
  const client = api();
  await assert.rejects(client.apiCall('/state'), BlueAirRateLimitError);
  assert.equal(client.cooldownUntil, now + 30000);
  now = client.cooldownUntil;
  await assert.rejects(client.apiCall('/state'), BlueAirRateLimitError);
  assert.equal(client.cooldownUntil, now + 60000);
  now = client.cooldownUntil;
  response = () => new Response('', { status: 429, headers: { 'Retry-After': '600' } });
  await assert.rejects(client.apiCall('/state'), BlueAirRateLimitError);
  assert.equal(client.cooldownUntil, now + 600000);
  now = client.cooldownUntil;
  response = () => new Response('{}', { status: 200 });
  assert.deepEqual(await client.apiCall('/state'), {});
  assert.equal(client.rateLimitDelay, 30000);
});

test('Retry-After HTTP date is honored', async (t) => {
  const now = 1000000;
  t.mock.method(Date, 'now', () => now);
  t.mock.method(global, 'fetch', async () => new Response('', {
    status: 429, headers: { 'Retry-After': new Date(now + 90000).toUTCString() },
  }));
  const client = api();
  await assert.rejects(client.apiCall('/state'), BlueAirRateLimitError);
  assert.equal(client.cooldownUntil, now + 90000);
});
