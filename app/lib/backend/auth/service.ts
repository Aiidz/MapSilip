import { BackendError, type BackendErrorStage } from '../security';
import type { CookieOptions } from '@supabase/ssr';
import { canBeginFirstLoginChange, decideFirstLoginCompletion, decideSignIn, type SecurityAttempt, type StaffAccount, type VerifiedIdentity } from './protocol';

export type AuthCookieWrite = Readonly<{ name: string; value: string; options: CookieOptions }>;
export type AuthSessionResult = Readonly<{ identity: VerifiedIdentity; cookies: readonly AuthCookieWrite[] }>;
export type SecurityCommandResult = Readonly<{
  result: 'restricted' | 'admitted' | 'completed';
  userId: string;
  sessionId: string;
  role: 'owner' | 'caretaker';
  securityRevision: string;
}>;

type SignInAttempt = Readonly<{ attempt: SecurityAttempt; account: StaffAccount }>;
type FirstLoginAttempt = Readonly<{ attempt: SecurityAttempt; account: StaffAccount }>;

export type StaffAuthDependencies = {
  consumeRateLimit(email: string, clientAddress: string): Promise<boolean>;
  beginStaffSignin(email: string): Promise<SignInAttempt | null>;
  finishStaffSignin(attemptId: string, userId: string, sessionId: string): Promise<SecurityCommandResult | null>;
  beginFirstLoginChange(userId: string, sessionId: string): Promise<FirstLoginAttempt | null>;
  hasOnlyAuthSession(userId: string, sessionId: string): Promise<boolean>;
  revokeSessionAdmission(userId: string, sessionId: string): Promise<boolean>;
  completeFirstLogin(attemptId: string, userId: string, sessionId: string,
    passwordUpdateConfirmed: boolean, globalRevocationConfirmed: boolean): Promise<SecurityCommandResult | null>;
  reconcileFirstLogin(attemptId: string, userId: string, sessionId: string): Promise<SecurityCommandResult | null>;
  auth: {
    signIn(email: string, password: string): Promise<AuthSessionResult>;
    verifyCurrentSession(): Promise<Readonly<{ identity: VerifiedIdentity; email: string }>>;
    signOutCurrent(): Promise<Readonly<{ confirmed: boolean; cookies: readonly AuthCookieWrite[] }>>;
    changePassword(currentPassword: string, newPassword: string): Promise<'confirmed' | 'rejected' | 'uncertain'>;
    signOutGlobally(): Promise<'confirmed' | 'uncertain'>;
    signInFresh(email: string, password: string): Promise<AuthSessionResult>;
  };
  now(): number;
};

const validLogin = (email: unknown, password: unknown): boolean =>
  typeof email === 'string' && email.length <= 320 && email === email.trim() &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && typeof password === 'string' && password.length > 0 && password.length <= 1024;

function safeResult(value: SecurityCommandResult | null, kind: SecurityCommandResult['result'], identity: VerifiedIdentity,
  stage?: BackendErrorStage) {
  if (!value || value.result !== kind || value.userId !== identity.userId || value.sessionId !== identity.sessionId ||
      !['owner', 'caretaker'].includes(value.role) || !/^[1-9]\d{0,18}$/.test(value.securityRevision)) {
    throw new BackendError('forbidden', stage);
  }
  return value;
}

const destinationFor = (role: SecurityCommandResult['role']) => role === 'owner' ? '/management' : '/caretaker';

/** Login orchestration never returns provider credentials until the DB command admits this exact verified session. */
export async function staffSignIn(dependencies: StaffAuthDependencies, input: {
  email: unknown; password: unknown; clientAddress: string;
}) {
  if (!validLogin(input.email, input.password) || typeof input.clientAddress !== 'string' || !input.clientAddress) {
    throw new BackendError('invalid_input');
  }
  const email = (input.email as string).toLowerCase();
  let stage: BackendErrorStage = 'rate_limit';
  try {
    if (!await dependencies.consumeRateLimit(email, input.clientAddress)) throw new BackendError('rate_limited', 'rate_limit');
    // The attempt/revision is captured before Auth accepts credentials. It is server-returned state only.
    stage = 'staff_lookup';
    const started = await dependencies.beginStaffSignin(email);
    if (!started) return Object.freeze({ kind: 'unmapped' as const });
    let session: AuthSessionResult;
    stage = 'supabase_auth';
    try {
      session = await dependencies.auth.signIn(email, input.password as string);
    } catch {
      throw new BackendError('unauthenticated', 'supabase_auth');
    }
    stage = 'supabase_identity';
    const decision = decideSignIn({ attempt: started.attempt, account: started.account,
      verifiedIdentity: session.identity, now: dependencies.now() });
    if (decision.kind === 'deny') throw new BackendError('unauthenticated', 'supabase_identity');
    const expectedResult = decision.kind === 'admit' ? 'admitted' : 'restricted';
    stage = 'staff_admission';
    const stored = safeResult(await dependencies.finishStaffSignin(
      started.attempt.id, session.identity.userId, session.identity.sessionId,
    ), expectedResult, session.identity, 'staff_admission');
    if (stored.role !== started.account.role || stored.securityRevision !== started.account.securityRevision) {
      throw new BackendError('forbidden', 'staff_role_consistency');
    }
    return Object.freeze({ kind: stored.result, role: stored.role, userId: stored.userId, sessionId: stored.sessionId,
      destination: stored.result === 'restricted' ? '/auth/change-password' : destinationFor(stored.role),
      cookies: session.cookies });
  } catch (error) {
    if (error instanceof BackendError) throw error.stage ? error : new BackendError(error.code, stage);
    throw new BackendError('unavailable', stage);
  }
}

