import { createHash, sign, verify } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { copyFile, mkdir, open, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { buildZip, PART_LIMIT } from '../../app/lib/storage/zip.mjs';

const receiptName = 'Delivery_Receipt.json';
const maxPartBytes = PART_LIMIT + 256 * 1024;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

async function readBounded(path, maxBytes) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maxBytes) throw new Error('Invalid part size or type');
    const buffer = Buffer.alloc(stat.size + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset !== stat.size) throw new Error('Invalid part length');
    return buffer.subarray(0, offset);
  } finally {
    await handle.close();
  }
}

function validPath(path) {
  return typeof path === 'string' && path.length <= 240 && path.split('/').every(segment =>
    /^[a-z0-9_-][a-z0-9_.-]{0,99}$/i.test(segment) && !segment.endsWith('.') &&
    !segment.includes('..') && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment));
}

/** Consume frozen entries in deterministic order. Each entry must fit in one bounded ZIP volume. */
export async function packageLocal(directory, backupId, entries, privateKey) {
  if (typeof backupId !== 'string' || !/^[a-z0-9_-]{1,80}$/i.test(backupId)) throw new Error('Invalid backup ID');
  await mkdir(directory, { mode: 0o700 });
  const parts = [];
  const paths = new Set();
  let part = [];
  let size = 22;

  async function flush() {
    if (part.length === 0) return;
    const name = 'Part_' + String(parts.length + 1).padStart(6, '0') + '.zip';
    const archive = buildZip(part);
    const path = join(directory, name);
    await writeFile(path, archive, { flag: 'wx', mode: 0o600 });
    const sha256 = digest(archive);
    const saved = await readBounded(path, maxPartBytes);
    if (digest(saved) !== sha256) throw new Error('Invalid part after write');
    let offset = 0;
    const files = part.map(entry => {
      const dataOffset = offset + 30 + Buffer.byteLength(entry.name);
      const bytes = entry.bytes.length;
      const fileHash = digest(entry.bytes);
      offset = dataOffset + bytes;
      if (digest(saved.subarray(dataOffset, offset)) !== fileHash) throw new Error('Invalid entry after write');
      return { path: entry.name, offset: dataOffset, bytes, sha256: fileHash };
    });
    parts.push({ name, bytes: archive.length, sha256, files });
    part = [];
    size = 22;
  }

  for await (const entry of entries) {
    const key = typeof entry.path === 'string' ? entry.path.toLowerCase() : '';
    if (!validPath(entry.path) || paths.has(key)) throw new Error('Unsafe or duplicate archive path');
    if (!(entry.bytes instanceof Uint8Array)) throw new Error('Invalid entry bytes');
    const cost = entry.bytes.length + 76 + 2 * Buffer.byteLength(entry.path);
    if (cost + 22 > PART_LIMIT) throw new Error('Entry requires separate large-file delivery');
    if (size + cost > PART_LIMIT || part.length === 65535) await flush();
    paths.add(key);
    part.push({ name: entry.path, bytes: Buffer.from(entry.bytes) });
    size += cost;
  }
  await flush();
  if (parts.length === 0) throw new Error('Empty delivery');
  const receipt = { version: 1, backupId, parts };
  const payload = JSON.stringify(receipt);
  const signature = sign(null, Buffer.from(payload), privateKey).toString('base64');
  const envelope = JSON.stringify({ payload, signature });
  if (Buffer.byteLength(envelope) > maxPartBytes) throw new Error('Delivery receipt exceeds size limit');
  await writeFile(join(directory, receiptName), envelope, { flag: 'wx', mode: 0o600 });
  return receipt;
}

async function readReceipt(directory, publicKey) {
  return decodeReceipt(await readBounded(join(directory, receiptName), maxPartBytes), publicKey);
}

function decodeReceipt(envelope, publicKey) {
  const { payload, signature } = JSON.parse(envelope);
  if (!verify(null, Buffer.from(payload), publicKey, Buffer.from(signature, 'base64'))) {
    throw new Error('Invalid delivery signature');
  }
  const receipt = JSON.parse(payload);
  if (receipt.version !== 1 || !receipt.parts.length) throw new Error('Invalid delivery receipt');
  return receipt;
}

async function* verifiedParts(directory, receipt) {
  const paths = new Set();
  for (const [index, part] of receipt.parts.entries()) {
    const name = 'Part_' + String(index + 1).padStart(6, '0') + '.zip';
    if (part.name !== name) throw new Error('Invalid part name');
    const bytes = await readBounded(join(directory, name), maxPartBytes);
    if (bytes.length !== part.bytes || digest(bytes) !== part.sha256) throw new Error('Invalid part checksum');
    for (const file of part.files) {
      const key = typeof file.path === 'string' ? file.path.toLowerCase() : '';
      if (!validPath(file.path) || paths.has(key)) throw new Error('Unsafe or duplicate restore path');
      paths.add(key);
      if (!Number.isSafeInteger(file.offset) || !Number.isSafeInteger(file.bytes) ||
          file.offset < 0 || file.bytes < 0 || file.offset + file.bytes > bytes.length) {
        throw new Error('Invalid entry range');
      }
      if (digest(bytes.subarray(file.offset, file.offset + file.bytes)) !== file.sha256) {
        throw new Error('Invalid entry checksum');
      }
    }
    yield { bytes, files: part.files };
  }
}

