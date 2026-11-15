import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const id = '11111111-1111-4111-8111-111111111111';
const owner = '22222222-2222-4222-8222-222222222222';
function harness(mode = '') {
  const calls = [], exports = {};
  class BackendError extends Error {}
  const client = { storage: { from(bucket) { calls.push(['bucket',bucket]); return {
    async remove(paths) { calls.push(['remove',paths]); return { error: mode === 'remove-fails' ? Error('failure') : null }; },
    async info() { calls.push(['info']); return { error: mode === 'still-present' ? null : { statusCode: mode === 'uncertain' ? '500' : '404' } }; },
  }; } } };
  const command = async (_client,action) => {
    calls.push([action]);
    if (action === 'cleanup.claim') {
      if (mode === 'ineligible') throw Error('eligibility denied');
      return mode === 'already-deleted' ? { deleted: true } : { bucket: mode === 'wrong-bucket' ? 'other' : 'mapsilip_evidence', path: `${owner}/${mode === 'wrong-file' ? owner : id}` };
    }
    if (action === 'cleanup.finished' && mode === 'finalize-fails') throw Error('database failed');
  };
  vm.runInNewContext(ts.transpileModule(readFileSync('app/lib/storage/cleanup.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: name => name === './server' ? { storageCommand: command } : { BackendError } });
  return { calls, run: (data = { attachment_id: id, confirmation: id }) => exports.removeAuthorizedFile(client,data) };
}
test('cleanup verifies identity, removes only the claimed object, confirms absence, then finalizes', async () => {
  const h = harness(); await h.run();
  assert.deepEqual(h.calls.map(c=>c[0]), ['cleanup.claim','bucket','remove','bucket','info','cleanup.finished']);
  assert.equal(h.calls.find(c=>c[0]==='remove')[1][0], `${owner}/${id}`);
});
for (const mode of ['ineligible','wrong-bucket','wrong-file','remove-fails','still-present','uncertain']) test(`cleanup fails closed: ${mode}`, async () => {
  const h = harness(mode); await assert.rejects(h.run());
  assert.ok(!h.calls.some(c=>c[0]==='cleanup.finished'));
  if (['ineligible','wrong-bucket','wrong-file'].includes(mode)) assert.ok(!h.calls.some(c=>c[0]==='remove'));
  if (mode !== 'ineligible') assert.ok(h.calls.some(c=>c[0]==='cleanup.failed'));
});
test('missing typed confirmation cannot even claim a deletion', async () => {
  const h = harness(); await assert.rejects(h.run({ attachment_id: id, confirmation: 'yes' })); assert.equal(h.calls.length,0);
});
test('already-deleted retries never call Storage again', async () => {
  const h = harness('already-deleted'); await h.run(); assert.deepEqual(h.calls.map(c=>c[0]), ['cleanup.claim']);
});
test('database finalization failure remains visible and does not report success', async () => {
  const h = harness('finalize-fails'); await assert.rejects(h.run()); assert.equal(h.calls.at(-1)[0],'cleanup.failed');
});
