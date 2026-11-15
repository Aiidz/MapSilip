// Small uncompressed ZIP parts: original files remain byte-for-byte unchanged.
// Every part is capped by the exporter; no archive-wide byte buffer is retained.
const encoder = new TextEncoder();
export const PART_LIMIT = 8 * 1024 * 1024;
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}
export function buildZip(entries) {
  let offset = 0; const local = [], central = [];
  for (const entry of entries) {
    if (!/^[a-zA-Z0-9_./\[\]-]+$/.test(entry.name) || entry.name.includes('..') || entry.name.startsWith('/')) throw Error('Unsafe archive path');
    const name = encoder.encode(entry.name), bytes = entry.bytes;
    const head = new Uint8Array(30 + name.length), h = new DataView(head.buffer);
    const checksum = crc32(bytes);
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x800, true); h.setUint16(12, 0x21, true);
    h.setUint32(14, checksum, true); h.setUint32(18, bytes.length, true); h.setUint32(22, bytes.length, true); h.setUint16(26, name.length, true); head.set(name, 30);
    const directory = new Uint8Array(46 + name.length), d = new DataView(directory.buffer);
    d.setUint32(0, 0x02014b50, true); d.setUint16(4, 20, true); d.setUint16(6, 20, true); d.setUint16(8, 0x800, true); d.setUint16(14, 0x21, true);
    d.setUint32(16, checksum, true); d.setUint32(20, bytes.length, true); d.setUint32(24, bytes.length, true); d.setUint16(28, name.length, true); d.setUint32(42, offset, true); directory.set(name, 46);
    local.push(head, bytes); central.push(directory); offset += head.length + bytes.length;
  }
  const centralSize = central.reduce((n, b) => n + b.length, 0);
  const end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true); e.setUint32(12, centralSize, true); e.setUint32(16, offset, true);
  const result = new Uint8Array(offset + centralSize + 22); let at = 0;
  for (const bytes of [...local, ...central, end]) { result.set(bytes, at); at += bytes.length; }
  if (result.length > PART_LIMIT + 256 * 1024) throw Error('Archive part exceeds memory safety limit');
  return result;
}
