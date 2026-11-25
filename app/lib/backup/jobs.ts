import 'server-only';
import { registry } from './connection';

export const backupWorkerEnabled = () => process.env.BACKUP_WORKER_ENABLED === 'true';

// j is already scoped to the authenticated owner. Only the matching connected root can serve files.
const verifiedFiles = `select regexp_replace(i.path,'^.*/','') as name,a.drive_id,a.parent_id,a.root_id,
    a.sha256,a.verified_bytes,c.account_id
  from jsonb_to_recordset(j.drive_inventory) as i(path text,"driveFileId" text,sha256 text,bytes bigint)
  join mapsilip_backup.drive_artifacts a on a.drive_id=i."driveFileId"
    and a.kind='file' and a.verified_at is not null and a.sha256=i.sha256 and a.verified_bytes=i.bytes
  join mapsilip_backup.drive_connections c on c.staging_root_id=a.root_id and c.state='connected'
  where c.owner_id=j.owner_id and j.drive_verified_at is not null and j.capture_seal_sha256 is not null
    and j.local_receipt_sha256 is not null
    and i.path ~ ('^([0-9]{4}/(0[1-9]|1[0-2])/)?[0-9]{4}-[0-9]{2}-[0-9]{2}_v1_' || j.id::text || '/(Part_[0-9]{6}[.]zip|Delivery_Receipt[.]json)$')
    and (regexp_replace(i.path,'^.*/','')<>'Delivery_Receipt.json' or a.sha256=j.local_receipt_sha256)`;

export async function verifiedDownload(ownerId: string, jobId: string, name: string) {
  const { rows } = await registry().query(`select f.* from mapsilip_backup.jobs j
    cross join lateral (${verifiedFiles}) f where j.owner_id=$1 and j.id=$2 and f.name=$3`, [ownerId,jobId,name]);
  return rows.length === 1 ? rows[0] : null;
}

export async function backupHistory(ownerId: string) {
  const { rows } = await registry().query<{
    id: string; reason: string; period: string | null; state: string;
    created_at: Date; failure_code: string | null; delivery_files: string[]; receipt_pinned: boolean; local_custody_at: Date | null; drive_verified_at: Date | null;
  }>(`select j.id,j.reason,j.period,j.state,j.created_at,j.failure_code,j.local_custody_at,j.drive_verified_at, j.local_receipt_sha256 is not null as receipt_pinned,
              array(select f.name from (${verifiedFiles}) f order by f.name) as delivery_files
       from mapsilip_backup.jobs j
       where j.owner_id=$1 order by j.created_at desc,j.id desc limit 25`, [ownerId]);
  return { rows, schedule: await backupSchedule(ownerId) };
}

export async function automaticBackupStatus(ownerId: string) {
  const [{ rows }, schedule] = await Promise.all([
    registry().query<{ created_at: Date; state: string; failure_code: string | null }>(
      `select created_at, state, failure_code from mapsilip_backup.jobs
       where owner_id=$1 and reason in ('weekly','monthly','yearly')
       order by created_at desc, id desc limit 1`, [ownerId]),
    backupSchedule(ownerId),
  ]);
  return { latest: rows[0], schedule };
}

export async function backupSchedule(ownerId: string) {
  const setting = await registry().query<{
    enabled: boolean; frequency: 'weekly' | 'monthly' | 'yearly'; weekday: number;
    month_day: number; year_month: number; local_time: string; next_run_at: Date | null;
  }>('select enabled,frequency,weekday,month_day,year_month,local_time,next_run_at from mapsilip_backup.schedule_settings where owner_id=$1', [ownerId]);
  return setting.rows[0];
}
