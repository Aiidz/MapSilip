# Storage, archives and retention — local implementation

> **2026-11-15 update:** Hosted storage migrations and private-key provisioning are now applied. Local archives are enabled; production redeployment and final upload-enforcement activation remain pending. Cleanup remains disabled. See [STORAGE_ACTIVATION.md](STORAGE_ACTIVATION.md) for current verification and rollout steps.

Date: 2026-11-12. Companion audit: [STORAGE_AUDIT.md](STORAGE_AUDIT.md).

## Release status

Local code and one forward-only migration cover Phases 1–8. This is **not an activated or production-verified storage system**. The migration has not been applied to hosted Supabase; no hosted policies, buckets, environment variables or objects have been changed. No deployment was performed. Both new server flags default off. Preserve that state until the release checks and separate authorization below are satisfied.

## Phase-by-phase result

| Phase | Local implementation | Verification / remaining boundary |
|---|---|---|
| 0 | Live metadata, FK, lifecycle and code audit documented | Live private bucket: 2 objects, 80,517 recorded bytes. Provider quota unavailable. |
| 1 | Existing compression utility extended by category; async browser encoding; actual image decoding, MIME/extension/size checks; original PDF and contract-image bytes retained; upload hashes/original names/failure state | Synthetic fixtures tested. Human legibility checks using representative real receipts and mobile orientation checks remain required. |
| 2 | Existing private bucket retained; session-scoped proxy downloads; owner-only API and database RPC/RLS for archives; trusted upload/export receipts | Local non-owner/anonymous tests and existing application authorization tests pass. Real hosted role/browser/Storage tests remain pending. No public buckets or permanent signed links added. |
| 3 | Existing soft deactivation, historical assignment, tenant attribution and property-centric maintenance links retained; no FK replacement or hard-deletion workflow | Current schema has active/inactive only. moving_out, checkout inspections, violations and clearance records are absent and explicitly reported unavailable. Their business workflow is not invented here. |
| 4 | Existing attachments registry extended; archive jobs/items, review records, events and settings added; SHA-256, stable paths, lifecycle, upload failures and timestamps supported | Migration compiled/executed only in isolated PostgreSQL WASM with pgcrypto and synthetic data. Existing rows are labelled legacy, not falsely asserted validated. |
| 5 | `/management/storage`, owner navigation and More link; measured usage, registered category sizes, failures, missing/unregistered candidates, largest/recent files, paginated history and reviews | Component fixture checked at 360, 390 and 1440px with no horizontal overflow or console errors. Does not establish real authenticated browser behavior. |
| 6 | Tenant, room maintenance, date-range, selected-ID and full business scopes; bounded immutable record snapshots; paginated downloads; checksums; ZIP parts and manifest; visible incomplete reports; explicit external-storage confirmation | Independent Python ZIP reader validates original bytes/CRC. Missing files and checksum mismatch tests reject completion. Large synthetic export uses multiple bounded parts. |
| 7 | File and business-record review dates/decisions; retained/cleanup-review states; owner portal activity creates deduplicated in-app reminders; quota thresholds configurable | Defaults 70/85/95, used only for warnings when a quota is supplied. Owner-configured quota is labelled unverified; no fabricated provider quota. No statutory retention periods or deletion scheduler. |
| 8 | Separate per-file typed confirmation; archive/download/safe-storage/review/dependency/active-workflow gates; signed verification receipts; Storage API removal; absence verification; audit and retry/cancellation states | Synthetic DB tests reject premature finalization while an object exists and preserve business/Auth records. No real Storage object has been removed or destructive hosted test run. |

## Files introduced

