export const EXPECTED_PROJECT_REF = 'atuqxpiandeutimdkgag';
export const REVIEWED_PREFLIGHT_FILES = Object.freeze([
  'supabase/review/staff-authorization.sql',
  'supabase/review/staff-probes.sql',
  'supabase/review/staff-storage-probes.sql',
  'supabase/review/staff-security-verification.md',
  'supabase/review/README.md',
  'scripts/security-preflight.mjs',
  'scripts/lib/security-preflight.mjs',
]);

function refuse(message) {
  throw new Error(`Security preflight refused: ${message}`);
}

function validateEnvironment(environment, projectRef) {
  const url = environment?.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = environment?.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  let parsed;
  try {
    if (typeof url !== 'string' || !url.trim() || url !== url.trim()) throw new Error();
    parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' ||
        parsed.search || parsed.hash || ![parsed.origin, `${parsed.origin}/`].includes(url) ||
        parsed.hostname !== `${projectRef}.supabase.co`) throw new Error();
  } catch {
    refuse('Supabase URL is invalid or does not match the approved project identity.');
  }
  if (typeof publishableKey !== 'string' ||
      !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey) ||
      /replace[-_]?me|your[-_]key|placeholder/i.test(publishableKey)) {
    refuse('a configured Supabase publishable key is required; privileged and legacy keys are not accepted.');
  }
  return { url: parsed.origin, publishableKey };
}

function validateManifest(manifest, hashes) {
  if (!manifest || Object.keys(manifest).sort().join('|') !== 'approval|approvedHashes|projectRef|scope|version' ||
      manifest.version !== 1 || manifest.projectRef !== EXPECTED_PROJECT_REF) {
    refuse('manifest project identity does not match the expected MapSilip project.');
  }
  const approval = manifest.approval;
  const parsedApprovalTime = typeof approval?.approvedAt === 'string'
    ? Date.parse(approval.approvedAt)
    : Number.NaN;
  const canonicalApprovalTime = Number.isFinite(parsedApprovalTime) &&
    (approval.approvedAt === new Date(parsedApprovalTime).toISOString() ||
      approval.approvedAt === new Date(parsedApprovalTime).toISOString().replace('.000Z', 'Z'));
  if (!approval || Object.keys(approval).sort().join('|') !== 'approvedAt|approvedBy|status' ||
      approval.status !== 'approved' || typeof approval.approvedBy !== 'string' ||
      !approval.approvedBy.trim() || typeof approval.approvedAt !== 'string' ||
      !canonicalApprovalTime) {
    refuse('an approved manifest with reviewer and timestamp is required.');
  }
  if (!manifest.scope || Object.keys(manifest.scope).sort().join('|') !== 'check|writesAllowed' ||
      manifest.scope.check !== 'auth-health-get-only' || manifest.scope.writesAllowed !== false) {
    refuse('manifest must authorize the read-only Auth health check only.');
  }
  const manifestHashes = manifest.approvedHashes;
  if (!manifestHashes || Object.keys(manifestHashes).sort().join('|') !== REVIEWED_PREFLIGHT_FILES.slice().sort().join('|') ||
      REVIEWED_PREFLIGHT_FILES.some(name => !/^[a-f0-9]{64}$/.test(manifestHashes[name]) || manifestHashes[name] !== hashes?.[name])) {
    refuse('review file hashes do not match the approved manifest.');
  }
}

export async function runSecurityPreflight({ optIn, manifest, hashes, environment, fetchImpl = fetch }) {
  if (optIn !== '1') refuse('set MAPSILIP_RUN_SECURITY_PREFLIGHT=1 to opt in.');
  validateManifest(manifest, hashes);
  const { url, publishableKey } = validateEnvironment(environment, EXPECTED_PROJECT_REF);
  let response;
  try {
    response = await fetchImpl(`${url}/auth/v1/health`, {
      method: 'GET',
      headers: { apikey: publishableKey, accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    refuse('Auth health request failed; network details and response bodies are suppressed.');
  }
  return { status: response.status, authReachable: response.status === 200 };
}
