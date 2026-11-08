## Production push activated — 2026-11-06

See PUSH_ACTIVATION_20261106.md for current status. Owner authorized staged provisioning/activation and later explicitly waived further testing. Reviewed candidate applied as hosted mobile_push20261106074954; VAPID/worker configuration and Vault secret stored; database/runtime and Production application gate enabled; once-per-minute dispatcher active. Vercel deployment dpl_E414gWvjFzzjNnSqdSPoJnYXQgzY is READY at mapsilip.vercel.app with the same verified176-file application source. Zero enabled subscriptions at activation. No device delivery test or synthetic notification was performed; unresolved quota/network/PostgREST evidence remains listed, not silently promoted to PASS. Historical blocked/off sections below describe earlier stages and are superseded only as to activation state, not their unverified evidence.

## Remaining evidence consolidated — 2026-11-06

See `PUSH_CONFIGURATION_EVIDENCE_REQUEST.md` for one narrowly scoped support/admin request covering effective PostgREST transaction/timeout settings, quotas and network policy. The request corrects the earlier unsupported grant-revocation proposal. All current owner authorizations/product decisions and the subsequent activation sequence are recorded there. No new hosted change was made. These management facts are unavailable through the current MCP tool set and cannot be inferred from null SQL settings or public ping results.

## Authorized activation work started — 2026-11-06

The owner authorized the staged migration/configuration/device-test/activation work, conditional on the previously agreed checks passing. Product defaults explicitly approved: Payments, Maintenance, Account/room updates and Visitors ON, Concerns OFF; master OFF until explicit per-user enrollment. Public VAPID contact explicitly approved: mailto:lupalogic@gmail.com. Owner confirmed availability to test both Android and supported iPhone devices. These facts do not count as delivery-test passes.

Fresh hosted checks confirm required auth.sessions/accounts/session_admissions column names/types and existing authority RPCs. Extensions remain installed; push runtime absent; Cron jobs0. Public read-only mapsilip_project_ping returned200/value1 through the actual Supabase Data API. GET probes with Prefer tx=rollback and tx=commit also returned200/value1 without Preference-Applied; the override requests were ignored in those probes. This does NOT prove default commit behavior or timeout hoisting. OpenAPI-root metadata requires a secret API key and was not accessed using privileged credentials. SQL current_setting for PostgREST version/transaction/hoisting was null in the administration connection, which does not establish service configuration.

Live exposed-schema probes also confirmed net and mapsilip_private are rejected by the Data API: both returned406/PGRST106 (Invalid schema). This independently corroborates the owner screenshot without reading tables.

Remaining pre-migration evidence: effective PostgREST commit/no-rollback-override policy and function statement-timeout hoisting; actual plan quotas/remaining usage and network policy. Current MCP tools expose database catalogs but not these management/account configurations. No new secret, Vault entry, scheduler, push migration, notification or activation was created during this verification. Do not infer those settings or waive the agreed gates. Next operational steps remain authorized once their requirements are established; physical tests require owner participation afterward.

## Vercel duration dashboard evidence — 2026-11-06

PASS project duration compatibility (owner-provided screenshots): MapSilip is on Vercel Hobby with Fluid Compute shown in Observability. Project Settings → Functions → Advanced Settings shows default maximum duration300seconds. No edit or Save action is required. The existing /api/push/dispatch route explicitly requests30seconds, and the reviewed generated functions-config-manifest records30seconds; that per-function override takes precedence over the300second default. The worker budget is25seconds, leaving5seconds within the configured route limit. This combines owner-provided current project settings and reviewed build evidence; it is not a long-running production dispatcher test or independent deployed function metadata read.

The prior missing project duration/compute-model evidence is resolved. No plan upgrade or redeployment is needed solely for this duration requirement. Current remaining Stage1 evidence: actual Supabase/Vercel remaining quotas/capacity, network/egress policy and PostgREST transaction/timeout-hoisting configuration. Direct-database-user trust was already explicitly confirmed; Data API exposed-schema evidence was supplied earlier. Push candidate, credentials, scheduling, physical delivery validation and activation remain subsequent separately controlled steps. No hosted setting was changed by recording these screenshots.

