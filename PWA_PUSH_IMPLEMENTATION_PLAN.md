# MapSilip Mobile PWA and Push Implementation Plan

> **For the implementation agent:** Use the executing-plans skill to work through the checkboxes sequentially. This is a handoff for a lower model; do not delegate unless the owner requests it. Read this complete document before editing. This document is a plan, not authorization to deploy, modify hosted settings, or apply migrations.

**Goal:** Offer installation after login on phones, support Android and iPhone, and deliver opted-in important notifications while the application is closed.

**Architecture:** Keep the existing in-app notification system as the source of truth. Add a small native service worker, a shared authenticated onboarding component, private subscription/preferences tables, and a durable push outbox driven by existing notification inserts. Send encrypted Web Push from a bounded server-only worker using VAPID; do not add an application email provider.

**Tech stack:** Existing Next.js App Router, React, TypeScript, Supabase/Postgres, native browser APIs, Node `web-push`. No PWA framework or additional animation library.

**Revision:** Review clarifications incorporated; planning only. The pasted reviewer’s implementation suggestion does not change this handoff into permission to implement or deploy.

**Spec:** The confirmed requirements and explicit proposed defaults below constitute the implementation specification. Date: 2026-11-04.

## Approval status

The owner approves this plan as the technical direction, including the final clarifications below. **Implementation has not been authorized.** Wait for an explicit implementation instruction. Keep push enrollment, subscription management and delivery disabled throughout development; PWA installation remains independently available and testable. Approval of this document does not authorize hosted migrations, hosted credential creation, hosted scheduling, deployment, production activation, paid services or alternative infrastructure. Preserve all existing security, authentication, role-routing, performance and deployment restrictions.

## 1. Confirmed requirements and boundaries

- Installation invitation appears **after login**, for owner, caretaker, and tenant, **on phones only**. Installation, its invitation, the manifest, service-worker registration and offline testing must not depend on `MAPSILIP_PUSH_ENABLED` or push infrastructure. That flag gates only push enrollment, subscription management and delivery. Browser notification permission remains strictly opt-in.
- Android and iOS must both have supported installation instructions and push paths. Do not promise equal browser capabilities.
- Send **important selected categories**, rather than every in-app notification.
- Notification master/category preferences are **account-wide across all enrolled devices**, not per-device. Subscription enrollment and browser permission remain device-specific.
- Ask notification permission through an explicit button, never automatically on page load.
- Preserve current UI, fluid motion, performance, authentication, roles, RLS, backend business behavior, and in-app notifications.
- Location is for a future attendance feature. **This implementation must not request geolocation**, store coordinates, or add attendance logic. Later attendance should request location at the relevant time-in/time-out action.
- No Resend, SMTP, SendGrid, Mailgun, custom email, or paid notification vendor. Supabase Auth recovery stays unchanged. Browser/OS push services remain necessary for standards-based Web Push.
- No deployment, production database mutation, production synthetic fixtures, credential creation in hosted services, or hosted scheduling/configuration changes without subsequent authorization.
- Never edit `.gitignore`, existing migrations, real records, certificate configuration, or unrelated features. Preserve uncommitted work.

### Proposed product defaults — not individually approved by the owner

These are concrete recommendations for review, not a claim that the owner already selected each category. They can be implemented behind the disabled feature flag, but must be reviewed before enabling production push.

| Preference | Default after explicit Enable notifications | Events |
|---|---|---|
| Payments | On | New invoice, payment proof submitted to owner, payment approved/rejected to tenant |
| Maintenance | On | New maintenance request to authorized staff; request status updates to its tenant |
| Account and room updates | On | New tenant request to owner; room assignment to tenant; room preparation to caretaker; approval/rejection only for recipients already eligible and subscribed |
| Visitors | On | Planned/cancelled visits to their existing authorized staff recipients |
| Concerns | Off | Existing concern notices, if user explicitly opts into this category |

Other defaults: invitation cooldown **7 days** after Not now; phones use compact width **<=767 CSS px** plus mobile/coarse-pointer signals; push expires **1 hour** after the original notice; generic lock-screen content; no scheduled due-date reminders. Settings expose all five category toggles and a master switch. Master starts off; category defaults never constitute permission to send before opt-in.

**Exact first-enrollment interaction:** show all five named category checkboxes and their descriptions before the permission button, using the table defaults visibly. Include **Select all categories** (which also checks Concerns) and **Clear selection**. Label the confirmation **Enable selected notifications**; disable it when none is selected. Include **Not now**. Never interpret opening this screen, installing, Select all, or granting browser permission alone as app enrollment. On confirmation capture the displayed selection, request browser permission directly in that click, then register the first subscription and atomically initialize previously uninitialized account preferences to enabled=true plus that exact displayed selection. This initialization is permitted only when no prior enrollment has initialized the account preferences. If enrollment fails, keep server master off and show a retry action. For a previously granted browser permission, the same confirmation still supplies explicit app consent. Subsequent preference edits save explicitly with **Save preferences**, and turning master off takes effect server-side immediately for every enrolled device on that account. Show this exact explanatory text beside the master/category controls: **“These notification preferences apply to your account on all enrolled devices. Changing them here also changes what your other devices receive. Browser permission and installation are managed separately on each device.”** Provide a separate **Disable notifications on this device** action that revokes only the current installation binding; it must not turn off the account-wide master or alter account categories.

On the first enrolled device only, show the proposed category defaults and initialize preferences after explicit consent. On each additional device, retrieve authoritative saved account preferences from the server and display them read-only during enrollment. If master is on, use **Enable on this device**. Additional-device enrollment must neither submit replacement preferences nor update them, even if another device changes them while enrollment is in flight. Only an explicit **Save preferences** action may change already-initialized account preferences, including master off→on. If master is off, explain “Notifications are off for your account. Save your preferences to enable them across enrolled devices.” Enrollment may bind this device but must leave master off and explain that no push will be sent until that explicit save. Never silently reactivate a disabled master on resume or enrollment. Existing device permission does not imply account-wide consent.

