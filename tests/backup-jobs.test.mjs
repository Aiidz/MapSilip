import assert from 'node:assert/strict';
import test from 'node:test';
import { claimBackupJob, finishBackupJob, updateBackupJob } from '../worker/backup/jobs.mjs';

test('worker claims use row locks and all later updates use the active fence', async () => {
  const job = { id: 'test-job', fence: '3' };
  const client = { async query(sql, args) {
    if (args.length === 1) {
      assert.match(sql, /for update skip locked/);
      return { rows: [job] };
    }
    assert.match(sql, /fence=\$2 and lease_until>now\(\)/);
    assert.deepEqual(args.slice(0, 2), ['test-job', '3']);
    return { rowCount: 0 };
  } };
  assert.equal(await claimBackupJob(client), job);
  await assert.rejects(updateBackupJob(client, job, 'packaging'), /lease lost/);
});

test('verified Drive completes independently of local custody', async () => {
  const job = { id: 'test-job', fence: '1' };
  const recorded = [];
  const client = { async query(_sql, args) { recorded.push(args); return { rowCount: 1 }; } };
  assert.equal(await finishBackupJob(client, job, { localVerified: false, driveVerified: true }), 'completed');
  assert.equal(await finishBackupJob(client, job, { localVerified: true, driveVerified: true }), 'completed');
  assert.equal(await finishBackupJob(client, job, { localVerified: true, driveVerified: false }), 'partially_completed');
  assert.deepEqual(recorded[0].slice(-2), [false, true]);
});

test('runner records an inaccessible source as failed without publishing', async () => {
  const { runBackupJob } = await import('../worker/backup/run.mjs');
  const job = { id: 'test-job', fence: '2' };
  const client = { async query(_sql, args) {
    if (args.length === 1) return { rows: [job] };
    assert.equal(args[2], 'failed');
    assert.equal(args[3], 'backup_processing_failed');
    return { rowCount: 1 };
  } };
  const result = await runBackupJob(client, {
    async collect() { throw new Error('Private source unavailable'); },
    async drive() { assert.fail('must not publish after collection failure'); },
  });
  assert.deepEqual(result, { id: job.id, state: 'failed', failureCode: 'backup_processing_failed' });
});
