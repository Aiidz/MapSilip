import { enqueueDueBackups } from '@/app/lib/backup/schedule';
import { nextScheduledRun } from '@/worker/backup/schedule.mjs';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { assertRequestOrigin, getTrustedAppOrigin } from '@/app/lib/backend/auth/dependencies';
import { requireStaffPortalAccess } from '@/app/lib/backend/server';
import { BackendError, publicBackendError } from '@/app/lib/backend/security';
import { registry } from '@/app/lib/backup/connection';
import { backupWorkerEnabled } from '@/app/lib/backup/jobs';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    assertRequestOrigin(request);
    const owner = await requireStaffPortalAccess('owner');
    const action = new URL(request.url).searchParams.get('action');
    if (!backupWorkerEnabled() && action !== 'schedule-disable') throw new BackendError('unavailable');
    if (action === 'due') {
      const queued = await enqueueDueBackups(owner.userId);
      return NextResponse.json({ queued }, { status: 202, headers });
    }
    const db = registry();
    if (action === 'now' || action === 'history') {
      const created = await db.query(`insert into mapsilip_backup.jobs (owner_id,job_key,reason)
        select owner_id,$2,'manual' from mapsilip_backup.drive_connections
        where owner_id=$1 and state='connected' and staging_root_id is not null
          and worker_seen_at > now() - interval '5 minutes'`, [owner.userId, action === 'history' ? 'history:' + randomUUID() : randomUUID()]);
      if (created.rowCount !== 1) throw new BackendError('unavailable');
    } else if (action === 'retry') {
      const id = new URL(request.url).searchParams.get('id') ?? '';
      if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) {
        throw new BackendError('invalid_input');
      }
      const retried = await db.query(`update mapsilip_backup.jobs j
        set state='queued',failure_code=null,lease_until=null,updated_at=now()
        from mapsilip_backup.drive_connections c
        where j.id=$2 and j.owner_id=$1 and c.owner_id=j.owner_id and c.state='connected'
          and c.staging_root_id is not null and c.worker_seen_at>now()-interval '5 minutes'
          and j.state='failed' and j.drive_verified_at is null`, [owner.userId, id]);
      if (retried.rowCount !== 1) throw new BackendError('unavailable');
    } else if (action === 'schedule-disable') {
      await db.query('update mapsilip_backup.schedule_settings set enabled=false,next_run_at=null where owner_id=$1', [owner.userId]);
    } else if (action === 'schedule') {
      const data = await request.formData();
      const frequency = String(data.get('frequency'));
      const local_time = String(data.get('local_time'));
      const integer = (name: string, fallback: number, min: number, max: number) => {
        const raw = data.get(name) ?? String(fallback);
        const value = Number(raw);
        if (!/^\d+$/.test(String(raw)) || value < min || value > max) throw new BackendError('invalid_input');
        return value;
      };
      const weekday = integer('weekday', 1, 0, 6);
      const month_day = integer('month_day', 1, 1, 31);
      const year_month = integer('year_month', 1, 1, 12);
      if (!['weekly','monthly','yearly'].includes(frequency) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(local_time)) throw new BackendError('invalid_input');
      const next = nextScheduledRun({frequency,weekday,month_day,year_month,local_time}, new Date());
      const saved = await db.query(`insert into mapsilip_backup.schedule_settings as s
        (owner_id,enabled,frequency,weekday,month_day,year_month,local_time,next_run_at)
        select owner_id,true,$2,$3,$4,$5,$6,$7 from mapsilip_backup.drive_connections
        where owner_id=$1 and state='connected' and staging_root_id is not null
        on conflict(owner_id) do update set enabled=true,frequency=excluded.frequency,
        weekday=excluded.weekday,month_day=excluded.month_day,year_month=excluded.year_month,local_time=excluded.local_time,
        next_run_at=case when s.enabled and (s.frequency,s.weekday,s.month_day,s.year_month,s.local_time)=
        (excluded.frequency,excluded.weekday,excluded.month_day,excluded.year_month,excluded.local_time)
        then s.next_run_at else excluded.next_run_at end`, [owner.userId,frequency,weekday,month_day,year_month,local_time,next]);
      if (!saved.rowCount) throw new BackendError('unavailable');
    } else {
      throw new BackendError('invalid_input');
    }
    const returnToSettings = (action === 'schedule' || action === 'schedule-disable') && new URL(request.url).searchParams.get('from') === 'settings';
    return NextResponse.redirect(new URL(returnToSettings ? '/management/settings?section=backups' : '/management/backups', getTrustedAppOrigin()), { status: 303, headers });
  } catch (error) {
    const failure = publicBackendError(error);
    return NextResponse.json({ message: failure.message }, { status: failure.status, headers });
  }
}
