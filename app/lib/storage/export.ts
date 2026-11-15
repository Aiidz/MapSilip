import { buildZip, PART_LIMIT } from './zip.mjs';
import { buildWorkbook } from './workbook.mjs';

const workbookNames: Record<string, string> = { tenant_profiles: 'Tenants', tenant_contact: 'Tenant_contacts', room_assignments: 'Room_assignments', rooms: 'Rooms', payments: 'Payments', invoices: 'Invoices', maintenance_requests: 'Maintenance', concerns: 'Concerns', account_requests: 'Account_requests', reporters: 'Reporters', planned_visits: 'Visitors' };
const safeName = (name: string) => name.replace(/[^a-zA-Z0-9_-]/g, '_');
const attachmentFolder = (purpose: unknown) => ({ receipt: 'Payments', maintenance: 'Maintenance', contract: 'Contracts', profile: 'Profiles' } as Record<string, string>)[String(purpose)] || 'Other';
const readme = new TextEncoder().encode('MapSilip backup\n\nOpen the Excel files in spreadsheets/ for organized records. Original pictures and PDFs are in attachments/, grouped by purpose. Attachment IDs connect the spreadsheets to the files; Attachment_index.xlsx lists their exact paths.\n\nLarge exports have multiple ZIP parts. Each part contains the spreadsheets for its records, so keep all parts and the final export report together. No files are automatically removed from MapSilip.\n\n_verification/ contains the original record snapshots, checksums and mappings for integrity checks. You do not need to open these for everyday use.\n\nZIP files are not encrypted. Keep your backup on an encrypted device or drive.');

