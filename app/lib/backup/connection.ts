import { localKeyId, validLocalWrappingKey, withLocalWrappingKey } from '../../../worker/backup/local-key.mjs';
import 'server-only';
import { headers } from 'next/headers';
import { exchangeVercelIdentity } from '../../../worker/backup/workload-identity.mjs';
import { Pool } from 'pg';
import { getTrustedAppOrigin } from '../backend/auth/dependencies';
import { BackendError } from '../backend/security';
import { openDriveToken, refreshDriveAccess, revokeDriveGrant, sealDriveToken } from '../../../worker/backup/oauth.mjs';

let pool: Pool | undefined;

const connectionSettings = [
  'BACKUP_REGISTRY_DATABASE_URL', 'BACKUP_TOKEN_KEY_ID', 'GOOGLE_DRIVE_CLIENT_ID',
  'GOOGLE_DRIVE_CLIENT_SECRET', 'GOOGLE_DRIVE_REDIRECT_URI',
] as const;

export function missingDriveSettings() {
  const modeSettings = process.env.BACKUP_TOKEN_KEY_ID === localKeyId
    ? (['BACKUP_LOCAL_WRAPPING_KEY'] as const)
    : (['BACKUP_GCP_WIF_AUDIENCE', 'BACKUP_GCP_SERVICE_ACCOUNT'] as const);
  return [...connectionSettings, ...modeSettings].filter(name => !process.env[name]?.trim());
}

export function driveConfig() {
  const { BACKUP_REGISTRY_DATABASE_URL, BACKUP_TOKEN_KEY_ID, GOOGLE_DRIVE_CLIENT_ID,
    GOOGLE_DRIVE_CLIENT_SECRET, GOOGLE_DRIVE_REDIRECT_URI, BACKUP_GCP_WIF_AUDIENCE, BACKUP_GCP_SERVICE_ACCOUNT } = process.env;
  if (!BACKUP_REGISTRY_DATABASE_URL || !GOOGLE_DRIVE_CLIENT_ID || !GOOGLE_DRIVE_CLIENT_SECRET ||
      !GOOGLE_DRIVE_REDIRECT_URI || !BACKUP_TOKEN_KEY_ID || (BACKUP_TOKEN_KEY_ID === localKeyId
        ? !validLocalWrappingKey(process.env.BACKUP_LOCAL_WRAPPING_KEY)
        : !BACKUP_GCP_WIF_AUDIENCE || !BACKUP_GCP_SERVICE_ACCOUNT ||
      !/^projects\/[a-z0-9-]+\/locations\/[a-z0-9-]+\/keyRings\/[\w-]+\/cryptoKeys\/[\w-]+$/.test(BACKUP_TOKEN_KEY_ID))) return null;
  try {
    const redirect = new URL(GOOGLE_DRIVE_REDIRECT_URI);
    if (redirect.href !== getTrustedAppOrigin() + '/api/backups/drive/callback' || redirect.protocol !== 'https:') return null;
  } catch {
    return null;
  }
  return { databaseUrl: BACKUP_REGISTRY_DATABASE_URL, keyId: BACKUP_TOKEN_KEY_ID,
    clientId: GOOGLE_DRIVE_CLIENT_ID, clientSecret: GOOGLE_DRIVE_CLIENT_SECRET, redirectUri: GOOGLE_DRIVE_REDIRECT_URI };
}

export function registry() {
  const config = driveConfig();
  if (!config) throw new BackendError('unavailable');
  return pool ??= new Pool({ connectionString: config.databaseUrl, max: 2, connectionTimeoutMillis: 5000 });
}

type Binding = { userId: string; sessionId: string; redirectUri: string; clientId: string };
type Challenge = Binding & { verifier: string; expiresAt: number };

export const consentStore = {
  async put(digest: string, state: Challenge) {
    await registry().query(
      'insert into mapsilip_backup.oauth_challenges (digest, binding, expires_at) values ($1,$2,to_timestamp($3 / 1000.0))',
      [digest, state, state.expiresAt],
    );
  },
  async consume(digest: string, binding: Binding, now: number): Promise<Challenge | null> {
    const result = await registry().query<{ binding: Challenge }>(
      'delete from mapsilip_backup.oauth_challenges where digest=$1 and binding @> $2::jsonb and expires_at > to_timestamp($3 / 1000.0) returning binding',
      [digest, binding, now],
    );
    return result.rows[0]?.binding ?? null;
  },
};

