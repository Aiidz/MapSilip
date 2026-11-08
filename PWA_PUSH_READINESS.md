# MapSilip PWA implementation and readiness — 2026-11-05

## Latest local remediation

The six static-audit findings have been corrected locally. See [PWA_PUSH_REMEDIATION.md](PWA_PUSH_REMEDIATION.md) for original behavior, exact changed lines, regression tests and remaining gates. Fresh verification:238 standard tests passed with12 DB cases skipped by default; all12 passed in a fresh isolated PostgreSQL run. Typecheck, lint (one existing warning), production build and client artifact scan passed. No hosted changes/deployment occurred and both actual push gates remain disabled. Installation remains independent of push availability.

Hosted PostgREST transaction commit/rollback-override policy and per-function timeout hoisting now require explicit read-only evidence before push activation. Physical Android/iPhone delivery is still unverified. Local test availability is dependency-injected; the real runtime row stays false.

## Status and scope

Local implementation is authorized and implemented. **Nothing has been deployed, no hosted migration applied, no hosted credential created and no hosted scheduling configured. Push remains disabled by default.** Installation is independent of push availability. This is not a claim that physical Android/iPhone push delivery has passed, or that production activation is ready.

Existing dirty work was preserved on `codex/login-ui-refinement-20261026`, baseline `37b529b9d9734905bd8c7aed77910f972448d345`. No commits, resets, GitHub pushes, `.gitignore` edits, old migration edits or real tenant record changes were made. Evidence and phase ledger: `docs/superpowers/evidence/pwa/` (ignored documentation; back up separately).

## Changes and phase evidence

| Phase | Implemented and verified locally | Still unverified / gate status |
|---|---|---|
| 1 Installation | Phone eligibility/cooldown, Android native or manual path, iPhone guidance, independent installation while push off, role-aware root startup, public-only offline SW, RSC/prefetch/API/auth exclusions | Native installation on physical Android/iPhone; full authenticated portal visuals |
| 2 Data/security | One append-only candidate migration; public narrow wrappers over private RLS tables; default-off database runtime gate; authoritative staff/tenant/session checks; installation capability ownership; account-wide preferences; first initialization once (two concurrent connections tested), additional-device enrollment never overwrites preferences | Actual hosted grants/migration history and hosted PostgREST integration; actual multi-device hosted enrollment |
| 3 Delivery | Durable outbox/deliveries, exact event classifier, 20-claim/4-concurrency bounds, absolute5s sends, lease reclamation/fencing, expiry/max-attempt guards, retry scheduling/policy, 410 removal, disabled auth flags, authenticated dispatcher | Actual provider/OS delivery; hosted scheduler and end-to-end time-to-delivery; actual provider retry/delivery behavior |
| 4 Consent/UI | Explicit click permission; visible categories/account-wide explanation; first/additional enrollment; Save-only existing preference changes; separate device disable; bounded best-effort logout cleanup; lazy shared overlay | Real browser permission UI; successful physical enrollment; full authenticated role-portal UI sessions |
| 5 Click routing | Generic visible notification, fixed UUID resolver, exact role destination allowlist, own recipient query, foreign404, signed-out login continuation | Real OS notification tap, physical shared-device/account-switch scenario and full first-password-change journey |
| 6 Acceptance | Automated checks, isolated PostgreSQL security tests, component fixture at390/1440px, reduced motion/focus/cache inspection, client artifact scan | **Not complete:** hosted capability access and physical-device tests required before activation |

Review caught and fixed missed Android install events, stale409→403 recovery state, dispatch ignoring auth flags, unbounded logout cleanup, and a browser-discovered effect-variable shadowing error. No application authentication mechanism was replaced.

## Main implementation files

