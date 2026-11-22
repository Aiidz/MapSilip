import { NextResponse } from 'next/server';
import { assertRequestOrigin, getTrustedAppOrigin } from '@/app/lib/backend/auth/dependencies';
import { requireStaffPortalAccess } from '@/app/lib/backend/server';
import { BackendError, publicBackendError } from '@/app/lib/backend/security';
import { registry } from '@/app/lib/backup/connection';
import { validateLocalCustody } from '@/worker/backup/delivery.mjs';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    assertRequestOrigin(request);
    const owner = await requireStaffPortalAccess('owner');
    const { id } = await params;
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) {
      throw new BackendError('invalid_input');
    }
    const key = process.env.BACKUP_RECEIVER_PUBLIC_KEY;
    if (!key || !request.body || !request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) {
      throw new BackendError('invalid_input');
    }
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 8192) {
        await reader.cancel();
        throw new BackendError('invalid_input');
      }
      chunks.push(part.value);
    }
    const db = registry();
    const { rows: [job] } = await db.query<{ local_receipt_sha256: string }>(
      'select local_receipt_sha256 from mapsilip_backup.jobs where id=$1 and owner_id=$2 and local_receipt_sha256 is not null',
      [id, owner.userId],
    );
    if (!job) throw new BackendError('forbidden');
    try {
      const attestation = new URLSearchParams(Buffer.concat(chunks).toString('utf8')).get('attestation');
      if (!attestation) throw new BackendError('invalid_input');
      validateLocalCustody(JSON.parse(attestation), {
        jobId: id, receiptSha256: job.local_receipt_sha256,
      }, key);
    } catch {
      throw new BackendError('invalid_input');
    }
    const updated = await db.query(
      `update mapsilip_backup.jobs set local_custody_at=coalesce(local_custody_at,now())
       where id=$1 and owner_id=$2 and local_receipt_sha256=$3`,
      [id, owner.userId, job.local_receipt_sha256],
    );
    if (updated.rowCount !== 1) throw new BackendError('unavailable');
    return NextResponse.redirect(new URL('/management/backups', getTrustedAppOrigin()), { status: 303, headers });
  } catch (error) {
    const failure = publicBackendError(error);
    return NextResponse.json({ message: failure.message }, { status: failure.status, headers });
  }
}
