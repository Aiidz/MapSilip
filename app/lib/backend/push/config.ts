import 'server-only';

/** Fail closed; installation is deliberately independent of this gate. */
export function pushAvailable() {
  return process.env.MAPSILIP_PUSH_ENABLED === 'true' &&
    Boolean(process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY && process.env.WEB_PUSH_VAPID_PRIVATE_KEY &&
      process.env.WEB_PUSH_VAPID_SUBJECT && process.env.MAPSILIP_PUSH_WORKER_SECRET && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