- `app/api/storage/route.ts`: bounded owner-only inventory, export, review and cleanup API.
- `app/lib/storage/server.ts`: current staff-authority checks, feature gates and guarded RPC adapter.
- `app/lib/storage/link-failure.ts`: uploader-scoped, deduplicated failure audit after failed business submissions; originals retained for owner review.
- `app/lib/storage/receipts.ts`: server-only HMAC receipts binding trusted upload/export verification to exact item IDs/checksums.
- `app/lib/storage/export.ts`: sequential file integrity checks, bounded export, progress, explicit part downloads and completeness reports.
- `app/lib/storage/zip.mjs`, `zip.d.mts`: dependency-free uncompressed ZIP writer preserving original files.
- `app/components/StorageManagementWorkspace.tsx`: existing-style owner workspace and explicit confirmations.
- `app/components/StorageReviewReminders.tsx`: owner-portal reminder check, not a deletion job.
- `app/management/storage/page.tsx`: owner guard and workspace entry point.
- `tests/storage-archives.integration.test.mjs`: optional isolated PGlite/pgcrypto migration and lifecycle/security test.
- `tests/storage-export.test.mjs`: archive integrity, missing files, independent ZIP reader and bounded-part tests.
- `tests/fixtures/pdf.mjs`: synthetic valid PDF for preservation/validation tests.
- `STORAGE_AUDIT.md`, this report and the local execution plan.

## Existing files extended

- `.env.example`: disabled activation flags and empty private receipt-key placeholder. No actual credentials added.
- `app/lib/uploads/{policy.mjs,client.ts,server.ts}`: category targets and original-document preservation.
- `app/api/operations/route.ts`, `app/api/account-requests/review/route.ts`: record failed attachment linking without automatic deletion.
- `app/api/attachments/route.ts`: extensions, trusted finalization, historical-file empty state, and retirement of unarchived DELETE behavior.
- `app/api/profile/photo/route.ts`: excludes removed/unvalidated new profile files when the storage system is enabled.
- `app/components/AccountRequestsDialog.tsx`: PDF/original-contract selection; leaving or switching a form no longer deletes uploaded objects.
- `app/components/AppShell.tsx`, `app/management/{layout.tsx,more/page.tsx}`: owner navigation/reminders.
- `app/lib/pwa/notification-navigation.ts`: owner storage reminder destination.
- `app/globals.css`: responsive styles using existing panels/colors/forms.
- `tests/account-request-notifications.test.mjs`: loads the real optional failure logger in the existing route harness.
- `tests/upload-compression.test.mjs`: new category dimensions and original PDF/image preservation expectations.

All unrelated working changes were preserved. `.gitignore` was not modified.

## Migration

New: `supabase/migrations/20261112145412_storage_archives.sql`.

It extends `attachments` rather than adding a duplicate registry. It adds archive snapshots, retention reviews, audit events, settings and a private signing key; enables RLS on new public tables; installs owner-only guarded RPCs and reference/reactivation guards; replaces the unused-contract deletion policy with archive-authorized cleanup; and permits original PDFs in the existing guarded contract-review function. The replacement validates that the expected original function fragment is present and aborts otherwise.

No existing foreign key or its ON DELETE behavior is changed. All new identity/business references use RESTRICT. No historical records or metadata are deleted. Existing migrations are not edited or reapplied. The signing-key table is private and inaccessible to anon/authenticated/service_role; the actual key must never be logged, returned to browsers, or placed in a NEXT_PUBLIC variable.

## Bucket and access behavior

No new buckets or visibility changes. Existing `mapsilip_evidence` remains private with its 2 MiB limit and JPEG/PNG/PDF types. New local policies add owner inventory/download and separately authorized cleanup. The old unused-contract delete policy and its RPC execution grants are retired by the pending migration.

Tenant and caretaker financial/contract access is not broadened. The existing authenticated download proxy is retained rather than adding signed URL distribution. It validates metadata authorization and streams one small object per request with private/no-store and nosniff headers. A removed original produces an explicit archived-file response, while its business record and attachment metadata remain.

New business links require server-validated uploads. A direct Storage upload alone cannot mark a new registry entry validated or attach it to a new payment/maintenance/contract record. Legacy existing rows remain usable and are explicitly labelled, not backfilled with fictitious checksums. Original profile files are private; no applicant identity-document workflow was found or added.

## Measured upload examples

These are generated synthetic fixtures, not production files, a typical-user benchmark, or proof of receipt legibility. Sizes below are server utility measurements on the current machine; already-small files are never enlarged to meet a target.

| Fixture | Before bytes | After bytes | Result |
|---|---:|---:|---|
| Textured photo as profile | 1,369,004 | 33,420 | 512 × 341, aspect ratio preserved |
| Same photo as maintenance | 1,369,004 | 446,612 | 1600 × 1067 |
| Text receipt raster | 850,065 | 252,917 | Close to the 100–250 KB target; target is advisory |
| Original synthetic PDF contract | 329 | 329 | Byte-for-byte unchanged |

