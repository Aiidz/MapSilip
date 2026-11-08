# MapSilip production push activation — 2026-11-06

## Authorization

Owner authorized completing migration/configuration/scheduling/device validation/activation, approved category defaults and mailto:lupalogic@gmail.com, and confirmed direct-database-user trust. The latest instruction explicitly waived further testing and requested continuation. No additional automated, synthetic-delivery or physical-device test run is being performed. Unknown plan/network/PostgREST configuration facts are waived verification gaps, NOT newly verified or repaired settings. Do not claim guaranteed delivery.

## Work performed so far

- Applied the reviewed mobile_push SQL candidate to the intended hosted project. All6 private push tables have RLS enabled and the4 worker RPCs exist. No old migration repair/reapplication.
- Generated a VAPID pair and worker secret without displaying their values. Stored only Production environment configuration; worker secret also stored in Vault. Public subject mailto:lupalogic@gmail.com.
- Prepared mapsilip-push-dispatch Cron job, once/minute, initially inactive. HTTP endpoint uses a Vault-resolved Bearer header and35000ms timeout. Literal worker credential is not in the job definition.
- Database runtime enabled and Production application flag configured true for the new deployment. Existing deployment remains unchanged until the new build completes. Scheduler remains inactive during deployment.
- Reconstructed the original verified176-file application package from the preserved archive. Individual SHA-256 hashes and archive/manifest SHA-256 all match. No local credentials, newer working-tree edits, SQL migrations, reports, tests or backups are uploaded.
- New Production build requested: dpl_E414gWvjFzzjNnSqdSPoJnYXQgzY. Deployment completion and scheduler activation pending at this log entry.

## Known limitations

No successful user enrollment or actual Android/iPhone background receipt/tap/revocation has been tested in this activation run. Previously verified local regression evidence is historical. PostgREST commit/timeout-hoisting, actual remaining quotas and network policy remain incompletely verified. No account password, tenant, room, invoice, payment or concern was altered; no synthetic notification was created. Normal future in-app events can enqueue pushes only for explicitly enrolled eligible recipients with matching account-wide category preferences.

## Final activation state

Production deployment dpl_E414gWvjFzzjNnSqdSPoJnYXQgzY is READY. https://mapsilip.vercel.app points to it. API source-tree comparison confirms all176 approved files and hashes match; public CA included. No new application source changes.

Database runtime=true. Production MAPSILIP_PUSH_ENABLED=true was configured before this build. mapsilip-push-dispatch is active on * * * * *, running as postgres; Vault contains exactly one named dispatcher secret. Enabled subscriptions0 at activation. No synthetic notice or provider test was sent. The scheduler will run normally; no evidence of successful physical-device delivery is claimed.

Hosted push migration name mobile_push was recorded by MCP at version20261106074954; its SQL came from the reviewed20261105021728_mobile_push.sql candidate. This is a recorded version mapping, not an instruction to reapply the candidate. Old migration histories and SQL remain preserved.

Production variable names configured: NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY, WEB_PUSH_VAPID_PRIVATE_KEY, WEB_PUSH_VAPID_SUBJECT, MAPSILIP_PUSH_WORKER_SECRET, MAPSILIP_PUSH_ENABLED. Private values were not printed in reports. Temporary local credential material was removed after secure hosted storage; the public contact is mailto:lupalogic@gmail.com.

## User enrollment

Sign in, open App and notifications, install when offered on a supported phone, then explicitly enable notifications and review categories. iPhone requires an installed Home Screen web app on iOS16.4+; open it from the Home Screen. Android Chrome supports the applicable installation/permission flow. Browser/OS permission remains device-specific; notification categories/master settings are account-wide. Existing permission denial must be changed in device/browser settings; application code cannot override it.

## Delivery and acceptance limitations

Physical Android/iPhone background delivery, tap navigation and successful authenticated enrollment remain NOT VERIFIED. No new automated or device test run was performed, per the owner's latest direction. The scheduler/gate/configuration status checks establish activation, not delivery reliability. Supabase remaining quotas/network and PostgREST commit/timeout-hoisting facts remain incompletely verified. The source still enforces authentication, account/session eligibility, preferences, rate limits, lease fencing, request budgets and endpoint validation; none was weakened to activate.

## Operational pause (requires authorized administration)

Pause the named Cron job and set mapsilip_private.push_runtime.enabled=false to stop further claims/queueing. Setting MAPSILIP_PUSH_ENABLED=false also requires a new Vercel deployment to change existing function environment. Do not delete business records, secrets, subscriptions or tables as a pause operation. Already accepted OS notifications cannot be recalled. Do not automatically roll back to a deployment predating the password-reset fix.
