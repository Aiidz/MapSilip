# Workstream A: production deployment review — 2026-11-05

**Result: local deployment candidate is ready for explicit deployment authorization with push OFF. No deployment was performed. Workstream B remains on hold.** This review is not a guarantee of zero defects or a claim of completed physical-device acceptance.

## Scope and identity

- Reviewed the complete working-tree application, including untracked files: backend/Auth/API/authorization review and frontend/workspace/PWA/service-worker review. The Git baseline is much older than the live deployment; the working-tree diff is not an exact comparison against the currently deployed upload.
- Branch: `codex/login-ui-refinement-20261026`; baseline HEAD: `37b529b9d9734905bd8c7aed77910f972448d345`. Changes remain uncommitted. No commit, reset, GitHub push, or removal of existing work.
- Vercel project verified read-only: `mapsilip`, `prj_qFwAvgeXlE5v517HnJNtXnSPngOZ`, team `team_VjDiMpLXtsEz8SYTIoqHRx74`; intended domain `https://mapsilip.vercel.app`.
- Existing production deployment at review time: READY, `dpl_PGGpmuVGs1uw57qnrWKS8Njk9E48`. It has not been replaced.

## Authorized corrections made locally

1. **Password-reset authorization — corrected.** An ordinary signed-in session previously reached `updateUser` without a current password or recovery proof. `app/lib/backend/auth/recovery-grant.ts`, `app/auth/callback/route.ts`, and `app/api/auth/reset-password/route.ts:21` now require a short-lived HttpOnly credential, redeemed once by Supabase at the reset POST. PKCE additionally requires verified recovery AMR and matching subject; direct recovery token hashes are verified explicitly as recovery. Callback GET defers redemption. No new hosted secret or migration is required. Provider consumption precedes password mutation, so concurrent replay cannot update twice. A consumed link must be replaced if a later password update fails.
2. **Truncated invoice lookups — corrected.** `app/lib/workspace-loading.ts:3`, `ManagementPaymentsWorkspace.tsx:48`, and `TenantWorkspace.tsx:127` load successive authorized API pages, report later-page failures, and cancel on unmount. No API/RLS/role scope changes. More than 100 records now requires additional background requests; datasets are still materialized for existing lookup UI. This is correctness, not an unlimited-scale performance claim.
3. **Truncated concerns list — corrected.** `ManagementConcernsWorkspace.tsx` uses 25-record server pages with existing pagination styling, authoritative count and filter-reset behavior. Older concerns remain reachable beyond record 100.
4. **Out-of-order search results — corrected.** `app/lib/workspace-loading.ts:16` supplies cancellation and latest-request identity guards. Payment, concern, tenant, tenant-notification, and shared notification loaders check identity before success/error/loading commits. Dependency changes cancel immediately during debounce cleanup. Transports ignoring cancellation still cannot commit stale results.

Regression coverage: `tests/recovery-grant.test.mjs`, `tests/reset-password-authorization.test.mjs`, `tests/push-off-deployment.test.mjs`, and `tests/workspace-loading.test.mjs`. Workspace tests execute the actual component load callbacks, including deliberately reversed response order and navigating concerns to page 5.

## Fresh checks

| Check | Result | Evidence |
| --- | --- | --- |
| Standard suite | PASS: 269 total, 257 passed, 0 failed, 12 database tests skipped by default | `docs/superpowers/evidence/workstream-a/mapsilip-a-tests.log` |
| Isolated PostgreSQL | PASS: all 12 database cases passed; fresh local PostgreSQL, no hosted connection | `mapsilip-a-postgres.log` in same folder |
| Typecheck | PASS | `mapsilip-a-typecheck.log` |
| Lint | PASS: zero errors, one pre-existing unnecessary `role` dependency warning at `app/components/RoomContextPanel.tsx:43` | `mapsilip-a-lint.log` |
| Production build | PASS, Next.js 16.4.3 on Node 26.8.2 | `mapsilip-a-build.log` |
| Client artifact scan | PASS: 31 artifacts, checked against two locally configured private values; no server-only push identifiers | `mapsilip-a-scan.log`; limited to current build/configured values, not all possible secrets |
| Push disabled without migration | PASS: route-module tests prohibit every DB/SDK call, test missing/false/non-exact gates, settings unavailable, mutation/dispatch rejection | `tests/push-off-deployment.test.mjs` |
| Production env metadata | PASS: inspected names/targets without decryption. No Production `MAPSILIP_PUSH_ENABLED`, VAPID or worker values; absent gate evaluates false | Existing settings were not modified |
| Database gate | PASS locally: isolated tests assert real runtime remains false; hosted candidate not applied by this task | Hosted runtime state independently NOT VERIFIED |