Distinguish uninitialized account preferences from an existing disabled account using nullable `initialized_at`; GET must not initialize preferences. Initial enrollment must atomically lock/check that state and persist preferences once, with the subscription, in one transaction. If two first enrollments race, exactly one initializes: the other receives409 `preferences_already_initialized`, fetches the current authoritative preferences and retries as additional-device enrollment without sending preference values. Never resolve this conflict by overwriting. Return saved account preferences in enrollment responses. Opening settings refreshes them without polling. Preserve **Disable notifications on this device**, which changes only that device binding. Do not show an ambiguous “Enable all” button that silently excludes Concerns.

Descriptions: Payments — “Invoices and payment updates”; Maintenance — “Repair requests and updates”; Account and room updates — “Account and room updates for your role”; Visitors — “Planned and cancelled visits”; Concerns — “Concern and suggestion updates”. Do not promise preapproval applicant push in this copy.

Do not invent an emergency priority, SMS fallback, announcement system, due-date scheduler, or new business notification. An unknown event key must produce no push until explicitly classified.

## 2. Existing integration points (verify before editing)

| Existing file | Relevant behavior |
|---|---|
| `public/manifest.webmanifest` | Existing manifest and icons; current start URL is `/tenant`, which must become `/` for all roles |
| `app/layout.tsx` | Existing manifest, viewport, theme color, Apple touch icon metadata |
| `app/components/AppShell.tsx` | Shared authenticated shell for tenant, management, caretaker; mount onboarding once here |
| `app/components/NotificationWorkspace.tsx` | Paginated in-app notices and mark-read updates; preserve requests and event behavior |
| `app/api/operations/route.ts` | Existing authorized notification reads and actions; do not replace business endpoints |
| `app/lib/backend/server.ts` | `requireStaffAccess('staff.access.inspect')` and authoritative staff checks |
| `app/lib/backend/tenant.ts` | Request-scoped `getTenantAccess`; use established tenant authority |
| `app/lib/backend/resume-session.ts` | Role-aware saved-session navigation; preserve security checks |
| `app/components/StaffAuthForms.tsx` | Shared `LoginForm`, whitelisted successful role destinations |
| `app/lib/backend/auth/dependencies.ts` | Existing trusted-origin and rate-limit patterns |
| `app/lib/backend/auth/executor.ts` | Restricted PostgreSQL security executor; do not broaden privileges for push |
| `supabase/migrations/` | Existing notification-producing business SQL; append a new migration only |
| `vercel.json` | Existing region; no current cron configuration |
| `next.config.ts` | Production Supabase CA tracing; preserve |

`public.notifications` already contains `id`, `recipient_id`, `title`, `body`, `href`, `event_key`, `read_at`, `created_at`. Existing in-app notices are not background push. There is currently no native push/subscription/service-worker implementation to rely on.

Production origin: `https://mapsilip.vercel.app`. Intended Supabase project: `atuqxpiandeutimdkgag`. Verify actual linked configuration before any later hosted change. Never use another project accidentally.

## 3. Browser and UX contract

### Installation

1. Render the portal and available data immediately; onboarding must not delay authentication, first content, or navigation.
2. Mount a small client manager once in the authenticated shell. Load installation UI only if eligible.
3. Automatic invitation requires authenticated portal access, phone evidence, width <=767px, not standalone, and no active cooldown. A narrow desktop window alone is insufficient. Do not automatically prompt tablets or desktop.
4. Detect standalone using `matchMedia('(display-mode: standalone)')` and iOS `navigator.standalone`. Recheck on visibility/display changes without polling.
5. Android: capture `beforeinstallprompt` once where supported, prevent default, save event in memory, call its `prompt()` only from Install tap, clear the one-use event after choice. Never invent a native prompt when event is unavailable.
6. iPhone: present concise Add to Home Screen instructions through the current browser's supported share/menu path. No programmatic iOS install prompt. Web Push requires a supported Home Screen web app on iOS/iPadOS 16.4+; feature-detect APIs as well as giving OS guidance.
7. Safari and Chrome on iOS do not behave like Chrome Android. Modern iOS browsers may expose Add to Home Screen; wording must match actual tested menu, with Open in Safari guidance where needed. Embedded browsers can require opening the page in a supported external browser.
8. Buttons: **Install MapSilip**, **Not now**. Unsupported state: “You can keep using MapSilip here. Installation and notifications depend on your browser and device.” Avoid claiming all Chrome installations behave identically.
9. Save dismissal `{version:1,dismissedUntil:number}` under a user-and-origin-scoped localStorage key. Storage denial must not crash; keep an in-memory dismissal for the current session. No auth tokens in localStorage.
10. Installation may use separate browser storage on iOS: explain that the installed app may ask for login again. Do not transfer tokens between contexts.
11. Provide manual installation and notification controls under a shared **App and notifications** dialog accessible from each portal's existing settings/profile area. The automatic invitation restriction does not disable normal desktop browser features or manual guidance.

### Permission and preferences

- Separate installation from notification consent; declining either must leave the application usable.
- Introductory heading: **Enable notifications**. Confirmation button: **Enable selected notifications**. Call `Notification.requestPermission()` directly inside its click handler before awaiting any network operation. Prepare the SW registration and public key beforehand; disable only this button until prerequisites are ready.
- iOS: only offer actionable permission enrollment when running as an eligible installed Home Screen app. Before installation show instructions, not a broken permission button.
- `default`: can offer Enable. `granted`: reconcile subscription after explicit enrollment or on app resume. `denied`: explain browser/OS Settings; never repeatedly call permission APIs. Unsupported: informative message, no failing action.
- Master/category controls are app preferences, distinct from browser permission. Turning master off stops server delivery immediately even if browser permission remains granted.
- On successful enrollment show one subtle in-app confirmation. Do not automatically send a real push test or create business data.
- Use existing dialogs/bottom-sheet styling, tokens, focus management and reduced-motion patterns. No full-screen forced onboarding or interaction-blocking entrance animation.

## 4. Files and interfaces to add

Keep business code changes narrow. Exact proposed new paths:

