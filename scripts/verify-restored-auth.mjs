// Run after the provider restores Auth into an isolated project. No account writes or sign-in attempts.
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { readVerifiedRecoveryIndex } from '../worker/backup/local.mjs';

const [directory, publicKeyFile] = process.argv.slice(2);
async function verifyIdentities() {
  if (!directory || !publicKeyFile || !process.env.BACKUP_RESTORE_DATABASE_URL) {
    throw new Error('Supply the package directory, trusted public key and isolated BACKUP_RESTORE_DATABASE_URL.');
  }
  const publicKey = await readFile(publicKeyFile);
  const index = await readVerifiedRecoveryIndex(directory,publicKey);
  const accountsById = new Map();
  for (const account of index.accounts) {
    if (typeof account.id !== 'string' || accountsById.has(account.id)) throw new Error('Invalid account identity.');
    accountsById.set(account.id,account);
  }
  const client = new pg.Client({connectionString:process.env.BACKUP_RESTORE_DATABASE_URL,connectionTimeoutMillis:5000});
  try {
    await client.connect();
    await client.query('begin isolation level repeatable read read only');
    const { rows } = await client.query('select id,email,phone,email_confirmed_at,phone_confirmed_at,deleted_at from auth.users');
    let matched = 0;
    for (const row of rows) {
      const account = accountsById.get(row.id);
      if (account && row.email === account.email && row.phone === account.phone &&
          ['email_confirmed_at','phone_confirmed_at','deleted_at'].every(key =>
            (row[key]?.toISOString() ?? null) === account[key])) matched++;
    }
    if (matched !== accountsById.size || rows.length !== matched) throw new Error('Restored Auth identity inventory differs.');
    await client.query('commit');
    console.log(`Verified ${matched} restored account identities against the signed package. Test login and configured providers separately.`);
  } finally { await client.end(); }
}
try { await verifyIdentities(); }
catch (error) {
  console.error(error.message?.startsWith('Supply the package') ? error.message : 'Auth recovery verification failed. Check the target, read access and signed identity inventory.');
  process.exitCode = 1;
}
