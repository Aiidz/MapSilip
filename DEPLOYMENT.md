# Local and Vercel setup

MapSilip uses Next.js App Router and the existing Supabase project. No deployment is performed by the repository. Apply the versioned Supabase migrations before connecting the app.

## Vercel settings

- Framework preset: Next.js. Node.js 20 or newer. Build command: `npm run build`.
- Set these environment variables in Vercel. Values must refer to the **same** Supabase project:
  - `NEXT_PUBLIC_SUPABASE_URL`: project API URL, used by browser and server.
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: browser-safe publishable key.
  - `SUPABASE_SERVICE_ROLE_KEY`: server-only Supabase Auth Admin credential for creating tenant identities with the applicant's password and no signup confirmation email. Never expose it to the browser.
  - `MAPSILIP_SECURITY_DATABASE_URL`: server-only TLS pooler connection for the narrow `mapsilip_security_executor` role. Keep the existing `sslmode=verify-full` and an absolute, readable CA bundle path in `sslrootcert`.
  - `MAPSILIP_RATE_LIMIT_HASH_KEY`: server-only random secret of at least 32 bytes for persistent rate-limit bucket hashing.
  - `MAPSILIP_APP_ORIGIN`: exact `https://` origin of the deployed domain, with no trailing slash. Origin validation rejects other domains.
  - `MAPSILIP_STAFF_AUTH_ENABLED` and `MAPSILIP_TENANT_AUTH_ENABLED`: existing feature flags. Set only when the relevant authentication flow is ready for that environment.
- Never put the service-role key, executor URL, password, or rate-limit key in a `NEXT_PUBLIC_` variable.
- For the permanent deployment, set `MAPSILIP_APP_ORIGIN=https://mapsilip.vercel.app`. Configure Supabase Auth as described below. Existing legacy invitations may still use the callback.
- Use one exact origin per Vercel environment. A changing preview URL needs its own matching `MAPSILIP_APP_ORIGIN` and Auth redirect allowlist entry; fixed preview domains are simpler. Vercel's forwarded client IP header is used only when `VERCEL=1`.
- Verify that the chosen Vercel Node runtime has the CA certificate file referenced by `sslrootcert` before enabling staff sign-in. The security executor deliberately fails closed if TLS verification cannot be configured. Do not replace it with a privileged role or disable certificate verification.
- `.env.local` continues to be used locally. It is ignored by Git. Keep local `MAPSILIP_APP_ORIGIN` exactly equal to the browser origin (`http://127.0.0.1:3000` or `http://localhost:3000`).

## Scheduled Supabase check

The workflow [`.github/workflows/supabase-reachability.yml`](.github/workflows/supabase-reachability.yml) runs at **04:17 UTC every Monday and Thursday** after it is on the repository's default branch. It can be started with **Actions → Supabase reachability → Run workflow**. Configure:

- GitHub Actions repository variable `SUPABASE_URL`: the Supabase project URL.
- GitHub Actions repository secret `SUPABASE_PUBLISHABLE_KEY`: the publishable key (no service-role key).

The workflow calls the fixed-result, read-only `mapsilip_project_ping` database RPC and reports HTTP status only. Check for a green Actions run after manually starting it. This checks reachability and generates a small amount of database activity. Supabase says Free Plan projects may pause after seven days of insufficient activity, and a few daily requests usually help; **this schedule is not a guarantee**. A paid Supabase plan is the reliable way to avoid inactivity pausing. Scheduled Actions can be delayed or disabled when a public GitHub repository becomes inactive.

## Email architecture and production password recovery

The application sends email only through Supabase Auth password recovery. No application email provider credentials, sender/admin email variables, retry endpoint secret, or custom email worker are required. Their absence is not a deployment blocker.

Account submission records an owner notification in the database transaction. Approval assigns the room and records the tenant notification; rejection records its reason and applicant notification. Pending/rejected applicants can check their own status at the shared login without receiving tenant portal access. These notices appear when users open the application; no external email alert is sent.

