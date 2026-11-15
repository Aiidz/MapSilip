export const PART_LIMIT: number;
export function crc32(bytes: Uint8Array): number;
export function buildZip(entries: { name: string; bytes: Uint8Array }[]): Uint8Array<ArrayBuffer>;
