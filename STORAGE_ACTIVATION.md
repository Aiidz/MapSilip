# Storage activation — 2026-11-15

User authorization: “apply it now”, followed by confirmed Supabase CLI login. Hosted migration/key provisioning is authorized; production deployment remains a separate approval under the original task restrictions. No real archive or cleanup operation was initiated by this verification.

## Applied

- Project: MapSilip, `atuqxpiandeutimdkgag`, Tokyo.
- `20261112145412_storage_archives`: applied once with its exact SQL saved in migration history, in a transaction with a duplicate-history guard and short lock timeout.
- `20261115044605_storage_rollout_compatibility`: forward-only follow-up, also applied once. It keeps previous-release uploads honestly marked legacy until the new code is deployed and enforcement is activated.
- Other pending local migrations were not pushed or reapplied. Hosted versions differ from some local filenames, so no blanket migration push was used.
- Private verification key provisioned in ignored `.env.local` and encrypted Vercel project variables for production/development. No key value is included in this report.
- `STORAGE_MANAGEMENT_ENABLED=true`; `STORAGE_CLEANUP_ENABLED=false` locally and in the configuration for the next Vercel deployment.

## Verified

- 17 focused SQL/cleanup/export tests passed with isolated PGlite/pgcrypto.
- Hosted RLS enabled on all five new public tables.
- Existing owner test account: local storage API 200 and direct guarded DB RPC permitted; returned usage is 4 objects / 104,975 metadata bytes.
- Existing caretaker test account: API 403; direct DB RPC denied with 42501.
- Anonymous local API request: 401.
- Cleanup API with owner session: 403 because deletion is disabled; no deletion claim or Storage removal occurred.
- Only newly created verification sessions were revoked using Supabase local-session scope. Other user sessions were not globally signed out.
- After both migrations, baseline counts unchanged: 4 Storage objects, 104,975 metadata bytes, 4 attachments, 3 tenant profiles, 3 assignments, 1 payment, 2 invoices, 1 maintenance request.
- Migration history contains exactly the two intended storage versions. `.gitignore` remains untouched; `.env.local` is ignored. No objects or business records were deleted.

The local dev server was started on port 3000; owner route: http://localhost:3000/management/storage . No official archive has yet been downloaded and independently verified on an owner-controlled encrypted device. Hosted tenant/different-tenant full workflow testing and real archive download integrity checks remain pending.

## Production rollout still pending

The current Vercel production deployment was not redeployed. New Vercel environment variables do not modify an existing deployment.

After explicit deployment authorization:

1. Run current build/checks and deploy the prepared application code with the configured server variables, leaving cleanup disabled.
2. Verify owner inventory, private upload finalization, and non-owner denial against that deployment. Confirm a test upload made through the new endpoint records a valid checksum and uploaded state.
3. As the authorized database administrator, run `select mapsilip_private.activate_storage_controls();` once the updated code is live. This switches new uploads out of compatibility mode, requires validated upload receipts, and retires the old unused-contract deletion path. It does not delete any objects. Do not activate enforcement before the updated upload endpoint is live.
4. Verify the enforcement flag and default through safe metadata queries; test owner archive creation/download/completeness separately.
5. Actual cleanup activation and every file removal remain separately owner-authorized. Do not enable STORAGE_CLEANUP_ENABLED or remove objects as part of ordinary deployment.

The compatibility follow-up is necessary because the old upload endpoint does not produce the new verification receipt. Enforcing immediately would break existing live uploads, and failing to mark transition-period profile uploads as legacy could hide them after rollout. Legacy markers do not assert that old files passed the new validation.
