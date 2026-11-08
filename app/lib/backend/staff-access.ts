import { BackendError } from './security';

const ownerActions = [
  'tenant.application.approve', 'tenant.application.reject', 'room.assign',
  'room.move', 'finance.read', 'invoice.correct', 'payment.reverse',
] as const;
export type StaffAction = 'staff.access.inspect' | typeof ownerActions[number];
export type StaffActor = Readonly<{ userId: string; sessionId: string; securityRevision: string; role: 'owner' | 'caretaker' }>;

export function requirePortalRole(actor: StaffActor, expectedRole: StaffActor['role']): StaffActor {
  if (actor.role !== expectedRole) throw new BackendError('forbidden');
  return actor;
}

export type StaffAuthority = {
  verifyIdentity: () => Promise<{ userId: string; sessionId: string; verified: true }>;
  /** Server-wired, caller-scoped database RPC. Never take this value from a request. */
  readSnapshot: () => Promise<unknown>;
};

function authorize(identity: { userId: string; sessionId: string; verified: true }, value: unknown, action: StaffAction): StaffActor {
  if (value === null) throw new BackendError('forbidden');
  if (typeof value !== 'object' || Array.isArray(value)) throw new BackendError('unavailable');
  const state = value as Record<string, unknown>;
  if (typeof state.user_id !== 'string' || typeof state.role !== 'string' ||
      typeof state.session_id !== 'string' || typeof state.status !== 'string' || typeof state.password_change_required !== 'boolean' ||
      typeof state.auth_session_active !== 'boolean' ||
      typeof state.security_revision !== 'string' || !/^[1-9]\d{0,18}$/.test(state.security_revision) ||
      (state.session_revision !== null &&
        (typeof state.session_revision !== 'string' || !/^[1-9]\d{0,18}$/.test(state.session_revision)))) {
    throw new BackendError('unavailable');
  }
  if (identity.verified !== true || state.user_id !== identity.userId || state.session_id !== identity.sessionId || !['owner', 'caretaker'].includes(state.role) ||
      state.status !== 'active' || state.password_change_required ||
      !state.auth_session_active || state.session_revision !== state.security_revision) {
    throw new BackendError('forbidden');
  }
  if (action !== 'staff.access.inspect' && state.role !== 'owner') throw new BackendError('forbidden');
  return Object.freeze({ userId: identity.userId, sessionId: identity.sessionId,
    securityRevision: state.security_revision, role: state.role as StaffActor['role'] });
}

/** Every invocation re-verifies identity and current authority. No automatic mutation retries.
 * A subsequent data operation MUST also enforce current access in database RLS/its transaction;
 * this preflight cannot close a deactivation race between a snapshot and a later query.
 */
export async function runStaffOperation<T>(
  authority: StaffAuthority,
  action: StaffAction,
  operation: (actor: StaffActor) => Promise<T>,
): Promise<T> {
  try {
    if (action !== 'staff.access.inspect' && !(ownerActions as readonly string[]).includes(action)) {
      throw new BackendError('forbidden');
    }
    const identity = await authority.verifyIdentity();
    const actor = authorize(identity, await authority.readSnapshot(), action);
    return await operation(actor);
  } catch (error) {
    if (error instanceof BackendError) throw error;
    throw new BackendError('unavailable');
  }
}