Profile target: 180 KiB; maintenance: 600 KiB; receipt: 220 KiB. Receipt quality stops at a higher floor to favor readability. Existing maximum upload size stays 2 MiB, including original contracts; larger original contracts are rejected with feedback rather than altered. Changing bucket/payload limits needs a separate resource review.

PDF checking validates header, EOF/startxref structure and xref presence; it is not a malware scan, a signature-verification system, or a complete implementation of the PDF specification. Contract images are fully decoded for validation and returned unchanged. Ordinary photos are re-encoded, EXIF orientation applied on the server, metadata removed and dimensions bounded. Client-side canvas/toBlob work is asynchronous where browser APIs permit; it is not a full off-main-thread worker pipeline.

## Archive format and verification

1. Owner selects tenant UUID, room UUID, a created-date range, up to 100 selected stable record IDs, or the full business system.
2. A bounded database transaction snapshots authorized business rows and attachment metadata. It takes short SHARE/NOWAIT source-table locks so competing writes cause a retry rather than an inconsistent snapshot. Snapshot preparation is not a background worker; contention and timing must be measured in staging.
3. Safety caps are 25,000 business/audit records and 25,000 file references per job. Larger scopes fail visibly and require partitioning; no truncation is accepted. Full-system preparation also refuses unregistered objects until classified.
4. The browser reads at most 25 manifest rows per request and one attachment per request. File bytes are bounded by the existing 2 MiB bucket limit. Server and browser SHA-256 values and stored sizes must agree. Record JSON is hashed too. Trusted delivery receipts require HMAC verification in PostgreSQL.
5. Original files and individual JSON records are written into uncompressed ZIP parts, targeting at most 8 MiB each plus bounded ZIP directory overhead. An explicit owner click downloads each part before processing continues. The full archive is never held as one byte buffer.
6. Each ZIP contains a part-manifest.json with IDs, original bucket/object path/name, MIME, metadata, sizes, SHA-256 hashes and record-to-file mappings. The final JSON manifest lists scope, part filenames/hashes/counts and expected/exported totals. Detailed mappings are bounded to one part in browser memory, rather than accumulating the whole inventory. Absent schema categories and excluded Auth/security credentials are explicit.
7. Missing, unreadable, changed or size-mismatched sources produce an INCOMPLETE report and failed job. Successful parts do not silently make a failed archive complete. Retry uses the same frozen job snapshot and downloads the package again; it may repeat already downloaded parts to avoid trusting lost browser state.
8. Only after all item acknowledgements match can the owner separately confirm every part/manifest finished downloading and was safely stored. Browser download gestures cannot prove OS-level persistence or an encrypted drive; explicit owner attestation is necessary. ZIP parts are not encrypted. Store all parts and the manifest on an owner-controlled encrypted device/drive/volume.

Snapshots contain business data, never file bytes or Base64 images. Auth/session/security-account secrets and invitation hashes are excluded. A minimal user-ID/contact-email projection is included only for the tenant profiles already within the chosen scope; raw Auth rows are never serialized. Snapshot/audit metadata grows in PostgreSQL and is intentionally not automatically purged; monitor database usage separately. There is no restore-to-production feature in this task.

## Retention and cleanup

Owners set review dates and retain/cleanup-review decisions for files or relevant existing business records. No legal period is guessed. Reminders are checked on owner portal activity and manually in the storage workspace, and deduplicated by day. They cover upcoming/overdue review, inactive tenant files awaiting archives, failed archives/uploads, orphan candidates and configured usage thresholds. There is no unattended reminder scheduler; a signed-out owner receives the in-app check on their next portal session.

Cleanup requires an identified business/profile record, no unknown/shared dependency, no active workflow, completed file review, a verified matching archive, owner download/safe-storage confirmation and typed confirmation for the exact file UUID. Unregistered objects and unlinked non-profile uploads remain blocked until classified; they are review candidates, not automatic garbage. No bulk-delete or age/usage-triggered deletion exists.

