/** Drive ID allocation and checkpoint writes are private and fenced to the active job. */
export function transferRegistry(client, job, { allocateId, sealSession, openSession }) {
  function ownedLease() {
    return "exists (select 1 from mapsilip_backup.jobs where id=$1 and fence=$2 and lease_until>now() and state in ('uploading','verifying') for share)";
  }
  return {
    async reserve({ rootId, logicalId, parentId, kind }) {
      const input = [job.id, job.fence, rootId, logicalId];
      const select = () => client.query(`select drive_id,parent_id,kind,session_envelope
        from mapsilip_backup.drive_artifacts where root_id=$3 and logical_id=$4 and ${ownedLease()}`, input);
      let { rows: [row] } = await select();
      if (!row) {
        const id = await allocateId();
        await client.query(`insert into mapsilip_backup.drive_artifacts (root_id,logical_id,parent_id,kind,drive_id)
          select $3,$4,$5,$6,$7 where ${ownedLease()} on conflict (root_id,logical_id) do nothing`,
        [...input, parentId, kind, id]);
        ({ rows: [row] } = await select());
      }
      if (!row || row.parent_id !== parentId || row.kind !== kind) throw new Error('Invalid Drive reservation or lost lease');
      return {
        id: row.drive_id,
        session: row.session_envelope ? await openSession(row.session_envelope, row.drive_id) : undefined,
      };
    },
    async checkpoint(id, { session, offset }) {
      if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid upload checkpoint');
      const envelope = await sealSession(session, id);
      const result = await client.query(`update mapsilip_backup.drive_artifacts
        set session_envelope=$4,acknowledged_bytes=$5 where drive_id=$3 and ${ownedLease()}`,
      [job.id, job.fence, id, envelope, offset]);
      if (result.rowCount !== 1) throw new Error('Backup upload lease lost');
    },
    async verified(id, { sha256, bytes }) {
      const result = await client.query(`update mapsilip_backup.drive_artifacts
        set sha256=$4,verified_bytes=$5,verified_at=now(),session_envelope=null
        where drive_id=$3 and ${ownedLease()}`, [job.id, job.fence, id, sha256, bytes]);
      if (result.rowCount !== 1) throw new Error('Backup verification lease lost');
    },
  };
}
