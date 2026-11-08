import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const output = mkdtempSync(join(tmpdir(), 'mapsilip-staff-access-'));
after(() => rmSync(output, { recursive: true, force: true }));
execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'),
  'app/lib/backend/staff-access.ts', 'app/lib/backend/staff-response.ts',
  '--rootDir', 'app/lib', '--outDir', output, '--module', 'commonjs',
  '--target', 'ES2020', '--strict', '--skipLibCheck', '--types', 'node'], { stdio: 'pipe' });
const { runStaffOperation, requirePortalRole } = require(join(output, 'backend/staff-access.js'));
const { staffAccessResponse } = require(join(output, 'backend/staff-response.js'));
const { BackendError, publicBackendError } = require(join(output, 'backend/security.js'));
const id = '00000000-0000-4000-8000-000000000001';
const sessionId = '00000000-0000-4000-8000-000000000002';
const current = () => ({ user_id: id, role: 'owner', status: 'active',
  session_id: sessionId, password_change_required: false, security_revision: '7', session_revision: '7',
  auth_session_active: true });

// These are trusted-provider boundary fixtures, not hosted completion/RLS proof.
function fixture(snapshot = current()) {
  let calls = 0;
  const authority = {
    verifyIdentity: async () => ({ userId: id, sessionId, verified: true }),
    readSnapshot: async () => snapshot,
  };
  return { authority, calls: () => calls,
    invoke: (action = 'staff.access.inspect') => runStaffOperation(authority, action, async actor => {
      calls++;
      return { result: 'protected-operation-ran', actor };
    }),
  };
}
const denied = status => error => publicBackendError(error).status === status;

test('unauthenticated direct server calls stop before reading staff authority or executing', async () => {
  const state = fixture();
  state.authority.verifyIdentity = async () => { throw new BackendError('unauthenticated'); };
  state.authority.readSnapshot = async () => assert.fail('Unauthenticated authority read');
  await assert.rejects(state.invoke(), denied(401));
  assert.equal(state.calls(), 0);
});
test('missing staff account denies a verified identity', async () => {
  const state = fixture(null);
  await assert.rejects(state.invoke(), denied(403));
  assert.equal(state.calls(), 0);
});
test('first-login restriction cannot be cleared by editable metadata or an asserted completion flag', async () => {
  const state = fixture({ ...current(), password_change_required: true,
    firstLoginComplete: true, user_metadata: { role: 'owner', password_change_required: false } });
  await assert.rejects(state.invoke('finance.read'), denied(403));
  assert.equal(state.calls(), 0);
});
test('deactivated, unknown-role and mismatched-subject snapshots deny', async () => {
  for (const change of [{ status: 'deactivated' }, { role: 'administrator' }, { user_id: 'another-user' }]) {
    const state = fixture({ ...current(), ...change });
    await assert.rejects(state.invoke(), denied(403));
    assert.equal(state.calls(), 0);
  }
});
test('revoked Auth sessions, absent grants and stale security revisions deny', async () => {
  for (const change of [{ auth_session_active: false }, { session_revision: null }, { security_revision: '8' }]) {
    const state = fixture({ ...current(), ...change });
    await assert.rejects(state.invoke(), denied(403));
    assert.equal(state.calls(), 0);
  }
});
test('clearing a first-login flag alone cannot revive an older granted session', async () => {
  const state = fixture({ ...current(), security_revision: '8', password_change_required: false });
  await assert.rejects(state.invoke(), denied(403));
  assert.equal(state.calls(), 0);
});
test('malformed authority fails closed instead of coercing strings or boolean flags', async () => {
  for (const change of [{ password_change_required: 'false' }, { security_revision: 7 },
    { auth_session_active: 'true' }, { security_revision: '-1' }, { session_revision: 1 }]) {
    const state = fixture({ ...current(), ...change });
    await assert.rejects(state.invoke(), denied(503));
    assert.equal(state.calls(), 0);
  }
});

