import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync('app/lib/backend/tenant.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function tenantRequest(active = true) {
  const queries = [];
  const exports = {};
  class BackendError extends Error { constructor(code) { super(code); this.code = code; } }
  const client = { from(table) {
    queries.push(table);
    const query = { select() { return query; }, eq() { return query; }, is() { return query; }, order() { return query; }, limit() { return query; },
      async maybeSingle() { return { data: table === 'tenant_profiles' ? { user_id: 'tenant', status: active ? 'active' : 'inactive' } : null, error: null }; } };
    return query;
  } };
  const modules = {
    'next/navigation': { redirect: path => { throw new Error(`redirect:${path}`); } },
    react: { cache: fn => { let promise; return () => promise ??= fn(); } },
    '../supabase/server': { createSupabaseServerClient: async () => client },
    './identity': { verifyAuthSession: async () => ({ identity: { userId: 'tenant' }, email: 'tenant@example.invalid' }) },
    './tenant-access': { authorizeTenantProfile: (identity, data) => { assert.equal(data.user_id, identity.userId); } },
    './security': { BackendError },
  };
  vm.runInNewContext(source, { exports, require: name => { assert.ok(modules[name]); return modules[name]; } });
  return { exports, queries };
}

test('tenant shell verifies access without querying room assignments or invoices', async () => {
  const { exports, queries } = tenantRequest();
  await exports.requireTenantAccess();
  assert.deepEqual(queries, ['tenant_profiles']);
  await exports.getTenantProfile();
  assert.deepEqual(queries, ['tenant_profiles', 'room_assignments', 'invoices']);
});

test('inactive tenant still redirects before room or invoice data is fetched', async () => {
  const { exports, queries } = tenantRequest(false);
  await assert.rejects(exports.requireTenantAccess(), /redirect:\/login/);
  assert.deepEqual(queries, ['tenant_profiles']);
});
