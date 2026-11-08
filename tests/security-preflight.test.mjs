import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { REVIEWED_PREFLIGHT_FILES, runSecurityPreflight } from '../scripts/lib/security-preflight.mjs';

const projectRef = 'atuqxpiandeutimdkgag';
const hashes = {
  'supabase/review/staff-authorization.sql': 'a'.repeat(64),
  'supabase/review/staff-probes.sql': 'b'.repeat(64),
  'supabase/review/staff-storage-probes.sql': 'e'.repeat(64),
  'supabase/review/staff-security-verification.md': 'c'.repeat(64),
  'supabase/review/README.md': 'f'.repeat(64),
  'scripts/security-preflight.mjs': '1'.repeat(64),
  'scripts/lib/security-preflight.mjs': '2'.repeat(64),
};
const approvedManifest = {
  version: 1,
  projectRef,
  approval: { status: 'approved', approvedBy: 'developer', approvedAt: '2026-10-25T00:00:00Z' },
  approvedHashes: hashes,
  scope: { check: 'auth-health-get-only', writesAllowed: false },
};
const environment = {
  NEXT_PUBLIC_SUPABASE_URL: `https://${projectRef}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test-value',
};

test('draft manifest binds the exact reviewed files and contains no credential fields', async () => {
  const manifest = JSON.parse(await readFile(new URL('../supabase/review/staff-security-manifest.example.json', import.meta.url), 'utf8'));
  const root = new URL('../', import.meta.url);
  const currentHashes = Object.fromEntries(await Promise.all(REVIEWED_PREFLIGHT_FILES.map(async file => [
    file, createHash('sha256').update(await readFile(new URL(file, root))).digest('hex'),
  ])));
  assert.equal(manifest.approval.status, 'draft');
  assert.equal(manifest.projectRef, projectRef);
  assert.deepEqual(manifest.approvedHashes, currentHashes);
  assert.deepEqual(Object.keys(manifest).sort(), ['approval', 'approvedHashes', 'projectRef', 'scope', 'version']);
  assert.deepEqual(Object.keys(manifest.scope).sort(), ['check', 'writesAllowed']);
});

test('preflight refuses without explicit opt-in and makes no request', async () => {
  let fetchCalls = 0;
  await assert.rejects(runSecurityPreflight({
    optIn: undefined, manifest: approvedManifest, hashes, environment,
    fetchImpl: async () => { fetchCalls++; return { status: 200 }; },
  }), /MAPSILIP_RUN_SECURITY_PREFLIGHT=1/);
  assert.equal(fetchCalls, 0);
});

test('preflight refuses a draft or mismatched manifest before network access', async () => {
  let fetchCalls = 0;
  await assert.rejects(runSecurityPreflight({
    optIn: '1', manifest: { ...approvedManifest, approval: { ...approvedManifest.approval, status: 'draft' } },
    hashes, environment, fetchImpl: async () => { fetchCalls++; return { status: 200 }; },
  }), /approved manifest/);
  await assert.rejects(runSecurityPreflight({
    optIn: '1', manifest: { ...approvedManifest, projectRef: 'wrong-project-ref' },
    hashes, environment, fetchImpl: async () => { fetchCalls++; return { status: 200 }; },
  }), /project identity/);
  assert.equal(fetchCalls, 0);
});

test('preflight rejects changed review files and any write-enabled manifest', async () => {
  let fetchCalls = 0;
  await assert.rejects(runSecurityPreflight({
    optIn: '1', manifest: approvedManifest, hashes: { ...hashes, 'supabase/review/staff-probes.sql': 'd'.repeat(64) },
    environment, fetchImpl: async () => { fetchCalls++; return { status: 200 }; },
  }), /review file hashes/);
  await assert.rejects(runSecurityPreflight({
    optIn: '1', manifest: { ...approvedManifest, scope: { check: 'auth-health-get-only', writesAllowed: true } },
    hashes, environment, fetchImpl: async () => { fetchCalls++; return { status: 200 }; },
  }), /read-only Auth health check only/);
  await assert.rejects(runSecurityPreflight({
    optIn: '1', manifest: { ...approvedManifest, scope: { ...approvedManifest.scope, extraWriteMode: true } },
    hashes, environment, fetchImpl: async () => { fetchCalls++; return { status: 200 }; },
  }), /read-only Auth health check only/);
  assert.equal(fetchCalls, 0);
});

test('preflight rejects unexpected credential-bearing manifest fields before network access', async () => {
  let fetchCalls = 0;
  await assert.rejects(runSecurityPreflight({
    optIn: '1', manifest: { ...approvedManifest, serviceRoleKey: 'must-not-be-accepted' },
    hashes, environment, fetchImpl: async () => { fetchCalls++; return { status: 200 }; },
  }), /manifest project identity/);
  await assert.rejects(runSecurityPreflight({
    optIn: '1', manifest: { ...approvedManifest, approval: { ...approvedManifest.approval, token: 'must-not-be-accepted' } },
    hashes, environment, fetchImpl: async () => { fetchCalls++; return { status: 200 }; },
  }), /approved manifest/);
  assert.equal(fetchCalls, 0);
});

test('preflight requires a canonical ISO approval timestamp before network access', async () => {
  let fetchCalls = 0;
  await assert.rejects(runSecurityPreflight({
    optIn: '1', manifest: { ...approvedManifest,
      approval: { ...approvedManifest.approval, approvedAt: 'October 25, 2026' } },
    hashes, environment, fetchImpl: async () => { fetchCalls++; return { status: 200 }; },
  }), /approved manifest/);
  assert.equal(fetchCalls, 0);
});

test('preflight requests only Auth health with the publishable key and no redirects', async () => {
  const requests = [];
  const result = await runSecurityPreflight({
    optIn: '1', manifest: approvedManifest, hashes, environment,
    fetchImpl: async (url, init) => {
      requests.push({ url: String(url), init });
      return { status: 200 };
    },
  });
  assert.deepEqual(result, { status: 200, authReachable: true });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, `https://${projectRef}.supabase.co/auth/v1/health`);
  assert.equal(requests[0].init.method, 'GET');
  assert.equal(requests[0].init.redirect, 'manual');
  assert.equal(requests[0].init.headers.apikey, environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  assert.equal(requests[0].init.body, undefined);
});