/** The only first-login transition. A lost commit is reconciled without repeating Auth mutations. */
export async function completeFirstLogin(dependencies: StaffAuthDependencies, input: {
  currentPassword: unknown; newPassword: unknown; clientAddress: string;
}) {
  if (typeof input.currentPassword !== 'string' || !input.currentPassword || input.currentPassword.length > 1024 ||
      typeof input.newPassword !== 'string' || input.newPassword.length < 8 || input.newPassword.length > 1024 ||
      input.currentPassword === input.newPassword || typeof input.clientAddress !== 'string' || !input.clientAddress) {
    throw new BackendError('invalid_input', 'first_login_input');
  }

  let current: Readonly<{ identity: VerifiedIdentity; email: string }>;
  try { current = await dependencies.auth.verifyCurrentSession(); }
  catch { throw new BackendError('unauthenticated', 'first_login_session_verification'); }

  let stage: BackendErrorStage = 'first_login_rate_limit';
  try {
    if (!await dependencies.consumeRateLimit(current.email.toLowerCase(), input.clientAddress)) throw new BackendError('rate_limited', stage);
    stage = 'first_login_admission';
    const started = await dependencies.beginFirstLoginChange(current.identity.userId, current.identity.sessionId);
    if (!started || !canBeginFirstLoginChange({ ...started, identity: current.identity, now: dependencies.now() })) {
      throw new BackendError('forbidden', stage);
    }

    stage = 'first_login_password_update';
    const passwordUpdate = await dependencies.auth.changePassword(input.currentPassword, input.newPassword);
    if (passwordUpdate === 'rejected') throw new BackendError('invalid_input', stage);
    if (passwordUpdate !== 'confirmed') throw new BackendError('unavailable', stage);

    stage = 'first_login_global_signout';
    const globalRevocation = await dependencies.auth.signOutGlobally();
    if (globalRevocation !== 'confirmed') throw new BackendError('unavailable', stage);

    let fresh: AuthSessionResult;
    stage = 'first_login_fresh_auth';
    try { fresh = await dependencies.auth.signInFresh(current.email, input.newPassword); }
    catch { throw new BackendError('unavailable', stage); }
    stage = 'first_login_session_check';
    const onlyCurrentSession = await dependencies.hasOnlyAuthSession(current.identity.userId, fresh.identity.sessionId);
    const protocol = decideFirstLoginCompletion({
      attempt: started.attempt, account: started.account,
      verifiedIdentity: fresh.identity, now: dependencies.now(), passwordUpdate,
      globalRevocation, liveSessionIds: onlyCurrentSession ? [fresh.identity.sessionId] : [],
    });
    if (protocol.kind !== 'complete' || fresh.identity.userId !== current.identity.userId) {
      throw new BackendError('forbidden', stage);
    }

    stage = 'first_login_completion';
    let completed: SecurityCommandResult | null;
    try {
      completed = await dependencies.completeFirstLogin(started.attempt.id, fresh.identity.userId,
        fresh.identity.sessionId, true, true);
    } catch {
      // The DB may have committed before transport failure. Only this exact fresh session can reconcile.
      try { completed = await dependencies.reconcileFirstLogin(started.attempt.id, fresh.identity.userId, fresh.identity.sessionId); }
      catch { throw new BackendError('unavailable'); }
      if (!completed) throw new BackendError('unavailable', stage);
    }
    const stored = safeResult(completed, 'completed', fresh.identity, stage);
    if (stored.role !== started.account.role || stored.securityRevision !== protocol.newRevision) {
      throw new BackendError('unavailable', stage);
    }
    return Object.freeze({ kind: 'completed' as const, role: stored.role, userId: stored.userId, sessionId: stored.sessionId,
      destination: destinationFor(stored.role), cookies: fresh.cookies });
  } catch (error) {
    if (error instanceof BackendError) throw error.stage ? error : new BackendError(error.code, stage);
    throw new BackendError('unavailable', stage);
  }
}

/** Revokes the database grant before global Auth sign-out so a surviving access JWT cannot keep portal access. */
export async function staffSignOut(dependencies: Pick<StaffAuthDependencies, 'auth' | 'revokeSessionAdmission'>) {
  let current: Readonly<{ identity: VerifiedIdentity; email: string }>;
  try { current = await dependencies.auth.verifyCurrentSession(); }
  catch { throw new BackendError('unauthenticated'); }

  try { await dependencies.revokeSessionAdmission(current.identity.userId, current.identity.sessionId); }
  catch { throw new BackendError('unavailable'); }

  let signedOut: Readonly<{ confirmed: boolean; cookies: readonly AuthCookieWrite[] }>;
  try { signedOut = await dependencies.auth.signOutCurrent(); }
  catch { throw new BackendError('unavailable'); }
  if (!signedOut.confirmed) throw new BackendError('unavailable');
  return Object.freeze({ kind: 'signed-out' as const, userId: current.identity.userId,
    sessionId: current.identity.sessionId, cookies: signedOut.cookies });
}

