import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { dispatchPushBatch } from '@/app/lib/backend/push/delivery';
import { pushAvailable } from '@/app/lib/backend/push/config';
export const runtime = 'nodejs';
export const maxDuration = 30;
const headers = { 'Cache-Control': 'no-store' };
export async function POST(request: Request) {
  const secret = process.env.MAPSILIP_PUSH_WORKER_SECRET;
  const bearer = request.headers.get('authorization') ?? '';
  const hash = (value: string) => createHash('sha256').update(value).digest();
  if (!secret || Buffer.byteLength(secret) < 32 || !timingSafeEqual(hash(bearer), hash(`Bearer ${secret}`))) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401, headers });
  }
  if (!pushAvailable()) return NextResponse.json({ error: 'unavailable' }, { status: 503, headers });
  try { return NextResponse.json(await dispatchPushBatch(), { headers }); }
  catch { return NextResponse.json({ error: 'unavailable' }, { status: 503, headers }); }
}