## Owner trust confirmation — 2026-11-06

PASS — owner explicitly replied “I confirm it” after the direct database credential trust requirement was presented. Recorded as confirmation that all reviewed direct database users, including mapsilip_security_executor and supabase_read_only_user, are trusted with queued push authorization headers. This accepts the documented Supabase pg_net trust boundary; it does not change permissions or make queued credentials unreadable to those users.

The earlier pending owner-trust entry is now resolved. Data API exclusion of net/private schemas remains supported by owner screenshot evidence. Actual hosted Vercel duration/quotas, network policy and PostgREST commit/timeout configuration remain unverified; this confirmation does not supply their values. No hosted migration, secret, scheduler or runtime activation was performed as part of recording this confirmation.

## Continued activation preflight — 2026-11-06

Additional hosted read-only verification completed:

- No public/graphql_public function body directly references net, http_request_queue or _http_response in the catalog scan. This is a direct-reference scan, not proof against transitive/dynamic SQL paths.
- mapsilip_security_executor has direct database LOGIN and effective net USAGE, queue SELECT and INSERT. supabase_read_only_user has LOGIN, BYPASSRLS, net USAGE and queue SELECT. These two identities require explicit owner trust review; a read-only database identity can still read a queued credential. No login attributes or grants were changed.
- Other direct-login roles observed: postgres, supabase_admin, authenticator, supabase_auth_admin, supabase_storage_admin, supabase_replication_admin, supabase_functions_admin, supabase_etl_admin and pgbouncer. Owner must review which people/services hold credentials; catalog metadata cannot establish that fact.
- Cron jobs0; pending HTTP queue rows0; no push runtime table. No dispatch, provider request or secret operation performed.
- Rechecked Vercel project/team metadata; these tools omit effective function duration, Fluid configuration and billing-plan fields. Absence is not evidence of incompatibility. Obtain current deployment /api/push/dispatch function details and account usage through the dashboard, as described below.

Owner-provided screenshot shows the Supabase organization FREE badge. That observation is not evidence of remaining quotas, selected compute capacity or network policy. Do not add a paid service or upgrade a plan without approval.

Continue toward activation only after: (1) owner confirms trust of the reviewed direct-login identities or an authorized supported alternative is reviewed; (2) actual effective Vercel duration is confirmed compatible with the25s worker; (3) plan/network and PostgREST commit/timeout evidence is obtained; then separately approve candidate application, credentials and scheduler, execute physical Android/iPhone tests, and approve production activation. A repeated instruction to continue does not answer the owner's explicitly pending trust review or establish unknown hosting facts.

## Owner-provided Data API evidence — 2026-11-06

PASS (owner-provided dashboard screenshot and explicit confirmation): selected Exposed schemas are `graphql_public` and `public` (2 of3 selectable schemas). `mapsilip_private` is unselected. `net` is not in the exposed list. This is dashboard evidence, not an independent Management API configuration read. No settings were changed by Codex. If the screenshot reflects unsaved edits, persisted configuration must still be confirmed; no Save action is requested unless the owner intentionally changed settings.

The screenshot also shows extra search path `public, extensions`, max rows1000, automatic pool sizing and automatic new-table exposure enabled. These are observations only. Extra search path is not the same as schema exposure. Keep candidate grants/revokes review mandatory when creating any later-authorized objects; no automatic-exposure setting was changed.

PENDING: the owner explicitly has not confirmed trust for every direct database login. Do not mark this accepted or waive it. Vault-held HTTP credentials can still be read from pg_net queues by database roles with direct access. Excluding net from the Data API closes the ordinary API exposure concern but does not establish direct-login trust or complete push readiness. Keep both gates off and do not create secrets/jobs or send notifications. Hosting limits, quotas and PostgREST transaction/timeout evidence also remain open as listed below.