Claiming a deletion locks the asset and records actor/time. Reference and tenant-reactivation guards serialize against the pending deletion. The API calls Supabase Storage remove, checks object absence through Storage, then finalizes deleted metadata; the database independently refuses finalization if the Storage catalog still contains the object. Failure leaves a visible pending/audit state. Owner retry is idempotent. Pending cleanup can be cancelled only while the original is still present. Business rows and file-reference metadata are retained.

## Verification performed

- Full suite with isolated storage integration enabled: **364 tests; 349 passed, 15 skipped, 0 failed** at the recorded run. The skipped tests depend on other optional existing infrastructure.
- The storage migration was compiled/executed in temporary PGlite PostgreSQL with real pgcrypto and synthetic schema/data. Tests cover owner scoping, forged receipts, incomplete archive denial, review gating, non-owner/anonymous denial, direct-table RLS/privilege denial, object-present finalization denial, and preservation of payment/Auth records. Synthetic identity/permission helpers are fixtures, not proof of hosted Auth enforcement.
- Export unit tests cover independent Python ZIP reading, traversal rejection, memory caps, complete manifests, failed checksums/missing sources and multi-part output.
- Typecheck and production build passed at the recorded run.
- Full lint currently reports an existing render-time Date.now error in `AnalyticsWorkspace.tsx:57` and a pre-existing RoomContextPanel dependency warning. New storage files have no reported lint errors. These unrelated local edits were preserved.
- Browser component fixture: 360×800, 390×844 and 1440×1000; document width matched viewport, native keyboard focus worked, dark background used existing CSS, and browser error list was empty. This used synthetic API responses outside the app, not a bypass of application authentication. No screenshots were captured.
- Reconnected Supabase read-only checks confirm pgcrypto functions exist in `extensions`, the expected source contract function matches, and this new migration is not applied. Live bucket still has 2 objects / 80,517 metadata bytes.

Reproduce the optional SQL test without adding an app dependency:

```sh
npm install --prefix /tmp/mapsilip-storage-sql-review --no-audit --no-fund @electric-sql/pglite@0.5.16
STORAGE_PGLITE_ROOT=/tmp/mapsilip-storage-sql-review/node_modules/@electric-sql/pglite node --test tests/storage-archives.integration.test.mjs
```

## Authorization and release checks still required

1. Review the forward-only migration, its short source-table lock behavior, caps and private key provisioning; confirm legal/accounting retention guidance separately. No FK change is proposed.
2. Authorize hosted migration/policy changes explicitly. Inspect migration history first and apply this version once; do not blindly push other pending local migrations or authorize unrelated changes; never replay prior migrations or run reset.
3. Through an authorized administrator, provision the private DB receipt-key value into server-only `STORAGE_RECEIPT_SECRET` securely without logging it. Keep key material out of browser/public variables. Inventory preflight verifies that DB/server keys match.
4. Authorize deployment separately. Apply the reviewed schema and provision the key before enabling `STORAGE_MANAGEMENT_ENABLED=true`. Leave `STORAGE_CLEANUP_ENABLED=false` initially.
5. In staging or another explicitly authorized test environment, exercise actual anonymous, tenant, different-tenant, caretaker and owner sessions against both API and Storage; test original PDFs, real receipt readability, replacements, failed uploads/links, move-out history, quota warnings, concurrent snapshot/cleanup and interrupted downloads.
6. Verify a downloaded complete archive independently, including record counts, part/file hashes and recovery/readability. Confirm encrypted external storage.
7. Only after separate cleanup activation authorization, enable its server flag. Every real deletion still requires its own owner confirmation and all eligibility checks. No real deletion was tested in this implementation.

Provider quota, full hosted role matrix, actual Storage deletion/retry behavior, real mobile image legibility, source-lock timing under load, OS download persistence and external-device encryption remain unverified. Do not describe this local implementation as production-safe solely because the unit/build checks pass.

**Safety confirmations:** `.gitignore` was not modified. No production database records or Storage objects were deleted. No hosted migration or policy change was applied. No production deployment was performed. No external email or cloud-storage provider and no app runtime dependency were added.

## Existing migration files left untouched

