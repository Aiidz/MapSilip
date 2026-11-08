# MapSilip push — local remediation results, 2026-11-05

Local remediation of the six audited findings is complete and verified below. **No deployment or hosted change was performed.** This report supersedes the earlier static audit findings for the corrected local code, not the outstanding hosted/physical acceptance gates.

## 1. Subscription errors cannot disable global push — PASS locally

**Original:** any endpoint401/403 was classified as a global configuration failure; SQL disabled push for everyone.

**Correction:**401/403 now classify as `invalid_subscription`. Only that subscription and current delivery are quarantined. Other queued deliveries are evaluated/discarded through bounded checks; there is no unbounded per-endpoint UPDATE and no worker UPDATE of `push_runtime`. Missing, malformed or mismatched global VAPID configuration fails preflight before any claim, without disabling subscriptions. Transient network/429/5xx failures retain bounded retries.

**Changed sources:** [policy.ts:1](/home/keita/Projects/MapSilip/app/lib/backend/push/policy.ts:1), [vapid.ts:4](/home/keita/Projects/MapSilip/app/lib/backend/push/vapid.ts:4), [delivery.ts:43](/home/keita/Projects/MapSilip/app/lib/backend/push/delivery.ts:43), [candidate:355](/home/keita/Projects/MapSilip/supabase/migrations/20261105021728_mobile_push.sql:355) (quarantine branch365–369).

**Regressions:** [dispatcher test:27](/home/keita/Projects/MapSilip/tests/push-worker-remediation.test.mjs:27) verifies one malicious403 while three other deliveries succeed; [database test:43](/home/keita/Projects/MapSilip/tests/push-remediation-database.test.mjs:43) verifies endpoint isolation and global availability; [bounded quarantine test:189](/home/keita/Projects/MapSilip/tests/push-remediation-database.test.mjs:189) verifies only one queued delivery is updated; [configuration test:32](/home/keita/Projects/MapSilip/tests/push-worker-remediation.test.mjs:32) verifies no claim/provider call for invalid configuration. All PASS.

**NOT VERIFIED:** actual APNs/FCM delivery and response behavior. Endpoint authorization failure is deliberately not sufficient evidence of a global configuration problem.

## 2. Unchanged enrollment is idempotent — PASS locally

**Original:** every reconciliation rotated generation, invalidating queued work even when nothing changed.

**Correction:** identical user/session/security revision/endpoint/keys and enabled state preserve generation and binding age; only last-seen metadata updates. Real owner/session/key changes, replacement and revocation fence stale deliveries. A separate binding timestamp prevents newly rebound accounts/devices joining older fanout.

**Changed source:** [candidate:172](/home/keita/Projects/MapSilip/supabase/migrations/20261105021728_mobile_push.sql:172), especially comparison/update at205–216, binding timestamp at17 and bounded fanout at309.

**Regression:** [database test:23](/home/keita/Projects/MapSilip/tests/push-remediation-database.test.mjs:23) checks generation equality, queued delivery survival, key replacement, endpoint replacement and revocation. PASS.

**Remaining limit:** a push already accepted by an OS service cannot be recalled immediately.

## 3. Failed mutations consume quota — PASS locally

**Original:** SQL exceptions rolled back quota increments; server validation or authority failures could avoid the mutation RPC entirely.

**Correction:** quota charging occurs in the outer transaction. Authorization, validation and mutation run in a nested exception block; failures return a controlled `push_error` envelope, so quota commits while mutation changes roll back. Counters saturate at maximum+1 and serialize concurrent attempts atomically. Next.js maps envelopes back to the existing public error/status behavior.

Failures rejected during server parsing/authority checks use a separate, bounded accounting RPC on the caller's verified JWT identity. Requests reaching a mutation RPC are not counted twice. The new accounting entry point cannot choose another user or arbitrary quota kind. Anonymous/invalid JWTs have no identifiable account quota: no anonymous execution grant was added, and the original401 is preserved. Untrusted-origin requests remain rejected before accounting to avoid cross-site quota depletion.

**Changed sources:** [candidate:78](/home/keita/Projects/MapSilip/supabase/migrations/20261105021728_mobile_push.sql:78) (rate/attempt/accounting), [candidate:152](/home/keita/Projects/MapSilip/supabase/migrations/20261105021728_mobile_push.sql:152) (mutation envelopes), [repository.ts:9](/home/keita/Projects/MapSilip/app/lib/backend/push/repository.ts:9), [subscription API:9](/home/keita/Projects/MapSilip/app/api/push/subscription/route.ts:9), [preferences API:13](/home/keita/Projects/MapSilip/app/api/push/preferences/route.ts:13).