## Correction: supported Supabase security boundary — 2026-11-06

Official Supabase guidance explicitly says per-project changes to managed pg_net grants/policies are unsupported. The previous recommendation to ask support to execute our grant-revocation script was incomplete and must not be treated as a supported deployment requirement. See https://supabase.com/kb/troubleshooting/revoking-access-to-pg_net-objects-has-no-effect-0bbc16 and https://supabase.com/kb/troubleshooting/database-roles-can-read-request-headers-queued-by-pg_net-ad6357 .

Supported evaluation instead requires net excluded from exposed Data API schemas and restricting direct database login to trusted services. Every direct database login must be trusted with queued HTTP authorization headers. Vault protects the secret at rest but does not hide decrypted queued headers from such database roles. Do not activate until the project owner reviews and accepts this precise trust boundary and actual exposure/login-role evidence passes. This is a platform constraint, not a defect that can be repaired through another revoke migration. No change to architecture, roles, credentials or Data API configuration is authorized by this correction.

The prepared administrator script is retained as historical review material, NOT a recommended supported action. Do not run it or delete previously recorded migration history. Support should instead confirm the supported boundary and current project configuration. Missing Data API, PostgREST, plan and function-limit evidence remains open.

## Latest authority verification — 2026-11-06

The connected postgres role is confirmed NOT a member of supabase_admin and cannot use its privileges. The net grant owner remains supabase_admin; anon HTTP EXECUTE remains true. Zero jobs/queue rows and no push runtime remain confirmed. No repeated ineffective hosted migration was run. Administrator transaction with preconditions and postcondition checks is prepared at `supabase/review/pg-net-admin-hardening.sql`; support-ready instructions are in `PUSH_ADMIN_REMEDIATION.md`. Neither was executed/sent. This authority requirement prevents completing all fixes through the current connection. The required action is managed-owner remediation, not another application redeploy or enabling push.

# Verification and permission remediation — 2026-11-06

**BLOCKED: push is not ready for activation. Verification found an unresolved pg_net permission issue.** This current result supersedes optimistic installation readiness statements below.

Verified through fresh hosted catalog queries:

- PASS: pg_cron1.6.4, pg_net0.20.4 and Vault0.3.1 installed, owned by supabase_admin.
- PASS: Cron jobs0, queued HTTP requests0, no push runtime table and no push candidate migration. No HTTP/provider request was sent.
- PASS: Vercel Production environment metadata contains no push/VAPID variables, no hidden Production variables; push remains false by default.
- PASS locally: generated functions-config-manifest lists /api/push/dispatch maxDuration30. NOT VERIFIED: effective hosted limit, actual plan quotas, network restrictions and PostgREST settings. Exposed MCP tools still do not provide those account-specific configuration facts; the exact dashboard evidence steps remain below.
- FAIL least privilege: net schema USAGE, queue/response SELECT and INSERT, and net function EXECUTE remain available to anon/authenticated through existing direct/PUBLIC grants. Queue and response tables have no RLS. API exposure is NOT VERIFIED, so this is not a claim of demonstrated anonymous internet access. It must be resolved before placing worker Authorization headers in the request queue.
- Cron schedule function EXECUTE appears true for ordinary roles, but cron schema USAGE is false, so function EXECUTE alone does not establish callable access. Do not broaden cron access.

The owner explicitly authorized a narrow pg_net permission migration. Hosted migration20261106000410_restrict_pg_net_api_role_access was recorded successfully, and its exact SQL is preserved locally. **Its intended security effect FAILED verification:** subsequent ACLs still show grants issued by supabase_admin and effective anon/authenticated access remains true. The connected postgres role is not a superuser; grants owned by supabase_admin were not removed by this operation. A successful migration response must not be treated as a successful permission fix. No retry with changed identities, ownership or credentials was attempted.