async function keyCall(keyId: string, operation: 'encrypt' | 'decrypt', data: Record<string, string>) {
  if (keyId !== driveConfig()?.keyId) throw new Error('Unknown backup encryption key');
  const audience = process.env.BACKUP_GCP_WIF_AUDIENCE;
  const serviceAccount = process.env.BACKUP_GCP_SERVICE_ACCOUNT;
  if (!audience || !serviceAccount) throw new Error('Backup KMS federation is not configured');
  const assertion = process.env.VERCEL
    ? (await headers()).get('x-vercel-oidc-token')
    : process.env.VERCEL_OIDC_TOKEN;
  const access_token = await exchangeVercelIdentity({ assertion, audience, serviceAccount });
  const response = await fetch('https://cloudkms.googleapis.com/v1/' + keyId + ':' + operation, {
    method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5000),
    headers: { Authorization: 'Bearer ' + access_token, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Backup key operation failed');
  return response.json();
}

const kms = withLocalWrappingKey({
  async wrap(key: Buffer, keyId: string, aad: Buffer): Promise<string> {
    const { ciphertext } = await keyCall(keyId, 'encrypt', {
      plaintext: key.toString('base64'), additionalAuthenticatedData: aad.toString('base64'),
    });
    if (typeof ciphertext !== 'string') throw new Error('KMS ciphertext unavailable');
    return ciphertext;
  },
  async unwrap(ciphertext: string, keyId: string, aad: Buffer): Promise<Buffer> {
    const { plaintext } = await keyCall(keyId, 'decrypt', {
      ciphertext, additionalAuthenticatedData: aad.toString('base64'),
    });
    if (typeof plaintext !== 'string') throw new Error('KMS plaintext unavailable');
    return Buffer.from(plaintext, 'base64');
  },
});

export async function saveDriveConnection(ownerId: string, accountId: string, refreshToken: string) {
  const config = driveConfig();
  if (!config) throw new BackendError('unavailable');
  const envelope = await sealDriveToken(refreshToken, ownerId, config.keyId, kms);
  const result = await registry().query(
    `insert into mapsilip_backup.drive_connections (owner_id, account_id, envelope) values ($1,$2,$3)
     on conflict (owner_id) do update set envelope=excluded.envelope, updated_at=now()
     where drive_connections.account_id=excluded.account_id and drive_connections.state='connected'`,
    [ownerId, accountId, envelope],
  );
  if (!result.rowCount) throw new BackendError('forbidden');
}

export async function disconnectDrive(ownerId: string) {
  const { rows } = await registry().query(
    `update mapsilip_backup.drive_connections set state='revocation_pending'
     where owner_id=$1 returning envelope`, [ownerId],
  );
  if (!rows[0]) return;
  await revokeDriveGrant(await openDriveToken(rows[0].envelope, ownerId, kms));
  await registry().query(
    "delete from mapsilip_backup.drive_connections where owner_id=$1 and state='revocation_pending'", [ownerId],
  );
}

export async function driveConnectionStatus(ownerId: string) {
  const { rows } = await registry().query<{ account_id: string; state: string; staging_root_id: string | null; worker_seen_at: Date | null; worker_online: boolean }>(
    `select account_id,state,staging_root_id,worker_seen_at,
      coalesce(worker_seen_at > now() - interval '5 minutes', false) as worker_online
      from mapsilip_backup.drive_connections where owner_id=$1`, [ownerId],
  );
  return rows[0] ?? null;
}


export async function downloadAccessToken(ownerId: string, accountId: string, rootId: string) {
  const config = driveConfig();
  if (!config) throw new BackendError('unavailable');
  const db = registry();
  const { rows: [connection] } = await db.query(`select envelope from mapsilip_backup.drive_connections
    where owner_id=$1 and account_id=$2 and staging_root_id=$3 and state='connected'`, [ownerId,accountId,rootId]);
  if (!connection) throw new BackendError('forbidden');
  const refresh = await openDriveToken(connection.envelope,ownerId,kms);
  const token = await refreshDriveAccess(config,refresh);
  if (token.rotatedRefreshToken) {
    const envelope = await sealDriveToken(token.rotatedRefreshToken,ownerId,config.keyId,kms);
    const updated = await db.query(`update mapsilip_backup.drive_connections set envelope=$5,updated_at=now()
      where owner_id=$1 and account_id=$2 and staging_root_id=$3 and envelope=$4::jsonb and state='connected'`,
    [ownerId,accountId,rootId,connection.envelope,envelope]);
    if (!updated.rowCount) throw new BackendError('unavailable');
  }
  return token.accessToken;
}
