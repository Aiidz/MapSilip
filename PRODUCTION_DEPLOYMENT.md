# Current Production: fluid animations and overlay fixes — 2026-11-04

- Status: READY in Vercel Production; permanent alias verified.
- URL: https://mapsilip.vercel.app
- Deployment: dpl_F2zioqLdc3DPyzEouj1HipdQTfhu
- Immutable URL: https://mapsilip-expyz7jjw-lupalogic-2108s-projects.vercel.app
- Source snapshot: f05aa462bdee9edd7d7bd4ec01d2d6ca2a0d3ca5
- Branch: codex/login-ui-refinement-20261026
- Region: hnd1 (Tokyo), unchanged.
- Rollback target: dpl_7wrSumerJGjWHd8vQctQSm6VwHB9
- Previous URL: https://mapsilip-5br2nec62-lupalogic-2108s-projects.vercel.app
- Source archive: backups/production/mapsilip-fluid-20261104.bundle
- Rollback record: backups/production/fluid-rollback-20261104.json

The user explicitly authorized this deployment after reviewing the refinement. The isolated snapshot preserves the original dirty workspace, includes the public Supabase CA certificate, excludes private environment files, and passed a configured-secret scan. Production environment values, backend/API/migration files, dependencies and .gitignore were not changed. No GitHub push or automatic deployment setup was performed.

Vercel build passed. The approved source passed 201 tests, typecheck and build; lint has one existing warning. Live checks passed: /login and /forgot-password return 200; anonymous /api/staff/access returns 401 from hnd1; designated owner login reaches /management; new 320/440/520ms motion tokens are served by the permanent domain; the invoice drawer opens at 1440px and becomes a mobile sheet at 390px; Escape dismisses it and its column structure persists through exit; theme switching completes cleanly. No horizontal overflow or browser JavaScript errors were observed. No form was submitted and no tenant record was edited during these checks.

Full role-specific production mutation workflows, physical phones and Safari were not retested during this deployment. Prior accepted backend/Auth audit limits remain in the historical reports. The prior READY deployment is retained for rollback; no rollback was necessary during the smoke test.

---

Historical reports follow.

# Current Production: approved motion polish — 2026-11-03

- Status: READY in Vercel Production; permanent alias verified.
- URL: https://mapsilip.vercel.app
- Immutable URL: https://mapsilip-aosfc0smn-lupalogic-2108s-projects.vercel.app
- Deployment: dpl_7gXaDhDhxB6wPEaNefNHjuRSB8TJ
- Source snapshot: 82f03f7bbd2aec408dacae6265be47ed23539b06
- Branch: codex/login-ui-refinement-20261026
- Region: hnd1 (Tokyo), preserved and confirmed by live unauthorized API response.
- Source archive: backups/production/mapsilip-motion-20261103.bundle. Original dirty workspace and existing .gitignore preserved; no GitHub push or automatic production deployment configured.

The user approved deployment after reviewing the motion changes. Compared with the previous live source snapshot, only AppShell, ThemeToggle, globals.css, the motion regression tests and PERFORMANCE.md changed. All 68 protected API/backend/Supabase/migration source hashes and .gitignore bytes match the pre-motion baseline. Production environment settings were not changed. Upload secret scan passed; private environment/account files were excluded and the required public CA was included.

Vercel production build passed. Approved-source checks: 195 tests, typecheck, build and lint passed (four existing lint warnings); checks were not unnecessarily repeated for deployment-only work.

Live smoke checks PASS: production domain serves new motion tokens; designated owner login, dashboard and room navigation; 24 real room controls; one-click room details; one rooms and one assignments fetch on room entry; mobile sheet entrance/close; mobile menu open/Escape with focus restored; no horizontal overflow at 1440px or 390px. /login and /forgot-password return 200; unauthenticated /api/staff/access returns 401. No browser JavaScript errors observed, no animations remained running after settling, and Vercel reported no runtime errors in the sampled five-minute window.

No production data was edited. Full tenant/caretaker workflows, physical phones and Safari were not retested for this UI-only deployment. Prior accepted Auth/migration/email limitations remain recorded below and in HOSTED_VERIFICATION.md.

---

Historical production reports follow.

# Current Production update — 2026-11-03

- Status: READY, Vercel Production; permanent alias verified.
- URL: https://mapsilip.vercel.app
- Immutable URL: https://mapsilip-ojephqofo-lupalogic-2108s-projects.vercel.app
- Deployment: dpl_4VAcMvWvNT7Hsnqpcf7pss9qjhJt
- Snapshot commit: 9dab4426b883fdbce156b23029c61b4cb1912527
- Branch: codex/login-ui-refinement-20261026
- Function region: hnd1 (Tokyo), confirmed by live response headers.
- Source bundle: backups/production/mapsilip-performance-20261103.bundle; original dirty workspace preserved, snapshot not pushed to GitHub.