## Runtime and UI review

- Candidate served from its production build locally with `MAPSILIP_PUSH_ENABLED=false`.
- PASS: `/login`, `/forgot-password`, `/reset-password`, manifest, SW and offline document return 200. SW response is `Cache-Control: no-store` and `Service-Worker-Allowed: /`.
- PASS: anonymous `/management`, `/caretaker`, `/tenant` return 307 to `/login`. Role-routing and first-password-change behavior also covered by automated tests; no live account sessions were created.
- PASS: local push preferences report `available:false`, master disabled. Installation UI is independently available, explains browser limitations and account-wide preferences, makes no automatic permission request.
- PASS: actual login page at 390×844 and 1440×1000, plus dark-mode 390px inspection; no horizontal overflow, controls visible, keyboard focus available. No browser page errors observed.
- PASS: actual PWA components rendered in an isolated UI fixture with no backend/account; 390px bottom sheet and 1440px dialog without horizontal overflow. Focus enters Close; Escape closes and restores focus to the trigger. With reduced-motion emulation active, no running animations were observed. Fixture does not reproduce application fonts or an authenticated role portal.
- Current production read-only probes: login200; anonymous staff access401 and tenant profile401. These do not establish successful account login.
- NOT VERIFIED: fresh successful owner/caretaker/tenant login and full authenticated portal visuals, hosted end-to-end recovery after the local security correction, physical Android/iPhone installation, OS notification permission/delivery/tap behavior. Browser checks used desktop Chromium156 emulation, not physical-device compatibility evidence. No real password changes or test emails were sent during this review.

## Deployment configuration and remaining cautions

- PASS: linked Vercel IDs match; Next.js/Node26.x; region `hnd1`; no Cron, migration application or production scheduling added.
- PASS: Supabase public CA exists and is valid through 2031. `next.config.ts` traces `.certs/supabase-root.crt`; `.vercelignore` excludes local `.env*`, backups and local tooling without excluding the CA. Preserve the CA when packaging; do not rely on Git tracking of ignored certificate files.
- PASS: no push-only Production variable is needed for installation. Preserve existing origin/Auth/database/security settings. No new environment values were invented, decrypted or printed.
- Conditional warning from backend review: tenant-only login configuration with staff Auth disabled can bypass the application's staff-path signin counter (`app/api/auth/signin/route.ts:22`). Existing Production anonymous probes reach authorization (401 rather than disabled503) for both role systems. Do not switch to tenant-only configuration without a separately reviewed limiter fix. No related flag was changed here.
- Offset pagination is not a transactional snapshot: concurrent insertions/deletions can shift lookup pages. No data is modified by loading; this correction does not redesign existing APIs.
- A deploy will upload dirty local application changes, not merely HEAD. Preserve an exact upload inventory/hash manifest and the prior READY deployment for rollback. Exclude local secrets and include the public CA. Build success cannot substitute for subsequent production smoke tests.

## Workstream B — HOLD

No hosted Supabase SQL, migrations, credentials, Vault entries, extensions, scheduler jobs, configuration changes or push activation were performed. Before activation: read-only hosted migration/capability and permissions evidence (Cron, pg_net, Vault, PostgREST, plan quotas), explicit candidate migration authorization, approved category defaults, authorized VAPID/worker credentials and scheduling, then physical Android/iPhone acceptance recording exact OS/browser versions. Obtain separate activation authorization. Neither application nor database push gate may be enabled implicitly during deployment.

## Next action

Obtain explicit authorization to deploy this reviewed local application to Vercel Production at `mapsilip.vercel.app` **with push disabled**. After authorization, prepare the safe upload, deploy, confirm READY/domain assignment and run authorized read-only production smoke checks. Full signed-in/recovery and physical-device checks remain explicit acceptance gaps.

No hosted resources, production records, credentials, deployment settings, runtime gates, existing migration SQL or `.gitignore` were changed. Evidence under ignored `docs/` must be backed up separately.
