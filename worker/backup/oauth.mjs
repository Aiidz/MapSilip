import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const scope = 'https://www.googleapis.com/auth/drive.file';
const tokenUrl = 'https://oauth2.googleapis.com/token';
const random = () => randomBytes(32).toString('base64url');
const digest = value => createHash('sha256').update(value).digest('base64url');

function binding(config, owner) {
  if (!owner.userId || !owner.sessionId) throw new Error('Verified owner session required');
  const redirect = new URL(config.redirectUri);
  if (redirect.protocol !== 'https:' || redirect.pathname !== '/api/backups/drive/callback' ||
      redirect.search || redirect.hash || redirect.username || redirect.password) throw new Error('Invalid OAuth redirect');
  return { userId: owner.userId, sessionId: owner.sessionId, redirectUri: redirect.href, clientId: config.clientId };
}

export async function startDriveConsent(config, owner, store, now = Date.now()) {
  const context = binding(config, owner);
  const state = random();
  const verifier = random();
  await store.put(digest(state), { ...context, verifier, expiresAt: now + 10 * 60 * 1000 });
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: config.clientId, redirect_uri: context.redirectUri, response_type: 'code',
    scope, access_type: 'offline', prompt: 'select_account consent', state,
    code_challenge_method: 'S256', code_challenge: digest(verifier),
  });
  return url.href;
}

async function tokenRequest(fields, fetcher) {
  const response = await fetcher(tokenUrl, {
    method: 'POST', redirect: 'error', body: new URLSearchParams(fields),
  });
  if (!response.ok) throw new Error('Google token request failed: ' + response.status);
  const token = await response.json();
  if (typeof token.access_token !== 'string' || !token.access_token) throw new Error('Google access token unavailable');
  return token;
}

export async function finishDriveConsent(config, owner, store, { state, code }, fetcher = fetch, now = Date.now()) {
  const context = binding(config, owner);
  if (!/^[a-z0-9_-]{43}$/i.test(state ?? '') || typeof code !== 'string' || !code || code.length > 4096) {
    throw new Error('Invalid OAuth state or code');
  }
  // The store atomically consumes only a still-valid state matching the entire binding.
  const challenge = await store.consume(digest(state), context, now);
  if (!challenge || challenge.expiresAt <= now || Object.keys(context).some(key => challenge[key] !== context[key])) {
    throw new Error('Invalid or consumed OAuth state');
  }
  const token = await tokenRequest({
    client_id: config.clientId, client_secret: config.clientSecret, grant_type: 'authorization_code',
    code, redirect_uri: context.redirectUri, code_verifier: challenge.verifier,
  }, fetcher);
  if (token.scope !== scope || typeof token.refresh_token !== 'string' || !token.refresh_token) {
    throw new Error('Google Drive offline grant unavailable');
  }
  const about = await fetcher('https://www.googleapis.com/drive/v3/about?fields=user(permissionId)', {
    headers: { Authorization: 'Bearer ' + token.access_token }, redirect: 'error',
  });
  if (!about.ok) throw new Error('Google Drive account verification failed');
  const accountId = (await about.json()).user?.permissionId;
  if (typeof accountId !== 'string' || !accountId) throw new Error('Google Drive account identity unavailable');
  return { accountId, refreshToken: token.refresh_token };
}

export async function refreshDriveAccess(config, refreshToken, fetcher = fetch) {
  const token = await tokenRequest({
    client_id: config.clientId, client_secret: config.clientSecret,
    grant_type: 'refresh_token', refresh_token: refreshToken,
  }, fetcher);
  if (token.scope && token.scope !== scope) throw new Error('Unexpected refreshed Google scope');
  return { accessToken: token.access_token, rotatedRefreshToken: token.refresh_token ?? null };
}

export async function revokeDriveGrant(refreshToken, fetcher = fetch) {
  const response = await fetcher('https://oauth2.googleapis.com/revoke', {
    method: 'POST', redirect: 'error', body: new URLSearchParams({ token: refreshToken }),
  });
  if (!response.ok) throw new Error('Google grant revocation failed: ' + response.status);
}

function associatedData(connectionId, keyId) {
  if (!connectionId || !keyId) throw new Error('Credential envelope binding required');
  return Buffer.from(JSON.stringify(['mapsilip-drive-refresh', 1, connectionId, keyId]));
}

export async function sealDriveToken(token, connectionId, keyId, kms) {
  const aad = associatedData(connectionId, keyId);
  const key = randomBytes(32);
  const nonce = randomBytes(12);
  try {
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    return {
      version: 1, keyId, wrappedKey: await kms.wrap(key, keyId, aad),
      nonce: nonce.toString('base64'), ciphertext: ciphertext.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
    };
  } finally {
    key.fill(0);
  }
}

export async function openDriveToken(envelope, connectionId, kms) {
  if (envelope.version !== 1) throw new Error('Unsupported credential envelope');
  const aad = associatedData(connectionId, envelope.keyId);
  const key = await kms.unwrap(envelope.wrappedKey, envelope.keyId, aad);
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.nonce, 'base64'));
    decipher.setAAD(aad);
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]).toString('utf8');
  } finally {
    key.fill(0);
  }
}
