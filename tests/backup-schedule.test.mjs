import assert from 'node:assert/strict';
import test from 'node:test';
import { closedManilaPeriod, enqueueClosedMonth } from '../worker/backup/schedule.mjs';

test('monthly requests share a durable key and use Manila year boundaries', () => {
  const now = new Date('2026-12-31T16:00:00.000Z');
  assert.deepEqual(closedManilaPeriod(now), {
    label: '2026-12', fromInclusive: '2026-11-30T16:00:00.000Z',
    toExclusive: '2026-12-31T16:00:00.000Z', zone: 'Asia/Manila',
  });
  const input = { propertyKey: 'fixture', formatVersion: '1', now };
  const first = enqueueClosedMonth(request => request, input);
  const later = enqueueClosedMonth(request => request, { ...input, now: new Date('2027-01-06T00:00:00Z') });
  assert.equal(first.idempotencyKey, later.idempotencyKey);
  assert.notEqual(first.requestedAt, later.requestedAt);
});

import { nextScheduledRun, scheduledJob } from '../worker/backup/schedule.mjs';

for (const [frequency, after, expected] of [
  ['weekly','2026-12-27T15:59Z','2026-12-27T16:00:00.000Z'],
  ['weekly','2026-12-27T16:00Z','2027-01-03T16:00:00.000Z'],
  ['monthly','2028-01-31T00:00Z','2028-02-28T16:00:00.000Z'],
  ['yearly','2028-02-29T00:00Z','2029-02-27T16:00:00.000Z'],
]) test(frequency + ' next Manila run after ' + after, () => {
  const settings = { frequency, weekday:1, month_day:31, year_month:2, local_time:'00:00' };
  assert.equal(nextScheduledRun(settings,new Date(after)).toISOString(),expected);
});
test('dispatch retries reuse the due occurrence, including legacy monthly keys', () => {
  const due = new Date('2026-12-31T16:00Z');
  for (const frequency of ['weekly','monthly','yearly']) {
    assert.deepEqual(scheduledJob(frequency,due), scheduledJob(frequency,new Date(due)));
  }
  assert.equal(scheduledJob('monthly',due).key,'monthly:1:2026-12');
});