| File | Responsibility |
|---|---|
| `app/lib/pwa/install.ts` | Pure installation eligibility/cooldown/capability helpers |
| `app/lib/pwa/push-contract.ts` | Shared public types and category constants; no server secrets |
| `app/components/PwaManager.tsx` | Single browser lifecycle, SW registration, enrollment coordination |
| `app/components/PwaOnboarding.tsx` | Mobile invitation, platform instructions, permission explanation |
| `app/components/PushPreferences.tsx` | Master/category controls in shared settings dialog |
| `app/lib/backend/push/identity.ts` | Resolve existing staff/tenant authority and session binding |
| `app/lib/backend/push/validation.ts` | Endpoint/key/body validation and SSRF prevention |
| `app/lib/backend/push/repository.ts` | Narrow authorized RPC calls; never arbitrary SQL from requests |
| `app/lib/backend/push/delivery.ts` | Server-only VAPID send, bounded dispatch/retry processing |
| `app/api/push/preferences/route.ts` | GET own preferences, PATCH own complete preference object |
| `app/api/push/subscription/route.ts` | POST enroll/reconcile this device; DELETE disable current device |
| `app/api/push/dispatch/route.ts` | Worker-only POST, Node runtime |
| `app/notifications/open/route.ts` | Validate notice ID, authorize recipient, redirect to safe internal destination |
| `public/sw.js` | Native push display, safe click routing, minimal offline fallback |
| `public/offline.html` | Public static offline message without tenant content |
| `tests/pwa-install.test.mjs` | Eligibility, dismissal and capability behavior |
| `tests/push-security.test.mjs` | Ownership, endpoint validation, authentication and secret boundaries |
| `tests/push-delivery.test.mjs` | Classifier, retries, leases, expiration and duplicates |
| `tests/push-navigation.test.mjs` | Safe deep links, login continuation and cross-user rejection |

Use existing test harness conventions to execute actual helpers; source text checks alone do not prove delivery/security behavior. Inspect the repository's TypeScript test loading pattern before choosing imports.

Public contract:

```ts
type PushCategory = 'payments' | 'maintenance' | 'accounts' | 'visitors' | 'concerns';
type PushPreferences = {
  enabled: boolean;
  categories: Record<PushCategory, boolean>;
};
type PushEnrollment = {
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
};
type PushPayload = { v: 1; notificationId: string; category: PushCategory };
```

`GET /api/push/preferences` returns `{available:boolean,initialized:boolean,preferences:PushPreferences}`. `available` refers **only to push availability**; false must not suppress PWA installation or its invitation. When push is disabled/unconfigured, do not request notification permission, reconcile/create/delete browser subscriptions, mutate enrollment/preferences or dispatch sends; respond503 to push mutations. Installation remains fully testable with that flag false.

PATCH accepts exactly PushPreferences and is called only by explicit **Save preferences** for an already-initialized account. It may change categories or either master state; enabling requires at least one selected category and an existing eligible enrolled device. It does not create a device binding or request browser permission. The first account initialization is exclusively the first-enrollment transaction, not PATCH.

POST subscription accepts one of these strict shapes:
- First enrollment: `{subscription: PushEnrollment['subscription'], initialPreferences: PushPreferences}`, enabled=true and at least one selected category. SQL initializes only if initialized_at is null, atomically with the binding; otherwise409 `preferences_already_initialized`, with no preference update.
- Additional enrollment/reconciliation: `{subscription: PushEnrollment['subscription']}` only. SQL requires existing initialized preferences and never writes them. Reject extra preference fields; do not silently accept stale values. Return authoritative saved preferences, including any changes made concurrently on another device.

DELETE accepts no arbitrary user/subscription ID; revoke only the authenticated session's installation binding without changing account preferences. Return no private keys, endpoint list, device capability, or another user's information. Use401 unauthenticated,403 forbidden/origin failure,400 invalid body,409 initialization conflict,429 rate limited,503 infrastructure unavailable; generic errors only.

Server identity interface: `resolvePushIdentity(): Promise<{userId:string;sessionId:string;role:'owner'|'caretaker'|'tenant';securityRevision:string|null}>`. Reuse established authoritative guards; do not authorize from caller JSON or editable Auth metadata.

Classifier interface: `classifyPushEvent(eventKey:string): PushCategory|null`. Worker interface: `dispatchPushBatch({limit:20}): Promise<{claimed:number;accepted:number;retried:number;discarded:number}>`. No sensitive details in its HTTP response/logs.

## 5. Security and database design

Read repository Supabase skills and relevant local Next.js guides before implementing. Inspect current hosted migration history read-only before applying any new migration later; do not repair/reapply existing migrations.

### Private tables in one new append-only migration

Choose a unique migration timestamp later than every repository migration. Do not assume the historical count remains 21. Use `mapsilip_private`, UUID primary keys, timestamptz timestamps, foreign keys, RLS enabled, and no public/anonymous table grants.

- `push_preferences`: user_id PK references auth.users, enabled boolean default false, five category booleans with defaults from section 1, initialized_at nullable, updated_at. Only first explicit enrollment sets initialized_at; reads and additional-device enrollment never initialize or reset this row.
- `push_subscriptions`: id UUID PK; user_id FK; auth_session_id UUID; staff_security_revision bigint nullable; installation_hash text (SHA-256 hex, never raw secret); endpoint text UNIQUE; endpoint_hash text UNIQUE; p256dh text; auth text; generation UUID; enabled boolean; created_at/updated_at/last_seen_at; disabled_at nullable. Index active user/session and installation hash. Keys/endpoints are sensitive capabilities: no public SELECT, no logs.
- `push_outbox`: id UUID PK; notification_id UUID UNIQUE FK public.notifications ON DELETE CASCADE; recipient_id FK; category constrained to five enum strings; created_at; expires_at default original notification time +1h. Index created_at for bounded dispatch. Unknown/unselected events do not enqueue; never backfill historical notices.
- `push_deliveries`: id UUID PK; outbox_id FK; subscription_id FK; subscription_generation UUID; status constrained pending/leased/accepted/discarded/failed; attempts integer >=0; next_attempt_at; lease_until nullable; claim_token UUID nullable; provider_status integer nullable; finished_at nullable. UNIQUE(outbox_id,subscription_id). Index due pending deliveries and expired leases. Do not store raw provider error bodies or message contents.

A minimal AFTER INSERT trigger on `public.notifications` classifies the existing event and inserts an outbox row. It must never make a synchronous HTTP request, alter recipient selection, or fail a business operation because a push provider is unavailable. Optional scheduling wakeup uses asynchronous infrastructure separately. Respect all existing transaction semantics.

