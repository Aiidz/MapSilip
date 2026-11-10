import { createSupabaseServerClient } from '@/app/lib/supabase/server';
import { verifyAuthSession } from '@/app/lib/backend/identity';
import { BackendError, publicBackendError } from '@/app/lib/backend/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** HttpOnly session stays on the server. Only own notice IDs enter the event stream. */
export async function GET(request: Request) {
  try {
    const client = await createSupabaseServerClient();
    const { identity } = await verifyAuthSession(client.auth);
    const { data, error } = await client.auth.getSession();
    const session = data.session;
    if (error || !session || session.user.id !== identity.userId) throw new BackendError('unauthenticated');
    await client.realtime.setAuth(session.access_token);
    const encoder = new TextEncoder();
    let stop = () => {};
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let stopped = false;
        const timers: { lifetime?: ReturnType<typeof setTimeout>; heartbeat?: ReturnType<typeof setInterval> } = {};
        const channel = client.channel(`notification-stream:${identity.userId}`);
        stop = () => {
          if (stopped) return;
          stopped = true;
          clearTimeout(timers.lifetime); clearInterval(timers.heartbeat);
          request.signal.removeEventListener('abort', stop);
          void client.removeChannel(channel).catch(() => {});
          try { controller.close(); } catch { /* Client already disconnected. */ }
        };
        const send = (text: string) => { if (!stopped) { try { controller.enqueue(encoder.encode(text)); } catch { stop(); } } };
        request.signal.addEventListener('abort', stop, { once: true });
        if (request.signal.aborted) { stop(); return; }
        // Refresh the authenticated connection before JWT expiry and before Vercel's deadline.
        const seconds = Math.max(1, Math.min(240, (session.expires_at ?? (Date.now() / 1000 + 250)) - Date.now() / 1000 - 10));
        timers.lifetime = setTimeout(stop, seconds * 1000);
        timers.heartbeat = setInterval(() => send(': keepalive\n\n'), 20000);
        send('retry: 5000\n\n');
        channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${identity.userId}` }, payload => {
          const row = payload.new;
          if (row.recipient_id !== identity.userId || typeof row.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.id) || row.read_at) return;
          send(`data: ${JSON.stringify({ id: row.id, recipient_id: identity.userId })}\n\n`);
        }).subscribe(status => {
          if (status === 'SUBSCRIBED') send('event: ready\ndata: {}\n\n');
          else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) stop();
        });
      },
      cancel() { stop(); },
    });
    return new Response(stream, { headers: {
      'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'private, no-store, no-transform',
      'X-Accel-Buffering': 'no', 'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) {
    const safe = publicBackendError(error);
    return Response.json({ error: safe.code }, { status: safe.status, headers: { 'Cache-Control': 'no-store' } });
  }
}
