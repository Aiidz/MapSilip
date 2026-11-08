import { NextResponse, type NextRequest } from 'next/server';
import { assertRequestOrigin } from '@/app/lib/backend/auth/dependencies';
import { requireStaffAccess } from '@/app/lib/backend/server';
import { createSupabaseServerClient } from '@/app/lib/supabase/server';
import { BackendError, publicBackendError } from '@/app/lib/backend/security';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    assertRequestOrigin(request);
    await requireStaffAccess('tenant.application.approve');
    const body = await request.json();
    const { id, decision, room_id, started_on, note } = body;

    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id) || !['approved', 'rejected'].includes(decision)) {
      throw new BackendError('invalid_input');
    }

    if (decision === 'approved') {
      if (typeof room_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(room_id)) {
        throw new BackendError('invalid_input');
      }
      if (started_on !== undefined && started_on !== null && (typeof started_on !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(started_on))) {
        throw new BackendError('invalid_input');
      }
    }
    if (decision === 'rejected' && note !== undefined && note !== null &&
        (typeof note !== 'string' || !note.trim() || note.trim().length > 500)) {
      throw new BackendError('invalid_input');
    }

    const client = await createSupabaseServerClient();
    const { error, data } = await client.rpc('mapsilip_review_account_request', {
      p_id: id,
      p_decision: decision,
      p_invitation_hash: null,
      p_room_id: decision === 'approved' ? room_id : null,
      p_started_on: decision === 'approved' ? (started_on || null) : null,
      p_note: typeof note === 'string' ? note.trim() : null,
    });

    if (error || data?.state !== decision) {
      throw new BackendError('invalid_input');
    }

    const validRoom = typeof data?.room_id === 'string' && /^[0-9a-f-]{36}$/i.test(data.room_id) &&
      typeof data?.room_number === 'string' && data.room_number.trim().length > 0;

    return NextResponse.json({
      state: decision,
      message: decision === 'approved'
        ? validRoom
          ? `Tenant account approved and assigned to Room ${data.room_number}.`
          : 'Account decision is saved. Room assignment needs review.'
        : 'Tenant account request rejected.',
      room_number: data?.room_number ?? null,
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const safe = publicBackendError(error);
    return NextResponse.json({ error: safe.code, message: safe.message }, { status: safe.status });
  }
}
