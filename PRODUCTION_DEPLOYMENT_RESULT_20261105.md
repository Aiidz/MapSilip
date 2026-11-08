# MapSilip Production deployment — 2026-11-05

**READY in Vercel Production: https://mapsilip.vercel.app**

- New deployment: `dpl_53FcUJvJTeY86Z8fjSwKc6RrZhYV`.
- Immutable deployment URL: `https://mapsilip-7pp9ls0qo-lupalogic-2108s-projects.vercel.app`.
- Project: `mapsilip` / `prj_qFwAvgeXlE5v517HnJNtXnSPngOZ`; team `lupalogic-2108s-projects` / `team_VjDiMpLXtsEz8SYTIoqHRx74`.
- Read-only alias metadata confirms `mapsilip.vercel.app` is assigned to this exact deployment. Build events contain successful compilation and build completion, with zero error events among the100 returned build events. Production READY independently confirms successful deployment.
- Previous deployment `dpl_PGGpmuVGs1uw57qnrWKS8Njk9E48` remains READY and was not deleted, canceled or rolled back. No rollback was executed; separate authorization is required. It predates the recovery security correction and must not be restored blindly.

## Exact package identity

Deployed only the reviewed176 files,1,021,090bytes, from `/tmp/mapsilip-deployment-gate-20261105T092254Z/package/`. Verified the saved SHA-256 manifest, preserved source archive, archive membership, file bytes and public CA before upload, and verified all176 packaged hashes again afterward.

The saved Vercel dry-run selection still matches every path and byte/hash. A fresh CLI attempt could not complete because its saved login had expired; no credentials were changed. The authorized connected Vercel integration uploaded those same176 files by SHA-1, then created Production from their exact references. The first creation request was rejected at input validation because the connector disallowed the optional file-mode field; it created no deployment. Removing that transport-only field changed no path or byte. The corrected request created the single new deployment above.

Read-only hosted source-tree comparison:176files, zero extra files, zero missing files, zero content-hash mismatches. The source tree explicitly includes `.certs/supabase-root.crt`. No local environment, credential, backup, test, script, SQL/migration or generated-build files were uploaded.

- Manifest SHA-256: `0def1d8211964a4fec99b5d3ed7c528f75ac1ff501da3f6692be1ebbc4c9d00a`.
- Preserved source archive SHA-256: `2ccc51f4f84950f295dda4f8aa7b6fee6c34059339532efa9e499cbea75f22b2`.
- Branch/baseline: `codex/login-ui-refinement-20261026`, HEAD `37b529b9d9734905bd8c7aed77910f972448d345`. The deployed package includes reviewed uncommitted work; it is not HEAD alone. No commit or GitHub push occurred.

## Read-only production GET smoke tests

| Route | HTTP | Result |
| --- | --- | --- |
| `/login` |200| PASS; correctly links `/manifest.webmanifest` |
| `/forgot-password` |200| PASS; page only, no email sent |
| `/reset-password` |200| PASS page availability; no password mutation |
| `/manifest` |404| NOT PROVIDED: this shorthand path is not the configured manifest route |
| `/manifest.webmanifest` |200| PASS; actual linked manifest, start_url `/`, scope `/`, standalone display |
| `/sw.js` |200| PASS; `Cache-Control: no-store`, `Service-Worker-Allowed: /`, JavaScript content type, `nosniff` |
| `/offline.html` |200| PASS |
| `/management` |307→`/login`| PASS anonymous guard |
| `/caretaker` |307→`/login`| PASS anonymous guard |
| `/tenant` |307→`/login`| PASS anonymous guard |
| `/api/push/preferences` |200| PASS; available=false, master enabled=false |
| `/api/push/subscription` |405| PASS method restriction; GET only, no subscription mutation attempted |
| `/api/push/dispatch` |405| PASS method restriction; no dispatch POST attempted |
| `/api/operations?resource=notifications` |401| PASS anonymous authorization; no push-schema error |
| `/notifications/open` |404| PASS invalid/missing identifier |
| `/notifications/open?id=11111111-1111-4111-8111-111111111111` |303| PASS; anonymous request redirects to production login with notice continuation; no test notice created |
| `/icon-192.png` |200| PASS |
| `/icon-512.png` |200| PASS |

All smoke requests were GETs without account credentials, with redirects inspected rather than authenticated navigation. No recovery request, reset POST, notification read mutation, subscription mutation, dispatch, business write or hosted SQL was issued. `/manifest`404 does not break installation because application metadata links the successful `/manifest.webmanifest`; the immutable approved package was not changed to add an alias.

## Push remains OFF

Production environment metadata was reconfirmed after deployment without decryption: `MAPSILIP_PUSH_ENABLED`, VAPID variables and worker secret remain absent; hiddenProductionEnvCount0. The reviewed exact-string gate treats absent configuration as false. Live preferences report unavailable and disabled. Both application layouts and logout cleanup use this gate without requiring push tables. Existing dashboard/ordinary notification paths use their original Auth/RPC/table dependencies. The candidate migration remains unapplied by this task.

The pre-deployment regression tests prove disabled push handlers return before any DB call even when the DB dependency throws. Combined with the identical hosted source hashes and live disabled response, this verifies the push-off path without executing hosted SQL or a worker. No hosted DB tracing was performed; the report does not claim every unrelated normal Auth/database call was traced.

## Not verified / remaining limits

- Successful owner/caretaker/tenant login, signed-in dashboards and role-specific production workflows: NOT VERIFIED in this deployment task; no authorized synthetic credentials were used.
- Real email delivery, reset-link redemption and new-password login against hosted Auth: NOT VERIFIED; no email sent or real/test password changed.
- Physical Android/iPhone installation and background push delivery: NOT VERIFIED. Push activation remains on hold pending its separate hosted audit, configuration, migration, category/default review and physical acceptance.
- No broad production log/secret-exposure claim is made from the build-event summary. The previous local client artifact scan and packaging secret-pattern scan remain the reviewed evidence, not an exhaustive audit of all hosted logs.
- `/manifest` is404; the configured browser manifest is200 at `/manifest.webmanifest`.
- Existing conditional tenant-only signin limiter and lookup/offset-pagination limits remain documented in `WORKSTREAM_A_READINESS.md`; no Auth flags or unrelated behavior were changed.

Evidence: `docs/superpowers/evidence/production-deployment-20261105/` contains deployment/alias/source comparison, environment-name-only verification, build summary, exact inventory/manifest and timestamped GET results. The source archive remains in the preceding deployment-gate evidence directory. Both evidence directories are ignored by Git and require separate backup.

## Preservation

No Supabase SQL/migration, push gate activation, VAPID/worker/Vault/scheduler setup, credential/environment/Auth setting change, tenant/payment/room/concern/account mutation, Git commit/push/reset, unrelated application edit or `.gitignore` modification occurred. Original Git status was unchanged after deployment before creating this new local report. Only the explicitly authorized Production deployment and its normal production-domain assignment changed hosted state. No rollback was executed.
