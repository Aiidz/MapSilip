export type StaffRole = 'owner' | 'caretaker';
export type StaffAccount = Readonly<{
  userId: string;
  role: StaffRole;
  status: 'active' | 'deactivated';
  passwordChangeRequired: boolean;
  securityRevision: string;
}>;

export type VerifiedIdentity = Readonly<{
  userId: string;
  sessionId: string;
  verified: true;
}>;

export type SecurityAttempt = Readonly<{
  id: string;
  kind: 'staff_signin' | 'staff_password_change';
  userId: string;
  expectedRevision: string;
  startingSessionId: string | null;
  expiresAt: number;
  consumedAt: number | null;
  receipt?: Readonly<{ userId: string; sessionId: string; revision: string }>;
}>;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const positiveRevision = (value: unknown): bigint | null => {
  if (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value)) return null;
  try {
    const parsed = BigInt(value);
    return parsed <= BigInt('9223372036854775807') ? parsed : null;
  } catch {
    return null;
  }
};

const validIdentity = (identity: VerifiedIdentity | null): identity is VerifiedIdentity =>
  identity !== null && identity.verified === true && uuid.test(identity.userId) && uuid.test(identity.sessionId);

const validAttempt = (attempt: SecurityAttempt | null, kind: SecurityAttempt['kind'], now: number): attempt is SecurityAttempt =>
  attempt !== null && attempt.kind === kind && uuid.test(attempt.userId) &&
  typeof attempt.id === 'string' && attempt.id.length >= 16 && attempt.id.length <= 128 &&
  Number.isSafeInteger(attempt.expiresAt) && attempt.expiresAt > now && attempt.consumedAt === null &&
  positiveRevision(attempt.expectedRevision) !== null;

const validAccount = (account: StaffAccount | null): account is StaffAccount =>
  account !== null && uuid.test(account.userId) && ['owner', 'caretaker'].includes(account.role) &&
  ['active', 'deactivated'].includes(account.status) && typeof account.passwordChangeRequired === 'boolean' &&
  positiveRevision(account.securityRevision) !== null;

export type SignInDecision =
  | Readonly<{ kind: 'deny' }>
  | Readonly<{ kind: 'restricted' | 'admit'; userId: string; sessionId: string; revision: string }>;

/** Pure protocol check; the caller's DB command must atomically consume and apply this result under locks. */
export function decideSignIn(input: {
  attempt: SecurityAttempt | null;
  account: StaffAccount | null;
  verifiedIdentity: VerifiedIdentity | null;
  now: number;
}): SignInDecision {
  const { attempt, account, verifiedIdentity, now } = input;
  if (!Number.isSafeInteger(now) || !validAttempt(attempt, 'staff_signin', now) ||
      !validAccount(account) || !validIdentity(verifiedIdentity) ||
      account.status !== 'active' || account.userId !== attempt.userId ||
      verifiedIdentity.userId !== attempt.userId || attempt.expectedRevision !== account.securityRevision) {
    return { kind: 'deny' };
  }
  return {
    kind: account.passwordChangeRequired ? 'restricted' : 'admit',
    userId: account.userId,
    sessionId: verifiedIdentity.sessionId,
    revision: account.securityRevision,
  };
}

export type CompletionDecision =
  | Readonly<{ kind: 'deny' }>
  | Readonly<{ kind: 'complete'; userId: string; sessionId: string; previousRevision: string; newRevision: string }>;

/** Validate the server-created change attempt before performing any irreversible Auth call. */
export function canBeginFirstLoginChange(input: {
  attempt: SecurityAttempt | null;
  account: StaffAccount | null;
  identity: VerifiedIdentity | null;
  now: number;
}): boolean {
  const { attempt, account, identity, now } = input;
  return Number.isSafeInteger(now) && validAttempt(attempt, 'staff_password_change', now) &&
    validAccount(account) && validIdentity(identity) && account.status === 'active' &&
    account.passwordChangeRequired && attempt.userId === account.userId &&
    identity.userId === account.userId && attempt.expectedRevision === account.securityRevision &&
    attempt.startingSessionId === identity.sessionId;
}

/** Auth outcomes must be freshly verified by the server. This does not itself grant DB access. */
export function decideFirstLoginCompletion(input: {
  attempt: SecurityAttempt | null;
  account: StaffAccount | null;
  verifiedIdentity: VerifiedIdentity | null;
  now: number;
  passwordUpdate: 'confirmed' | 'uncertain';
  globalRevocation: 'confirmed' | 'uncertain';
  liveSessionIds: readonly string[];
}): CompletionDecision {
  const { attempt, account, verifiedIdentity, now, liveSessionIds } = input;
  if (!Number.isSafeInteger(now) || !validAttempt(attempt, 'staff_password_change', now) ||
      !validAccount(account) || !validIdentity(verifiedIdentity) || account.status !== 'active' ||
      !account.passwordChangeRequired || attempt.userId !== account.userId ||
      verifiedIdentity.userId !== account.userId || attempt.expectedRevision !== account.securityRevision ||
      !attempt.startingSessionId || !uuid.test(attempt.startingSessionId) ||
      attempt.startingSessionId === verifiedIdentity.sessionId ||
      input.passwordUpdate !== 'confirmed' || input.globalRevocation !== 'confirmed' ||
      !Array.isArray(liveSessionIds) || liveSessionIds.length !== 1 ||
      liveSessionIds[0] !== verifiedIdentity.sessionId || !liveSessionIds.every(id => uuid.test(id))) {
    return { kind: 'deny' };
  }
  const revision = positiveRevision(account.securityRevision);
  if (revision === null || revision === BigInt('9223372036854775807')) return { kind: 'deny' };
  return { kind: 'complete', userId: account.userId, sessionId: verifiedIdentity.sessionId,
    previousRevision: account.securityRevision, newRevision: (revision + BigInt('1')).toString() };
}

/** A lost response is recoverable only for the still-current fresh admission. */
export function reconcileCompletion(input: {
  attempt: SecurityAttempt | null;
  account: StaffAccount | null;
  verifiedIdentity: VerifiedIdentity | null;
  currentAdmission: Readonly<{ sessionId: string; revision: string }> | null;
}) {
  const { attempt, account, verifiedIdentity, currentAdmission } = input;
  const receipt = attempt?.receipt;
  if (!attempt || attempt.kind !== 'staff_password_change' || attempt.consumedAt === null || !receipt ||
      !validAccount(account) || account.status !== 'active' || account.passwordChangeRequired ||
      !validIdentity(verifiedIdentity) || !currentAdmission ||
      receipt.userId !== attempt.userId || receipt.userId !== account.userId ||
      receipt.userId !== verifiedIdentity.userId || receipt.sessionId !== verifiedIdentity.sessionId ||
      currentAdmission.sessionId !== receipt.sessionId || currentAdmission.revision !== receipt.revision ||
      account.securityRevision !== receipt.revision || positiveRevision(receipt.revision) === null) {
    return { kind: 'deny' as const };
  }
  return { kind: 'confirmed' as const, userId: receipt.userId, sessionId: receipt.sessionId, revision: receipt.revision };
}
