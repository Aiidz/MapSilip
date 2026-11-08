import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const output = mkdtempSync(join(tmpdir(), 'mapsilip-proxy-'));
after(() => rmSync(output, { recursive: true, force: true }));
execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), 'app/lib/supabase/proxy.ts',
  '--rootDir', 'app/lib', '--outDir', output, '--module', 'commonjs', '--target', 'ES2020',
  '--strict', '--skipLibCheck', '--types', 'node'], { stdio: 'pipe' });
const { refreshSupabaseSession, requiresPrivateNoStore } = require(join(output, 'supabase/proxy.js'));

function requestFixture() {
  const values = new Map([['sb-project-auth-token.0', 'old-session']]);
  const request = { cookies: { getAll: () => [...values].map(([name, value]) => ({ name, value })),
    set: (name, value) => values.set(name, value) } };
  const response = { cookies: { written: [], set(name, value, options) { this.written.push({ name, value, options }); } },
    headers: new Map(), setHeader(name, value) { this.headers.set(name, value); } };
  return { request, response, values };
}

test('proxy refreshes with signed claims and mirrors every cookie chunk to request and response', async () => {
  const { request, response, values } = requestFixture();
  const options = { path: '/', httpOnly: true, sameSite: 'lax' };
  const result = await refreshSupabaseSession(request, response, ({ cookies }) => ({
    auth: { getClaims: async () => cookies.setAll([
      { name: 'sb-project-auth-token.0', value: 'new-a', options },
      { name: 'sb-project-auth-token.1', value: 'new-b', options },
    ]) },
  }));
  assert.equal(result, response);
  assert.equal(values.get('sb-project-auth-token.0'), 'new-a');
  assert.equal(values.get('sb-project-auth-token.1'), 'new-b');
  assert.equal(response.cookies.written.length, 2);
  assert.deepEqual(response.cookies.written[0].options, options);
});

test('proxy catches refresh errors without replacing response or writing unauthorized role headers', async () => {
  const { request, response } = requestFixture();
  const result = await refreshSupabaseSession(request, response, () => ({
    auth: { getClaims: async () => { throw new Error('synthetic provider outage'); } },
  }));
  assert.equal(result, response);
  assert.equal(response.cookies.written.length, 0);
  assert.equal(response.headers.has('x-mapsilip-role'), false);
});

test('cookie-bearing requests and refresh responses require private no-store caching', () => {
  assert.equal(requiresPrivateNoStore(['sb-project-auth-token.0'], 0), true);
  assert.equal(requiresPrivateNoStore([], 1), true);
  assert.equal(requiresPrivateNoStore(['theme'], 0), false);
});
