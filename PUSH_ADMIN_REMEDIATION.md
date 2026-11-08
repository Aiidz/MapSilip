## Correction: supported Supabase security boundary — 2026-11-06

Official Supabase guidance explicitly says per-project changes to managed pg_net grants/policies are unsupported. The previous recommendation to ask support to execute our grant-revocation script was incomplete and must not be treated as a supported deployment requirement. See https://supabase.com/kb/troubleshooting/revoking-access-to-pg_net-objects-has-no-effect-0bbc16 and https://supabase.com/kb/troubleshooting/database-roles-can-read-request-headers-queued-by-pg_net-ad6357 .

Supported evaluation instead requires net excluded from exposed Data API schemas and restricting direct database login to trusted services. Every direct database login must be trusted with queued HTTP authorization headers. Vault protects the secret at rest but does not hide decrypted queued headers from such database roles. Do not activate until the project owner reviews and accepts this precise trust boundary and actual exposure/login-role evidence passes. This is a platform constraint, not a defect that can be repaired through another revoke migration. No change to architecture, roles, credentials or Data API configuration is authorized by this correction.

The prepared administrator script is retained as historical review material, NOT a recommended supported action. Do not run it or delete previously recorded migration history. Support should instead confirm the supported boundary and current project configuration. Missing Data API, PostgREST, plan and function-limit evidence remains open.

# Required Supabase administrator remediation

Project: atuqxpiandeutimdkgag. Date:2026-11-06.

Current confirmed blocker: net objects/grants are owned by supabase_admin. MCP executes as postgres; pg_has_role(postgres,supabase_admin,MEMBER) and USAGE both return false. Ordinary anon/authenticated roles retain net queue/response privileges and HTTP-function EXECUTE. No Internet exploit has been demonstrated; Data API schema exposure remains unverified. Do not enqueue worker credentials until this is resolved.

The existing privilege migration20261106000410 recorded successfully but did not remove the managed-owner grants. Repeating it through the same connection will not establish security. Do not delete the history record or claim the fix passed.

An authorized Supabase administrator/support operator must review and execute `supabase/review/pg-net-admin-hardening.sql` under the managed grant-owner identity. The script rejects the currently available postgres role before modifications. It verifies effective API-role denial before commit, preserving postgres administration and the extension owner. It cannot silently pass if the original permissions remain. This file has been prepared, not executed or empirically tested under supabase_admin.

Suggested support request (not sent):

> Please review pg_net0.20.4 permissions for project atuqxpiandeutimdkgag. After enabling the extension, PUBLIC has queue/response table access and net-function EXECUTE; anon/authenticated also have net USAGE. We plan to enqueue an Authorization header read from Vault, so require least privilege before provisioning. The managed objects/grants belong to supabase_admin; our postgres role is not its member and our revoke migration did not change the grants. Please provide the supported admin remediation or execute the attached reviewed transaction under the grant-owner identity. Preserve postgres/managed worker administration. Do not create secrets, jobs, HTTP requests or enable push. Confirm effective schema/table/sequence/function privileges for anon/authenticated afterward, and whether managed extension updates will restore broad grants.

Keep net, cron, vault and mapsilip_private outside exposed Data API schemas. Actual schema exposure, PostgREST transaction/timeout configuration, account quotas/network and effective Vercel function duration still need the read-only evidence listed in PUSH_HOSTED_READINESS.md. Current connector tools do not expose those account settings. Do not infer them from generic plan documentation or change credentials to bypass access.

Still verified: installed pg_cron1.6.4 and pg_net0.20.4; zero jobs, zero queued requests; no hosted push runtime table. No new hosted writes were made while preparing this remediation. Push remains disabled. No paid plan, migration-history repair, deployment or client-policy implementation is authorized by this document.