- Installation/UI: `app/lib/pwa/`, `app/components/PwaManager.tsx`, `PwaOnboarding.tsx`, `PushPreferences.tsx`; narrow mounts in AppShell and the three authenticated layouts; shared profile-menu entry in ToolbarPopovers.
- Offline/install assets: `public/sw.js`, `public/offline.html`, manifest root start URL and conservative icon purpose; `next.config.ts` SW no-store headers, existing CA tracing retained.
- Server: `app/lib/backend/push/`, `app/api/push/`, `app/notifications/open/route.ts`; narrow UUID continuation in login/resume helpers and bounded cleanup in both sign-out routes.
- Database candidate: `supabase/migrations/20261105021728_mobile_push.sql`; metadata-only audit `supabase/review/push-capabilities.sql`.
- Tests/tooling: `tests/pwa-*.test.mjs`, `tests/push-*.test.mjs`, isolated Auth fixture, `scripts/push-isolated-tests.mjs`, `scripts/push-client-scan.mjs`; optional variable names/default-off flag in `.env.example`.

## Checks

- Baseline:208 tests passed.
- Current standard suite:238 passed,0 failed,12 skipped. The skipped tests are explicitly opt-in isolated PostgreSQL integration, not hidden failures.
- Isolated PostgreSQL integration:12 tests PASS, run separately, including clean database creation and the actual relevant repository authority/access migrations plus the candidate.
- Typecheck:PASS.
- ESLint:0 errors;1 pre-existing `RoomContextPanel.tsx` unnecessary `role` dependency warning.
- Production build:PASS. This command builds only; it does not deploy.
- Client static artifact scan:PASS,31 artifacts checked against2 configured private values and server-only push identifiers. Scope is the current build/local configuration, not every possible deployment/log.
- npm audit reports8 moderate findings in the existing ESLint/TypeScript/minimatch development dependency chain; no blanket dependency upgrade or audit-force fix performed. New runtime dependency is pinned `web-push`, with pinned type declarations in dev dependencies.

## Browser evidence and performance limits

Isolated local component fixture only; no production account or protected route bypass. Chromium156.0.8078.4 on Linux, desktop1440×900 and emulated iPhone390px. Emulated iPhone UA identifies iOS16.0/Safari16.0 but **this is not a physical iPhone or Safari execution**. Device emulation did not expose coarse pointer/touch; automatic eligibility is unit-tested, not visually proved on a real phone. Never claim universal browser compatibility from this evidence.

Observed at390px: no horizontal document overflow; dialog390px wide; keyboard focus inside dialog; Escape closes it and restores focus to App and notifications. Light/dark media and reduced-motion states exercised; physical-device animations/performance not measured. CacheStorage contains only `/offline.html`, `/icon-192.png`, `/icon-512.png`; no authenticated pages/API content.

The settings/consent overlay is dynamically loaded after first opening. Prior build measured roughly3.6KiB gzip for its lazy JS chunk and1.4KiB gzip for the service worker (final numbers may vary with bundling). No new polling, animation loop, per-route auth fetch or client push library. No before/after authenticated LCP, real-phone CPU trace, or portal navigation latency comparison was obtained; do not describe this as zero measured performance cost. Installation/SW asset transfer is a small additional one-time network cost.

## Hosted capability audit — blocked by missing read access

Attempted only this read-only metadata query, targeting the exact intended project:

```bash
npx supabase db query --remote=atuqxpiandeutimdkgag --read-only --file supabase/review/push-capabilities.sql
```

CLI returned `DbQueryLoginRequiredError`: no Supabase access token is available to this CLI. No SQL executed on hosted Supabase. Cron, pg_net, Vault, provisioning privileges, plan quotas and egress restrictions are all **NOT VERIFIED**, not failed/inferred available. No alternative scheduler, paid service or infrastructure was added.

To resolve, the owner can authorize a securely stored scoped Supabase Management API token with the CLI-documented `database_read` permission (and any documented project/branch read permission), or execute `supabase/review/push-capabilities.sql` in the correct project's SQL Editor. Provide only sanitized metadata output; never secret values. The query does not read Vault secrets, existing job commands or user data. Separately inspect the actual project plan's Cron/network limits. Existing hosted migration versions/names must be compared read-only before approving the new migration.

## Reproduce local database security tests