test('authority snapshot must match the exact signed session and safe revision string', async () => {
  const mismatch = fixture({ ...current(), session_id: '00000000-0000-4000-8000-000000000099' });
  await assert.rejects(mismatch.invoke(), denied(403));
  const malformed = fixture({ ...current(), session_revision: '08' });
  await assert.rejects(malformed.invoke(), denied(503));
});
test('eligible owner executes only after current authority checks', async () => {
  const state = fixture();
  assert.deepEqual(await state.invoke('invoice.correct'), {
    result: 'protected-operation-ran', actor: { userId: id, sessionId, securityRevision: '7', role: 'owner' },
  });
  assert.equal(state.calls(), 1);
});

test('portal role enforcement keeps owner and caretaker routes separate', () => {
  const owner = { userId: id, sessionId, securityRevision: '7', role: 'owner' };
  const caretaker = { ...owner, role: 'caretaker' };
  assert.equal(requirePortalRole(owner, 'owner'), owner);
  assert.equal(requirePortalRole(caretaker, 'caretaker'), caretaker);
  assert.throws(() => requirePortalRole(owner, 'caretaker'), denied(403));
  assert.throws(() => requirePortalRole(caretaker, 'owner'), denied(403));
});
test('caretaker may inspect own eligibility but cannot use owner actions', async () => {
  const state = fixture({ ...current(), role: 'caretaker' });
  assert.equal((await state.invoke()).actor.role, 'caretaker');
  for (const action of ['tenant.application.approve', 'tenant.application.reject', 'room.assign',
    'room.move', 'finance.read', 'invoice.correct', 'payment.reverse']) {
    await assert.rejects(state.invoke(action), denied(403));
  }
  assert.equal(state.calls(), 1);
});
test('unapproved caretaker modules and unknown actions remain denied even for an owner', async () => {
  for (const role of ['owner', 'caretaker']) {
    const state = fixture({ ...current(), role });
    for (const action of ['maintenance.respond', 'visitors.read', 'reports.export', 'anything']) {
      await assert.rejects(state.invoke(action), denied(403));
    }
    assert.equal(state.calls(), 0);
  }
});
test('each operation reloads authority; deactivation and reissue snapshots cannot reuse prior access', async () => {
  const snapshot = current();
  const state = fixture(snapshot);
  await state.invoke();
  snapshot.status = 'deactivated'; snapshot.security_revision = '8';
  await assert.rejects(state.invoke(), denied(403));
  snapshot.status = 'active'; snapshot.password_change_required = false;
  await assert.rejects(state.invoke(), denied(403));
  assert.equal(state.calls(), 1);
});
test('authority failures do not run/retry operations; a later explicit invocation rechecks', async () => {
  const state = fixture();
  state.authority.readSnapshot = async () => { throw new Error('private-provider-detail'); };
  await assert.rejects(state.invoke(), error => denied(503)(error) && !error.message.includes('private-provider-detail'));
  assert.equal(state.calls(), 0);
  state.authority.readSnapshot = async () => current();
  await state.invoke();
  assert.equal(state.calls(), 1);
});
test('protected operation failure is sanitized without replay or synthetic success', async () => {
  const state = fixture(); let attempts = 0;
  await assert.rejects(runStaffOperation(state.authority, 'staff.access.inspect', async () => {
    attempts++; throw new Error('private-database-detail');
  }), error => denied(503)(error) && !error.message.includes('private-database-detail'));
  assert.equal(attempts, 1);
});
test('HTTP response boundary returns sanitized 401/403/503 without identity leakage or caching', async () => {
  for (const code of ['unauthenticated', 'forbidden', 'unavailable']) {
    const response = await staffAccessResponse(async () => { throw new BackendError(code); });
    assert.equal(response.status, publicBackendError(new BackendError(code)).status);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal((await response.text()).includes(id), false);
  }
});
test('HTTP probe exposes only a minimal success result after authorization', async () => {
  const response = await staffAccessResponse(async () => ({ userId: id, role: 'owner' }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { access: 'granted' });
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});

test('RLS read predicate stays compatible with GET, HEAD and stable RPC transactions', () => {
  const sql = readFileSync('supabase/review/staff-authorization.sql', 'utf8');
  const readPredicate = sql.match(/create function mapsilip_private\.can_read[\s\S]*?\$\$;/i)?.[0];
  assert.ok(readPredicate, 'read-compatible permission predicate must exist');
  assert.match(readPredicate, /stable\s+security definer/i);
  assert.match(readPredicate, /set search_path\s*=\s*''/i);
  assert.doesNotMatch(readPredicate, /for\s+(?:no\s+key\s+)?update|for\s+(?:key\s+)?share|pg_advisory|insert\s+into|update\s+mapsilip_|delete\s+from/i);
  assert.match(readPredicate, /session_admissions/i);
  assert.match(readPredicate, /security_revision/i);
  assert.match(readPredicate, /requested_action/i);
});

test('transactional security commands, not read predicates, lock account and attempt rows', () => {
  const sql = readFileSync('supabase/review/staff-authorization.sql', 'utf8');
  const completion = sql.match(/create function mapsilip_private\.complete_first_login[\s\S]*?\$\$;/i)?.[0];
  assert.ok(completion, 'trusted completion command must exist');
  assert.match(completion, /for update/i);
  assert.match(completion, /expected_revision/i);
  assert.match(completion, /expires_at/i);
  assert.match(completion, /session_admissions/i);
  assert.match(sql, /revoke all on all functions in schema mapsilip_private from public, anon, authenticated, service_role, mapsilip_security_executor/i);
  assert.match(sql, /grant execute on function [\s\S]*?mapsilip_private\.complete_first_login\(uuid, uuid, uuid, boolean, boolean\)[\s\S]*?to mapsilip_security_executor/i);
});

test('separate review fixtures exercise RLS and owner-only Storage gates', () => {
  const rlsSql = readFileSync('supabase/review/staff-probes.sql', 'utf8');
  const storageSql = readFileSync('supabase/review/staff-storage-probes.sql', 'utf8');
  assert.match(rlsSql, /mapsilip_private\.can_read\('staff\.access\.inspect'\)/i);
  assert.match(rlsSql, /mapsilip_private\.can_read\('finance\.read'\)/i);
  assert.match(rlsSql, /raise exception 'MapSilip security probe name collision/i);
  assert.match(rlsSql, /public\s*,\s*anon\s*,\s*authenticated\s*,\s*service_role/i);
  assert.doesNotMatch(rlsSql, /storage\.(?:buckets|objects)/i);
  assert.match(storageSql, /storage\.allow_only_operation\('object\.get_authenticated'\)/i);
  assert.match(storageSql, /storage\.allow_only_operation\('object\.upload'\)/i);
  assert.doesNotMatch(storageSql, /storage\.allow_any_operation|for\s+(?:update|delete)|public\s*=>\s*true/i);
  assert.match(storageSql, /raise exception 'MapSilip Storage probe name or policy collision/i);
});

test('executor function ACLs are revoked before the narrow reviewed command grant', () => {
  const sql = readFileSync('supabase/review/staff-authorization.sql', 'utf8');
  assert.match(sql, /create role mapsilip_security_executor login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls/i);
  assert.match(sql, /revoke all on all tables in schema mapsilip_private from public, anon, authenticated, service_role, mapsilip_security_executor/i);
  assert.match(sql, /revoke all on all functions in schema mapsilip_private from public, anon, authenticated, service_role, mapsilip_security_executor/i);
  assert.doesNotMatch(sql, /grant\s+(?:all|select|insert|update|delete)\s+on\s+all\s+tables\s+in\s+schema\s+mapsilip_private\s+to\s+mapsilip_security_executor/i);
});
