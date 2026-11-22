import assert from 'node:assert/strict';
import test from 'node:test';
import { collectDatabase, collectOriginals } from '../worker/backup/collect.mjs';

test('database capture keeps read-only snapshot open until technical export returns', async () => {
  const queries = [];
  const db = { async query(sql) {
    queries.push(sql);
    return { rows: sql.includes('pg_export_snapshot') ? [{ snapshot_id: 'snapshot', captured_at: 'cut' }] : [] };
  } };
  const capture = await collectDatabase(db, { captureDump(id) {
    assert.equal(id, 'snapshot');
    assert.ok(!queries.includes('commit'));
    return { scope: 'application_schemas' };
  } });
  assert.match(queries[0], /repeatable read read only/);
  assert.equal(queries.at(-1), 'commit');
  assert.deepEqual(capture.snapshot.invoices, []);
  assert.deepEqual(capture.technical, { scope: 'application_schemas' });
});

test('private Storage readback detects missing files and a changed source version', async () => {
  const id = '00000000-0000-4000-8000-000000000005';
  const path = id + '/' + id;
  const bytes = Buffer.from('%PDF-synthetic');
  const mimeType = 'application/pdf';
  const snapshot = { payments: [{ attachment_id: id }], maintenance_requests: [], room_assignments: [],
    attachments: [{ id, path, bucket_name: 'mapsilip_evidence', purpose: 'payment', mime_type: mimeType, byte_size: bytes.length }] };
  const object = { path, bytes: bytes.length, mimeType, version: 'old' };
  const storage = { list: () => [object], download: async () => bytes, version: async () => 'old' };
  async function read(adapter) {
    const output = [];
    const consume = async (_id, chunks) => { for await (const chunk of chunks) assert.ok(chunk.length); };
    for await (const file of collectOriginals(snapshot, adapter, undefined, consume)) output.push(file);
    return output;
  }
  assert.equal((await read(storage))[0].byteLength, bytes.length);
  await assert.rejects(read({ ...storage, version: async () => 'new' }), /changed/);
  await assert.rejects(read({ ...storage, list: () => [] }), /missing/);
  await assert.rejects(read({ ...storage, download: async () => Buffer.from('wrong') }), /integrity/);
});

test('sealed staging resumes by registry digest and fails after byte corruption', async () => {
  const { stageBackup, readStagedBackup } = await import('../worker/backup/staging.mjs');
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const root = await mkdtemp(join(tmpdir(), 'mapsilip-stage-'));
  const directory = join(root, 'capture');
  const bytes = Buffer.from('synthetic archive');
  try {
    const hash = await stageBackup(directory, 'fixture', [{ path: 'README.txt', bytes }]);
    const [artifact] = await Array.fromAsync(readStagedBackup(directory, 'fixture', hash));
    assert.deepEqual(artifact.bytes, bytes);
    await assert.rejects(Array.fromAsync(readStagedBackup(directory, 'other-job', hash)), /another job/);
    await writeFile(join(directory, artifact.sha256), 'tampered');
    await assert.rejects(Array.fromAsync(readStagedBackup(directory, 'fixture', hash)), /artifact checksum/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('configuration inventory excludes credentials and URL payloads', async () => {
  const { captureConfigurationIndex } = await import('../worker/backup/collect.mjs');
  const deployment = { commit: 'a'.repeat(40) };
  const inventory = captureConfigurationIndex({
    NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co', GOOGLE_DRIVE_CLIENT_SECRET: 'secret-fixture',
  }, deployment);
  assert.deepEqual(inventory.settings, { NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co/' });
  assert.equal(inventory.recoveryComplete, false);
  assert.throws(() => captureConfigurationIndex({ MAPSILIP_APP_ORIGIN: 'https://example.test/?token=secret' }, deployment), /URL/);
});

test('history capture contains six reports and only linked receipts, maintenance photos and contracts', async () => {
  const { captureBackup } = await import('../worker/backup/capture.mjs');
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = await mkdtemp(join(tmpdir(), 'mapsilip-history-'));
  const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
  const originals = [Buffer.from('%PDF-receipt'), Buffer.from([0xff, 0xd8, 0xff, 0x01]), Buffer.from('%PDF-contract'), Buffer.from('%PDF-unrelated')];
  const attachments = ['payment', 'maintenance', 'contract', 'profile'].map((purpose, i) => ({
    id: id(i + 1), path: id(99) + '/' + id(i + 1), purpose, bucket_name: 'mapsilip_evidence',
    byte_size: originals[i].length, mime_type: i === 1 ? 'image/jpeg' : 'application/pdf',
  }));
  const tables = {
    rooms: [{ id: id(10), room_number: '01' }],
    tenant_profiles: [{ user_id: id(99), display_name: 'Former tenant' }],
    room_assignments: [{ id: id(11), tenant_id: id(99), room_id: id(10), ended_on: '2026-11-01', contract_attachment_id: id(3) }],
    invoices: [{ id: id(12), tenant_id: id(99), room_id: id(10), amount: '100.00', currency: 'PHP' }],
    payments: [
      { id: id(13), invoice_id: id(12), amount: '100.00', status: 'approved', attachment_id: id(1) },
      { id: id(14), invoice_id: id(12), amount: '100.00', status: 'rejected' },
    ],
    maintenance_requests: [{ id: id(15), room_id: id(10), attachment_id: id(2) }],
    concerns: [], attachments,
  };
  const database = { async query(sql) {
    if (sql.includes('pg_export_snapshot')) return { rows: [{ captured_at: new Date('2026-11-20T00:00:00Z') }] };
    const table = /from public\.(\w+)/.exec(sql)?.[1];
    if (!table) return { rows: [] };
    assert.ok(table in tables, 'Exclude unrelated database sources');
    return { rows: tables[table] };
  } };
  const storage = {
    list: () => attachments.map(row => ({ path: row.path, bytes: row.byte_size, mimeType: row.mime_type, version: '1' })),
    download: async object => originals[attachments.findIndex(row => row.path === object.path)],
    version: async () => '1',
  };
  try {
    const capture = await captureBackup({ id: id(100), fence: 1 }, { root, database, storage, historyOnly: true });
    const entries = await Array.fromAsync(capture.entries());
    assert.equal(entries.length, 10);
    assert.equal(entries.filter(entry => entry.path.endsWith('.xlsx')).length, 6);
    assert.ok(entries.every(entry => !entry.path.includes('Technical_Recovery')));
    for (const [i, folder] of ['Receipts', 'Maintenance', 'Contracts'].entries()) {
      assert.deepEqual(entries.find(entry => entry.path.startsWith('Attachments/' + folder + '/')).bytes, originals[i]);
    }
    const index = JSON.parse(entries.find(entry => entry.path === 'Archive_Index.json').bytes);
    assert.equal(index.files.length, 9);
    for (const file of index.files) assert.equal(file.sha256, entries.find(entry => entry.path === file.path).sha256);
    await assert.rejects(captureBackup({ id: id(101), fence: 1 }, {
      root, database, historyOnly: true, storage: { ...storage, list: () => storage.list().slice(1) },
    }), error => error.code === 'original_capture_failed');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
