import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { samplePdf } from './fixtures/pdf.mjs';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as policy from '../app/lib/uploads/policy.mjs';
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync('app/lib/uploads/server.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, {
  exports, Buffer, Response, require: name => { if (name === 'sharp') return sharp; if (name === './policy.mjs') return policy; throw Error(name); },
});
const normalize = exports.normalizeUpload;
test('profile photos shrink, strip metadata and use the declared output type', async () => {
  const source = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#f05454' } }).withMetadata({ orientation: 6 }).png().toBuffer();
  const result = await normalize(source, 'image/png', 'profile');
  const metadata = await sharp(result.bytes).metadata();
  assert.ok(Math.max(metadata.width, metadata.height) <= 512);
  assert.ok(['jpeg', 'png'].includes(metadata.format));
  assert.equal(result.mime, metadata.format === 'png' ? 'image/png' : 'image/jpeg');
  assert.equal(metadata.exif, undefined);
  assert.ok(result.bytes.length < source.length);
});
test('contract images retain original bytes while receipts and maintenance use category dimensions', async () => {
  const source = await sharp({ create: { width: 3000, height: 4200, channels: 3, background: '#fff' } }).png().toBuffer();
  for (const purpose of ['contract', 'payment', 'maintenance']) {
    const result = await normalize(source, 'image/png', purpose);
    const metadata = await sharp(result.bytes).metadata();
    assert.equal(metadata.height, purpose === 'contract' ? 4200 : purpose === 'maintenance' ? 1600 : 2000);
    if (purpose === 'contract') assert.deepEqual(result.bytes, source);
    assert.ok(result.bytes.length <= policy.MAX_UPLOAD_BYTES);
  }
});
test('malformed files, MIME spoofing and oversized input are rejected', async () => {
  await assert.rejects(normalize(Buffer.from('not an image'), 'image/jpeg', 'contract'));
  const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: 'white' } }).png().toBuffer();
  await assert.rejects(normalize(png, 'image/jpeg', 'profile'));
  await assert.rejects(normalize(Buffer.alloc(policy.MAX_UPLOAD_BYTES + 1), 'image/png', 'maintenance'));
  await assert.rejects(normalize(Buffer.from('%PDF-1.7\ntruncated'), 'application/pdf', 'contract'));
});
test('PDF evidence is bounded and preserved without destructive rasterization', async () => {
  const bytes = samplePdf();
  const result = await normalize(bytes, 'application/pdf', 'payment');
  assert.equal(result.mime, 'application/pdf');
  assert.deepEqual(result.bytes, bytes);
});

test('chunked uploads cannot bypass the request body size limit', async () => {
  const bytes = new Uint8Array(2_200_001);
  const request = new Request('https://example.invalid/api/attachments', { method: 'POST', body: bytes, headers: { 'Content-Type': 'multipart/form-data; boundary=test' } });
  await assert.rejects(exports.readUploadForm(request));
});
test('bounded multipart parser preserves a legitimate file and rejects non-multipart bodies', async () => {
  const body = new FormData(); body.set('purpose', 'contract'); body.set('file', new File(['fixture'], 'contract.jpg', { type: 'image/jpeg' }));
  const fields = await exports.readUploadForm(new Request('https://example.invalid', { method: 'POST', body }));
  assert.equal(fields.get('purpose'), 'contract');
  assert.equal(fields.get('file').size, 7);
  await assert.rejects(exports.readUploadForm(new Request('https://example.invalid', { method: 'POST', body: '{}' })));
});

test('original PDF contracts preserve every byte', async () => {
  const bytes = samplePdf();
  const result = await normalize(bytes, 'application/pdf', 'contract');
  assert.deepEqual(result.bytes, bytes);
  assert.equal(result.mime, 'application/pdf');
});

test('a PDF header and EOF alone cannot disguise a malformed contract', async () => {
  await assert.rejects(normalize(Buffer.from('%PDF-1.7\nnot a document\n%%EOF'), 'application/pdf', 'contract'));
  const spoof = Buffer.from('%PDF-1.7\nnot a document\nstartxref\n9\n%%EOF');
  await assert.rejects(normalize(spoof, 'application/pdf', 'contract'));
});
