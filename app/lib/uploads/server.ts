import sharp from 'sharp';
import { IMAGE_TYPES, MAX_UPLOAD_BYTES, uploadSettings } from './policy.mjs';

/** Re-encode trusted formats, strip metadata, and bound decode work even for custom clients. */
export async function normalizeUpload(bytes: Uint8Array, mime: string, purpose: string) {
  if (!bytes.length || bytes.length > MAX_UPLOAD_BYTES) throw new Error('invalid_upload');
  if (mime === 'application/pdf' && purpose !== 'profile') {
    const header = Buffer.from(bytes.subarray(0, 8)).toString('latin1');
    const tail = Buffer.from(bytes.subarray(Math.max(0, bytes.length - 2048))).toString('latin1');
    const ending = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(tail);
    if (!/^%PDF-(?:1\.[0-7]|2\.0)/.test(header) || !ending) throw new Error('invalid_upload');
    const offset = Number(ending[1]);
    const crossReference = Buffer.from(bytes.subarray(offset, Math.min(bytes.length, offset + 4096))).toString('latin1');
    if (offset < 8 || offset >= bytes.length || !(crossReference.startsWith('xref') || (/^\d+\s+\d+\s+obj/.test(crossReference) && /\/Type\s*\/XRef/.test(crossReference)))) throw new Error('invalid_upload');
    return { bytes: Buffer.from(bytes), mime };
  }
  if (!IMAGE_TYPES.includes(mime)) throw new Error('invalid_upload');
  const source = sharp(bytes, { limitInputPixels: 40_000_000, animated: false, failOn: 'warning' });
  const metadata = await source.metadata();
  if (!['jpeg', 'png'].includes(metadata.format || '') || (mime === 'image/png') !== (metadata.format === 'png') || (metadata.pages ?? 1) > 1) throw new Error('invalid_upload');
  if (purpose === 'contract') {
    // Fully decode before trusting an original image; metadata alone accepts some truncations.
    await source.clone().stats();
    return { bytes: Buffer.from(bytes), mime };
  }
  const { maxEdge, targetBytes } = uploadSettings(purpose);
  const image = source.rotate().resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' });
  let output = await image.clone().jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  if (output.length > targetBytes) output = await image.clone().jpeg({ quality: purpose === 'payment' ? 78 : 70, mozjpeg: true }).toBuffer();
  if (output.length > MAX_UPLOAD_BYTES) throw new Error('invalid_upload');
  if (mime === 'image/png' && bytes.length <= targetBytes) {
    const png = await image.clone().png({ compressionLevel: 9 }).toBuffer();
    if (png.length < output.length) return { bytes: png, mime: 'image/png' };
  }
  return { bytes: output, mime: 'image/jpeg' };
}

/** Bound chunked requests too; Content-Length alone is not a reliable upload limit. */
export async function readUploadForm(request: Request): Promise<FormData> {
  const maximum = 2_200_000;
  const contentType = request.headers.get('content-type') || '';
  const length = request.headers.get('content-length');
  if (!contentType.startsWith('multipart/form-data;') || !request.body ||
      (length !== null && (!/^\d+$/.test(length) || Number(length) > maximum))) throw new Error('invalid_upload');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) { await reader.cancel(); throw new Error('invalid_upload'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return new Response(body, { headers: { 'Content-Type': contentType } }).formData();
}
