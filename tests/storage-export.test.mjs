import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createHash, webcrypto } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import * as workbook from '../app/lib/storage/workbook.mjs';
import * as zip from '../app/lib/storage/zip.mjs';
const checksum = bytes => createHash('sha256').update(bytes).digest('hex');

test('ZIP parts preserve original bytes and open with an independent ZIP reader', () => {
  const bytes = new TextEncoder().encode('original receipt bytes');
  const archive = zip.buildZip([{ name: 'attachments/fixture.pdf', bytes }]);
  const result = spawnSync('python3', ['-c', 'import sys,io,zipfile; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); assert z.testzip() is None; sys.stdout.buffer.write(z.read("attachments/fixture.pdf"))'], { input: archive });
  assert.equal(result.status, 0); assert.deepEqual(result.stdout, Buffer.from(bytes));
  assert.throws(() => zip.buildZip([{ name: '../escape', bytes }]));
});

test('ZIP memory safety limit rejects an oversized part', () => {
  assert.throws(() => zip.buildZip([{ name: 'large.bin', bytes: new Uint8Array(zip.PART_LIMIT + 300000) }]));
});

function exporter({ missing = false, mismatch = false, fileCount = 1, fileSize = 0 } = {}) {
  const exports = {}, calls = [], saved = [];
  const record = { id: 'tenant-one', display_name: 'Tenant' };
  const file = fileSize ? new Uint8Array(fileSize).fill(65) : new TextEncoder().encode('original contract');
  const items = [{ id: 1, kind: 'record', record_type: 'tenant_profiles', record_id: 'tenant-one', payload: record, checksum_sha256: checksum(JSON.stringify(record)) }, { id: 2, kind: 'file', record_type: 'attachments', record_id: 'asset-one', attachment_id: 'asset-one', payload: { path: 'owner/asset-one', bucket_name: 'mapsilip_evidence', byte_size: file.length, mime_type: 'application/pdf' } }];
  if (fileCount > 1) items.push(...Array.from({ length: fileCount - 1 }, (_, index) => ({ ...items[1], id: index + 3, record_id: `asset-${index + 2}` })));
  vm.runInNewContext(ts.transpileModule(readFileSync('app/lib/storage/export.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, TextEncoder, Uint8Array, Blob, crypto: webcrypto, setTimeout,
    fetch: async (url, options) => {
      if (options?.method === 'POST') { const body = JSON.parse(options.body); calls.push(body); return new Response('{}'); }
      if (url.includes('action=archive.file')) return new Response(missing ? '{}' : file, { status: missing ? 404 : 200, headers: { 'X-Checksum-Sha256': mismatch ? 'bad' : checksum(file) } });
      return Response.json({ archive: { scope: { type: 'tenant' }, record_count: 1, file_count: fileCount }, items });
    },
    require: name => { if (name === './zip.mjs') return zip; if (name === './workbook.mjs') return workbook; throw Error(name); },
  });
  return { run: () => exports.downloadArchive('job', async (blob,name) => { saved.push({ name, bytes: new Uint8Array(await blob.arrayBuffer()) }); }, () => {}, new AbortController().signal), saved, calls };
}
test('export checks every record and original file before writing its complete manifest', async () => {
  const h = exporter(); const manifest = await h.run();
  assert.equal(manifest.complete, true); assert.equal(manifest.expected, 2); assert.equal(manifest.processed, 2);
  const partManifest = spawnSync('python3', ['-c', 'import sys,io,zipfile; sys.stdout.buffer.write(zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())).read("_verification/part-manifest.json"))'], { input: h.saved[0].bytes });
  assert.equal(partManifest.status, 0);
  assert.equal(JSON.parse(partManifest.stdout).mapping[1].original_object_path, 'owner/asset-one');
  assert.equal(manifest.parts[0].files, 1);
  const contents = spawnSync('python3', ['-c', 'import sys,io,zipfile,xml.etree.ElementTree as E; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); assert z.read("attachments/Other/asset-one-file.pdf")==b"original contract"; w=zipfile.ZipFile(io.BytesIO(z.read("spreadsheets/Tenants.xlsx"))); E.fromstring(w.read("xl/worksheets/sheet1.xml")); assert "spreadsheets/Attachment_index.xlsx" in z.namelist()'], { input: h.saved[0].bytes });
  assert.equal(contents.status, 0, contents.stderr.toString());
  assert.equal(h.calls.filter(call => call.action === 'archive.ack').length, 2);
  assert.equal(h.calls.filter(call => call.action === 'archive.confirm').length, 0, 'external safe-storage confirmation must remain a separate owner action');
  assert.ok(h.saved.at(-1).name.endsWith('-export-report.zip'));
});
for (const mode of [{ missing: true }, { mismatch: true }]) test(`incomplete export never acknowledges a missing or mismatched file ${JSON.stringify(mode)}`, async () => {
  const h = exporter(mode); await assert.rejects(h.run());
  assert.equal(h.calls.filter(call => call.action === 'archive.ack').length, 0);
  assert.ok(h.calls.some(call => call.action === 'archive.failed'));
  assert.ok(h.saved.at(-1).name.endsWith('-INCOMPLETE.json'));
});

test('large exports produce bounded parts with a complete cross-part manifest', async () => {
  const h = exporter({ fileCount: 6, fileSize: 1900000 });
  const manifest = await h.run();
  assert.equal(manifest.parts.length, 2);
  assert.equal(manifest.processed, 7);
  for (const part of h.saved.filter(part => part.name.endsWith('.zip'))) assert.ok(part.bytes.length <= zip.PART_LIMIT + 256 * 1024);
  assert.equal(h.calls.filter(call => call.action === 'archive.ack').length, 7);
});
