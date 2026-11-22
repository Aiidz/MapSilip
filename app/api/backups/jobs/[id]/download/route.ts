import { NextResponse } from 'next/server';
import { executeStaffOperation } from '@/app/lib/backend/server';
import { BackendError, publicBackendError } from '@/app/lib/backend/security';
import { privatePackageDownload } from '@/worker/backup/drive.mjs';
import { verifiedDownload } from '@/app/lib/backup/jobs';
import { downloadAccessToken } from '@/app/lib/backup/connection';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
  try {
    const { id } = await params;
    const name = new URL(request.url).searchParams.get('file') ?? '';
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id) ||
        !/^(Part_[0-9]{6}\.zip|Delivery_Receipt\.json)$/.test(name)) {
      throw new BackendError('invalid_input');
    }
    return await executeStaffOperation('finance.read', async (_client, owner) => {
      const artifact = await verifiedDownload(owner.userId,id,name);
      if (!artifact) throw new BackendError('forbidden');
      const token = await downloadAccessToken(owner.userId,artifact.account_id,artifact.root_id);
      const target = await privatePackageDownload((url: string) => fetch(url, {
        headers: { Authorization: 'Bearer ' + token }, redirect:'error', cache:'no-store', signal:AbortSignal.timeout(10000),
      }), artifact);
      return NextResponse.redirect(target, { status: 303, headers });
    });
  } catch (error) {
    const failure = publicBackendError(error);
    return NextResponse.json({ message: failure.message }, { status: failure.status, headers });
  }
}
