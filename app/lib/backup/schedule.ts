import 'server-only';
import { registry } from './connection';
import { nextScheduledRun, scheduledJob } from '@/worker/backup/schedule.mjs';

export async function enqueueDueBackups(ownerId: string | null) {
  const client = await registry().connect();
  try {
    await client.query('begin');
    const due = await client.query(`select s.*,now() as tick from mapsilip_backup.schedule_settings s
      join mapsilip_backup.drive_connections c using(owner_id)
      where ($1::uuid is null or s.owner_id=$1) and s.enabled and s.next_run_at <= now() and c.state='connected'
      order by s.next_run_at,s.owner_id limit 100 for update of s skip locked`, [ownerId]);
    let queued = 0;
    for (const row of due.rows) {
      const job = scheduledJob(row.frequency, row.next_run_at);
      const inserted = await client.query(`insert into mapsilip_backup.jobs(owner_id,job_key,reason,period)
        values ($1,$2,$3,$4) on conflict(owner_id,job_key) do nothing`,
      [row.owner_id,job.key,row.frequency,job.period]);
      queued += inserted.rowCount ?? 0;
      await client.query('update mapsilip_backup.schedule_settings set next_run_at=$2 where owner_id=$1',
        [row.owner_id,nextScheduledRun(row,row.tick)]);
    }
    await client.query('commit');
    return queued;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally { client.release(); }
}
