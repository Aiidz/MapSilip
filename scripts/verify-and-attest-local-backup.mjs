import { createHash, sign } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { verifyLocal } from '../worker/backup/local.mjs';

const [directory, archivePublicKey, receiverPrivateKey, output] = process.argv.slice(2);
if (!directory || !archivePublicKey || !receiverPrivateKey || !output) {
  console.error('Usage: node scripts/verify-and-attest-local-backup.mjs <saved-directory> <archive-public-key> <receiver-private-key> <attestation.json>');
  process.exitCode = 2;
} else {
  try {
    const archiveKey = await readFile(archivePublicKey);
    const manifest = await verifyLocal(directory, archiveKey);
    const receipt = await readFile(join(directory, 'Delivery_Receipt.json'));
    const { payload: signedPayload } = JSON.parse(receipt);
    if (signedPayload !== JSON.stringify(manifest)) throw new Error('Delivery receipt changed during verification');
    const payload = JSON.stringify({ version: 1, jobId: manifest.backupId,
      receiptSha256: createHash('sha256').update(receipt).digest('hex') });
    const signature = sign(null, Buffer.from(payload), await readFile(receiverPrivateKey)).toString('base64');
    await writeFile(output, JSON.stringify({ payload, signature }), { flag: 'wx', mode: 0o600 });
    console.log('Verified the received archive and wrote its custody attestation.');
  } catch {
    console.error('Local verification or attestation failed.');
    process.exitCode = 1;
  }
}
