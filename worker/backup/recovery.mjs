import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';

function run(tool, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(tool, args, options);
    child.once('error', reject);
    child.once('close', code => {
      if (code === 0) resolve();
      else reject(new Error(tool + ' failed with exit code ' + code));
    });
  });
}

/** Capture app-owned database schemas while the caller holds the exported snapshot open. */
export async function captureApplicationDump({ databaseUrl, snapshotId, output, signal }) {
  if (!/^postgres(?:ql)?:\/\//.test(databaseUrl) || !/^[0-9a-f]+-[0-9a-f]+-\d+$/i.test(snapshotId)) {
    throw new Error('A read-only database connection and exported snapshot are required');
  }
  // libpq does not expand a connection URI supplied as the PGDATABASE environment default.
  // Keep the password out of argv while passing the connection explicitly to pg_dump.
  const connection = new URL(databaseUrl);
  const password = connection.searchParams.get('password') ?? decodeURIComponent(connection.password);
  connection.password = '';
  connection.searchParams.delete('password');
  for (const key of connection.searchParams.keys()) {
    if (!['host','port','sslmode','sslrootcert','sslcert','sslkey','connect_timeout','application_name'].includes(key)) {
      throw new Error('Unsupported PostgreSQL backup connection option');
    }
  }
  const destination = await open(output, 'wx', 0o600);
  try {
    await run('pg_dump', [
      '--format=custom', '--no-password', '--dbname=' + connection.href,
      '--snapshot=' + snapshotId, '--enable-row-security',
      '--schema=public', '--schema=mapsilip_private',
      '--exclude-table=mapsilip_private.session_admissions',
      '--exclude-table=mapsilip_private.storage_receipt_key',
      '--exclude-table=mapsilip_private.push_runtime',
      '--exclude-table=mapsilip_private.push_subscriptions',
      '--exclude-table=mapsilip_private.push_outbox',
      '--exclude-table=mapsilip_private.push_deliveries',
    ], {
      env: { PATH: process.env.PATH, PGPASSWORD: password, PGOPTIONS: '-c default_transaction_read_only=on' },
      stdio: ['ignore', destination.fd, 'ignore'],
      signal,
    });
    await destination.sync();
  } finally {
    await destination.close();
  }
  await run('pg_restore', ['--list', output], { stdio: 'ignore', signal });
  const sha256 = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(output, { signal })) {
    bytes += chunk.length;
    sha256.update(chunk);
  }
  return {
    bytes, sha256: sha256.digest('hex'),
    scope: 'application_schemas',
    recoveryComplete: false,
    outstanding: ['Auth identities', 'Storage original bytes and policies', 'provider configuration', 'isolated restore drill'],
  };
}