export async function verifyLocal(directory, publicKey) {
  const receipt = await readReceipt(directory, publicKey);
  for await (const part of verifiedParts(directory, receipt)) {
    if (part.files.length === 0) throw new Error('Empty ZIP volume');
  }
  return receipt;
}

/** Read a specific entry only after the complete signed package has verified. */
export async function readVerifiedRecoveryIndex(directory, publicKey) {
  const receipt = await readReceipt(directory,publicKey);
  const path = `01_Technical_Recovery/${receipt.backupId}/Auth_Identity_Index.json`;
  let index;
  for await (const {bytes,files} of verifiedParts(directory,receipt)) {
    const entry = files.find(file => file.path === path);
    if (entry) index = JSON.parse(bytes.subarray(entry.offset,entry.offset + entry.bytes));
  }
  if (index?.version !== 1 || !Array.isArray(index.accounts)) throw new Error('Invalid signed identity index');
  return index;
}

/** Yield the signed delivery set in publication order, one bounded file at a time. */
export async function* packageFiles(directory, publicKey, backupId) {
  const envelope = await readBounded(join(directory, receiptName), maxPartBytes);
  const receipt = decodeReceipt(envelope, publicKey);
  if (receipt.backupId !== backupId) throw new Error('Package job mismatch');
  let index = 0;
  for await (const { bytes } of verifiedParts(directory, receipt)) {
    const part = receipt.parts[index++];
    yield { path: part.name, bytes, sha256: part.sha256 };
  }
  yield { path: receiptName, bytes: envelope, sha256: digest(envelope) };
}

export async function restoreLocal(directory, output, publicKey) {
  const receipt = await verifyLocal(directory, publicKey);
  await mkdir(output, { mode: 0o700 });
  for await (const { bytes, files } of verifiedParts(directory, receipt)) {
    for (const file of files) {
      const target = join(output, file.path);
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      const original = bytes.subarray(file.offset, file.offset + file.bytes);
      await writeFile(target, original, { flag: 'wx', mode: 0o600 });
      if (digest(await readBounded(target, maxPartBytes)) !== file.sha256) throw new Error('Invalid restored entry');
    }
  }
  const files = receipt.parts.flatMap(part => part.files);
  const inventory = files.find(file => file.path === `01_Technical_Recovery/${receipt.backupId}/Storage_Object_Map.json`);
  if (inventory) {
    const byHash = new Map(files.map(file => [file.sha256,file]));
    const contents = await readBounded(join(output,inventory.path), maxPartBytes);
    if (digest(contents) !== inventory.sha256) throw new Error('Storage inventory changed');
    const objects = JSON.parse(contents);
    if (!Array.isArray(objects)) throw new Error('Invalid Storage inventory');
    for (const object of objects) {
      if (object.bucket !== 'mapsilip_evidence' || !/^[0-9a-f-]{36}\/[0-9a-f-]{36}$/i.test(object.path) ||
          object.path.split('/')[1] !== object.id) throw new Error('Invalid Storage recovery reference');
      const target = join(output,'Restored_Storage',object.bucket,object.path);
      await mkdir(dirname(target),{ recursive:true, mode:0o700 });
      if (object.pieces !== undefined) {
        if (!validPath(object.archivePath) || !Array.isArray(object.pieces) || !object.pieces.length) {
          throw new Error('Invalid split Storage original');
        }
        const readable = join(output,object.archivePath);
        await mkdir(dirname(readable),{ recursive:true, mode:0o700 });
        const file = await open(readable,'wx',0o600);
        const hash = createHash('sha256');
        let size = 0;
        try {
          for (const [index,path] of object.pieces.entries()) {
            const expected = `01_Technical_Recovery/${receipt.backupId}/Storage_Parts/${object.id}/${String(index+1).padStart(8,'0')}.bin`;
            if (path !== expected) throw new Error('Invalid Storage piece path');
            const bytes = await readBounded(join(output,path),maxPartBytes);
            size += bytes.length;
            if (size > object.byteLength) throw new Error('Oversized restored original');
            hash.update(bytes);
            await file.writeFile(bytes);
          }
          if (size !== object.byteLength || hash.digest('hex') !== object.sha256) throw new Error('Invalid assembled original');
          await file.sync();
        } finally { await file.close(); }
        await copyFile(readable,target,constants.COPYFILE_EXCL);
      } else {
        const source = byHash.get(object.sha256);
        if (!source || source.bytes !== object.byteLength) throw new Error('Invalid Storage recovery reference');
        await copyFile(join(output,source.path),target,constants.COPYFILE_EXCL);
      }
      const restoredHash = createHash('sha256');
      for await (const bytes of createReadStream(target)) restoredHash.update(bytes);
      if (restoredHash.digest('hex') !== object.sha256) throw new Error('Invalid restored Storage object');
    }
  }
  return receipt;
}