Required remediation: an authorized Supabase administrator/support-managed workflow must revoke the relevant PUBLIC/anon/authenticated net grants under the grant-owning identity, preserving postgres administration and the managed worker. Review the recorded SQL rather than blindly rerunning it under the same role. After remediation, require false for has_schema_privilege(role,'net','USAGE'), queue/response SELECT/INSERT and every net-function EXECUTE for anon/authenticated; require postgres access remains true. Check both direct ACLs and inherited PUBLIC grants. Recheck after extension upgrades. This additional administrator action remains pending; no further hosted write was attempted.

No Vault entry, worker/VAPID secret, Cron job, push table, push activation, business record mutation, Auth/environment setting change or deployment occurred. Only the two previously authorized extensions and this explicitly authorized (but ineffective) privilege migration were applied. Hosted migration history now includes both infrastructure records; preserve them and do not delete/repair their history. The original17 timestamp differences and verified SQL equivalence remain unchanged.

---

# Hosted readiness follow-up — 2026-11-06

The owner explicitly authorized enabling **only pg_cron and pg_net**. This section supersedes the installation/content-equivalence findings in the historical Stage1 report below. Push activation remains blocked pending the remaining hosting/configuration evidence.

| Item | Current result | Evidence |
|---|---|---|
| pg_cron | PASS installed | Version1.6.4, extension schema pg_catalog |
| pg_net | PASS installed | Version0.20.4, extension schema extensions; net.http_post exists |
| Cron jobs | PASS unchanged/empty | count(*)=0; no schedule or HTTP request created |
| Push candidate/runtime | PASS untouched | mobile_push absent from history; mapsilip_private.push_runtime absent |
|17 timestamp mismatches | PASS content equivalence; version parity remains different | Database-computed MD5 of stored SQL equals local raw SQL for all17 names. No statements or secrets were dumped. No repair, renaming or reapplication of old migrations. |
| Other4 earlier migrations | PASS content equivalence | Three raw SQL hashes equal; tenant_profiles differs only in surrounding whitespace, confirmed by matching trimmed SQL hashes. Digest comparison is an equality check, not a replacement for security review. |
| New infrastructure history | PASS recorded | Hosted version20261106000129, name enable_push_prerequisite_extensions; corresponding local file added after observing the generated hosted version. This migration enables only the two extensions; it does not contain the push candidate. |
| Effective Vercel duration | NOT VERIFIED hosted | Existing local generated functions-config-manifest confirms maxDuration30 for the route; provider effective configuration remains unavailable through exposed project/deployment tools. |
| Plan quotas, network, PostgREST | NOT VERIFIED | Previous report's exact dashboard/configuration evidence requirements remain open. No plan upgrade, network test or settings change was made. |

The supported managed extension installation succeeded using the connected project's DDL migration interface. Only the two CREATE EXTENSION statements were executed, plus their normal migration-history recording. Post-install SELECT verified versions, zero jobs and absence of push runtime. The corresponding local infrastructure migration preserves reproducibility; do not apply it again to this hosted project.

The repository now has23 migrations (21 earlier, unhosted push candidate, installed infrastructure migration); hosted history has22. The17 historical timestamp differences remain documented, with SQL equality established. Do not use an automatic bulk migration command that treats the old timestamps as unapplied changes.

**Remaining next steps:** obtain actual account quotas/compute/egress evidence, deployed function duration/region, effective Data API exposure and PostgREST commit/timeout-hoisting configuration. Review Cron/net/Vault least privilege before approving a scheduler. Extension availability alone does not prove secure scheduled delivery. Candidate application, VAPID/worker credentials, Vault entries, scheduling, delivery tests and activation still require separate authorization. Neither push gate was enabled, no business records/passwords/Auth/Vercel settings were changed, and no deployment occurred. The client-policy side quest remains on hold.

Installation references: https://supabase.com/docs/guides/cron/install and https://supabase.com/docs/guides/database/extensions/pg_net .

---

# Historical Stage1 audit (before extension authorization)

