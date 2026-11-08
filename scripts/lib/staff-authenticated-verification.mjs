const expectedProjectRef = 'atuqxpiandeutimdkgag';

export function assertSyntheticEmail(value) {
  if (typeof value !== 'string' || value !== value.trim() || value.length > 320 ||
      !/^[^\s@]+@[^\s@]+\.invalid$/i.test(value)) {
    throw new Error('Synthetic staff email must use the reserved .invalid domain.');
  }
  return value.toLowerCase();
}

export function summarizeCheck(name, passed, status = null) {
  return Object.freeze({ name, passed: passed === null ? null : Boolean(passed), status });
}

export function mergeSetCookieHeaders(cookies, setCookieHeaders) {
  for (const header of setCookieHeaders) {
    const pair = header.slice(0, header.indexOf(';') < 0 ? header.length : header.indexOf(';'));
    const separator = pair.indexOf('=');
    if (separator <= 0) continue;
    const name = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    if (/(?:^|;)\s*max-age=0(?:;|$)/i.test(header) || value === '') cookies.delete(name);
    else cookies.set(name, value);
  }
  return cookies;
}

export function getAccessTokenFromCookies(cookies, projectRef = expectedProjectRef) {
  if (projectRef !== expectedProjectRef) throw new Error('Unexpected Supabase project.');
  const name = `sb-${projectRef}-auth-token`;
  const chunks = [...cookies.entries()]
    .map(([key, value]) => ({ key, value, match: key.match(new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.(\\d+)$`)) }))
    .filter(item => item.match)
    .sort((left, right) => Number(left.match[1]) - Number(right.match[1]));
  const value = chunks.length ? chunks.map(item => item.value).join('') : cookies.get(name);
  if (!value) throw new Error('No Supabase session cookie was returned.');
  let decoded;
  try {
    const normalized = decodeURIComponent(value);
    const json = normalized.startsWith('base64-')
      ? Buffer.from(normalized.slice('base64-'.length), 'base64url').toString('utf8')
      : normalized;
    decoded = JSON.parse(json);
  } catch {
    throw new Error('Supabase session cookie could not be decoded.');
  }
  const accessToken = Array.isArray(decoded) ? decoded[0] : decoded?.access_token;
  if (typeof accessToken !== 'string' || !accessToken) throw new Error('Supabase session cookie has no access token.');
  return accessToken;
}

function safeLoopbackOrigin(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('MAPSILIP_APP_ORIGIN must be a local HTTP origin.'); }
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname) ||
      url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error('Hosted staff verification accepts only a local loopback app origin.');
  }
  return url.origin;
}

function requireResponse(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(url, options = {}) {
  try {
    return await fetch(url, { ...options, redirect: 'manual', signal: AbortSignal.timeout(10000) });
  } catch {
    throw new Error('Request failed; response details suppressed.');
  }
}

function updateCookies(jar, response) {
  if (typeof response.headers.getSetCookie !== 'function') throw new Error('Node Set-Cookie inspection is unavailable.');
  return mergeSetCookieHeaders(jar, response.headers.getSetCookie());
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

async function jsonResult(response) {
  try { return await response.json(); } catch { throw new Error('Application returned an invalid response.'); }
}

async function appRequest(origin, path, { jar, method = 'GET', body } = {}) {
  const headers = { accept: 'application/json' };
  if (jar?.size) headers.cookie = cookieHeader(jar);
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    headers.origin = origin;
  }
  const response = await request(`${origin}${path}`, {
    method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (response.status >= 300 && response.status < 400) throw new Error('Unexpected local application redirect.');
  updateCookies(jar ?? new Map(), response);
  return { response, body: await jsonResult(response) };
}

async function markerRows(projectUrl, publishableKey, accessToken, table) {
  const url = new URL(`/rest/v1/${table}?select=id,marker`, projectUrl);
  const response = await request(url, {
    method: 'GET', headers: { apikey: publishableKey, authorization: `Bearer ${accessToken}`, accept: 'application/json' },
  });
  if (response.status === 401 || response.status === 403) return { status: response.status, rows: null };
  requireResponse(response.status === 200, `RLS probe ${table} returned an unexpected status.`);
  let rows;
  try { rows = await response.json(); } catch { throw new Error(`RLS probe ${table} returned invalid JSON.`); }
  requireResponse(Array.isArray(rows), `RLS probe ${table} returned an unexpected shape.`);
  return { status: response.status, rows };
}

async function assertSnapshot(projectUrl, publishableKey, accessToken, role) {
  const response = await request(new URL('/rest/v1/rpc/mapsilip_staff_access_snapshot', projectUrl), {
    method: 'GET', headers: { apikey: publishableKey, authorization: `Bearer ${accessToken}`, accept: 'application/json' },
  });
  requireResponse(response.status === 200, 'Authenticated access snapshot was not available.');
  let snapshot;
  try { snapshot = await response.json(); } catch { throw new Error('Authenticated access snapshot was invalid.'); }
  requireResponse(snapshot?.role === role && snapshot?.status === 'active' &&
    snapshot?.password_change_required === false && snapshot?.auth_session_active === true &&
    snapshot?.security_revision === snapshot?.session_revision,
  'Authenticated access snapshot did not match the expected role and active session.');
  return response.status;
}

async function assertNoAccess(origin, jar) {
  const { response } = await appRequest(origin, '/api/staff/access', { jar });
  requireResponse(response.status === 401 || response.status === 403, 'A restricted or stale session retained app access.');
  return response.status;
}

async function assertRestrictedRls(projectUrl, publishableKey, accessToken) {
  const result = await markerRows(projectUrl, publishableKey, accessToken, 'mapsilip_staff_security_probe');
  requireResponse(result.status === 401 || result.status === 403 || result.rows?.length === 0,
    'A restricted or stale session could read the RLS marker.');
  return result.status;
}

async function assertRoleRls(projectUrl, publishableKey, accessToken, role) {
  const own = await markerRows(projectUrl, publishableKey, accessToken, 'mapsilip_staff_security_probe');
  requireResponse(own.status === 200 && own.rows.length === 1 && own.rows[0]?.id === '90000000-0000-4000-8000-000000000001',
    `${role} did not read the synthetic staff marker.`);
  const finance = await markerRows(projectUrl, publishableKey, accessToken, 'mapsilip_financial_security_probe');
  if (role === 'owner') {
    requireResponse(finance.status === 200 && finance.rows.length === 1 &&
      finance.rows[0]?.id === '90000000-0000-4000-8000-000000000002', 'Owner financial marker access failed.');
  } else {
    requireResponse(finance.status === 401 || finance.status === 403 || finance.rows?.length === 0,
      'Caretaker could read the financial marker.');
  }
  return { ownStatus: own.status, financeStatus: finance.status };
}

async function signIn(origin, email, password) {
  const jar = new Map();
  const { response, body } = await appRequest(origin, '/api/auth/signin', {
    method: 'POST', jar, body: { email, password },
  });
  requireResponse(response.status === 200 && ['restricted', 'admitted'].includes(body?.state),
    'Staff sign-in did not return an allowed state.');
  return { jar, state: body.state, destination: body.destination };
}

async function verifyIdentity({ origin, projectUrl, publishableKey, role, email, currentPassword, replacementPassword }) {
  const tests = [];
  const first = await signIn(origin, email, currentPassword);
  const expectedDestination = role === 'owner' ? '/management' : '/caretaker';
  if (first.state === 'restricted') {
    requireResponse(first.destination === '/auth/change-password', 'First-login restriction routed to an unexpected screen.');
    const oldJar = new Map(first.jar);
    const oldToken = getAccessTokenFromCookies(first.jar);
    const deniedStatus = await assertNoAccess(origin, first.jar);
    tests.push(summarizeCheck(`${role}_restricted_app_denial`, true, deniedStatus));
    const oldRlsStatus = await assertRestrictedRls(projectUrl, publishableKey, oldToken);
    tests.push(summarizeCheck(`${role}_restricted_rls_denial`, true, oldRlsStatus));
    requireResponse(typeof replacementPassword === 'string' && replacementPassword.length >= 8 &&
      replacementPassword.length <= 1024 && replacementPassword !== currentPassword,
    'A distinct replacement password of at least 8 characters is required for a restricted account.');
    const changed = await appRequest(origin, '/api/auth/first-login', {
      method: 'POST', jar: first.jar, body: { currentPassword, newPassword: replacementPassword },
    });
    requireResponse(changed.response.status === 200 && changed.body?.state === 'completed' &&
      changed.body?.destination === expectedDestination, 'First-login replacement did not complete.');
    const changedToken = getAccessTokenFromCookies(first.jar);
    const oldSessionStatus = await assertNoAccess(origin, oldJar);
    tests.push(summarizeCheck(`${role}_old_session_app_denial`, true, oldSessionStatus));
    tests.push(summarizeCheck(`${role}_first_login_completed`, true, changed.response.status));
    const restrictedOldSessionDenied = await assertRestrictedRls(projectUrl, publishableKey, oldToken);
    tests.push(summarizeCheck(`${role}_old_session_rls_denied`, true, restrictedOldSessionDenied));
    const snapshotStatus = await assertSnapshot(projectUrl, publishableKey, changedToken, role);
    const rls = await assertRoleRls(projectUrl, publishableKey, changedToken, role);
    tests.push(summarizeCheck(`${role}_post_change_snapshot`, true, snapshotStatus));
    tests.push(summarizeCheck(`${role}_staff_rls`, true, rls.ownStatus));
    tests.push(summarizeCheck(`${role}_financial_rls`, true, rls.financeStatus));
  } else {
    requireResponse(first.destination === expectedDestination, 'Admitted account role destination did not match.');
    requireResponse(!replacementPassword, 'Do not provide a replacement password for an account already past first login.');
    const token = getAccessTokenFromCookies(first.jar);
    const snapshotStatus = await assertSnapshot(projectUrl, publishableKey, token, role);
    const rls = await assertRoleRls(projectUrl, publishableKey, token, role);
    tests.push(summarizeCheck(`${role}_first_login`, null, 'not_run_account_already_admitted'));
    tests.push(summarizeCheck(`${role}_post_change_snapshot`, true, snapshotStatus));
    tests.push(summarizeCheck(`${role}_staff_rls`, true, rls.ownStatus));
    tests.push(summarizeCheck(`${role}_financial_rls`, true, rls.financeStatus));
  }

  const authenticatedPassword = first.state === 'restricted' ? replacementPassword : currentPassword;
  const subsequent = await signIn(origin, email, authenticatedPassword);
  requireResponse(subsequent.state === 'admitted' && subsequent.destination === expectedDestination,
    'Subsequent password sign-in did not receive the expected role admission.');
  const subsequentToken = getAccessTokenFromCookies(subsequent.jar);
  const access = await appRequest(origin, '/api/staff/access', { jar: subsequent.jar });
  requireResponse(access.response.status === 200 && access.body?.access === 'granted',
    'The newly admitted session could not access the staff gate.');
  const roleRls = await assertRoleRls(projectUrl, publishableKey, subsequentToken, role);
  tests.push(summarizeCheck(`${role}_subsequent_signin`, true, 200));
  tests.push(summarizeCheck(`${role}_role_rls`, true, roleRls.ownStatus));
  tests.push(summarizeCheck(`${role}_financial_boundary`, true, roleRls.financeStatus));

  const signedOut = await appRequest(origin, '/api/auth/signout', { method: 'POST', jar: subsequent.jar, body: {} });
  requireResponse(signedOut.response.status === 200 && signedOut.body?.state === 'signed-out', 'Server sign-out was not confirmed.');
  const afterSignOut = await assertNoAccess(origin, subsequent.jar);
  const afterSignOutRls = await assertRestrictedRls(projectUrl, publishableKey, subsequentToken);
  tests.push(summarizeCheck(`${role}_signout_app_denial`, true, afterSignOut));
  tests.push(summarizeCheck(`${role}_signout_rls_denial`, true, afterSignOutRls));
  return tests;
}

export async function runAuthenticatedStaffVerification({ projectUrl, publishableKey, appOrigin, identities }) {
  const parsedProject = new URL(projectUrl);
  if (parsedProject.origin !== `https://${expectedProjectRef}.supabase.co` || parsedProject.pathname !== '/' ||
      parsedProject.search || parsedProject.hash) throw new Error('Hosted verification refused for an unexpected project.');
  const origin = safeLoopbackOrigin(appOrigin);
  if (!Array.isArray(identities) || identities.length !== 2 ||
      identities[0]?.role !== 'owner' || identities[1]?.role !== 'caretaker') {
    throw new Error('Exactly one synthetic owner and one synthetic caretaker are required.');
  }
  const emails = identities.map(identity => assertSyntheticEmail(identity.email));
  if (emails[0] === emails[1]) throw new Error('The synthetic identities must be distinct.');

  const preflight = await appRequest(origin, '/api/auth/signin', { method: 'POST', body: {} });
  if (preflight.response.status !== 400) throw new Error('Local staff Auth endpoint is not enabled or did not reject the safe preflight request.');
  const unauthenticated = await appRequest(origin, '/api/staff/access');
  requireResponse(unauthenticated.response.status === 401 || unauthenticated.response.status === 403,
    'Unauthenticated staff access was not denied.');
  const results = [summarizeCheck('unauthenticated_app_denial', true, unauthenticated.response.status)];

  for (const identity of identities) {
    results.push(...await verifyIdentity({ origin, projectUrl, publishableKey, ...identity }));
  }
  return Object.freeze(results);
}
