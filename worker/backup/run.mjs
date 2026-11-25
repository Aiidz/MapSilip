import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { claimBackupJob, finishBackupJob, updateBackupJob } from './jobs.mjs';
import { packageFiles, packageLocal, verifyLocal } from './local.mjs';
import { publishDriveTree } from './publish.mjs';

/**
 * Process one job using a sealed staging capture. Each destination adapter uses
 * that capture's immutable files. Local staging verification does not prove custody.
 */
export async function runBackupJob(client, adapters) {
  const job = await claimBackupJob(client, 120, adapters.ownerId ?? null);
  if (!job) return null;
  let driveVerified = false;
  let localVerified = false;
  let failureCode = null;
  try {
    const renew = state => updateBackupJob(client, job, state);
    const capture = await adapters.collect(job, () => renew('collecting'));
    const recoveryVerified = await adapters.verifyRequiredRecoveryArtifacts(capture) === true;
    await renew('packaging');
    let clientHistory = false;
    async function* localEntries() {
      for await (const artifact of capture.entries()) {
        await renew('packaging');
        if (createHash('sha256').update(artifact.bytes).digest('hex') !== artifact.sha256) {
          throw new Error('Staged content changed');
        }
        if (artifact.path === 'Archive_Index.json') clientHistory = true;
        yield artifact;
      }
    }
    await packageLocal(capture.directory, job.id, localEntries(), adapters.signingKey);
    await verifyLocal(capture.directory, adapters.verificationKey);
    const envelope = await readFile(join(capture.directory, 'Delivery_Receipt.json'));
    const deliveryHash = createHash('sha256').update(envelope).digest('hex');
    await adapters.pinPackageReceipt(job, capture, deliveryHash);
    await renew('uploading');
    const drive = await adapters.drive(job);
    const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Manila' }).format(job.created_at);
    const folder = clientHistory
      ? day.slice(0, 4) + '/' + day.slice(5, 7) + '/' + day + '_v1_' + job.id
      : day + '_v1_' + job.id;
    async function* driveEntries() {
      for await (const file of packageFiles(capture.directory, adapters.verificationKey, job.id)) {
        await renew('uploading');
        if (file.path === 'Delivery_Receipt.json' && file.sha256 !== deliveryHash) {
          throw new Error('Destination package mismatch');
        }
        yield { ...file, path: folder + '/' + file.path };
      }
    }
    const files = await publishDriveTree(drive.request, {
      rootId: drive.rootId, ownerId: drive.ownerId, backupId: job.id, sharedPeriodFolders: clientHistory,
      artifacts: driveEntries(), registry: drive.registry,
    });
    await renew('verifying');
    driveVerified = await adapters.recordDriveReceipt(job, files, capture) === true;
    localVerified = await adapters.checkLocalCustodyReceipt(job, capture) === true;
    if (!driveVerified) failureCode = 'drive_receipt_unverified';
    else if (!clientHistory && !recoveryVerified) failureCode = 'recovery_coverage_unverified';
  } catch (error) {
    failureCode = error?.code === 'original_capture_failed' ? 'original_capture_failed' : 'backup_processing_failed';
  }

  const state = await finishBackupJob(client, job, { localVerified, driveVerified, failureCode });
  return { id: job.id, state, failureCode };
}