# MapSilip push: Stage 1 hosted readiness audit

Date: 2026-11-05. **Outcome: BLOCKED for provisioning/activation. The read-only audit report is complete; infrastructure readiness is not established.** No implementation redesign or remediation was attempted.

## Identity, scope and evidence

- **PASS:** Supabase MCP authenticated and returned `https://atuqxpiandeutimdkgag.supabase.co`, matching the intended project. SQL ran as `postgres` in database `postgres`, PostgreSQL17.11/aarch64. This role is not a superuser.
- **PASS:** Vercel project `mapsilip`, ID `prj_qFwAvgeXlE5v517HnJNtXnSPngOZ`, team `team_VjDiMpLXtsEz8SYTIoqHRx74`, slug `lupalogic-2108s-projects`. Production deployment `dpl_53FcUJvJTeY86Z8fjSwKc6RrZhYV` is READY and reports alias `mapsilip.vercel.app`.
- Read `PWA_PUSH_READINESS.md`, `PWA_PUSH_REMEDIATION.md`, the candidate migration and existing authorization paths. Older readiness documents describe pre-deployment status; `PRODUCTION_DEPLOYMENT_RESULT_20261105.md` records the later application deployment. Their earlier test counts are historical, not checks repeated in this audit.
- Executed all four SELECT statements in `supabase/review/push-capabilities.sql` separately because this MCP SQL interface returns only the final result of a multi-statement request. Additional catalog-only SELECTs inspected ACLs, ownership, policy metadata, narrowly allowlisted settings and aggregate capacity. No business rows, Vault contents, job commands, passwords, tokens or keys were selected.
- Evidence: `docs/superpowers/evidence/push-hosted-stage1-20261105/hosted-audit-evidence.json`. This folder is ignored by Git and needs separate backup.

## Migration comparison

**FAIL exact migration-version parity:** repository22 SQL migrations, hosted21; four exact version/name matches,17 matching names with different version timestamps. There are no extra hosted names and no missing earlier migration names. The sole local-only name is the unhosted `mobile_push` candidate. Matching names do not establish equal SQL contents. The17 timestamp differences are both missing local versions and extra hosted versions under a strict version-based comparison; they must not be described as17 unapplied feature migrations.

Migration-history table owner: `postgres`. Historical execution identities and equivalence of stored SQL versus local SQL are **NOT VERIFIED**. Do not run automatic `db push`, repair history, reapply old files, or rewrite repository timestamps. A separately reviewed reconciliation decision is needed before any hosted migration application.

| Name | Repository version | Hosted version | Result |
|---|---|---|---|
| staff_authorization | 20261025081017 | 20261025081017 | PASS |
| staff_security_probes | 20261025081034 | 20261025081034 | PASS |
| tenant_profiles | 20261026123837 | 20261026123837 | PASS |
| operational_core | 20261026150000 | 20261026142702 | FAIL exact version match |
| operational_access | 20261026150010 | 20261026142706 | FAIL exact version match |
| operational_commands | 20261026150020 | 20261026142710 | FAIL exact version match |
| operational_dashboard | 20261026150030 | 20261026143453 | FAIL exact version match |
| project_ping | 20261026150040 | 20261026143749 | FAIL exact version match |
| tenant_role_exclusivity | 20261026150050 | 20261026144255 | FAIL exact version match |
| visit_notifications | 20261026150060 | 20261026151701 | FAIL exact version match |
| payment_retry | 20261026150070 | 20261026151711 | FAIL exact version match |
| invitation_renewal | 20261026150080 | 20261026151830 | FAIL exact version match |
| currency_safe_dashboard | 20261026150090 | 20261026151935 | FAIL exact version match |
| payment_status_summary | 20261026150100 | 20261027012036 | FAIL exact version match |
| payment_monthly_summary | 20261026150110 | 20261027012907 | FAIL exact version match |
| visit_times | 20261026150120 | 20261027013354 | FAIL exact version match |
| concern_categories | 20261026150130 | 20261027013627 | FAIL exact version match |
| tenant_approval_and_room_assignment | 20261027120000 | 20261029033219 | FAIL exact version match |
| room_context | 20261029120000 | 20261029033228 | FAIL exact version match |
| tenant_directory | 20261029130000 | 20261029033236 | FAIL exact version match |
| storage_authenticated_reads | 20261029150716 | 20261029150716 | PASS |
| mobile_push | 20261105021728 | absent | NOT APPLIED (candidate) |

