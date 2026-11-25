import { readFile } from 'node:fs/promises';
import { restoreLocal } from '../worker/backup/local.mjs';

const [archive, output, trustedKeyFile] = process.argv.slice(2);
if (!archive || !output || !trustedKeyFile) {
  console.error('Usage: node scripts/restore-backup.mjs <archive-directory> <new-output-directory> <trusted-public-key.pem>');
  process.exitCode = 2;
} else {
  try {
    const receipt = await restoreLocal(archive, output, await readFile(trustedKeyFile));
    console.log(`Restored verified files for ${receipt.backupId}`);
  } catch (error) {
    console.error('Restore failed:', error.message);
    process.exitCode = 1;
  }
}