**Regressions:** [database test:58](/home/keita/Projects/MapSilip/tests/push-remediation-database.test.mjs:58) and [concurrent test:87](/home/keita/Projects/MapSilip/tests/push-remediation-database.test.mjs:87) cover invalid, conflicting and unauthorized attempts, including25 concurrent requests per scenario. [HTTP/accounting tests:4](/home/keita/Projects/MapSilip/tests/push-rate-accounting.test.mjs:4) cover parser failures, no double-counting, authority rejection and anonymous401 preservation. All PASS.

**Hosted prerequisite — NOT VERIFIED:** PostgREST must commit these RPC transactions and disallow caller-controlled rollback overrides. Explicit transaction rollback, a database crash or failure before a commit cannot be made durable by an ordinary function in that same transaction. Anonymous authentication abuse remains an Auth/ingress concern; this fix does not weaken authentication or create a global anonymous quota.

## 4. Complete worker budget and bounded fanout — PASS locally

**Original:** provider calls had deadlines, database calls did not; the worker budget started after claim; expanding20 notices could insert unbounded device fanout.

**Correction:**
- 25s overall deadline starts before preflight/claim, below the route's unchanged30s limit.
- Each RPC has a2s abort/race deadline, including claim, check, finish and release. Provider requests have a propagated5s abort deadline.
- 2.5s is reserved for one fenced batch release; a new group requires9s for check/send/finish. At most4 providers run concurrently.
- Claim inspects at most20 subscription rows across at most20 outboxes per invocation, then claims at most20 deliveries. A UUID cursor and indexed user/cursor lookup resume remaining devices in later invocations.
- Worker RPCs specify statement_timeout2s and lock_timeout1s without changing role-wide database configuration.
- Unprocessed claims are released together. Known-unsent reserved attempts are refunded exactly once under the matching claim token. Sent/uncertain attempts are not refunded. If release fails or a claim response is lost, the60s lease remains reclaimable.

**Changed sources:** [delivery.ts:37](/home/keita/Projects/MapSilip/app/lib/backend/push/delivery.ts:37), [budget.ts:2](/home/keita/Projects/MapSilip/app/lib/backend/push/budget.ts:2), [candidate:295](/home/keita/Projects/MapSilip/supabase/migrations/20261105021728_mobile_push.sql:295) (claim/cursor), [candidate:379](/home/keita/Projects/MapSilip/supabase/migrations/20261105021728_mobile_push.sql:379) (release/refund), reservation marker at45/349.

**Regressions:** [45-device fanout test:68](/home/keita/Projects/MapSilip/tests/push-remediation-database.test.mjs:68) observes20/20/5 deliveries; [unsent reservation test:172](/home/keita/Projects/MapSilip/tests/push-remediation-database.test.mjs:172) proves six unsent deferrals do not exhaust attempts and stale/sent claims cannot refund; [database timeout test:206](/home/keita/Projects/MapSilip/tests/push-remediation-database.test.mjs:206) checks function settings and a real blocked row abort; [worker tests](/home/keita/Projects/MapSilip/tests/push-worker-remediation.test.mjs:36) hang claim/check/finish, observe abort and recoverable release; [budget tests](/home/keita/Projects/MapSilip/tests/push-budget.test.mjs:8) check ignored cancellation. All PASS.

**Hosted prerequisite — NOT VERIFIED:** actual PostgREST must hoist the per-function statement_timeout before the query, as supported in PostgREST12.2+. Merely setting statement_timeout inside a raw SQL function call is not proof of a whole-statement deadline. Hosted execution limits, transaction settings and real workload still require approved verification. Client deadlines remain active independently. No paid service or infrastructure was added.

## 5. Pause/resume preserves valid work — PASS locally

**Original:** checking a valid leased delivery while paused permanently discarded it.

**Correction:** valid unexpired work becomes pending with a30s defer and cleared lease/token; it can resume. Revoked sessions/subscriptions, obsolete generations, disabled preferences, read/expired notices and exhausted real/uncertain attempts remain terminal. Configuration deferral does not flip global availability. Provider403 permanently quarantines only its own endpoint.

**Changed source:** [candidate:327](/home/keita/Projects/MapSilip/supabase/migrations/20261105021728_mobile_push.sql:327), pause branch345–347 and finish deferral370–371.

**Regression:** [concurrent pause/resume test:143](/home/keita/Projects/MapSilip/tests/push-remediation-database.test.mjs:143) executes simultaneous claimers, pause, configuration deferral, expired lease recovery, stale finish rejection, resume and permanent invalidation. PASS.