## Capability and privilege matrix

| Check | Result | Hosted evidence and requirement |
|---|---|---|
| Candidate objects | PASS absent | No push tables or push functions were found. Candidate history entry absent. This establishes no hosted push runtime row exists to enable; it does not verify a false row in an applied schema. |
| Migration target schemas | PASS existing | `mapsilip_private` and `supabase_migrations` owned by postgres; public owned by pg_database_owner. Audit postgres has USAGE/CREATE on those schemas. |
| Existing private table ACLs | PASS sampled catalog scope | accounts, session_admissions, auth_attempts, signin_rate_limits, security_events have RLS and postgres-only direct ACLs. No API table grants shown. |
| Legacy email_events | NOT VERIFIED security completeness | Private postgres-only ACL, RLS false. No exposure demonstrated; private schema exposure must still be checked. Defense-in-depth gap predates push. No table contents read or change made. |
| Ordinary notifications | PASS catalog security | public.notifications owned by postgres, RLS enabled; authenticated SELECT, service_role table privileges. Recipient SELECT policy checks auth.uid plus current eligibility. This is metadata inspection, not a new live isolation test. |
| Existing authority RPCs | PASS inspected functions | mapsilip_dashboard and mapsilip_staff_access_snapshot: postgres owner, SECURITY INVOKER, empty search_path, EXECUTE only postgres/authenticated. |
| Private schema access | PASS ACL observed; exposure NOT VERIFIED | authenticated has USAGE for existing authority helpers; anon and service_role have no USAGE. USAGE alone grants no table access. Do not remove existing helper access or expose private schema to support push. |
| Candidate tables/functions | PASS static design; hosted NOT VERIFIED | Candidate lines52–59 enable RLS and revoke direct table privileges. Narrow public enrollment/preferences wrappers grant authenticated EXECUTE (100–110,246–253); worker functions grant service_role only (392–398). Definer functions have empty search_path; worker functions specify2s statement and1s lock deadlines. Candidate is not installed, so its effective hosted owner/default grants remain unverified. |
| pg_cron | BLOCKED | Available1.6.4; not installed. cron schema and schedule functions absent. Settings mentioning Cron do not mean extension is installed. |
| pg_net | BLOCKED | Available0.20.4; not installed. net schema/http_post absent. No outbound request was executed. |
| Vault | PASS installed, partial privilege readiness | supabase_vault0.3.1 installed. Schema owned by supabase_admin. Audit postgres has USAGE, no CREATE, and EXECUTE on create_secret/update_secret. No function was invoked. |
| Vault read protection | PASS checked ACLs | postgres can SELECT decrypted view; anon/authenticated cannot. Service role has Vault schema USAGE; broader service-role/other-role Vault ACL review remains required before approving a scheduler principal. No secret rows or names read. |
| Extension provisioning privileges | NOT VERIFIED | Listed extensions are untrusted and require superuser in extension metadata; postgres audit role is not superuser. Supabase may provide a managed installation path, which was not invoked or proven. Do not infer either denial or successful installability solely from these flags. |
| Secure scheduled HTTP invocation | BLOCKED | Vault access supports the planned direction, but missing Cron and pg_net prevent scheduling now. Future scheduler identity must be able to read only the intended secret, invoke HTTPS POST and avoid exposing authorization in job definitions or operational logs. No existing job command or HTTP queue was inspected. |

## PostgREST, ownership and RLS gates