In Supabase project `atuqxpiandeutimdkgag` configure:

- Authentication → URL Configuration → Site URL: `https://mapsilip.vercel.app`.
- Redirect URLs: `https://mapsilip.vercel.app/auth/callback?next=/reset-password`. Retain the exact `https://mapsilip.vercel.app/auth/callback` entry if supporting legacy invitations; do not use a broad production wildcard.
- Authentication → Sign In / Providers → Email: keep email/password authentication enabled. Account requests are provisioned with Auth Admin and a confirmed email flag; this is separate from recovery delivery.
- Authentication → Email Templates → Reset Password: use Supabase's `{{ .ConfirmationURL }}` link, which verifies the recovery request and redirects to the configured callback. Do not replace it with a bare Site URL or reset page URL.
- Retain PKCE cookie handling: the default code-based reset link must be opened in the browser that requested it. The callback exchanges the code and redirects only to the fixed `/reset-password` path. The reset endpoint verifies the session/account, calls Supabase Auth `updateUser({ password })`, then signs out globally.
- Verify Supabase Auth delivery, rate limits, and expiry with a designated recipient before normal use. Never claim delivery is verified from a successful build alone.

MapSilip deliberately uses Supabase Auth's built-in email service exclusively. SMTP and external email providers are not deployment requirements, and their absence must not block deployment. Do not request external email credentials or add a custom delivery integration.

The accepted limits are significant: Supabase's built-in service restricts recipients to organization team addresses, currently limits delivery to two messages per hour, and offers best-effort delivery without an SLA. Ordinary tenant addresses outside the organization team cannot receive password-reset emails through this service. These are accepted product limitations, not unrestricted production email capability. Keep the real delivery outcome visible; do not claim a reset email was delivered from a successful API response alone. Verify recovery with an authorized, deliverable organization-team test address when one is available.

References: [Supabase password recovery](https://supabase.com/docs/guides/auth/passwords), [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [Auth email delivery limits](https://supabase.com/docs/guides/auth/auth-smtp).

The removed application email service, retry API, and hourly workflow are no longer part of deployment validation. Historical database email-event tables/functions and existing records remain unchanged; the application no longer calls or drains them. Applied migrations must not be rewritten or reapplied to remove this historical infrastructure.

## Existing onboarding migration safeguards

For a non-mutating readiness check, run `supabase/review/production-readiness.sql` in the intended project's Supabase SQL Editor using authorized administration access. It starts a read-only transaction, compares all 21 local version/name pairs against hosted history, inventories RLS metadata and synthetic role/profile counts, and rolls back. A `MATCH` confirms a version/name pair, not a byte-for-byte SQL checksum. Preserve and review any missing, extra, or differently named migration; do not reapply or rewrite it. Do not expand the application executor's privileges to run this inspection.

For synthetic validation, inventory the existing `.invalid` owner/caretaker mappings before provisioning anything; reuse those identities. Prepare a designated synthetic tenant through the existing request/approval flow only after the owner mapping and schema are verified. Preserve mandatory staff first-login password replacement, session admissions, room-required approval, and tenant RLS. Keep credentials in a private local file with mode `0600`, never in source or reports. Synthetic `.invalid` addresses cannot test inbox delivery; use a separately authorized organization-team mailbox for recovery delivery checks.

Before applying the onboarding migration, compare hosted migration history and function signatures to the local files, inventory legacy approved requests and their linked Auth identities, and test the exact migration on a compatible database copy. The owner-only `mapsilip_inventory_legacy_invitations` RPC lists requests needing reconciliation. The owner-only `mapsilip_reconcile_legacy_invitation` RPC accepts the request ID, action (`assign_room` or `reset_to_pending`), eligible room ID when assigning, and the verified Auth user UUID. It rejects identities whose confirmed Auth email does not match the request. `assign_room` links the identity, assigns the room, and activates the account in one transaction; `reset_to_pending` links the identity for normal room-required review. Do not use either action without checking the request and Auth identity first.