Exact RPC responsibilities (names may use existing project prefix, but choose once and use consistently):
- `mapsilip_push_preferences_get/set`: current auth identity only, existing role/session validity, strict categories.
- `mapsilip_push_subscription_upsert/revoke`: authenticated identity + installation capability ownership, current session, strict validation; no caller-specified user identity.
- `mapsilip_push_claim`: service_role only; expand eligible new notices into per-device deliveries, then claim <=20 due rows with SKIP LOCKED, 60s lease and fresh claim token.
- `mapsilip_push_finish`: service_role only; update only matching delivery ID, generation, live claim token; apply outcome/retry atomically.

### Concrete RPC exposure decision — resolve before writing migration SQL

Use **public-schema, narrowly granted SECURITY DEFINER RPC entry points accessing private tables**. Do not expose `mapsilip_private` in PostgREST schemas, and do not introduce a new direct database credential/connection for this feature.

- Every RPC named above lives in `public`, e.g. `public.mapsilip_push_preferences_get`, with an explicit full signature and grants in the migration. Any internal implementation helper stays in `mapsilip_private` with no API-role execution grant.
- Browser requests go through the Next.js API routes. Those routes use the existing request-scoped, user-authenticated Supabase client for preference/subscription RPCs. Thus PostgREST supplies the real auth.uid()/JWT session; routes must not call user-facing RPCs with the service-role client.
- The worker uses a separate server-only service-role Supabase client solely for `public.mapsilip_push_claim` and `public.mapsilip_push_finish`. These two RPCs grant EXECUTE only to service_role; authenticated/anon/PUBLIC get none. Worker input never substitutes for authenticated user authority in enrollment.
- Revoke default function EXECUTE from PUBLIC on **every new signature** in the same migration before committing. User entry points grant EXECUTE to authenticated only. Explicitly revoke table/schema rights from anon/authenticated on new private storage; keep RLS enabled. Audit catalog grants after migration in the isolated test database.
- Direct authenticated calls to public user RPCs must remain secure even if they bypass the Next.js route. SQL must validate current authority, bounds, endpoint/key structure, installation capability hash ownership and transactional rate limits; routes add Origin/body validation and provider-host checks, not the sole authorization boundary. Repeat the provider-host allowlist in the enrollment SQL validation so direct RPC cannot inject arbitrary delivery destinations. Never accept a raw caller user_id as authority.
- Enrollment RPC takes a random installation capability supplied only by the server route from its HttpOnly cookie; hashes it inside SQL and compares the existing binding. Do not accept a prehashed capability as a bearer credential. A caller can mint its own installation but cannot take over an existing one without that capability. Cookie issuance/rotation stays in the server route.
- `mapsilip_push_claim` must return only the bounded service-role delivery data; it is not a general query interface. No generic SQL function, schema-wide grants, or exposure of private subscription rows.

Required database tests before Phase 2 is complete: anon cannot execute any push RPC; authenticated user cannot execute claim/finish or SELECT private tables; user A cannot read/change user B preferences or hijack its endpoint; a directly invoked authenticated RPC cannot bypass host validation, rate limits or session eligibility. Merely confirming the tables are in a private schema does not pass this gate.

All SECURITY DEFINER functions use empty search_path, fully qualified objects, explicit grants, input bounds, and revocations from PUBLIC/anon. User RPCs require auth.uid() and must enforce existing staff/tenant authority inside SQL as well as the route. Do not grant push functions to the unrelated existing security executor. Worker-only functions must be inaccessible with anon/authenticated roles. Private tables are not exposed through Data API.

### Verified code facts and required identity adapter tests

Source inspection for this revision confirms:
- `app/lib/backend/identity.ts::verifyAuthSession` verifies getUser plus getClaims, matches subject to user, validates session_id UUID, and returns `identity.userId` and `identity.sessionId`. Use this existing verified result; do not decode an unverified JWT to populate the adapter.
- `app/lib/backend/server.ts::requireStaffAccess` uses the authoritative staff snapshot. The SQL staff authority checks `mapsilip_private.accounts`, `mapsilip_private.session_admissions`, auth.sessions, deleted/banned users, password-change restriction and security revision. Inspect the current return type before mapping revision; do not assume requireStaffAccess directly exposes sessionId/revision. Reuse the existing verified session/snapshot inside a request-scoped adapter if necessary, avoiding redundant Auth calls.
- `app/lib/backend/tenant.ts::getTenantAccess` returns `{client,session,identity,data}`, with verified session identity and active tenant profile. The worker must reproduce its current authoritative eligibility in SQL; confirm the project's role-conflict rule instead of assuming tenant role exclusivity is already enforced by that helper.
- These are repository facts, **not** verification of hosted grants, migration state, token-refresh behavior, or sign-out revocation semantics.

Before finalizing the adapter, add a mapping table to implementation evidence: role → source helper → verified user/session fields → staff revision source or null → SQL worker predicate. Tests must reject missing/malformed session IDs, mismatched subject, banned/deleted user, expired session, unadmitted staff revision, mandatory password change and inactive tenant. Verify refresh retains the bound session and new login creates/rebinds a session as designed. If logout does not invalidate the relevant hosted session, explicitly revoke the device binding in the server logout path; do not assume cookie deletion removes auth.sessions. Do not redesign authentication to fit push.

### Session and shared-phone protection

- Create a random 32-byte installation capability in a Secure, HttpOnly, SameSite=Lax, Path=/ cookie named `mapsilip_push_device`, only during explicit enrollment. Persist for at most 1 year. Store SHA-256 hash server-side; never return the raw cookie in JSON or use fingerprinting.
- A known endpoint cannot be reassigned to another user by submitting its JSON. Rebinding requires the existing installation capability plus current authenticated identity and explicit opt-in, and atomically invalidates old generation/jobs.
- If browser cookie was cleared while its PushSubscription survived, do not silently take over the old database row: unsubscribe in that browser and enroll a fresh provider subscription. Never allow arbitrary endpoint deletion belonging to another user.
- Bind each subscription to auth session ID. At send time verify session still exists, belongs to recipient, is not expired; user is not deleted/banned; tenant remains active; staff account is active, password change is not required, security_revision equals the stored revision, and `mapsilip_private.session_admissions` still admits that exact session/revision. Reuse the full existing authority rules, including tenant role exclusivity. Do not treat existence in auth.users as sufficient authorization.
- Before logout, attempt current-installation revocation while authenticated. Cleanup failure must not block logout; existing server session revocation still prevents later sends. On account switch retire the previous binding before enrolling the new account. Do not silently subscribe the second account.
- Recheck preference, generation, account/session eligibility, notice recipient and expiry immediately before send. A delivery already accepted by an OS push service may remain in its queue; no implementation can promise instant recall after logout. Generic lock-screen content limits exposure in that race.