**NOT VERIFIED:** actual exposed schemas, PostgREST version, transaction-end policy and transaction override policy, and hoisting of per-function timeout settings. No allowlisted pgrst settings appeared in queried role or database-role configurations. Absence from catalogs does not establish the service configuration/defaults.

Observed role timeouts: anon3s; authenticated8s; authenticator statement8s and lock8s. Audit-role statement timeout120s, lock timeout0. These are different execution contexts. Worker RPC2s settings in the candidate need actual PostgREST hoisting support; do not treat a function-local SET as proof that the outer RPC statement will be interrupted within2s.

The failed-mutation quota design requires committed RPC transactions and no caller-controlled rollback override. Confirm effective `db-tx-end=commit` without an allowed rollback override (and any version-specific equivalent). Keep `mapsilip_private` outside exposed schemas. Public wrappers are the intended API; private tables do not need exposure.

**Next read-only evidence:** Supabase project → Integrations → Data API → exposed schemas; project Database/API settings or provider-supported read-only configuration metadata for PostgREST version, db-tx-end and db-hoisted-tx-settings. Record only those settings. If dashboard does not display them, obtain the narrowly scoped configuration facts from Supabase support/admin documentation for this actual project. Do not retrieve JWT secrets or broad configuration dumps.

## Actual capacity, quotas and execution limits

| Item | Result | Observed value / remaining evidence |
|---|---|---|
| PostgreSQL capacity snapshot | PASS observation | database13,711,027bytes; max_connections60;16 connections,1 active at audit instant. Not a sustained-load test or project allocation guarantee. |
| Cron settings | PASS observation only | cron.max_running_jobs32, use_background_workers off. Extension absent; no enabled scheduler capacity established. |
| pg_net settings | PASS observation only | batch_size200, ttl6hours. Extension absent; not an active throughput or request timeout measurement. |
| Supabase subscription and quotas | NOT VERIFIED | MCP exposes project database tools, not organization billing/compute allocation. Actual plan name, compute tier/RAM/CPU, disk quota/headroom, egress allowance/remaining usage, pooler allocation and spend restrictions were not available. No free/pro plan inferred from connection count. |
| Network and egress | NOT VERIFIED | Database-origin HTTPS access to mapsilip.vercel.app, Vercel protection/WAF restrictions for scheduler traffic and Vercel provider egress to accepted push hosts were not tested. No HTTP dispatch/provider call made. |
| Vercel route budget | PASS source | app/api/push/dispatch/route.ts:6 declares maxDuration30s; delivery.ts:40 starts25s overall deadline. Locally compatible5s margin, RPC2s/provider5s/deadline/release bounds retained. |
| Effective deployed Vercel limit | NOT VERIFIED | Available project/deployment tools report Node26.x/READY but omit effective per-function duration and Fluid Compute/plan allocation. Team response exposes identity but no billing plan. Successful build is not proof of a30s effective limit. Do not test by invoking the dispatcher or intentionally timing out a function. |
| Deployment region | PASS observation | Current deployment API reports iad1, while repository vercel.json requests hnd1. Record actual function region in dashboard; no setting changed. This is a latency/capacity verification gap, not evidence of a failed push delivery. |
| Planned scheduler volume | PASS arithmetic, quota fit NOT VERIFIED | Once/minute means1,440 invocations/day and43,200 per30-day month. Up to20 resulting deliveries per run gives at most28,800 daily attempt slots before retries/expiration, not guaranteed successful deliveries or20 notifications' unlimited fanout. Match actual usage/billing allowances before approval. |

Official guidance supports pg_cron-based scheduling and configured Vercel maxDuration, but cannot establish this account's entitlements. Sources: [Supabase Cron](https://supabase.com/docs/guides/cron), [pg_net maintained by Supabase](https://github.com/supabase/pg_net), [Vercel duration](https://vercel.com/docs/functions/configuring-functions/duration), [Vercel limits](https://vercel.com/docs/functions/limitations). No paid service or alternative architecture is proposed.

