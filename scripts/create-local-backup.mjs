import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { businessCategoryEntries, readableEntries } from '../worker/backup/export.mjs';
import { packageLocal } from '../worker/backup/local.mjs';
import { PART_LIMIT } from '../app/lib/storage/zip.mjs';

const [snapshotFile, originalsDir, output, privateKeyFile] = process.argv.slice(2);
if (!snapshotFile || !originalsDir || !output || !privateKeyFile) {
  console.error('Usage: node scripts/create-local-backup.mjs <frozen-snapshot.json> <originals-directory> <new-output-directory> <private-key.pem>');
  process.exitCode = 2;
} else {
  try {
    const snapshot = JSON.parse(await readFile(snapshotFile, 'utf8'));
    const tenantArchiveIds = new Map(Object.entries(snapshot.tenantArchiveIds ?? {}));
    async function readOriginal(id) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
      const path = join(originalsDir, id);
      try {
        const stat = await lstat(path);
        if (!stat.isFile() || stat.size > PART_LIMIT) return null;
        return await readFile(path);
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
    }
    async function* entries() {
      yield* businessCategoryEntries(snapshot, { period: snapshot.period, tenantArchiveIds });
      yield* readableEntries(snapshot, readOriginal, tenantArchiveIds);
    }
    const receipt = await packageLocal(output, snapshot.backupId, entries(), await readFile(privateKeyFile));
    console.log(`Packaged prepared snapshot ${receipt.backupId} in ${receipt.parts.length} ZIP volumes. Review source coverage and verify the saved copy.`);
  } catch (error) {
    console.error('Packaging failed:', error.message);
    process.exitCode = 1;
  }
}
