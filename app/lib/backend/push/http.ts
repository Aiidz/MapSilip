import 'server-only';
import { NextResponse } from 'next/server';
import { BackendError, publicBackendError } from '../security';
import { PushConflict } from './repository';
import { assertRequestOrigin } from '../auth/dependencies';
import { pushAvailable } from './config';
export const pushHeaders = { 'Cache-Control': 'no-store' };
export function assertPushMutation(request: Request) {
  if (!pushAvailable()) throw new BackendError('unavailable');
  assertRequestOrigin(request);
}
export async function readPushJson(request: Request): Promise<unknown> {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') ?? '') || !request.body) throw new BackendError('invalid_input');
  const reader = request.body.getReader(); let size = 0; const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 8192) { await reader.cancel(); throw new BackendError('invalid_input'); }
      chunks.push(value);
    }
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return input;
  } catch (error) {
    if (error instanceof BackendError) throw error;
    throw new BackendError('invalid_input');
  } finally { reader.releaseLock(); }
}
export function pushError(error: unknown) {
  if (error instanceof PushConflict) return NextResponse.json({ error: 'preferences_already_initialized' }, { status: 409, headers: pushHeaders });
  const safe = publicBackendError(error);
  return NextResponse.json({ error: safe.code }, { status: safe.status, headers: pushHeaders });
}