**Remaining limit:** delivery remains at-least-once. A crash or failed release can leave an uncertain attempt charged; OS acceptance and a lost acknowledgement can cause a duplicate, suppressed through the existing notification tag. This differs from ordinary known-unsent deferral, which now refunds its reservation.

## 6. Installation capability ownership is serialized — PASS locally

**Original:** non-unique capability index and endpoint-only serialization did not enforce one active binding across different endpoints/accounts.

**Correction:** a per-capability transaction advisory lock serializes enrollment/revocation, alongside a unique partial index enforcing one enabled binding per installation hash. Endpoint ownership checks and generation fencing remain. Different installation capabilities still support legitimate multiple devices.

**Changed source:** [candidate:25](/home/keita/Projects/MapSilip/supabase/migrations/20261105021728_mobile_push.sql:25), enrollment capability lock184, revoke capability lock235.

**Regression:** [concurrency test:104](/home/keita/Projects/MapSilip/tests/push-remediation-database.test.mjs:104) covers different accounts/endpoints, different accounts sharing an endpoint, same-account different sessions, and simultaneous switching with old queued work. Test barriers force real contention; active ownership remains unique and stale work is rejected. A separate isolated control with the lock/index removed reproduced two active owners and failed the test. Correct candidate PASS.

**NOT VERIFIED:** physical shared-phone account switching and hosted PostgREST integration.

## Fresh verification results

| Command | Result |
|---|---|
| `npm test` |250 tests:238 PASS,0 FAIL,12 explicit isolated-database skips |
| `MAPSILIP_EMBEDDED_POSTGRES_MODULE=/tmp/mapsilip-pg-test/node_modules/embedded-postgres/dist/index.js node scripts/push-isolated-tests.mjs` |12 PASS,0 FAIL,0 skipped, fresh isolated PostgreSQL18 |
| `npm run typecheck` |PASS |
| `npm run lint` |0 errors; one existing RoomContextPanel unnecessary role-dependency warning |
| `npm run build` |PASS; build only, not deployment |
| `node scripts/push-client-scan.mjs` |PASS:31 client artifacts,2 configured private values checked; no server-only push identifiers |

The isolated runner checks the actual database runtime row is false before and after tests. Tests mock availability only in `tests/fixtures/push-test-availability.sql`; the production candidate has no test bypass. The normal suite skips DB cases by design; the isolated runner executes every skipped case. Existing authority/access migrations are exercised with synthetic Auth/storage scaffolding, not a complete hosted Supabase environment.

A fresh read-only reviewer checked the six fixes and the follow-up reservation/quarantine/authentication corrections. No remaining important local regression was identified in those paths. Full source and results remain locally reviewable; no Git commits or pushes were made.

## Migration compatibility and remaining gates

- Repository contains21 earlier migrations plus this candidate, all unique/in order. Only the authorized unhosted `20261105021728_mobile_push.sql` was modified; old migration SQL was preserved. The candidate remains transactional and adds no hosted extension, job, account or secret.
- Private tables retain RLS and no direct API-role grants. Public user RPCs remain authenticated-only; claim/check/finish/release remain service_role-only. All functions use empty search_path. No existing security-executor privilege expansion.
- Before any hosted application, obtain read-only version/name history, ownership/ACL/schema exposure evidence and actual PostgREST transaction/timeout configuration. If this candidate unexpectedly already exists in hosted history, do not reapply or overwrite it; stop for a separately versioned migration decision.
- Cron, pg_net, Vault, actual project quotas, Vercel effective limits and scheduling access remain NOT VERIFIED. No hosted audit was attempted during this remediation.
- Category defaults still need product-owner approval. Real Android and supported iPhone Home Screen background delivery, click routing and account switching remain NOT VERIFIED.

## Deployment recommendation and authorization boundary

**The six local findings are remediated. The application can proceed to deployment review with push disabled.** Installation is independent and no push migration is required merely to deploy the disabled push code. This is not authorization to deploy, nor a claim that live push is ready.

To activate push later, the hosted evidence, separately approved configuration/migration/scheduling, and physical-device acceptance are still required. These cannot be substituted with local green tests. Do not enable either gate prematurely.

No hosted Supabase SQL, production/staging data operations, hosted credentials/Vault/extensions/Cron changes, Vercel configuration changes, deployment or GitHub push occurred. No existing application credentials were changed. `MAPSILIP_PUSH_ENABLED` remains false-by-default and was not enabled; the actual isolated `push_runtime.enabled` row stayed false. No `.gitignore` or unrelated feature changes were made. Only ephemeral synthetic local database credentials/records were used for isolated testing.
