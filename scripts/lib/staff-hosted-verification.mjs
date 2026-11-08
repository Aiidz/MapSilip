const expectedProjectOrigin = 'https://atuqxpiandeutimdkgag.supabase.co';

export async function runAnonymousReadProbes({ projectUrl, publishableKey, fetchImpl = fetch }) {
  let origin;
  try {
    const parsed = new URL(projectUrl);
    if (parsed.origin !== expectedProjectOrigin || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error();
    origin = parsed.origin;
  } catch {
    throw new Error('Hosted security verification refused: project URL does not match the approved project.');
  }
  if (typeof publishableKey !== 'string' || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey) ||
      /replace[-_]?me|your[-_]key|placeholder/i.test(publishableKey)) {
    throw new Error('Hosted security verification refused: a publishable key is required.');
  }

  const probes = [
    { name: 'anonymous_get', path: '/rest/v1/mapsilip_staff_security_probe?select=id', method: 'GET' },
    { name: 'anonymous_head', path: '/rest/v1/mapsilip_staff_security_probe?select=id', method: 'HEAD' },
    { name: 'anonymous_stable_rpc', path: '/rest/v1/rpc/mapsilip_staff_access_snapshot', method: 'GET' },
  ];
  const results = [];
  for (const probe of probes) {
    let response;
    try {
      response = await fetchImpl(`${origin}${probe.path}`, {
        method: probe.method,
        headers: { apikey: publishableKey, accept: 'application/json' },
        redirect: 'manual',
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new Error(`Hosted security verification failed at ${probe.name}: transport failure.`);
    }
    if (response.redirected || (response.status >= 300 && response.status < 400)) {
      throw new Error(`Hosted security verification failed at ${probe.name}: redirect refused.`);
    }

    let denied = response.status === 401 || response.status === 403;
    if (probe.name === 'anonymous_get' && response.status === 200) {
      try {
        const rows = await response.json();
        denied = Array.isArray(rows) && rows.length === 0;
      } catch {
        denied = false;
      }
    }
    if (!denied) throw new Error(`Hosted security verification failed at ${probe.name}: anonymous marker access was not denied.`);
    results.push(Object.freeze({ name: probe.name, status: response.status, denied: true }));
  }
  return Object.freeze(results);
}
