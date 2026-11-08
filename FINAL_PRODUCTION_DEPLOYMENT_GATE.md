# MapSilip final production deployment gate — 2026-11-05

**No deployment performed. The exact local upload candidate passed packaging and targeted checks. Stop for explicit deployment authorization.** Push activation remains a separate held workstream. Successful hosted authenticated and recovery validation remain unverified; this report does not claim the application is errorless.

Read and reconciled `WORKSTREAM_A_READINESS.md`, `PWA_PUSH_REMEDIATION.md`, and `PWA_PUSH_READINESS.md`. The older push reports contain historical test counts; the Workstream A report contains the later full-suite results. No application code or configuration was changed during this gate.

## Check results

| # | Check | Result | Evidence / limit |
| --- | --- | --- | --- |
| 1 | Complete intended upload, tracked/modified/untracked | **PASS** | 176 regular files, 1,021,090 bytes: 8 tracked unchanged, 51 tracked modified, 116 untracked, 1 ignored public CA explicitly included. Actual Vercel CLI65.9.0 `deploy --dry --json` selects exactly the same 176 paths. No deployment/upload is created by this documented dry mode. |
| 2 | Secrets, backups, temporary and test-only exclusions | **PASS** | Exact exclusions recorded in `excluded.json`. No local environment file, credential directory, backup, test, maintenance script, migration or prebuilt artifact is in the snapshot. Pattern scan of included bytes found zero private-key/API-secret/credentialed-DB-URL/literal-JWT matches. This is not proof against every possible unknown secret format; excluded credential contents were not inspected. |
| 3 | Public Supabase CA | **PASS** | `.certs/supabase-root.crt` included explicitly,1367bytes; public X.509 certificate, valid2021-04-28 through2031-04-26. Copied byte-for-byte, checksum verified, Vercel dry-run includes it. Existing Next output-file tracing includes it;64 existing build trace manifests reference it. |
| 4 | Exact inventory / SHA-256 manifest | **PASS** | All176 packaged files verified by SHA-256, sizes and Vercel dry-run SHA-1. All source bytes still match snapshot. Inventory, individual hashes, exclusion inventory, archive and verification output preserved locally; locations below. |
| 5 | Reviewed Vercel project / Production domain | **PASS** | Read-only API reconfirms `mapsilip`, project `prj_qFwAvgeXlE5v517HnJNtXnSPngOZ`, team `team_VjDiMpLXtsEz8SYTIoqHRx74`, domain `mapsilip.vercel.app`. Existing production target is READY at the pinned rollback ID below. Node26.x / Next.js; package retains region `hnd1`. |
| 6 | Missing push config / migration isolation | **PASS locally; hosted signed-in behavior NOT VERIFIED** | Production environment names read without decryption: push flag, VAPID variables and worker secret absent; hiddenProductionEnvCount0. Exact-string gate returns false. Push route regression tests make DB access throw and prove zero calls while disabled. Login/resume, dashboards and ordinary notification reads use existing Auth/RPC/tables, not new push tables. Logout returns before push cleanup RPC when disabled. Candidate migration is excluded and no migration hook/Cron is configured. This establishes absence of a new push-schema dependency; it does not establish health of existing hosted Auth/DB configuration. |
| 7 | Recovery, role routing, pagination review | **PASS locally; hosted recovery NOT VERIFIED** | Fresh targeted suite:32 PASS,0 FAIL,0 skipped. Ordinary signed-in session cannot authorize reset; provider redemption precedes password update; PKCE requires verified recovery AMR; token_hash explicitly verifies recovery. Cookie HttpOnly/Secure/300sec/path-limited. Root resumes authoritative owner/caretaker/tenant routes, signed-out root goes to login; first-password-change restrictions remain. Successive lookup pages and concern pagination reach beyond100, and old responses cannot overwrite newer results. No hosted email/reset attempted. |
| 8 | Safe successful authenticated smoke-test method | **PASS procedure; accounts/results NOT VERIFIED** | Separate browser profiles and existing designated synthetic accounts, reads only after normal sign-in; procedure below. No password or account availability was assumed from an old fixture. |
| 9 | Controlled end-to-end recovery test | **PASS procedure; account/delivery/end-to-end result NOT VERIFIED** | Requires a confirmed existing dedicated synthetic account linked to an eligible organization-team mailbox, and explicit permission to change that synthetic password. No such account/mailbox pairing was verified in this gate. Previously observed mailbox delivery is not proof of a dedicated synthetic recovery identity. |
| 10 | Rollback / preserve current READY deployment | **PASS identity and procedure; execution NOT VERIFIED** | Current domain resolves in Vercel alias metadata to the unchanged READY Production deployment below. Exact rollback command verified against installed CLI help; not run. No deletion, cancellation, promotion, alias assignment or redeployment performed. Rollback caveat below: the old app predates the recovery security correction. |