- `supabase/migrations/20261025081017_staff_authorization.sql`
- `supabase/migrations/20261025081034_staff_security_probes.sql`
- `supabase/migrations/20261026123837_tenant_profiles.sql`
- `supabase/migrations/20261026150000_operational_core.sql`
- `supabase/migrations/20261026150010_operational_access.sql`
- `supabase/migrations/20261026150020_operational_commands.sql`
- `supabase/migrations/20261026150030_operational_dashboard.sql`
- `supabase/migrations/20261026150040_project_ping.sql`
- `supabase/migrations/20261026150050_tenant_role_exclusivity.sql`
- `supabase/migrations/20261026150060_visit_notifications.sql`
- `supabase/migrations/20261026150070_payment_retry.sql`
- `supabase/migrations/20261026150080_invitation_renewal.sql`
- `supabase/migrations/20261026150090_currency_safe_dashboard.sql`
- `supabase/migrations/20261026150100_payment_status_summary.sql`
- `supabase/migrations/20261026150110_payment_monthly_summary.sql`
- `supabase/migrations/20261026150120_visit_times.sql`
- `supabase/migrations/20261026150130_concern_categories.sql`
- `supabase/migrations/20261027120000_tenant_approval_and_room_assignment.sql`
- `supabase/migrations/20261029120000_room_context.sql`
- `supabase/migrations/20261029130000_tenant_directory.sql`
- `supabase/migrations/20261029150716_storage_authenticated_reads.sql`
- `supabase/migrations/20261105021728_mobile_push.sql`
- `supabase/migrations/20261106000129_enable_push_prerequisite_extensions.sql`
- `supabase/migrations/20261106000410_restrict_pg_net_api_role_access.sql`
- `supabase/migrations/20261106081010_push_device_controls.sql`
- `supabase/migrations/20261108141329_push_prompt_dispatch.sql`
- `supabase/migrations/20261108153140_foreground_notification_realtime.sql`
- `supabase/migrations/20261110162913_notification_tenant_profile_photos.sql`
- `supabase/migrations/20261111144908_room_gender_and_monthly_rent.sql`
- `supabase/migrations/20261111145817_editable_room_rent_policy.sql`
- `supabase/migrations/20261112053637_access_review_contracts.sql`
- `supabase/migrations/20261112100000_applicant_room_preference.sql`
- `supabase/migrations/20261113090000_automatic_monthly_rent.sql`
- `supabase/migrations/20261113100000_cash_payment_review.sql`


## Phase 8 corrective completion — 2026-11-14

The cleanup executor now independently validates the typed UUID confirmation and the exact registered bucket/object identity before calling Storage. It rejects unexpected buckets and mismatched object IDs, preserves pending state on removal/verification/finalization failure, and safely returns for already-deleted retries. Ten focused executor tests cover these paths. Owner authority, activation flags, database eligibility checks and Storage absence verification remain mandatory. No production cleanup or activation was performed.

Additional files: `app/lib/storage/cleanup.ts`, `tests/storage-cleanup.test.mjs`; updated `app/api/storage/route.ts` uses that executor.

## Dashboard export simplification — 2026-11-15

The dashboard Export Data action now opens the existing responsive dialog/bottom sheet. Separate storage navigation was removed; old storage links redirect to the dashboard export dialog. New export is the default, with past exports and storage reviews in secondary tabs. Tenant/room exports use searchable, paginated choices rather than UUID entry. Existing owner authorization, review controls and cleanup guards remain enforced.

Export ZIP parts now include separate real OOXML Excel workbooks by record category, original attachments grouped by purpose, an attachment-index workbook, and a README. Raw snapshots and checksum mappings remain in `_verification/` for integrity checks. The final report is a ZIP containing an Excel summary and the verification manifest. Larger exports contain per-part workbooks; all parts must be retained together. Original attachment bytes remain unchanged. Excel cells use literal strings to prevent formula injection; long text continues in additional columns.

Verification: 382 tests (366 passed, 16 skipped), targeted exporter/workbook tests, typecheck, isolated production webpack build, and diff whitespace checks passed. Independent openpyxl reader verified generated workbook values, leading-zero references, formula safety, freeze panes and filters. Browser fixture checked 1440, 390 and 360px with no horizontal overflow, searchable target selection and multipart download progression. No screenshots were captured. Real authenticated browser verification was unavailable: local signin returned 503. Full lint retains the existing AnalyticsWorkspace render-purity error and RoomContextPanel dependency warning; changed files pass targeted lint. No deployment, hosted schema changes or deletion was performed in this UI/export pass.
