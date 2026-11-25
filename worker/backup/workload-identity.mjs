const scope = 'https://www.googleapis.com/auth/cloud-platform';

export async function exchangeVercelIdentity({ assertion, audience, serviceAccount }, request = fetch) {
  if (!assertion || !/^\/\/iam\.googleapis\.com\/projects\/\d+\/locations\/global\/workloadIdentityPools\/[\w-]+\/providers\/[\w-]+$/.test(audience) ||
      !/^[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/.test(serviceAccount)) {
    throw new Error('Vercel workload federation is not configured');
  }
  const options = { method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5000) };
  const exchange = await request('https://sts.googleapis.com/v1/token', {
    ...options, body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
      subject_token: assertion, audience, scope,
    }),
  });
  if (!exchange.ok) throw new Error('Google workload token exchange failed');
  const { access_token } = await exchange.json();
  if (typeof access_token !== 'string' || !access_token) throw new Error('Google workload token unavailable');
  const impersonation = await request(
    'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/' + encodeURIComponent(serviceAccount) + ':generateAccessToken',
    { ...options, headers: { Authorization: 'Bearer ' + access_token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: [scope], lifetime: '600s' }) },
  );
  if (!impersonation.ok) throw new Error('Google KMS service account impersonation failed');
  const { accessToken } = await impersonation.json();
  if (typeof accessToken !== 'string' || !accessToken) throw new Error('Google KMS access token unavailable');
  return accessToken;
}
