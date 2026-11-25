import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { packageLocal, verifyLocal } from '../worker/backup/local.mjs';
import { csv } from '../worker/backup/export.mjs';

test('CSV preserves text and neutralizes formulas', () => {
  assert.equal(csv(['Room', 'Note'], [['01', ' =1'], [null, 'a,"b"']]), '\ufeffRoom,Note\r\n01,\' =1\r\n,"a,""b"""\r\n');
});

test('signed local delivery rejects damaged parts and unsafe paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mapsilip-backup-'));
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  try {
    await assert.rejects(packageLocal(join(root, 'bad'), 'fixture', [
      { path: '../unsafe', bytes: Buffer.from('x') },
    ], privateKey));
    const dir = join(root, 'backup');
    const receipt = await packageLocal(dir, 'fixture', [
      { path: 'README.txt', bytes: Buffer.from('Synthetic archive') },
    ], privateKey);
    assert.equal((await verifyLocal(dir, publicKey)).backupId, 'fixture');
    await writeFile(join(dir, receipt.parts[0].name), 'changed');
    await assert.rejects(verifyLocal(dir, publicKey), /invalid part/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('readable local delivery indexes the same original from invoice, payment and room views', async () => {
  const { readableEntries } = await import('../worker/backup/export.mjs');
  const { readFile } = await import('node:fs/promises');
  const snapshot = JSON.parse(await readFile(new URL('./fixtures/backup-source-map.json', import.meta.url)));
  const originals = new Map(snapshot.attachments.map(row => [row.id, Buffer.from('fixture ' + row.purpose)]));
  const entries = new Map();
  for await (const item of readableEntries(snapshot, id => originals.get(id))) entries.set(item.path, item.bytes);
  const invoiceIndex = entries.get('06_Indexes/Invoice_Index.csv').toString();
  const paymentIndex = entries.get('06_Indexes/Payment_Index.csv').toString();
  const roomIndex = entries.get('06_Indexes/Maintenance_Index.csv').toString();
  const receipt = [...entries.keys()].find(path => path.endsWith('_Receipt.pdf'));
  const photo = [...entries.keys()].find(path => path.endsWith('_Submission.png'));
  assert.ok(invoiceIndex.includes(receipt));
  assert.ok(paymentIndex.includes(receipt));
  assert.ok(roomIndex.includes(photo));
  assert.deepEqual(entries.get(receipt), originals.get(snapshot.payments[0].attachment_id));
  assert.deepEqual(entries.get(photo), originals.get(snapshot.maintenance_requests[0].attachment_id));
  const root = await mkdtemp(join(tmpdir(), 'mapsilip-readable-'));
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  try {
    const directory = join(root, 'export');
    await packageLocal(directory, 'source-map', readableEntries(snapshot, id => originals.get(id)), privateKey);
    const verified = await verifyLocal(directory, publicKey);
    assert.deepEqual(verified.parts.flatMap(part => part.files.map(file => file.path)), [...entries.keys()]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('offline restore materializes verified originals and refuses to replace a prior copy', async () => {
  const { restoreLocal } = await import('../worker/backup/local.mjs');
  const { readFile } = await import('node:fs/promises');
  const root = await mkdtemp(join(tmpdir(), 'mapsilip-restore-'));
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  try {
    const archive = join(root, 'archive');
    const restored = join(root, 'restored');
    const bytes = Buffer.from('original evidence');
    const path = '03_Room_Archives/Room_01/Originals/Submission.png';
    await packageLocal(archive, 'restore-fixture', [{ path, bytes }], privateKey);
    await restoreLocal(archive, restored, publicKey);
    assert.deepEqual(await readFile(join(restored, path)), bytes);
    await assert.rejects(restoreLocal(archive, restored, publicKey), { code: 'EEXIST' });
    await writeFile(join(archive, 'Part_000001.zip'), 'tampered');
    await assert.rejects(restoreLocal(archive, join(root, 'invalid'), publicKey), /checksum/);
    assert.deepEqual(await readFile(join(restored, path)), bytes);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('category export retains unlinked history and reports unavailable sources', async () => {
  const { businessCategoryEntries } = await import('../worker/backup/export.mjs');
  const entries = new Map([...businessCategoryEntries({
    room_assignments: [{ id: 'historical-assignment', tenant_id: 'internal-user', ended_on: '2025-02-01' }],
    payments: [{ id: 'historical-payment', reference_number: '0002', reviewer_id: 'private-reviewer' }],
    notifications: [],
  }, { period: '2026-11', tenantArchiveIds: new Map() })].map(file => [file.path, file.bytes.toString()]));
  const root = '02_Annual_Archives/2026/11_November/CSV_Exports';
  assert.match(entries.get(root + '/Room_Assignments.csv'), /historical-assignment/);
  assert.doesNotMatch(entries.get(root + '/Room_Assignments.csv'), /internal-user/);
  assert.match(entries.get(root + '/Payments.csv'), /0002/);
  assert.doesNotMatch(entries.get(root + '/Payments.csv'), /private-reviewer/);
  assert.match(entries.get('00_Backup_Reports/Category_Coverage.csv'), /concerns,Unavailable,/);
  assert.match(entries.get('00_Backup_Reports/Category_Coverage.csv'), /notifications,Included,0/);
});

test('custody confirmation requires a distinct receiver signature bound to the exact receipt', async () => {
  const { validateLocalCustody } = await import('../worker/backup/delivery.mjs');
  const { sign } = await import('node:crypto');
  const receiver = generateKeyPairSync('ed25519');
  const wrong = generateKeyPairSync('ed25519');
  const expected = { jobId: 'fixture', receiptSha256: 'a'.repeat(64) };
  const payload = JSON.stringify({ version: 1, ...expected });
  const attestation = { payload, signature: sign(null, Buffer.from(payload), receiver.privateKey).toString('base64') };
  assert.equal(validateLocalCustody(attestation, expected, receiver.publicKey).jobId, 'fixture');
  assert.throws(() => validateLocalCustody(attestation, expected, wrong.publicKey), /signature/);
  assert.throws(() => validateLocalCustody(attestation, { ...expected, jobId: 'different' }, receiver.publicKey), /mismatch/);
});
