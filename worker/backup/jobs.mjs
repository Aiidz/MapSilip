const liveStates = "('queued','collecting','packaging','uploading','verifying')";

/** Claim once using a finite lease and a monotonically increasing fencing token. */
export async function claimBackupJob(client, leaseSeconds = 120, ownerId = null) {
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < 10 || leaseSeconds > 600) {
    throw new Error('Invalid backup lease');
  }
  const result = await client.query(`
    with candidate as (
      select id from mapsilip_backup.jobs
      where state in ${liveStates} and (lease_until is null or lease_until <= now())
      ${ownerId === null ? '' : 'and owner_id=$2'}
      order by created_at,id limit 1 for update skip locked
    )
    update mapsilip_backup.jobs j
    set state='collecting', fence=j.fence+1, attempts=j.attempts+1,
        lease_until=now()+($1 * interval '1 second'), updated_at=now(), failure_code=null
    from candidate where j.id=candidate.id
    returning j.id,j.owner_id,j.created_at,j.reason,j.job_key,j.period,j.fence,j.attempts`, ownerId === null ? [leaseSeconds] : [leaseSeconds, ownerId]);
  return result.rows[0] ?? null;
}

export async function updateBackupJob(client, job, state, leaseSeconds = 120) {
  if (!['collecting', 'packaging', 'uploading', 'verifying'].includes(state) ||
      !Number.isInteger(leaseSeconds) || leaseSeconds < 10 || leaseSeconds > 600) {
    throw new Error('Invalid backup job transition');
  }
  const result = await client.query(`
    update mapsilip_backup.jobs
      set state=$3,updated_at=now(),lease_until=now()+($4 * interval '1 second')
    where id=$1 and fence=$2 and lease_until>now() and state in ${liveStates}`,
  [job.id, job.fence, state, leaseSeconds]);
  if (result.rowCount !== 1) throw new Error('Backup lease lost');
}

export async function finishBackupJob(client, job, { localVerified, driveVerified, failureCode = null }) {
  const state = driveVerified === true ? 'completed' : localVerified === true ? 'partially_completed' : 'failed';
  if (failureCode !== null && !/^[a-z][a-z0-9_]{0,59}$/.test(failureCode)) {
    throw new Error('Invalid backup failure code');
  }
  const result = await client.query(`
    update mapsilip_backup.jobs
    set state=$3, failure_code=$4, lease_until=null, updated_at=now(),
        local_verified_at=case when $5 then now() else null end,
        drive_verified_at=case when $6 then now() else null end
    where id=$1 and fence=$2 and lease_until>now() and state in ${liveStates}`,
  [job.id, job.fence, state, failureCode, localVerified === true, driveVerified === true]);
  if (result.rowCount !== 1) throw new Error('Backup lease lost');
  return state;
}
