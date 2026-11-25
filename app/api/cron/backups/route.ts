import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { backupWorkerEnabled } from '@/app/lib/backup/jobs';
import { enqueueDueBackups } from '@/app/lib/backup/schedule';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  const secret = process.env.CRON_SECRET;
  const provided = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from('Bearer ' + secret);
  if (!secret || provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return NextResponse.json({ message: 'Access denied' }, { status: 401, headers });
  }
  if (!backupWorkerEnabled()) return NextResponse.json({ message: 'Backups are inactive' }, { status: 503, headers });
  try {
    const queued = await enqueueDueBackups(null);
    return NextResponse.json({ queued }, { status: 202, headers });
  } catch {
    return NextResponse.json({ message: 'Backup scheduler unavailable' }, { status: 503, headers });
  }
}