test('preflight refuses non-publishable credentials and redirected health endpoints', async () => {
  await assert.rejects(runSecurityPreflight({
    optIn: '1', manifest: approvedManifest, hashes,
    environment: { ...environment, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'service_role_secret' },
    fetchImpl: async () => { throw new Error('must not run'); },
  }), /publishable key/);
  const redirect = await runSecurityPreflight({
    optIn: '1', manifest: approvedManifest, hashes, environment,
    fetchImpl: async () => ({ status: 307 }),
  });
  assert.deepEqual(redirect, { status: 307, authReachable: false });
});

test('preflight refuses a different project URL without making a request', async () => {
  let fetchCalls = 0;
  await assert.rejects(runSecurityPreflight({
    optIn: '1', manifest: approvedManifest, hashes,
    environment: { ...environment, NEXT_PUBLIC_SUPABASE_URL: 'https://other-project.supabase.co' },
    fetchImpl: async () => { fetchCalls++; return { status: 200 }; },
  }), /project identity/);
  assert.equal(fetchCalls, 0);
});

test('preflight suppresses transport error details', async () => {
  await assert.rejects(runSecurityPreflight({
    optIn: '1', manifest: approvedManifest, hashes, environment,
    fetchImpl: async () => { throw new Error('credential-bearing transport detail'); },
  }), error => {
    assert.match(error.message, /network details and response bodies are suppressed/);
    assert.doesNotMatch(error.message, /credential-bearing/);
    return true;
  });
});