### Route and network protections

- Enforce same trusted Origin on browser mutations, JSON content type, <=8KiB request bodies, field allowlists and existing secure cookie practices.
- Add narrowly scoped rate limits: subscription mutations 10 per user/device per 10 minutes; preference mutations 30 per user per 10 minutes. Use atomic hosted storage, not per-process maps. Extend rate-limit infrastructure with a dedicated authorized action; never misuse login lockout counters.
- Treat endpoint input as SSRF input. HTTPS only, no credentials/fragments/nondefault ports, max4096 chars; reject IP literals, localhost and private hosts. Allow only exact documented push-provider hosts or anchored documented subdomains. Start with verified FCM and Apple endpoint hosts required by actual Android/iPhone tests; add Mozilla/Windows hosts only after official documentation verification. Never accept arbitrary domains or suffix tricks like `apple.com.attacker.example`. Reject redirects rather than following them.
- Validate base64url p256dh decodes to a 65-byte uncompressed P-256 public key (first byte 0x04), auth decodes to16 bytes. Reject malformed/extra fields. Never log these values.
- Mark server modules server-only. VAPID private key, worker secret, Supabase service role, database credentials and installation capability must never reach client props/bundles.

## 6. Event routing and delivery rules

Before implementing the classifier, inventory every current SQL notification producer and record its exact key grammar in tests. Known key families:

| Existing key pattern | Category / decision |
|---|---|
| `invoice:<uuid>` | payments |
| `payment:<uuid>:submitted:<ownerId>` | payments |
| `payment:<uuid>:approved` or `:rejected` | payments |
| `assignment:<uuid>` | accounts |
| `room-prep:<assignmentId>:<caretakerId>` | accounts |
| `account-request:<uuid>:created:<ownerId>` | accounts |
| `account-request:<uuid>:approved` or `:rejected` | accounts, eligible subscribers only |
| `account-request:<uuid>:activated` | suppress to avoid duplicate approval push |
| `maintenance:<uuid>:...` | maintenance; enumerate the actual existing suffixes, do not accept arbitrary strings |
| `visit:<uuid>:planned:<staffId>` or `:cancelled:<staffId>` | visitors |
| `concern:<uuid>:...` | concerns; enumerate actual suffixes, disabled by default |

Pending/rejected applicants cannot enter protected tenant portals and therefore may never enroll. **Do not promise them approval/rejection push before enrollment.** Preserve the normal application-status/in-app workflow; do not weaken authorization or add pre-login subscriptions to fill this gap.

Payload contains only `v`, notificationId and category. Worker sets TTL to remaining notice lifetime, max3600s. Service worker displays title **MapSilip**, body **You have a new [category label] update.**, existing icon, stable tag `mapsilip:<notificationId>`, renotify=false. No names, room numbers, payments, free text, rejection reasons, attached documents or location on lock screen. Keep encrypted payload under2KiB. Every push must display a user-visible notification; no silent tracking pushes.

At-least-once delivery, not exactly-once. Provider acceptance is not proof of device delivery or user reading. Idempotent rows plus stable notification tags minimize duplicates.

Worker: maximum20 claimed deliveries, network concurrency4, per-send timeout5s, platform execution budget checked before launching more work; leave remaining rows for next invocation. Lease60s with fencing token prevents stale workers overwriting newer outcomes.

Outcome policy:
- 2xx accepted: record accepted, never resend that delivery.
- 404/410: disable that endpoint/generation, discard outstanding deliveries.
- Network errors,429,5xx: retry at30s,2m,10m,30m; max5 total send attempts, within original1h expiry. Respect a valid Retry-After if later than the base delay but never past expiry.
- 400: discard malformed delivery and record sanitized error class.
- 401/403: pause sending for configuration investigation; do not disable all subscriber endpoints or hot-loop retries. Expose a sanitized operational failure, keep jobs until expiry/config correction.
- Unread/read handling: proposed default skip an already-read notice before provider submission; do not mutate read_at when push is accepted or clicked.

## 7. Scheduling and environment

Reliable background delivery cannot depend on a browser tab, a client fetch after mutations, or work continuing after a Vercel response.

Primary schedule: Supabase Cron invokes a short asynchronous pg_net POST to `/api/push/dispatch` every minute. Store origin and worker bearer secret in Supabase Vault; do not embed secrets into migration text, cron SQL literals, source control, screenshots or logs. Verify pg_cron/pg_net/Vault availability and authorized provisioning first.

**Required capability gate for the actual hosted project:** before calling background delivery provisionable, use authorized read-only dashboard/SQL access to verify project `atuqxpiandeutimdkgag` and record timestamp and evidence for each of the following: (1) pg_cron is installed/enabled and Cron is available under the project's actual plan/settings; (2) pg_net is installed/enabled with its expected asynchronous HTTP API; (3) Vault is available with the expected secret storage interface; (4) the intended administrative role has the privileges required for later approved job/secret provisioning; (5) applicable quotas and scheduling/network restrictions support the proposed one-minute dispatcher. Distinguish **available to install** from **already enabled and usable**. Inspect extension catalogs, documented function signatures, dashboard status and privilege metadata; do not enable extensions, create jobs, read secret values, make network calls or create credentials during this read-only audit. Record PASS, FAIL or NOT VERIFIED separately for Cron, pg_net, Vault, privileges and relevant limits. Unknown/unavailable access is NOT VERIFIED, never an inferred PASS. Missing evidence means **background provisioning readiness not established**, even if local tests pass. If enabling a required component is needed, identify the exact change for separate authorization. Do not introduce a paid service, plan upgrade, external scheduler or alternative infrastructure without approval.

