import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { accessSync, constants, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import nextEnv from '@next/env';
import { runAnonymousReadProbes } from './lib/staff-hosted-verification.mjs';

const { loadEnvConfig } = nextEnv;
const requireProject = createRequire(import.meta.url);
const root = process.cwd();

function loadBackendModules() {
  const output = mkdtempSync(join(tmpdir(), 'mapsilip-hosted-verification-'));
  try {
    execFileSync(process.execPath, [requireProject.resolve('typescript/bin/tsc'),
      'app/lib/backend/auth/executor.ts', 'app/lib/backend/security.ts', 'app/lib/supabase/env.ts',
      '--rootDir', 'app/lib', '--outDir', output, '--module', 'commonjs', '--target', 'ES2020',
      '--strict', '--skipLibCheck', '--types', 'node', '--esModuleInterop'], { cwd: root, stdio: 'pipe' });
    return {
      output,
      executor: requireProject(join(output, 'backend/auth/executor.js')),
      supabaseEnvironment: requireProject(join(output, 'supabase/env.js')).getSupabaseEnvironment,
      Pool: requireProject('pg').Pool,
    };
  } catch {
    rmSync(output, { recursive: true, force: true });
    throw new Error('Hosted security verification refused: local backend modules failed to compile.');
  }
}

async function main() {
  loadEnvConfig(root);
  if (process.env.MAPSILIP_RUN_STAFF_SECURITY_TESTS !== '1') {
    throw new Error('Set MAPSILIP_RUN_STAFF_SECURITY_TESTS=1 to opt in to read-only hosted checks.');
  }
  if (process.env.MAPSILIP_STAFF_AUTH_ENABLED === 'true') {
    throw new Error('Hosted security verification refused while staff authentication is enabled.');
  }

  const modules = loadBackendModules();
  const { executor, supabaseEnvironment, Pool } = modules;
  let pool;
  let phase = 'local_preflight';
  try {
    const { url: projectUrl, publishableKey } = supabaseEnvironment();
    const connectionString = executor.getSecurityDatabaseUrl(process.env);
    const connectionUrl = executor.parseSecurityDatabaseUrl(connectionString);
    const rootCertificatePath = connectionUrl.searchParams.get('sslrootcert');
    assert.ok(rootCertificatePath);
    accessSync(rootCertificatePath, constants.R_OK);
    const certificate = new X509Certificate(readFileSync(rootCertificatePath));
    assert.ok(certificate.ca && Date.now() >= Date.parse(certificate.validFrom) && Date.now() <= Date.parse(certificate.validTo));

    phase = 'database_connectivity_and_executor_authorization';
    pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 5000, statement_timeout: 5000, query_timeout: 6000, lock_timeout: 3000 });
    const executorClient = executor.createSecurityExecutor(pool);
    const hasOnlySyntheticNonexistentSession = await executorClient.hasOnlyAuthSession(
      '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002',
    );
    assert.equal(hasOnlySyntheticNonexistentSession, false);

    phase = 'anonymous_http_authorization';
    const anonymousProbes = await runAnonymousReadProbes({ projectUrl, publishableKey });
    const firstLoginCredentialsPresent = Boolean(process.env.MAPSILIP_TEST_OWNER_PASSWORD?.trim() &&
      process.env.MAPSILIP_TEST_CARETAKER_PASSWORD?.trim());
    process.stdout.write(`${JSON.stringify({
      executor_connection: 'passed',
      executor_role_privileges: 'passed',
      read_only_session_probe: 'passed',
      anonymous_probes: anonymousProbes,
      authenticated_first_login_tests: 'not_run_by_read_only_harness',
      synthetic_passwords_configured: firstLoginCredentialsPresent,
      staff_auth_enabled: false,
    })}\n`);
  } catch {
    process.stderr.write(`Hosted security verification stopped during ${phase}; details suppressed.\n`);
    process.exitCode = 1;
  } finally {
    await pool?.end();
    rmSync(modules.output, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await main();
  } catch {
    process.stderr.write('Hosted security verification stopped; detailed connection or response data suppressed.\n');
    process.exitCode = 1;
  }
}