Fresh targeted command:

```bash
node --test tests/push-off-deployment.test.mjs tests/recovery-grant.test.mjs tests/reset-password-authorization.test.mjs tests/password-recovery.test.mjs tests/resume-session.test.mjs tests/workspace-loading.test.mjs
```

No source changes justified repeating the full build/typecheck/lint here. The immediately preceding reviewed results remain257 standard tests passed,12 isolated PostgreSQL cases passed, successful typecheck/build/client scan, zero lint errors and one existing warning. No hosted SQL or isolated database execution was needed during this packaging gate.

## Exact artifact locations

Persistent evidence directory (intentionally ignored by Git; back up separately):

`/home/keita/Projects/MapSilip/docs/superpowers/evidence/deployment-gate-20261105T092254Z/`

- `inventory.json`: every intended path, byte count, SHA-256 and Git classification.
- `files.txt`: exact176-file path inventory.
- `SHA256SUMS`: per-file SHA-256 manifest, relative to the package root.
- `excluded.json`: exact local excluded paths/reasons; generated dependency/build/Git trees recorded as excluded subtrees.
- `deployment-source.tar`: preserved exact176-file source snapshot; normalized archive metadata, no credentials/environment values.
- `ARCHIVE_SHA256SUMS`: checksum of the source archive.
- `vercel-dry-run.json`, `package-verification.json`, `manifest-verification.log`: independently selected file set and byte/hash comparison.
- `hosted-readonly-evidence.json`: sanitized target/READY deployment and environment **names only**, no values.
- `literal-secret-scan.json`, `ca-build-traces.json`, `source-context.json`, `targeted-checks.log`.

Working package for a later, explicitly authorized upload:

`/tmp/mapsilip-deployment-gate-20261105T092254Z/package/`

SHA-256 of `SHA256SUMS`:

`0def1d8211964a4fec99b5d3ed7c528f75ac1ff501da3f6692be1ebbc4c9d00a`

SHA-256 of `deployment-source.tar`:

`2ccc51f4f84950f295dda4f8aa7b6fee6c34059339532efa9e499cbea75f22b2`

Branch `codex/login-ui-refinement-20261026`; baseline HEAD `37b529b9d9734905bd8c7aed77910f972448d345`. This is an uncommitted working-tree package, not a deployment of HEAD alone. Do not deploy directly from the full repository and assume it equals this snapshot. Any changed file invalidates this gate's exact upload identity.

Verify before any later upload, from the package directory:

```bash
sha256sum -c ../SHA256SUMS
```

If reconstructing from the preserved archive, extract into a NEW empty directory, use its preserved per-file manifest, and repeat the Vercel dry-run. Do not extract over the working repository.

## Upload inclusion / exclusion decisions

Included: all current `app/` code, all9 public PWA/branding assets, package/lockfile, TypeScript and Next configuration/types, ESLint config, proxy, Vercel config/ignore rules and the public CA. There are no symlinks in the package.

Excluded:

- `.env*` including `.env.example`: local values and template are not runtime source; Production supplies its existing configuration. Excluded values were not read or copied.
- `.aws/`, `.codex/`, `.agents/`, `.vercel/`, browser/tool state: local credentials, linkage and tooling. Known project/team IDs are passed explicitly during any later authorized CLI operation.
- `backups/`: local backups may contain sensitive account/data material; never upload.
- `docs/`, root Markdown reports, plans and references: review/design evidence, not runtime files.
- `tests/`, `scripts/`, `supabase/`, `.github/`: test fixtures, operational SQL/migrations and maintenance/CI tooling. Neither build nor runtime imports these paths. Excluding SQL prevents accidental provisioning; no migration execution is configured by the build.
- `.next/`, `node_modules/`, `.git/`, TypeScript build-info: generated outputs, dependencies and version-control internals. Vercel rebuilds source with the lockfile.
- `.gitignore` and `skills-lock.json`: repository/tooling policy, not runtime files. Omitting `.gitignore` FROM THE SNAPSHOT preserves the repository unchanged and prevents its certificate ignore from removing the deliberately included CA. CLI dry-run confirms all176files with zero further ignored files.

No application secret was placed in a `NEXT_PUBLIC_` variable, and no environment variable was edited. The package includes no credentials; the public CA is not a client secret.

## Safe authenticated smoke tests — after separate authorization

1. Owner confirms three EXISTING designated synthetic identities and their authoritative roles/status through existing approved evidence or admin UI; do not create accounts/assignments, read credential files, reset passwords, approve requests or query hosted SQL for this gate. Passwords should be entered directly by the owner in a browser/password manager, never in chat, command arguments, screenshots or reports. If an account is missing, stop that role's test; do not substitute a real tenant or manufacture fixtures.
2. Use three separate fresh browser profiles/contexts on `https://mapsilip.vercel.app`. Disable recording and network/body logging during credentials and callback navigation. Normal sign-in/session creation changes Auth session/audit/admission state; this is expected and must be authorized, although it changes no tenant business record. Do not use the old staff verification script: it is local-only and can perform first-login password transitions.
3. Sign in through the actual `/login` form. Expected destinations: owner `/management`, caretaker `/caretaker`, approved active tenant `/tenant`. Confirm displayed synthetic identity/role and read-only dashboard success, with no500/503. If first-login password change is required, stop and report the precondition rather than changing any password.
4. Owner: view dashboard, rooms/map, tenant directory and concerns/payment pagination. Caretaker: view dashboard, map and maintenance list. Tenant: view dashboard, own billing/profile/maintenance/notifications. Do not submit forms, edit profile/room/assignment, upload proof, mark notifications read, follow a notification action that marks it read, or alter tenant status. Avoid copying real data into evidence; report statuses/counts and redact screenshots.
5. Exercise pagination and search without selecting/editing records. More-than100 live coverage needs existing authorized synthetic data; do not add fake production records to manufacture that case. Automated coverage already tests101+records.
6. Negative read-only checks: signed-out protected routes return login/401; tenant cannot open management/caretaker routes or administrative GETs; caretaker cannot open owner-only screens. Cross-tenant checks require known designated synthetic IDs and assert403/404/empty results without retaining response bodies. Do not enumerate real tenant IDs or issue mutations to test denials.
7. On390px and1440px, check page overflow, focus, navigation, phone-only install invitation and ordinary notification list. Do not grant push or location permission; no push enrollment/dispatch calls. Confirm notification settings say push unavailable and installation remains usable.
8. Log out through the normal UI for each synthetic identity; verify protected access is denied afterward. Logout may revoke that synthetic identity's other sessions under existing policy, so coordinate with its owner first. Save only timestamps, role, URL, HTTP result and redacted evidence, not cookies/tokens/credentials.

## Controlled recovery test — not executed

Preconditions: explicit permission for one dedicated SYNTHETIC account's password mutation and session revocation; accessible eligible organization-team mailbox; owner records its new synthetic password securely. Built-in Supabase recipient/sending restrictions are accepted. No SMTP, external provider or Auth setting change is permitted.