Optional low-latency wakeup: asynchronous database webhook on new outbox rows, authenticated using the same worker secret; duplicate invocations must be harmless. Start with the one-minute durable schedule. Do not claim instant delivery; an optional webhook is a later latency improvement, not a prerequisite for correctness. Never issue network sends inside the business notification trigger.

Do not assume a Vercel plan supports every-minute cron: Hobby cron limitations can prevent this. Do not add a paid upgrade or alternate service silently. If Supabase scheduling cannot be authorized, report **background dispatch not configured** and keep push disabled.

Required new environment names:

| Name | Exposure | Requirement |
|---|---|---|
| `MAPSILIP_PUSH_ENABLED` | server only | default `false`; enable only after approved provisioning and end-to-end checks |
| `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY` | public | generated matching VAPID public key |
| `WEB_PUSH_VAPID_PRIVATE_KEY` | server only | matching private key; never print it |
| `WEB_PUSH_VAPID_SUBJECT` | server only | real operator-controlled `mailto:` address or HTTPS contact URI; owner supplies/approves |
| `MAPSILIP_PUSH_WORKER_SECRET` | server only + Supabase Vault | random >=32 bytes; exact match between dispatcher and scheduler |

Keep existing `MAPSILIP_APP_ORIGIN`, Supabase URL/public key/server service key and all security settings unchanged. New names do not replace any existing required variables. Generate VAPID material into a protected local secret file using a script that does not print key values. Do not rotate VAPID keys after subscriptions exist without an explicit reenrollment strategy. Keep Preview and Production subscriptions/keys/schedules isolated; no production fanout from Preview.

## 8. Service worker and click routing

- Register `/sw.js` once, scope `/`, independently of push availability or `MAPSILIP_PUSH_ENABLED`; native installation/offline behavior must work while push is disabled. Set the SW response `Cache-Control: no-store`; configure headers through existing Next configuration without removing CA tracing.
- Set manifest start_url to `/`, retain id `/`, scope `/`, standalone display **only after the role-start tests below pass**. Current `app/page.tsx` calls resumeSignedInPortal and otherwise renders AuthPreview; signed-out root does not currently redirect to `/login`. Implement an explicit root-to-login fallback after the existing helper returns, while preserving restricted first-login handling. Do not claim this behavior already exists.
- Root startup tests: valid owner → `/management`; valid caretaker → `/caretaker`; active tenant → `/tenant`; no session → `/login`; expired/revoked session → `/login`; restricted first-login user must never reach a portal and must retain the established change-password flow. Inspect existing restricted-state logic and preserve it instead of broadening access. Auth infrastructure errors must retain current error handling, not be presented as a successful login. Test with staff/tenant activation flags both on/off; push must not turn either on. Include `app/page.tsx` and `tests/resume-session.test.mjs` in this task's touched files. Verify192/512 icons and Apple touch icon. Verify maskable safe padding; remove an inaccurate maskable claim or supply a correct separate maskable asset, not a new logo.
- Cache only the fixed public offline page and selected public icon assets in a versioned MapSilip cache. Never cache API results, authenticated HTML, auth endpoints, redirects, Supabase requests, session responses or tenant information.
- Offline HTML is eligible **only** for same-origin GET document-navigation requests: require `request.mode === 'navigate'`, `request.destination === 'document'`, and an HTML Accept header. Check exclusions first. Explicitly exclude Next.js RSC/Flight traffic (`RSC` header, `text/x-component` Accept, `_rsc` query parameter, or `Next-Router-State-Tree` header), router prefetch (`Next-Router-Prefetch`, `Next-Router-Segment-Prefetch`, `Purpose: prefetch` or `Sec-Purpose` containing prefetch), `/api`, `/auth`, `/login`, `/forgot-password`, `/reset-password`, all non-GET and cross-origin requests. An excluded request must pass through unchanged; do not attach an HTML fallback. Conservative exclusion takes precedence over navigation eligibility.
- For eligible document requests, use network and return the public static fallback only when fetch rejects due to an actual network error. HTTP401/403/404/500 responses pass through unchanged. Never substitute HTML for an RSC, prefetch, API or auth response, and never cache those responses. Tests must check response Content-Type/body and fetch rejection for every excluded class, not just service-worker registration.
- Activate/update without forcing page reload or global skipWaiting while a form is open. Provide a manual “Update available” action; a user-confirmed reload can activate a waiting worker. Delete only obsolete caches belonging to this application.
- Push handler validates payload version/category/UUID; invalid payload is ignored safely. Use `event.waitUntil(showNotification(...))`.
- Notification click closes the notice and opens/focuses the **fixed same-origin** `/notifications/open?id=<UUID>`; never navigate to a URL supplied in push data.
- Open route obtains authenticated authority and selects the notice scoped to current recipient via RLS. Foreign/missing IDs return404. Derive destination from stored href only after validating a same-origin role-appropriate allowlisted path; reject protocol-relative URLs, encoded bypasses, arbitrary schemes and external origins.
- Signed-out click redirects to `/login?notice=<UUID>`. Add only a validated UUID continuation to the existing LoginForm/resume helper. After successful normal role admission go to the fixed notice-open route, which reauthorizes. Never introduce unrestricted `next` redirects or bypass first-password-change flows.

## 9. Implementation tasks and review gates

Keep `MAPSILIP_PUSH_ENABLED=false` in every shared/hosted development, Preview and Production environment throughout implementation. This does not gate installation invitations, manifest/SW availability or document-only offline fallback. Tests use dependency-injected availability/provider mocks; they must not flip the real production flag. Physical delivery validation needs a separately authorized isolated validation environment and test-only send path with real infrastructure; that is a gate, not a reason to secretly activate production. Production activation is a distinct final authorization after physical tests pass.

Work in six small reviewable phases. At each boundary report: touched files; completed behavior; exact tests and results; security assumptions with evidence; NOT VERIFIED items; rollback; next phase scope. Do not call a phase complete solely because it compiles. Continue independent local work after a passing gate; pause dependent work when a required security/behavior test fails. Boundary reporting itself does not demand another permission question. Hosted mutation, credentials, scheduling, deployments and production activation still require explicit owner authorization.