The harness never loads `.env` or connects to hosted Supabase. It starts a fresh local PostgreSQL18 cluster at127.0.0.1:55440, uses minimal synthetic Auth/storage scaffolding, executes actual relevant existing migrations, applies the candidate locally, runs tests and deletes its own temporary cluster. This is real PostgreSQL, not a complete Supabase deployment.

```bash
npm install --prefix /tmp/mapsilip-pg-test --cache /tmp/mapsilip-npm-cache --save-exact embedded-postgres@18.6.0-beta.19
MAPSILIP_EMBEDDED_POSTGRES_MODULE=/tmp/mapsilip-pg-test/node_modules/embedded-postgres/dist/index.js node scripts/push-isolated-tests.mjs
```

This test-only binary installation is outside the application package/lockfile. Do not replace the test target with a hosted connection string; the test enforces localhost and test ports. For normal checks: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, then `node scripts/push-client-scan.mjs`.

## Separate approvals and configuration still required

1. Confirm proposed category defaults before production activation. First enrollment visibly presents choices; no silent consent. Account master/categories apply across enrolled devices; browser permission and device revocation are separate.
2. Establish read-only hosted capability/migration evidence and review the new SQL candidate. Never expose `mapsilip_private`, broaden the security executor or reapply old migrations.
3. After **separate authorization**, apply only `20261105021728_mobile_push.sql` to the intended environment. Candidate creates no accounts, jobs or credentials; its private runtime gate starts false.
4. After **separate authorization**, securely generate/store a matching VAPID pair and random>=32-byte worker secret. Owner must approve a real contact URI; none was invented. Never print private values. Use these names only:
   - `MAPSILIP_PUSH_ENABLED=false` until final activation
   - `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY`
   - `WEB_PUSH_VAPID_PRIVATE_KEY`
   - `WEB_PUSH_VAPID_SUBJECT`
   - `MAPSILIP_PUSH_WORKER_SECRET`
   Existing Supabase/server-origin/auth/security variables remain required and unchanged.
5. After **separate authorization** and verified component availability, put the worker secret into Vault through its secure UI/API. Use a reviewed Cron job once/minute to asynchronously POST to the intended `/api/push/dispatch` with matching Bearer authorization. Store a Vault reference, not a literal secret, in the Cron command. Set HTTP timeout to cover the bounded Vercel worker and verify the actual plan supports its30s duration. No browser-tab trigger or fire-and-forget request substitutes for this scheduler.
6. The private `mapsilip_private.push_runtime.enabled` gate must be enabled by authorized administration **only in the approved validation environment**, alongside a separately authorized test execution of the server push gate. There is deliberately no public configuration RPC for this switch. Production gates remain false. A dependency-injected UI/unit mock does not prove real delivery.
7. Execute real Android and supported iPhone Home Screen background tests using designated accounts and explicitly authorized synthetic notices. Record manufacturer/model, exact OS/build, browser/full version, date, standalone state, results and evidence. Test closed app/locked screen, category/master changes across devices, logout/revocation, account switching and click isolation. Never change real tenant data to force an event.
8. Only after these checks pass obtain separate authorization for deployment/production activation. Do not implicitly enable staff/tenant auth flags; preserve their existing configuration.

Optional webhook wakeup and7-day bounded push-history cleanup remain separate reviewed operational work; no job is silently provisioned. Do not delete business notifications during push cleanup.

## Rollback

Disable `MAPSILIP_PUSH_ENABLED` and private runtime, pause any later-authorized Cron/webhook, and restore the prior verified application if necessary. Installation and in-app notifications must remain usable when push is disabled. Do not drop data tables, rewrite migrations or reset production. Already-accepted OS notifications cannot be instantly recalled; generic content limits exposure.

## Current recommendation

Local code is reviewable and the automated checks pass. **Do not enable production push or claim six-phase production acceptance complete.** Hosted access/configuration and physical Android/iPhone background delivery remain required. Installation can be reviewed independently while push remains disabled. No deployment was performed.
