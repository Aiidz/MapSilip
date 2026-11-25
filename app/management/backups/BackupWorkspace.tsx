import Link from 'next/link';
import { ScheduleEditor } from './ScheduleEditor';
import { automaticBackupStatus, backupWorkerEnabled } from '../../lib/backup/jobs';
import { driveConfig, driveConnectionStatus } from '../../lib/backup/connection';
import { storageEnabled } from '../../lib/storage/server';
import { Panel, StatusBadge } from '../../components/ui';
import { BackupHistoryRefresh } from '../../components/BackupHistoryRefresh';
import styles from './backups.module.css';

const stages: Record<string, string> = {
  queued: 'Queued', collecting: 'Collecting records', packaging: 'Preparing local archive',
  uploading: 'Uploading to Google Drive', verifying: 'Verifying archive', completed: 'Complete',
  partially_completed: 'Partially complete', failed: 'Failed', cancelled: 'Cancelled',
};
const failures: Record<string, string> = {
  original_capture_failed: 'An original file could not be collected and verified. Check private Storage before retrying.',
  backup_processing_failed: 'Processing stopped. Check the staging worker before retrying.',
  recovery_coverage_unverified: 'Database and Auth restore unverified.',
  awaiting_local_verification: 'Verify the downloaded archive on your device.',
  drive_receipt_unverified: 'Drive readback has not been verified.',
};
const running = new Set(['queued', 'collecting', 'packaging', 'uploading', 'verifying']);
const dateTime = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila',
});

function PostButton({ action, label, disabled = false, primary = false, reason }: {
  action: string; label: string; disabled?: boolean; primary?: boolean; reason?: string;
}) {
  return <form method="post" action={action}>
    <button className={`dashboard-export ${styles.button} ${primary ? styles.primary : ''}`}
      type="submit" disabled={disabled} aria-describedby={reason}>{label}</button>
  </form>;
}

export async function BackupWorkspace({ userId, drive: result }: { userId: string; drive?: string }) {
  const configured = driveConfig() !== null;
  let registryUnavailable = false;
  let connection = null;
  let automation = null;
  if (configured) {
    try { connection = await driveConnectionStatus(userId); }
    catch { registryUnavailable = true; }
    if (!registryUnavailable) {
      try { automation = await automaticBackupStatus(userId); } catch { /* Show the unavailable schedule state. */ }
    }
  }
  const connected = connection?.state === 'connected' ? connection : null;
  const archiveId = connected?.staging_root_id && /^[a-z0-9_-]{5,128}$/i.test(connected.staging_root_id)
    ? connected.staging_root_id : null;
  const workerEnabled = backupWorkerEnabled();
  const schedule = automation?.schedule;
  const latest = automation?.latest;
  const canSchedule = Boolean(archiveId && workerEnabled && automation);
  const connectReady = configured && !registryUnavailable;
  const revoking = connection?.state === 'revocation_pending';
  return (
    <div className={styles.workspace}>
      <div className={styles.topGrid}>
        <Panel title="Local backup" icon="download" className={styles.panel}>
          <p>Save a ZIP of dormitory records and original files to this device.</p>
          <div className={styles.actions}>
            {storageEnabled() ? <Link className={`dashboard-export ${styles.button} ${styles.primary}`}
              href="/management/storage">Export to this device</Link>
              : <p className={styles.hint}>Local export is unavailable.</p>}
          </div>
        </Panel>

        <Panel title="Google Drive" icon="download" className={styles.panel}>
          <div className={styles.statusLine}>
            <StatusBadge tone={connected ? 'success' : !connectReady || revoking ? 'warning' : 'neutral'}>
              {!connectReady ? 'Setup required' : revoking ? 'Disconnect pending' : connected ? 'Connected' : 'Disconnected'}
            </StatusBadge>
            {connected && <span>Account ending {connected.account_id.slice(-6)}</span>}
          </div>
          {result === 'failed' && <p className={styles.warning} role="alert">Connection failed. Reconnect or contact your administrator.</p>}
          <div className={styles.actions}>
            {!revoking && <PostButton action="/api/backups/drive/connect" primary disabled={!connectReady}
              reason={!connectReady ? 'drive-setup' : undefined} label={connected ? 'Reconnect' : 'Connect Google Drive'} />}
            {connection && <PostButton action="/api/backups/drive/disconnect"
              label={revoking ? 'Retry disconnect' : 'Disconnect'} />}
          </div>
          {!archiveId && <p id="drive-setup" className={!connectReady ? styles.warning : styles.hint}>
            {!configured ? 'Google Drive setup is incomplete.' : registryUnavailable
              ? 'The backup registry is unavailable.' : connected
                ? 'The backup worker needs to prepare a private Drive folder.' : 'Connect your Google account to schedule backups.'}
          </p>}
          {connected && <>
            <div className={styles.schedule}>
              <div><strong>Automatic backups</strong><p className={styles.hint}>
                {automation ? schedule?.enabled ? schedule.frequency : 'Off' : 'Unavailable'}
              </p></div>
              {schedule?.enabled && <PostButton action="/api/backups/jobs?action=schedule-disable&from=settings" label="Turn off" />}
            </div>
            {schedule?.enabled && schedule.next_run_at && <p className={styles.hint}>
              Next backup · {dateTime.format(schedule.next_run_at)} (Manila)
            </p>}
            {canSchedule && <ScheduleEditor settings={schedule} enabled={!!schedule?.enabled} />}
            {archiveId && !canSchedule && <p className={styles.hint}>Scheduling is currently unavailable.</p>}
            {archiveId && workerEnabled && !connected.worker_online && <p className={styles.warning}>Backup worker is offline.</p>}
            {latest && <div className={styles.schedule}>
              <div>
                <strong>Latest automatic backup</strong>
                <p className={styles.hint}>{dateTime.format(latest.created_at)} · {stages[latest.state] ?? 'Status unavailable'}</p>
                {latest.failure_code && <p className={styles.warning}>
                  {failures[latest.failure_code] ?? 'The backup could not be verified.'}
                </p>}
              </div>
              <BackupHistoryRefresh active={running.has(latest.state)} />
            </div>}
          </>}
        </Panel>
      </div>
    </div>
  );
}