## Push-off verification

**PASS:** Production environment names queried without decryption: no MAPSILIP_PUSH_ENABLED, VAPID variables or MAPSILIP_PUSH_WORKER_SECRET; hiddenProductionEnvCount0. Existing config requires exact `true` plus credentials, so missing configuration remains disabled. No hosted candidate runtime table or functions exist. Neither gate was enabled. No dispatch endpoint was called, no notification delivered and no credential existence/value was queried from Vault.

## Exact remaining read-only actions

1. Migration content reconciliation: in project SQL Editor at `https://supabase.com/dashboard/project/atuqxpiandeutimdkgag/sql/new`, run only `select version,name from supabase_migrations.schema_migrations order by version;` to reproduce history. The completed audit already obtained these values. Compare names/versions against the table above. If content equality is required, review the17 matching-name SQL definitions/stored migration statements under controlled access; migration bodies can contain unrelated sensitive material and were deliberately not dumped here. No repair/reapply action is authorized.
2. Capabilities: reproduce existing SELECTs from `supabase/review/push-capabilities.sql` in that SQL Editor. They select catalog metadata only; never execute the candidate for auditing. Inspect Database → Extensions for installation availability, without enabling anything. Record which managed role/workflow can install pg_cron/pg_net.
3. PostgREST: record Data API exposed schemas and narrowly scoped transaction/timeout/version settings described above. Private-schema USAGE is not proof of Data API exposure.
4. Supabase Dashboard → organization Billing/Subscription and Usage; project Settings → Compute and Disk, Database/Connection pooling, and Network Restrictions. Record plan, limits, remaining usage and network policy only; never copy connection strings/passwords. If a screen is unavailable, mark the permission missing. Project ref is fixed above; no other account should be used to bypass it.
5. Vercel → lupalogic-2108s-projects/mapsilip → current Production deployment → Functions → /api/push/dispatch details. Record effective maximum duration, runtime, region and memory. Project Settings → Functions: record Fluid Compute and duration settings. Team Settings → Billing/Usage: record plan and available invocation/compute/egress budget. Required result: the deployed route actually permits30s (or another explicitly reviewed limit compatible with25s worker plus overhead), with capacity for the planned schedule. Do not edit a setting to obtain a passing result.
6. Review scheduler least privilege and HTTP timeout policy on paper. A later-authorized pg_net request needs a timeout exceeding the bounded worker plus network overhead; do not assume its default covers25s. Verify Authorization and endpoint data cannot be read through exposed Cron/queue tables by ordinary API users. Live network acceptance remains a separate authorized test, not a SELECT-only audit result.

## Required approvals after Stage 1

- Resolve/approve migration-history treatment and content equivalence; no historical SQL rewrite or automatic repair.
- Explicitly approve any missing extension enablement and the single candidate application only after remaining security/hosting evidence passes. If candidate appears in history later, stop and reassess; never reapply.
- Separately approve VAPID/contact and worker secret creation/storage, Vault least privilege and scheduler provisioning. No credentials were created in this audit.
- Confirm proposed category defaults with the product owner before activation.
- Separately authorize validation environment/gate activation and synthetic test delivery; physical Android/iPhone acceptance must record exact model/OS/browser versions, background receipt, account switching and click isolation.
- Obtain explicit final production push activation authorization. This Stage1 request authorizes none of these writes.

## Preservation and final status

The audit found real missing prerequisites (Cron/pg_net not installed) and a real history mismatch (17 timestamps), while plan/network/PostgREST/effective function limits remain unverified. **Do not proceed to migration, secrets, scheduling, delivery or activation.**

No hosted resources, credentials, business records, environment variables, Auth settings, deployment settings, runtime gates, existing migration SQL or application files were changed. No tests/build/deployment/Git commit/push were run for this report. Only this local report and sanitized local audit evidence were created. The client-policy side quest remains on hold and no business-rule implementation was started.
