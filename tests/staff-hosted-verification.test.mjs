import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runAnonymousReadProbes } from '../scripts/lib/staff-hosted-verification.mjs';

const url = 'https://atuqxpiandeutimdkgag.supabase.co';
const key = 'sb_publishable_offline_probe_test';

test('anonymous probes use only read requests, no bearer token, and reject redirects', async () => {
  const requests = [];
  const results = await runAnonymousReadProbes({ projectUrl: url, publishableKey: key,
    fetchImpl: async (requestUrl, init) => {
      requests.push({ url: requestUrl, method: init.method, redirect: init.redirect, hasAuthorization: !!init.headers.Authorization });
      return new Response(null, { status: 401 });
    },
  });
  assert.deepEqual(results.map(result => result.status), [401, 401, 401]);
  assert.deepEqual(requests.map(request => request.method), ['GET', 'HEAD', 'GET']);
  assert.ok(requests.every(request => request.redirect === 'manual' && !request.hasAuthorization));
  assert.ok(requests[2].url.endsWith('/rest/v1/rpc/mapsilip_staff_access_snapshot'));
});

test('anonymous marker access fails if GET returns any row', async () => {
  let calls = 0;
  await assert.rejects(runAnonymousReadProbes({ projectUrl: url, publishableKey: key,
    fetchImpl: async () => {
      calls++;
      return calls === 1 ? Response.json([{ id: 'synthetic-marker' }]) : new Response(null, { status: 401 });
    },
  }), /anonymous marker access was not denied/);
});

test('anonymous probes reject redirects and invalid project credentials before continuing', async () => {
  let calls = 0;
  await assert.rejects(runAnonymousReadProbes({ projectUrl: url, publishableKey: key,
    fetchImpl: async () => { calls++; return new Response(null, { status: 302, headers: { location: 'https://elsewhere.invalid' } }); },
  }), /redirect refused/);
  assert.equal(calls, 1);
  await assert.rejects(runAnonymousReadProbes({ projectUrl: 'https://other.supabase.co', publishableKey: key,
    fetchImpl: async () => { calls++; return new Response(null, { status: 401 }); },
  }), /project URL does not match/);
  assert.equal(calls, 1);
});