export type ArchiveProgress = { processed: number; expected: number; part: number };
type Item = { id: number; kind: 'record' | 'file'; record_type: string; record_id: string; attachment_id?: string; payload: Record<string, unknown>; checksum_sha256: string };
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const sha = async (bytes: Uint8Array<ArrayBuffer>) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
export async function storageMutation(action: string, data: Record<string, unknown>, signal?: AbortSignal) {
  const response = await fetch('/api/storage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, data }), signal });
  const result = await response.json(); if (!response.ok) throw Error(result.message || 'Storage action failed.'); return result;
}
async function page(archive: string, cursor: number, signal: AbortSignal) {
  const response = await fetch(`/api/storage?action=archive.items&archive_id=${encodeURIComponent(archive)}&cursor=${cursor}`, { signal, cache: 'no-store' });
  const result = await response.json(); if (!response.ok) throw Error(result.message || 'Archive records could not be read.'); return result;
}
/** Each save callback must await an explicit user gesture before the next part is built. */
export async function downloadArchive(archive: string, save: (blob: Blob, name: string) => Promise<void>, progress: (value: ArchiveProgress) => void, signal: AbortSignal) {
  let cursor = 0, processed = 0, part = 1, size = 0, expected = 0;
  let records = 0, files = 0;
  let entries: { name: string; bytes: Uint8Array<ArrayBuffer> }[] = [];
  let acknowledgements: { item: Item; checksum: string }[] = [];
  let mapping: Record<string, unknown>[] = [];
  let currentItem: Item | null = null;
  const parts: { name: string; checksum_sha256: string; bytes: number; records: number; files: number }[] = [];
  let scope: unknown;
  async function flush() {
    if (!entries.length) return;
    const filename = `mapsilip-${archive}-part-${String(part).padStart(4, '0')}.zip`;
    const partManifest = encode({ archive_id: archive, part, mapping, complete_part: true });
    if (partManifest.length > 512 * 1024) throw Error('Part manifest exceeds its memory safety limit.');
    const groups = new Map<string, Record<string, unknown>[]>();
    for (const { item } of acknowledgements) {
      if (item.kind !== 'record') continue;
      const rows = groups.get(item.record_type) || [];
      rows.push(item.payload); groups.set(item.record_type, rows);
    }
    const spreadsheets = [...groups].map(([type, rows]) => ({ name: `spreadsheets/${workbookNames[type] || safeName(type)}.xlsx`, bytes: buildWorkbook(workbookNames[type] || type, rows) }));
    const fileRows = mapping.filter(item => item.kind === 'file').map(item => ({ file_name: item.original_name, attachment_id: item.attachment_id, folder_and_filename: item.archive_path, size_bytes: item.bytes, file_type: item.mime_type }));
    if (fileRows.length) spreadsheets.push({ name: 'spreadsheets/Attachment_index.xlsx', bytes: buildWorkbook('Attachments', fileRows) });
    const bytes = buildZip([...entries, ...spreadsheets, { name: 'README.txt', bytes: readme }, { name: '_verification/part-manifest.json', bytes: partManifest }]);
    const checksum = await sha(bytes);
    await save(new Blob([bytes], { type: 'application/zip' }), filename);
    if (signal.aborted) throw Error('Export cancelled. Originals were retained.');
    parts.push({ name: filename, checksum_sha256: checksum, bytes: bytes.length, records: mapping.filter(item => item.kind === 'record').length, files: mapping.filter(item => item.kind === 'file').length });
    for (const ack of acknowledgements) await storageMutation('archive.ack', { archive_id: archive, item_id: ack.item.id, checksum: ack.checksum }, signal);
    entries = []; acknowledgements = []; mapping = []; size = 0; part++;
  }
  try {
    for (;;) {
      const batch = await page(archive, cursor, signal);
      if (!batch.archive) throw Error('Archive not found.');
      scope = batch.archive.scope;
      expected = batch.archive.record_count + batch.archive.file_count;
      for (const item of batch.items as Item[]) {
        currentItem = item;
        if (signal.aborted) throw Error('Export cancelled. Originals were retained.');
        let bytes: Uint8Array<ArrayBuffer>, checksum: string;
        const safeId = item.record_id.replace(/[^a-zA-Z0-9_-]/g, '_');
        let name: string;
        if (item.kind === 'file') {
          const response = await fetch(`/api/storage?action=archive.file&archive_id=${encodeURIComponent(archive)}&item_id=${item.id}`, { signal, cache: 'no-store' });
          if (!response.ok) throw Error(`Attachment ${item.attachment_id} is missing, changed or unreadable. This archive is incomplete.`);
          bytes = new Uint8Array(await response.arrayBuffer()); checksum = await sha(bytes);
          if (checksum !== response.headers.get('X-Checksum-Sha256') || bytes.length !== Number(item.payload.byte_size)) throw Error(`Integrity check failed for ${item.attachment_id}.`);
          const extension = item.payload.mime_type === 'application/pdf' ? 'pdf' : item.payload.mime_type === 'image/png' ? 'png' : 'jpg';
          const original = safeName(String(item.payload.original_name || 'file').replace(/\.[^.]+$/, '')).slice(0, 80);
          name = `attachments/${attachmentFolder(item.payload.purpose)}/${safeId}-${original}.${extension}`; files++;
        } else {
          bytes = encode(item.payload); checksum = await sha(bytes);
          if (checksum !== item.checksum_sha256) throw Error(`Record checksum mismatch: ${item.record_type}/${item.record_id}`);
          name = `_verification/records/${safeName(item.record_type)}/${safeId}.json`; records++;
        }
        // Reserve room for OOXML, escaped text, file indexes and per-part metadata.
        const estimatedSize = item.kind === 'record' ? bytes.length * 12 + 16384 : bytes.length + 4096;
        if (size + estimatedSize > PART_LIMIT - 1024 * 1024 || entries.length >= 200) await flush();
        entries.push({ name, bytes }); size += estimatedSize;
        mapping.push({ metadata: item.kind === 'file' ? item.payload : undefined, kind: item.kind, record_type: item.record_type, record_id: item.record_id, attachment_id: item.attachment_id, original_bucket: item.payload.bucket_name, original_object_path: item.payload.path, original_name: item.payload.original_name, mime_type: item.payload.mime_type, bytes: bytes.length, checksum_sha256: checksum, archive_path: name, part });
        acknowledgements.push({ item, checksum }); cursor = item.id; processed++;
        currentItem = null;
        progress({ processed, expected, part });
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      if (batch.items.length < 25) break;
    }
    await flush();
    if (processed !== expected) throw Error('Expected and exported record/file counts differ.');
    const manifest = { format_version: 1, archive_id: archive, exported_at: new Date().toISOString(), scope, records, files, expected, processed, complete: true, missing_or_failed: [], unavailable_categories: ['checkout inspections', 'move-out clearance', 'violations (not implemented in source schema)'], excluded_security_data: ['Auth credentials', 'sessions', 'invitation hashes', 'private security accounts'], parts, mapping_location: 'Each ZIP part contains _verification/part-manifest.json with complete original metadata and record-to-file mapping.', note: 'ZIP files are not encrypted. Store every part and this manifest on an owner-controlled encrypted device. Download completion does not authorize deleting originals.' };
    const bytes = encode(manifest);
    if (bytes.length > PART_LIMIT) throw Error('Manifest exceeds the safety limit. Narrow the scope.');
    const report = buildZip([{ name: 'Export_summary.xlsx', bytes: buildWorkbook('Export summary', [{ archive_id: archive, result: 'Complete', records, files, zip_parts: parts.length, exported_at: manifest.exported_at }]) }, { name: '_verification/manifest.json', bytes }, { name: 'README.txt', bytes: readme }]);
    await save(new Blob([report], { type: 'application/zip' }), `mapsilip-${archive}-export-report.zip`);
    return manifest;
  } catch (error) {
    if (!signal.aborted) {
      await storageMutation('archive.failed', { archive_id: archive }).catch(() => {});
      const report = encode({ archive_id: archive, complete: false, processed, expected, exported_at: new Date().toISOString(), failure: error instanceof Error ? error.message : 'Export failed', saved_parts: parts, unsaved_part_mapping: mapping, current_item: currentItem ? { id: currentItem.id, record_type: currentItem.record_type, record_id: currentItem.record_id, attachment_id: currentItem.attachment_id } : null, unprocessed_count: expected - processed, originals_retained: true });
      await save(new Blob([report], { type: 'application/json' }), `mapsilip-${archive}-INCOMPLETE.json`).catch(() => {});
    }
    throw error;
  }
}
