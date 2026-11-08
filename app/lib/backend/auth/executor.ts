import type { Pool, PoolClient } from 'pg';
import { isAbsolute } from 'node:path';
import { BackendError } from '../security';
import type { SecurityAttempt, StaffAccount } from './protocol';
import type { SecurityCommandResult } from './service';

const expectedRole = 'mapsilip_security_executor';
const expectedPoolerHost = 'aws-0-ap-northeast-1.pooler.supabase.com';
const expectedPoolerUsername = 'mapsilip_security_executor.atuqxpiandeutimdkgag';
const roleCheckSql = `select current_user as role_name, r.rolcanlogin as can_login, r.rolreplication as can_replicate,
  r.rolsuper as superuser,
  r.rolbypassrls as bypass_rls, r.rolcreatedb as can_create_db,
  r.rolcreaterole as can_create_role, r.rolinherit as inherits,
  exists (select 1 from pg_catalog.pg_auth_members m
    join pg_catalog.pg_roles mem on mem.oid = m.member
    where m.member = r.oid or (m.roleid = r.oid and mem.rolname <> 'postgres')) as has_untrusted_memberships
  from pg_catalog.pg_roles r where r.rolname = current_user`;

type PoolLike = Pick<Pool, 'connect'>;
type DatabaseValue = Record<string, unknown> | boolean | string | number | null;

export function parseSecurityDatabaseUrl(value: unknown): URL {
  try {
    if (typeof value !== 'string' || !value.trim() || value !== value.trim()) throw new Error();
    const url = new URL(value);
    const sslMode = url.searchParams.get('sslmode');
    const sslRootCert = url.searchParams.get('sslrootcert');
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.username !== expectedPoolerUsername || !url.password ||
        url.hostname !== expectedPoolerHost || url.port !== '6543' || sslMode !== 'verify-full' ||
        !sslRootCert || !isAbsolute(sslRootCert) || url.searchParams.size !== 2 || url.hash) throw new Error();
    return url;
  } catch {
    throw new BackendError('unavailable');
  }
}

export function getSecurityDatabaseUrl(environment: NodeJS.ProcessEnv = process.env) {
  const value = environment.MAPSILIP_SECURITY_DATABASE_URL;
  parseSecurityDatabaseUrl(value);
  return value!;
}

async function checkedClient(pool: PoolLike): Promise<PoolClient> {
  let client: PoolClient;
  try { client = await pool.connect(); }
  catch { throw new BackendError('unavailable'); }
  try {
    const { rows } = await client.query(roleCheckSql);
    const role = rows[0];
    if (!role || role.role_name !== expectedRole || role.can_login !== true || role.can_replicate !== false ||
        role.superuser !== false || role.bypass_rls !== false ||
        role.can_create_db !== false || role.can_create_role !== false || role.inherits !== false ||
        role.has_untrusted_memberships !== false) throw new BackendError('unavailable');
    return client;
  } catch {
    client.release();
    throw new BackendError('unavailable');
  }
}

async function execute<T>(pool: PoolLike, sql: string, values: unknown[], parse: (value: DatabaseValue) => T, expectedDatabaseErrors: readonly string[] = []): Promise<T> {
  let client: PoolClient | undefined;
  try {
    client = await checkedClient(pool);
    const { rows } = await client.query<{ result: DatabaseValue }>(sql, values);
    return parse(rows[0]?.result ?? null);
  } catch (error) {
    if (error instanceof BackendError) throw error;
    if (error && typeof error === 'object' && 'code' in error &&
        expectedDatabaseErrors.includes(String(error.code))) throw new BackendError('invalid_input');
    throw new BackendError('unavailable');
  } finally {
    client?.release();
  }
}

function objectValue(value: DatabaseValue) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value;
}

function mapAttempt(value: DatabaseValue, kind: SecurityAttempt['kind']): SecurityAttempt | null {
  const row = objectValue(value);
  if (!row) return null;
  const id = row.attempt_id;
  const userId = row.user_id;
  const expectedRevision = row.expected_revision;
  const expiresAt = Date.parse(String(row.expires_at));
  const startingSessionId = kind === 'staff_password_change' ? row.starting_session_id : null;
  if (typeof id !== 'string' || typeof userId !== 'string' || typeof expectedRevision !== 'string' ||
      !Number.isSafeInteger(expiresAt) || (startingSessionId !== null && typeof startingSessionId !== 'string')) {
    throw new BackendError('unavailable');
  }
  return Object.freeze({ id, kind, userId, expectedRevision, startingSessionId, expiresAt, consumedAt: null });
}

function mapAccount(value: DatabaseValue): StaffAccount {
  const row = objectValue(value);
  if (!row || typeof row.user_id !== 'string' || !['owner', 'caretaker'].includes(String(row.role)) ||
      !['active', 'deactivated'].includes(String(row.status)) || typeof row.password_change_required !== 'boolean' ||
      typeof row.expected_revision !== 'string') throw new BackendError('unavailable');
  return Object.freeze({ userId: row.user_id, role: row.role as StaffAccount['role'],
    status: row.status as StaffAccount['status'], passwordChangeRequired: row.password_change_required,
    securityRevision: row.expected_revision });
}

