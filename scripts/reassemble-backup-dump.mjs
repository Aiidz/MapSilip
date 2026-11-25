import { createHash } from 'node:crypto';
import { open, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const [restoredDirectory, jobId, output] = process.argv.slice(2);
if (!restoredDirectory || !/^[a-f0-9-]{36}$/i.test(jobId ?? '') || !output) {
  console.error('Usage: node scripts/reassemble-backup-dump.mjs <verified-restored-directory> <job-uuid> <new-dump-file>');
  process.exitCode = 2;
} else {
  try {
    const root = `01_Technical_Recovery/${jobId}/Database`;
    const inventory = JSON.parse(await readFile(join(restoredDirectory, root, 'Application_Dump.json'), 'utf8'));
    const sha256 = createHash('sha256');
    let total = 0;
    const destination = await open(output, 'wx', 0o600);
    try {
      for (const [index, piece] of inventory.pieces.entries()) {
        const expected = `${root}/application.dump.${String(index + 1).padStart(6, '0')}`;
        if (piece.path !== expected || !Number.isSafeInteger(piece.bytes) || piece.bytes <= 0 ||
            piece.bytes > 4 * 1024 * 1024) throw new Error('Invalid dump piece');
        const bytes = await readFile(join(restoredDirectory, expected));
        if (bytes.length !== piece.bytes) throw new Error('Invalid restored dump piece length');
        await destination.writeFile(bytes);
        sha256.update(bytes);
        total += bytes.length;
      }
      if (!total || total !== inventory.bytes || sha256.digest('hex') !== inventory.sha256) {
        throw new Error('Reassembled dump checksum mismatch');
      }
      await destination.sync();
    } finally {
      await destination.close();
    }
    console.log('Reassembled and checksum-verified the application dump. Auth and Storage recovery require separate verified material.');
  } catch {
    console.error('Dump reassembly failed. Treat any newly written file as incomplete.');
    process.exitCode = 1;
  }
}