| Phase | Gate evidence required before dependent work |
|---|---|
| 1 Installable shell | All role-start tests, cache safety and phone eligibility pass; otherwise retain current manifest start URL |
| 2 Data/security | Public-wrapper/private-table design reviewed; isolated DB grants, direct-RPC abuse and session-adapter tests pass |
| 3 Delivery | Retry/lease/idempotency/SSRF tests pass; no sensitive provider data in logs; background scheduler runbook reviewable |
| 4 UI/consent | Visible five-category selection, explicit enrollment and denied/unsupported paths pass; mobile/desktop/reduced-motion checked |
| 5 Navigation | Signed-out continuation, role destinations, foreign-notice rejection and mandatory password-change behavior pass |
| 6 Readiness | All project checks plus authorized physical Android/iPhone background delivery evidence; unavailable checks remain NOT VERIFIED and block production push activation |

Do not bundle all six phases into one enormous change. Keep each phase's diff/evidence independently reviewable. Do not automatically commit unrelated existing work or push to GitHub.

### Task 1 — Baseline and installable shell

- [ ] Inspect `git status`, preserve every unrelated change; record baseline commit and dirty files without secrets.
- [ ] Read `AGENTS.md`, relevant skills and local `node_modules/next/dist/docs/` PWA/config guides. Verify current code matches section2; document actual differences before using an outdated path.
- [ ] Add failing install-helper tests: authenticated390px mobile eligible; logged-out false;1440px false; narrow desktop false; standalone false; dismiss until7days false then true; storage failures harmless.
- [ ] Implement install helpers, manifest root start URL, safe offline SW and manager registration. Verify installation invitation and offline behavior with MAPSILIP_PUSH_ENABLED=false and all push infrastructure absent; no permission or subscription API may run.
- [ ] Add offline tests for document network failure, RSC headers/Accept/_rsc, router prefetch headers, API/auth, non-GET and cross-origin. Only the eligible failed document receives HTML; excluded request failures remain failures. Run `npm test` and inspect CacheStorage manually: only public allowlisted assets, no account data.

### Task 2 — Private data and authority

- [ ] Add local/integration tests for authorized own preferences, rejected/pending/inactive tenant denial, owner/caretaker revision admission, other-user endpoint takeover denial and authenticated worker-RPC denial.
- [ ] Draft one new migration implementing section5 tables, narrow RPCs, classifier and outbox trigger. Do not apply hosted yet.
- [ ] Test first-enrollment initialization, two-device initialization race, stale additional-device payload rejection, concurrent category changes, master-off preservation and explicit Save-only updates; verify additional enrollment never writes existing preferences. Implement identity/repository/validation server modules and preference/subscription routes. Add body/Origin/rate limits, installation capability and generation rebinding.
- [ ] Verify local DB grants/RLS using separate anon, authenticated userA/userB, and worker contexts. If no isolated local DB is available, label SQL execution tests NOT VERIFIED; do not pretend text inspection verifies RLS.
- [ ] Confirm existing security executor grants, old migrations and business notification behavior are unchanged.

### Task 3 — Durable delivery

- [ ] Add failing behavioral tests for exact key classification, unknown-event suppression, opted-out category suppression, revoked session, expired notice, duplicate claim, stale lease completion, 410 removal and retry bounds.
- [ ] Install only server `web-push` and its type declarations if needed, pinned to resolved supported versions; update lockfile. No blanket dependency upgrade.
- [ ] Implement delivery worker and authenticated dispatch route. Reject missing/incorrect bearer token before database access. Compare fixed-length secret hashes timing-safely; never log headers.
- [ ] Mock provider responses to verify concurrency<=4, batch<=20, timeouts, lease fencing, max5 sends, generic payload and sanitized errors.
- [ ] Write reviewed provisioning instructions for Vault/Cron; do not execute them or store live secrets in the document. Verify worker and scheduled HTTP execution budgets against the actual platform plan.

### Task 4 — Enrollment and settings UI

- [ ] Test permission call occurs directly in user click; no prompt at login, grant/deny/unsupported handling, Android one-use prompt and iOS instructions.
- [ ] Implement PwaOnboarding, manager and shared settings dialog; mount once inside authenticated AppShell. Use server-provided availability and existing role context rather than extra auth queries per route.
- [ ] Implement master/category settings, explicit subscription enrollment and revoke-on-logout integration. Preserve original logout destination/session invalidation even if push cleanup fails.
- [ ] Verify no automatic invitation on desktop/tablet or standalone; after-login invitation on eligible phones for all3 roles; rejected invitation does not recur before cooldown.
- [ ] Reuse existing motion tokens, focus trapping, Escape, sheet behavior and reduced motion; no new perpetual animation or timers/polling.

### Task 5 — Secure notification navigation

- [ ] Add tests: valid own notice opens role destination; foreign notice404; signed-out click preserves UUID through login; invalid UUID discarded; external href rejected; first-login restrictions remain enforced.
- [ ] Implement fixed notice-open route, SW click behavior, narrow LoginForm continuation and saved-session continuation. Preserve all existing role destination allowlists.
- [ ] Test switching accounts while a notification is visible: accountB cannot open accountA's record; no new A alerts are submitted after A session/binding is revoked.

### Task 6 — Checks, approved provisioning and physical acceptance

- [ ] Run `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`. Report exact counts/results and distinguish existing warnings from new failures.
- [ ] Inspect production build/client requests for server secret exposure. Inspect SW cache and network behavior for account content leaks.
- [ ] Review product defaults, actual VAPID contact, scheduler access and target environments with owner. Keep feature off until approved. Request deployment/provisioning authorization only after code and plan are reviewable.
- [ ] Only after authorization: compare hosted migration history, apply only the new reviewed migration, set private/public environment variables, provision authenticated scheduler, deploy approved environment. Never reapply old migrations or mutate real business records to test.
- [ ] Record each physical test device's manufacturer/model, exact Android or iOS/iPadOS version including available build identifier, browser name and full version, standalone-versus-browser context, test date, and outcome. If a version/build cannot be obtained, mark that field unknown and explain; do not fill it by guessing. Keep device evidence free of serial numbers, account credentials and private notification content. Test Android and iPhone separately. State compatibility only for the exact tested combinations; one device or browser does not establish universal Android/iOS/Chrome compatibility.
- [ ] Use approved designated accounts and explicitly authorized synthetic events for the acceptance matrix below. Missing physical devices/accounts remain NOT VERIFIED. Do not fabricate a PASS.
- [ ] Produce a report with changed files, check results, device/browser versions, evidence, measured performance and rollback instructions. Keep push off if critical ownership, authorization, scheduling or device delivery checks fail.

