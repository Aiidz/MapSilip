import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const authorizationSql = await readFile(new URL('../supabase/review/staff-authorization.sql', import.meta.url), 'utf8');
const probeSql = await readFile(new URL('../supabase/review/staff-probes.sql', import.meta.url), 'utf8');
const storageProbeSql = await readFile(new URL('../supabase/review/staff-storage-probes.sql', import.meta.url), 'utf8');

test('SQL review candidate keeps the private executor schema closed to future PUBLIC function grants', () => {
  assert.match(authorizationSql,
    /alter default privileges for role postgres in schema mapsilip_private\s+revoke execute on functions from public;/i);
});

test('read predicates stay STABLE and non-locking while commands own account-then-attempt locks', () => {
  const functionBody = name => authorizationSql.split(`create function mapsilip_private.${name}`)[1]?.split('create function ')[0] ?? '';
  for (const name of ['can_read', 'staff_access_snapshot']) {
    assert.match(functionBody(name), /language plpgsql stable security definer/i);
    assert.doesNotMatch(functionBody(name), /for\s+(?:no\s+key\s+)?update|for\s+(?:key\s+)?share/i);
  }
  assert.match(functionBody('finish_staff_signin'), /accounts a[\s\S]*?for update[\s\S]*?auth_attempts x[\s\S]*?for update/i);
  assert.match(functionBody('complete_first_login'), /accounts a[\s\S]*?for update[\s\S]*?auth_attempts x[\s\S]*?for update/i);
});

test('every SECURITY DEFINER candidate fixes an empty search_path and ownership is explicit', () => {
  const definitions = authorizationSql.match(/create function[\s\S]*?\$\$;/gi) ?? [];
  const definers = definitions.filter(definition => /security definer/i.test(definition));
  assert.ok(definers.length > 0);
  for (const definition of definers) assert.match(definition, /security definer set search_path = ''/i);
  assert.match(authorizationSql, /alter function mapsilip_private\.can_read\(text\) owner to postgres;/i);
  assert.match(authorizationSql, /alter function mapsilip_private\.complete_first_login\(uuid, uuid, uuid, boolean, boolean\) owner to postgres;/i);
});

test('Auth ban and deletion state are rechecked at admission and first-login completion', () => {
  const functionBody = name => authorizationSql.split(`create function mapsilip_private.${name}`)[1]?.split('create function ')[0] ?? '';
  for (const name of ['finish_staff_signin', 'begin_first_login_change', 'complete_first_login', 'reconcile_first_login']) {
    assert.match(functionBody(name), /auth\.users/i);
    assert.match(functionBody(name), /deleted_at is null/i);
    assert.match(functionBody(name), /banned_until is null/i);
  }
});

test('first-login completion rejects NULL confirmations and the receipt constraint is two-valued', () => {
  assert.match(authorizationSql, /password_update_confirmed is not true/i);
  assert.match(authorizationSql, /global_revocation_confirmed is not true/i);
  assert.match(authorizationSql,
    /check\s*\(\s*\(result is not distinct from 'completed'[\s\S]*?receipt_session_id is not null[\s\S]*?receipt_revision is not null[\s\S]*?\)\s*or\s*\(result is distinct from 'completed'[\s\S]*?receipt_session_id is null[\s\S]*?receipt_revision is null/i);
});

test('RLS marker fixtures are separate from Storage resources', () => {
  assert.match(probeSql, /create table public\.mapsilip_staff_security_probe/i);
  assert.match(probeSql, /create table public\.mapsilip_financial_security_probe/i);
  assert.match(probeSql, /insert into public\.mapsilip_staff_security_probe/i);
  assert.doesNotMatch(probeSql, /storage\.(?:buckets|objects)|mapsilip-security-probe/i);
  assert.match(probeSql, /^begin;[\s\S]*^commit;$/im);
});

test('Storage fixture is separately gated to owner-owned authenticated upload/download operations', () => {
  assert.match(storageProbeSql, /values\s*\('mapsilip-security-probe'[\s\S]*?false/i);
  assert.match(storageProbeSql, /storage\.allow_only_operation\('object\.upload'\)/i);
  assert.match(storageProbeSql, /storage\.allow_only_operation\('object\.get_authenticated'\)/i);
  assert.equal((storageProbeSql.match(/^create policy/gim) ?? []).length, 2);
  assert.match(storageProbeSql, /\(storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/i);
  assert.doesNotMatch(storageProbeSql, /create policy[\s\S]*?for\s+(?:update|delete)/i);
  assert.doesNotMatch(storageProbeSql, /create table public\./i);
});
