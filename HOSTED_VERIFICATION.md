# Hosted Supabase verification — 2026-11-03

Project: atuqxpiandeutimdkgag. No Vercel deployment performed. Production staff/tenant auth flags remain false.

Validation used the existing local application against hosted Supabase. It does not prove Vercel ingress, deployed cookies, or production callback routing.

## Results

- PASS: existing synthetic owner and caretaker Auth identities match active authoritative database mappings, verified through the existing narrow staff sign-in command.
- PASS: designated synthetic staff credentials prepared; prior synthetic sessions globally revoked. Passwords are stored only in the ignored local credential file with mode 0600. No real user password was changed.
- PASS: owner/caretaker login, active access snapshots, staff RLS markers, owner-only financial boundary, logout, and post-logout denial.
- NOT VERIFIED: mandatory first-login replacement; both existing staff mappings had already completed it, so the flag was not reset.
- PASS: synthetic tenant request, pending denial, caretaker review denial, owner approval and room assignment, original-password login, own-profile/assignment RLS, admin denial, cross-tenant profile/assignment denial, and logout. Cross-tenant checks only read opaque identifiers; other tenants' records were not modified.
- PASS: one Supabase Auth password-reset request to the user-designated organization-team mailbox was accepted; the user confirmed arrival in Inbox. No password update was performed for that real mailbox.
- NOT VERIFIED: complete password-reset callback/update round trip, hosted Site URL, redirect allowlist, or reset email template. Production URL is not deployed.
- NOT VERIFIED: execution of supabase/review/production-readiness.sql and comparison of all 21 hosted migration versions/names. The local MCP configuration lists the correct project with OAuth, but this conversation exposes no Supabase administration tools. No missing/extra/mismatched migration conclusion can be made.
- PASS: application-level email delivery remains removed. Built-in mail restrictions are accepted and not an SMTP/provider deployment blocker.

## Preserved synthetic fixtures

```json
{
  "roomId": "7cb361a1-af4a-48b9-9cc1-f6507293ba7b",
  "roomName": "SYNTHETIC-READINESS-261103",
  "requestId": "a3d3627d-2a0c-4a0a-af5a-f3ec359a1876",
  "tenantId": "bc0824fc-5679-4281-a2f5-9311d97fe02e"
}
```

The synthetic room, approved request, tenant profile, assignment, related notifications/audit events, and normal auth test events remain in the hosted project. No cleanup/deletion was performed.

Private test credentials: .env.mapsilip-test-accounts.local (mode 0600; Git-ignored). Do not include its contents in reports, commits, or deployment uploads.

Staff harness: 17 passing checks, 2 first-login checks not run. Tenant workflow: 19 passing checks.

## Remaining actions

Restore Supabase administration tools to the active conversation, execute the read-only audit, verify hosted Auth URLs/template without changing settings, and complete production callback testing after an authorized deployment. Leave both Production auth flags false; enabling them requires separate authorization after validation.

## Authorized readiness fixture removal — 2026-11-03

The user explicitly requested removal of the synthetic readiness tenant and room. Before deletion, targeted read guards confirmed the exact reserved synthetic identity and room label, no other occupants, and no dependent payments, invoices, maintenance, concerns or visits. An app-row backup is preserved privately at `backups/production/synthetic-readiness-removal-20261103.json` (0600); it contains no Auth password hashes.

Removed only the readiness tenant's notifications/request/assignment/profile, its `Synthetic validation only` room, and its Auth identity. Historical audit evidence and existing owner/caretaker identities were preserved. Removed the deleted tenant's credentials from the ignored test-account file.

Read-only post-cleanup verification: synthetic room 0, profile 0, assignment 0, Auth identity 0; normal rooms 24. No schema/migration SQL or real tenant record was changed.
