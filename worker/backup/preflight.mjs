import { localKeyId, validLocalWrappingKey } from './local-key.mjs';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

const required = [
  'BACKUP_WORKER_REGISTRY_URL', 'BACKUP_SOURCE_DATABASE_URL', 'BACKUP_ENCRYPTED_STAGING_ROOT',
  'BACKUP_STAGING_OWNER_ID', 'BACKUP_TENANT_ALIAS_FILE', 'BACKUP_SIGNING_KEY_FILE',
  'BACKUP_VERIFICATION_KEY_FILE', 'BACKUP_SOURCE_COMMIT',
  'BACKUP_TOKEN_KEY_ID',
  'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_SECRET',
];
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function checkWorkerEnvironment(env) {
  const errors = required.filter(name => !env[name]?.trim()).map(name => 'Missing ' + name);
  if (!env.BACKUP_SOURCE_STORAGE_TOKEN) {
    for (const name of ['BACKUP_SOURCE_STORAGE_EMAIL','BACKUP_SOURCE_STORAGE_PASSWORD','BACKUP_SOURCE_STORAGE_SUBJECT']) {
      if (!env[name]?.trim()) errors.push('Missing ' + name);
    }
  }
  const check = (name, predicate) => {
    if (env[name] && !predicate(env[name])) errors.push('Invalid ' + name);
  };
  check('BACKUP_SOURCE_STORAGE_SUBJECT', value => uuid.test(value));
  check('BACKUP_STAGING_OWNER_ID', value => uuid.test(value));
  check('BACKUP_SOURCE_COMMIT', value => /^[a-f0-9]{40}$/i.test(value));
  check('BACKUP_DRIVE_ROOT_ID', value => /^[a-z0-9_-]{5,128}$/i.test(value));
  check('BACKUP_TOKEN_KEY_ID', value =>
    value === localKeyId || /^projects\/[a-z0-9-]+\/locations\/[a-z0-9-]+\/keyRings\/[\w-]+\/cryptoKeys\/[\w-]+$/.test(value));
  if (env.BACKUP_TOKEN_KEY_ID === localKeyId && !validLocalWrappingKey(env.BACKUP_LOCAL_WRAPPING_KEY)) {
    errors.push('Missing or invalid BACKUP_LOCAL_WRAPPING_KEY');
  }
  for (const name of ['BACKUP_ENCRYPTED_STAGING_ROOT', 'BACKUP_TENANT_ALIAS_FILE', 'BACKUP_SIGNING_KEY_FILE', 'BACKUP_VERIFICATION_KEY_FILE']) {
    check(name, isAbsolute);
  }
  for (const name of ['BACKUP_WORKER_REGISTRY_URL', 'BACKUP_SOURCE_DATABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']) {
    check(name, value => {
      try {
        const url = new URL(value);
        return name === 'NEXT_PUBLIC_SUPABASE_URL'
          ? url.protocol === 'https:' && url.href === url.origin + '/' && !url.username && !url.password
          : ['postgres:', 'postgresql:'].includes(url.protocol) && !!url.hostname;
      } catch { return false; }
    });
  }
  return errors;
}

export async function checkWorkerFiles(env) {
  const errors = [];
  const checked = {};
  for (const name of ['BACKUP_ENCRYPTED_STAGING_ROOT', 'BACKUP_TENANT_ALIAS_FILE', 'BACKUP_SIGNING_KEY_FILE', 'BACKUP_VERIFICATION_KEY_FILE']) {
    try {
      const stat = await lstat(env[name]);
      const isDirectory = name === 'BACKUP_ENCRYPTED_STAGING_ROOT';
      if (isDirectory ? !stat.isDirectory() || (stat.mode & 0o077) !== 0
        : !stat.isFile() || stat.size > 1024 * 1024 ||
          (name !== 'BACKUP_VERIFICATION_KEY_FILE' && (stat.mode & 0o077) !== 0)) {
        throw new Error('Invalid type or permissions');
      }
      if (!isDirectory) checked[name] = await readFile(env[name]);
    } catch {
      errors.push(name + ' must be a readable, appropriately restricted ' +
        (name === 'BACKUP_ENCRYPTED_STAGING_ROOT' ? 'directory' : 'regular file'));
    }
  }
  if (errors.length) return { errors };
  try {
    const privateKey = createPrivateKey(checked.BACKUP_SIGNING_KEY_FILE);
    const publicKey = createPublicKey(checked.BACKUP_VERIFICATION_KEY_FILE);
    if (privateKey.asymmetricKeyType !== 'ed25519' || publicKey.asymmetricKeyType !== 'ed25519' ||
        !createPublicKey(privateKey).export({ type: 'spki', format: 'der' })
          .equals(publicKey.export({ type: 'spki', format: 'der' }))) throw new Error('Key mismatch');
  } catch { errors.push('Backup signing and verification files must contain a matching Ed25519 key pair'); }
  let tenantArchiveIds;
  try {
    const aliases = JSON.parse(checked.BACKUP_TENANT_ALIAS_FILE);
    if (!aliases || typeof aliases !== 'object' || Array.isArray(aliases)) throw new Error('Invalid alias map');
    tenantArchiveIds = new Map(Object.entries(aliases));
    const unique = new Set();
    for (const [id, alias] of tenantArchiveIds) {
      if (!uuid.test(id) || typeof alias !== 'string' || !/^[a-z0-9_-]{1,80}$/i.test(alias) ||
          unique.has(alias.toLowerCase())) throw new Error('Invalid alias');
      unique.add(alias.toLowerCase());
    }
  } catch { errors.push('BACKUP_TENANT_ALIAS_FILE must map tenant UUIDs to unique portable archive aliases'); }
  return { errors, tenantArchiveIds, signingKey: checked.BACKUP_SIGNING_KEY_FILE,
    verificationKey: checked.BACKUP_VERIFICATION_KEY_FILE };
}