- Do not use an `.invalid` mailbox for delivery. Previously confirmed delivery to an organization mailbox does not establish that its associated account is synthetic or authorize changing its password.
- Start an isolated browser profile at the deployed production URL. Request ONE reset using `/forgot-password`. Keep the same browser profile for PKCE verifier cookies. Open the email link in that profile, rather than an email application's embedded browser. Never paste the link/code or log callback query/cookies.
- Expected callback: `https://mapsilip.vercel.app/auth/callback?next=/reset-password`; clean redirect to `/reset-password`, short-lived HttpOnly recovery grant. Promptly enter a new unique test-only password (grant expires in300seconds). No successful claim until the POST reports success.
- Expected proof: successful ordinary login using the new synthetic password, correct role destination, then logout. Verify the used link cannot change the password again. An invalid/expired/replayed link must fail; an ordinary signed-in session alone must not authorize reset. The last condition is already automated and should not be probed against real accounts.
- Confirm Site URL/redirect allowlist/template behavior from actual navigation and delivery. If the configured template/allowlist, provider AMR or email restrictions prevent completion, report failure and stop; do not edit Auth settings or configure another provider. A consumed/expired link needs a fresh explicitly authorized request; do not trigger repeated emails.
- The test intentionally changes ONLY that synthetic password and its sessions. It is not a read-only test and therefore is not authorized by this gate. No currently verified dedicated recovery account was available here.

## Exact rollback target and procedure — NOT executed

Preserved current production target, verified READY through read-only Vercel deployment/alias metadata:

- ID: `dpl_PGGpmuVGs1uw57qnrWKS8Njk9E48`
- Immutable deployment URL: `https://mapsilip-41tcgn76t-lupalogic-2108s-projects.vercel.app`
- Production alias: `https://mapsilip.vercel.app`
- Project: `prj_qFwAvgeXlE5v517HnJNtXnSPngOZ`
- Team: `team_VjDiMpLXtsEz8SYTIoqHRx74` / `lupalogic-2108s-projects`

After a later authorized deployment, if a critical regression requires rollback, obtain the relevant rollback authorization and run from the correct account:

```bash
vercel rollback dpl_PGGpmuVGs1uw57qnrWKS8Njk9E48 --scope lupalogic-2108s-projects --yes --timeout 3m
vercel rollback status mapsilip --scope lupalogic-2108s-projects
vercel inspect dpl_PGGpmuVGs1uw57qnrWKS8Njk9E48 --scope lupalogic-2108s-projects
```

Then use read-only alias inspection to confirm `mapsilip.vercel.app` points to that exact deployment, GET `/login` and `/forgot-password`, check unauthorized administrative/tenant GETs, and perform separately authorized synthetic login checks. Retain both deployments and their metadata; do not delete or rebuild the rollback target. If CLI access or rollback eligibility fails, stop and use the project's authorized dashboard rollback operation, then independently verify the resulting deployment ID.

**Security caveat:** the rollback target predates the newly corrected password-reset authorization issue. Restoring it restores its older behavior. Prefer a narrow forward fix if feasible; do not present rollback as restoring the new security fix. Any temporary recovery restriction would require separate authorization, not an automatic environment change. Deployment rollback cannot undo Auth/password/session mutations from a later recovery test and cannot remove service workers already installed on phones. Existing SW caches only public offline/icons, not authenticated pages/API data; verify online behavior after rollback and do not forcibly clear sessions or device storage.

## Remaining gates / blockers

- **Required before deployment:** explicit deployment authorization. No packaging defect or push-off migration dependency was found.
- **Unverified acceptance:** actual successful three-role hosted login and the corrected recovery flow. Credentials and a dedicated recovery identity were not available/verified, so these remain open checks rather than assumed passes. For a launch gate requiring verified successful login/recovery before normal use, keep that gate on hold until they pass.
- Existing conditional tenant-only signin limiter warning and materialized lookup/offset-pagination limitations remain documented in `WORKSTREAM_A_READINESS.md`; this task did not change Auth flags or redesign APIs.
- Workstream B: hosted capability/migration/permission audit, category-default approval, credentials, scheduling and physical Android/iPhone background delivery remain held. Do not enable push in either layer during application deployment.

## Preservation statement

No Vercel deployment, GitHub push/commit, hosted Supabase SQL/migration, environment/Auth setting edit, push activation, credential creation, or production data mutation occurred. Both push gates were left untouched and push remains off by default. No existing application/configuration/migration file or `.gitignore` changed. Original Git status matched the initial status before this new local report was added. Only local snapshot, inventory, checksums and audit evidence/report files were created. Await explicit deployment authorization.
