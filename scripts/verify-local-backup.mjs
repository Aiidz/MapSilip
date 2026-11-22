import { readFile } from 'node:fs/promises';
import { verifyLocal } from '../worker/backup/local.mjs';

const [directory, trustedKeyFile] = process.argv.slice(2);
if (!directory || !trustedKeyFile) {
  console.error('Usage: node scripts/verify-local-backup.mjs <directory> <trusted-public-key.pem>');
  process.exitCode = 2;
} else {
  try {
    const receipt = await verifyLocal(directory, await readFile(trustedKeyFile));
    console.log(`Verified signed delivery ${receipt.backupId} (${receipt.parts.length} parts)`);
  } catch (error) {
    console.error('Verification failed:', error.message);
    process.exitCode = 1;
  }
}
