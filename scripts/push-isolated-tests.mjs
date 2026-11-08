/** Real local PostgreSQL authority tests; never loads .env or contacts hosted Supabase. */
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import pg from 'pg';

const modulePath = process.env.MAPSILIP_EMBEDDED_POSTGRES_MODULE;
if (!modulePath) throw Error('Set MAPSILIP_EMBEDDED_POSTGRES_MODULE to a local embedded-postgres installation; see PWA_PUSH_READINESS.md.');
const { default: EmbeddedPostgres } = await import(pathToFileURL(resolve(modulePath)).href);
const directory = await mkdtemp(join(tmpdir(), 'mapsilip-push-db-'));
const password = randomBytes(24).toString('hex');
const server = new EmbeddedPostgres({ databaseDir: join(directory, 'data'), port: 55440, user: 'postgres', password,
  persistent: true, autoRehydrateSymlinks: true, postgresFlags: ['-h', '127.0.0.1'], onLog: () => {}, onError: () => {} });
let client;
try {
  await server.initialise(); await server.start();
  const url = `postgresql://postgres:${password}@127.0.0.1:55440/postgres`;
  client = new pg.Client({ connectionString: url }); await client.connect();
  for (const file of [
    'tests/fixtures/push-isolated-auth.sql',
    'supabase/migrations/20261025081017_staff_authorization.sql',
    'supabase/migrations/20261026123837_tenant_profiles.sql',
    'supabase/migrations/20261026150000_operational_core.sql',
    'supabase/migrations/20261026150010_operational_access.sql',
    'supabase/migrations/20261026150050_tenant_role_exclusivity.sql',
    'supabase/migrations/20261105021728_mobile_push.sql',
  ]) await client.query(await readFile(file, 'utf8'));
  const gates = await client.query('select enabled from mapsilip_private.push_runtime');
  if (gates.rows.some(row => row.enabled)) throw Error('Real database push gate must stay disabled.');
  await client.query(await readFile('tests/fixtures/push-test-availability.sql', 'utf8'));
  await client.end(); client = null;
  const child = spawn(process.execPath, ['--test', '--test-concurrency=1', 'tests/push-database.test.mjs', 'tests/push-remediation-database.test.mjs'], {
    env: { ...process.env, MAPSILIP_PUSH_TEST_DATABASE_URL: url }, stdio: 'inherit',
  });
  const exitCode = await new Promise((done, reject) => { child.on('error', reject); child.on('exit', done); });
  if (exitCode !== 0) process.exitCode = 1;
  client = new pg.Client({ connectionString: url }); await client.connect();
  if ((await client.query('select enabled from mapsilip_private.push_runtime')).rows.some(row => row.enabled)) throw Error('Tests changed the actual runtime gate.');
  await client.query(await readFile('supabase/migrations/20261106081010_push_device_controls.sql', 'utf8'));
  const deviceChild = spawn(process.execPath, ['--test', 'tests/push-device-database.test.mjs'], {
    env: { ...process.env, MAPSILIP_PUSH_TEST_DATABASE_URL: url }, stdio: 'inherit',
  });
  const deviceExit = await new Promise((done, reject) => { deviceChild.on('error', reject); deviceChild.on('exit', done); });
  if (deviceExit !== 0) process.exitCode = 1;
  if ((await client.query('select enabled from mapsilip_private.push_runtime')).rows.some(row => row.enabled)) throw Error('Device tests changed the actual runtime gate.');

} finally {
  await client?.end(); await server.stop();
  await rm(directory, { recursive: true, force: true });
}