Changes: remove duplicate map room/assignment requests; retain refresh after edits; restore pointer/keyboard floor selection and one-click room details; prevent decorative seams from intercepting clicks; reject revoked read-only sessions without cookie-deletion errors. Region selection reduces network round trips to the existing Supabase backend.

PASS: 188 tests, typecheck, local and Vercel production builds; lint exits successfully with four existing warnings. Local client static build and uploaded source scans found no configured server-secret values. Live owner/caretaker login, owner dashboard, room/directory/maintenance reads, anonymous rejection and caretaker-to-owner denial passed. Live map shows 24 normal rooms, opens room details, and corridor pointer selection isolates the correct floor. The final deployed seam correction was verified after a full browser navigation without injected styles. Layout has no horizontal overflow at 390px or 1440px. No browser JavaScript errors were observed.

Cleanup: only the explicitly authorized readiness tenant's Auth identity, profile, request, assignment, notifications and synthetic room were deleted. Post-checks: each target absent, 24 normal rooms and two active staff mappings remain. Private pre-cleanup backup retained. No existing migration SQL, real tenant records, `.gitignore`, credentials or security configuration was changed by this performance pass.

Auth variables and flags remain as documented below. Prior migration/Auth URL audit limitations and built-in Supabase email restrictions remain unchanged. Tenant login/isolation and production mutation workflows were not repeated in this pass; prior evidence is retained in HOSTED_VERIFICATION.md. No fake production records were created for these checks. Detailed timing evidence is in PERFORMANCE.md.

---

The following is the historical initial deployment report; its fixture-preservation statement describes the state before the authorized cleanup above.

# MapSilip Production deployment — 2026-11-03

Status: READY in Vercel Production.

- Production URL: https://mapsilip.vercel.app
- Immutable deployment URL: https://mapsilip-75mcyw8i5-lupalogic-2108s-projects.vercel.app
- Project: mapsilip, owned by lupalogic@gmail.com (LupaLogic).
- Project ID: prj_qFwAvgeXlE5v517HnJNtXnSPngOZ
- Deployment ID: dpl_7hWDSvpe66XiRr1rjpQPeUynZqqy
- Branch: codex/login-ui-refinement-20261026
- Source snapshot commit: b7a0bbb716ec4148c1c3fdcdf32690789206eab2
- Original workspace base commit: 37b529b9d9734905bd8c7aed77910f972448d345
- Repository: https://github.com/Aiidz/MapSilip.git

The deployment includes the current working-tree application through an isolated source snapshot. The original working tree and .gitignore remain intact. The snapshot commit was not pushed to GitHub. A Git bundle preserves it at backups/production/mapsilip-production-20261103.bundle. No automatic Git deployment was enabled.

## Environment

Required Production names:

- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
- SUPABASE_SERVICE_ROLE_KEY
- MAPSILIP_SECURITY_DATABASE_URL
- MAPSILIP_RATE_LIMIT_HASH_KEY
- MAPSILIP_APP_ORIGIN
- MAPSILIP_STAFF_AUTH_ENABLED
- MAPSILIP_TENANT_AUTH_ENABLED

Both auth flags were enabled for this explicitly authorized Production deployment. Existing authentication, role checks, RLS, rate limiting, and verified database TLS remain enforced. The bundled public CA certificate SHA-256 is 700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7. No application email-provider credentials are required.

## Verification

- PASS: Vercel Production build and deployment completed successfully.
- PASS: permanent domain assigned to the Production deployment.
- PASS: /, /login, and /forgot-password returned HTTP 200 and MapSilip content without a Vercel sign-in gate.
- PASS: unauthenticated /api/staff/access returned HTTP 401.
- PASS: production_synthetic_tenant_login (HTTP 200).
- PASS: production_tenant_profile (HTTP 200).
- PASS: production_synthetic_tenant_logout (HTTP 200).
- PASS: upload scan found no configured server secret values or synthetic passwords; the private credential file was excluded.
- Previous source checks: 186 automated tests, typecheck, and build passed; lint had four existing warnings. They were not unnecessarily repeated during this deployment.

## Accepted remaining limits

The user instructed deployment without the remaining hosted migration-history and Auth URL/template audits. Those checks remain NOT VERIFIED; no migration or hosted Auth-setting change was made. Full production system, mobile/desktop, and recovery callback/password-update testing were not repeated. Prior hosted role/RLS/isolation evidence remains in HOSTED_VERIFICATION.md.

Supabase project atuqxpiandeutimdkgag is the intended backend. The deployed tenant smoke check successfully exercised it. Mail uses Supabase Auth's built-in service exclusively, with accepted organization-team recipient restrictions, sending limits, and best-effort delivery. Prior recovery email delivery was confirmed by the user; unrestricted tenant email delivery is not claimed.

Existing real tenant data and synthetic fixtures were preserved. No database reset, migration application/repair, or data deletion occurred.

## Access

Open https://mapsilip.vercel.app and use your MapSilip account. Designated synthetic credentials are in the ignored local file .env.mapsilip-test-accounts.local (mode 0600); do not upload, commit, or publish that file.