## 10. Acceptance matrix and performance measurements

Maintain a device evidence table with one row per tested combination:

| Test date | Device manufacturer/model | Exact OS version/build | Browser name/full version | Browser or installed standalone | Scenarios exercised | PASS/FAIL/NOT VERIFIED | Evidence reference |
|---|---|---|---|---|---|---|---|
| Populate from actual physical testing only | | | | | | | |

Report unsupported or untested combinations explicitly. Simulators, viewport emulation and desktop mobile user agents do not count as physical Android/iPhone delivery evidence. Do not summarize a single successful combination as “works on all Android/iOS browsers”.

| Check | Required outcome |
|---|---|
| Android physical Chrome,390px, after login each role | Dismissible install invitation; installation works where native prompt supported |
| iPhone physical supported iOS, browser then installed Home Screen app | Accurate install steps; sign in if separate storage; permission only from explicit tap; genuine background push |
| Desktop1440px and desktop resized390px | No automatic installation invitation; ordinary site unchanged |
| Keyboard, dark/light, reduced motion, mobile sheet | Accessible focus, no overflow/layout shift, existing visual style retained |
| App closed / phone locked, Android and iPhone | Selected authorized notice arrives through OS service; tap opens correct authorized record |
| Account-wide category/master changed on device A | Subsequent sends on enrolled devices A and B both honor the saved account-wide change |
| Disable only device A | A receives no new submissions; B enrollment and account-wide preferences are unchanged |
| Enroll device B / resume with browser permission granted | Authoritative categories remain intact despite stale payload/concurrent edits; enrollment does not write preferences or reactivate master |
| Push flag false / infrastructure absent | Phone installation and eligible document offline fallback remain testable; no permission requests, subscription management or delivery |
| Offline RSC/prefetch/API/auth request | No HTML fallback, cache substitution or false success; normal response/error semantics preserved |
| Category disabled / master off / unsubscribed | No new provider submission for that account preference or revoked device |
| Pending/rejected/inactive/foreign tenant | No unauthorized enrollment, data or record access |
| Logout, global sign-out, revision change, account switch | Future sends denied by authoritative checks; foreign click404; explain already-queued OS delivery caveat |
| Provider410 /429 /network error / worker overlap | Endpoint revoked or bounded retry; no hot loop, duplicate DB jobs or stale completion |
| Scheduler while no browser open | Due work processed; transient failures recover on later minute; unauthorized dispatcher401 |
| Offline / SW update / unsaved form | Public fallback only, no stale tenant HTML, no forced reload or lost edits |
| iOS Focus/battery/network restrictions | Report observed limitation; do not promise guaranteed immediate OS delivery |

Measure before/after on the same route/device/network profile: initial transferred JS, portal LCP, interaction latency for menu/dialog taps, request count on3 navigations, CPU activity while idle30s. Record raw numbers and method, not an unsupported “no performance impact” claim.

Performance constraints: no extra repeated auth query on navigation; one manager/registration; no periodic client polling; reuse existing notification refresh events; no push library in browser bundle; no waiting for permission/subscription before showing data; no added long task>50ms attributable to this feature in the measured mobile interaction trace. If physical profiling is unavailable use browser throttling and label it simulated, not real-device verification.

## 11. Operational safety, rollback and known limits

- Rollback: set `MAPSILIP_PUSH_ENABLED=false`, pause authorized Cron/webhook dispatch, optionally redeploy previous verified application. Keep in-app notices active. Do not drop tables, delete notifications, rewrite migrations or reset data. A previously installed worker can remain until its next update; feature-off must prevent new server sends regardless.
- Monitor only aggregate queue depth/oldest age, accepted/retry/discard counts and sanitized error classes. Do not expose public diagnostics or log endpoint URLs, auth material, user messages or recipient details.
- Prune expired delivery/outbox rows after7days through a separately reviewed bounded cleanup job; never prune public.notifications as part of push maintenance. Avoid unbounded history scans.
- Browser installation, permission and OS delivery are user/platform controlled. Push is best effort, not an emergency communication guarantee. iOS Home Screen support and explicit permission are required. Unsupported browsers retain the full normal web application and in-app notices.
- Browser permission and subscription enrollment are device/browser-specific. Master/category preferences are account-wide. Each additional phone requires explicit enrollment and displays existing account preferences; it does not reset them.
- This plan does not implement attendance or location, application email, pre-login applicant push, bulk broadcasts, desktop auto prompts or changes to login persistence.

## 12. Handoff and source references

Suggested instruction to the implementation model:

> Read `PWA_PUSH_IMPLEMENTATION_PLAN.md` fully. Once the owner explicitly asks for implementation, implement its tasks sequentially with push disabled and installation independently testable. Preserve existing uncommitted changes, security, UI and performance work. Do not deploy, apply hosted migrations, change hosted settings, create production records or edit `.gitignore`. Record proposed product defaults for owner review. Run the prescribed checks and report real-device/hosted work you could not verify. Never claim that permission granted or an in-app toast proves background push works.

References to check for current platform details before implementation:
- Next.js PWA guide: https://nextjs.org/docs/app/guides/progressive-web-apps
- Apple Web Push: https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers
- WebKit iOS Home Screen push: https://webkit.org/blog/13878/
- MDN installability and browser differences: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable
- Supabase Cron: https://supabase.com/docs/guides/cron
- Supabase database webhooks: https://supabase.com/docs/guides/database/webhooks
- Supabase pg_net: https://supabase.com/docs/guides/database/extensions/pg_net
- Vercel cron plan limits: https://vercel.com/docs/cron-jobs/usage-and-pricing

Primary copy is at repository root because `docs/` is intentionally Git-ignored. A second copy is saved under `docs/superpowers/plans/2026-11-04-pwa-push.md`. Keep them synchronized when revising this plan; back up ignored documentation separately. No application code or deployment is changed by writing this plan.