function mapCommand(value: DatabaseValue): SecurityCommandResult | null {
  const row = objectValue(value);
  if (!row) return null;
  if (!['restricted', 'admitted', 'completed'].includes(String(row.result)) ||
      typeof row.user_id !== 'string' || typeof row.session_id !== 'string' ||
      !['owner', 'caretaker'].includes(String(row.role)) || typeof row.security_revision !== 'string') {
    throw new BackendError('unavailable');
  }
  return Object.freeze({ result: row.result as SecurityCommandResult['result'], userId: row.user_id,
    sessionId: row.session_id, role: row.role as SecurityCommandResult['role'], securityRevision: row.security_revision });
}

export function createSecurityExecutor(pool: PoolLike) {
  const jsonCommand = (sql: string, values: unknown[]) => execute(pool, sql, values, mapCommand);
  return Object.freeze({
    accountRequestProvisioningReady: () =>
      execute(pool, `select jsonb_build_object('ready',
        to_regprocedure('mapsilip_private.submit_account_request(text,text,text,uuid)') is not null
        and to_regprocedure('mapsilip_private.review_account_request(uuid,text,text,uuid,date,text)') is not null
        and to_regprocedure('mapsilip_private.applicant_status(uuid)') is not null
      ) as result`, [], value => objectValue(value)?.ready === true),
    consumeRateLimit: (identifierHash: string, clientHash: string) =>
      execute(pool, 'select mapsilip_private.consume_signin_rate_limit($1, $2) as result', [identifierHash, clientHash], value => {
        if (typeof value !== 'boolean') throw new BackendError('unavailable');
        return value;
      }),
    beginStaffSignin: async (email: string) => {
      const value = await execute(pool, 'select mapsilip_private.begin_staff_signin($1) as result', [email], objectValue);
      if (!value) return null;
      return Object.freeze({ attempt: mapAttempt(value, 'staff_signin')!, account: mapAccount(value) });
    },
    finishStaffSignin: (attemptId: string, userId: string, sessionId: string) =>
      jsonCommand('select mapsilip_private.finish_staff_signin($1, $2, $3) as result', [attemptId, userId, sessionId]),
    beginFirstLoginChange: async (userId: string, sessionId: string) => {
      const value = await execute(pool, 'select mapsilip_private.begin_first_login_change($1, $2) as result', [userId, sessionId], objectValue);
      if (!value) return null;
      return Object.freeze({ attempt: mapAttempt(value, 'staff_password_change')!, account: mapAccount(value) });
    },
    hasOnlyAuthSession: (userId: string, sessionId: string) =>
      execute(pool, 'select mapsilip_private.has_only_auth_session($1, $2) as result', [userId, sessionId], value => {
        if (typeof value !== 'boolean') throw new BackendError('unavailable');
        return value;
      }),
    revokeSessionAdmission: (userId: string, sessionId: string) =>
      execute(pool, 'select mapsilip_private.revoke_session_admission($1, $2) as result', [userId, sessionId], value => {
        if (typeof value !== 'boolean') throw new BackendError('unavailable');
        return value;
      }),
    completeFirstLogin: (attemptId: string, userId: string, sessionId: string,
      passwordUpdateConfirmed: boolean, globalRevocationConfirmed: boolean) =>
      jsonCommand('select mapsilip_private.complete_first_login($1, $2, $3, $4, $5) as result',
        [attemptId, userId, sessionId, passwordUpdateConfirmed, globalRevocationConfirmed]),
    reconcileFirstLogin: (attemptId: string, userId: string, sessionId: string) =>
      jsonCommand('select mapsilip_private.reconcile_first_login($1, $2, $3) as result', [attemptId, userId, sessionId]),
    submitAccountRequest: (email: string, name: string, phone: string | null, userId?: string | null) =>
      execute(pool, 'select mapsilip_private.submit_account_request($1, $2, $3, $4) as result',
        [email, name, phone, userId || null], value => {
          const row = objectValue(value);
          const id = row?.id;
          if (row?.state !== 'received' || typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) {
            throw new BackendError('unavailable');
          }
          return { state: 'received' as const, id };
        }, ['42501', '23505', '22023']),
    invitationDetails: (id: string, hash: string) =>
      execute(pool, 'select mapsilip_private.invitation_details($1, $2) as result', [id, hash], value => {
        const row = objectValue(value);
        return row && typeof row.email === 'string' && typeof row.display_name === 'string'
          ? { email: row.email, displayName: row.display_name } : null;
      }),
    applicantStatus: (userId: string) =>
      execute(pool, 'select mapsilip_private.applicant_status($1) as result', [userId], value => {
        const row = objectValue(value);
        if (!row || typeof row.status !== 'string') return null;
        return {
          status: row.status as 'pending' | 'approved' | 'rejected' | 'activated',
          rejectionReason: typeof row.rejection_reason === 'string' ? row.rejection_reason : null,
          displayName: typeof row.display_name === 'string' ? row.display_name : null,
        };
      }),

  });
}

let poolPromise: Promise<Pool> | undefined;
export async function getSecurityExecutor() {
  if (!poolPromise) {
    const connectionString = getSecurityDatabaseUrl();
    parseSecurityDatabaseUrl(connectionString);
    poolPromise = (async () => {
      const { Pool: PgPool } = await import('pg');
      const created = new PgPool({ connectionString, max: 1, connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 5000, statement_timeout: 5000, query_timeout: 6000, lock_timeout: 3000,
        application_name: 'mapsilip-staff-auth' });
      created.on('error', () => { /* Never log driver errors or connection details. */ });
      return created;
    })().catch(() => {
      poolPromise = undefined;
      throw new BackendError('unavailable');
    });
  }
  return createSecurityExecutor(await poolPromise);
}
