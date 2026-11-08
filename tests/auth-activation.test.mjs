import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const output = mkdtempSync(join(tmpdir(), 'mapsilip-auth-activation-'));
after(() => rmSync(output, { recursive: true, force: true }));
execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), 'app/lib/backend/auth/activation.ts',
  'app/lib/backend/security.ts', '--rootDir', 'app/lib', '--outDir', output, '--module', 'commonjs',
  '--target', 'ES2020', '--strict', '--skipLibCheck', '--types', 'node'], { stdio: 'pipe' });
const { assertStaffAuthEnabled, isStaffAuthEnabled } = require(join(output, 'backend/auth/activation.js'));

test('staff auth server staging is disabled unless the exact server value enables it', () => {
  for (const value of [undefined, '', 'false', 'TRUE', '1', 'yes']) {
    assert.throws(() => assertStaffAuthEnabled({ MAPSILIP_STAFF_AUTH_ENABLED: value }), error => error.code === 'unavailable');
    assert.equal(isStaffAuthEnabled({ MAPSILIP_STAFF_AUTH_ENABLED: value }), false);
  }
  assert.doesNotThrow(() => assertStaffAuthEnabled({ MAPSILIP_STAFF_AUTH_ENABLED: 'true' }));
  assert.equal(isStaffAuthEnabled({ MAPSILIP_STAFF_AUTH_ENABLED: 'true' }), true);
});
