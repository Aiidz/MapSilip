# MapSilip Storage Audit — Phase 0

> **2026-11-15 update:** Hosted storage migrations and private-key provisioning are now applied. Local archives are enabled; production redeployment and final upload-enforcement activation remain pending. Cleanup remains disabled. See [STORAGE_ACTIVATION.md](STORAGE_ACTIVATION.md) for current verification and rollout steps.

Audit date: 2026-11-12. Evidence: current repository and read-only hosted catalog/Storage metadata queries. No file contents, private object paths, or tenant identities were copied into this report.

## 1. Bucket inventory
The connected hosted database has one bucket: `mapsilip_evidence`, private, maximum object size 2,097,152 bytes. Allowed MIME types: JPEG, PNG, PDF. `avatars`, `receipts`, and `maintenance_photos` do not exist in the inspected project. Do not create duplicate buckets merely to match old documentation.

## 2. Usage and quota
Storage object metadata reports **2 objects / 80,517 bytes**. This is the sum of recorded object sizes, not a provider billing measurement or physical storage scan. Provider-reported quota and billing usage were unavailable through the inspected catalog; no quota or utilization percentage is asserted.

## 3. Upload workflows
All discovered uploads use `app/lib/uploads/client.ts`, POST `/api/attachments`, `mapsilip_operate('attachment.begin')`, and Storage API upload into the private bucket. Paths follow authenticated uploader UUID / generated attachment UUID; upsert is disabled. Browser source images are limited to 12 MiB, decoded images to 40 million pixels; normalized uploads are limited to 2 MiB. The route bounds multipart request bodies at 2,200,000 bytes. Metadata is created before uploading bytes.

| Workflow | UI source | Purpose/reference | Current processing |
|---|---|---|---|
| Profile photo, all roles | `ProfilePhoto.tsx` | attachment purpose profile; latest authorized profile metadata is read by `/api/profile/photo` | 512px edge, 180 KiB target, JPEG/PNG |
| Payment receipt | `TenantWorkspace.tsx`, `OperationalWorkspace.tsx` | payments.attachment_id | JPEG/PNG compression; PDFs passed through after signature/size validation |
| Maintenance photo | same workspace components | maintenance_requests.attachment_id | JPEG/PNG compression; current generic route also accepts PDF |
| Rental contract | `AccountRequestsDialog.tsx` | room_assignments.contract_attachment_id | **Images only and recompressed**, original PDFs rejected |

Non-profile images currently share a 2000px / 900 KiB target, which differs from the requested category targets. Client canvas re-encoding and server Sharp rotate/resize strip metadata; actual decode format is checked against supplied MIME for images. PDF validation currently checks only the `%PDF-` signature. Filename extensions are not validated. No separate applicant identity-document workflow was found; ordinary profile images must not be reclassified as identity documents.

Downloads use authenticated proxy GET `/api/attachments?id=…`, metadata RLS, then Storage download under the same session. Contract download names are generated, not original filenames. Responses use private/no-store and nosniff. No permanent signed URLs are stored by this path; signed URL expiry is therefore not applicable to this implementation.

## 4. Existing registry and references
Reuse `public.attachments`; do not introduce a parallel file_assets table. Hosted columns: id, uploader_id, purpose, path, mime_type, byte_size, created_at, discarded_at. Missing for the proposed system: explicit bucket, original filename, SHA-256, archive lifecycle, review dates, failure records and verified archive associations. Paths are stable object identifiers, not public URLs or Base64.

Payments, maintenance requests and room assignment contracts reference attachment IDs using ON DELETE RESTRICT. Registry deletion therefore cannot silently cascade into these business records. Hosted comparison found **0 metadata rows missing objects**, **0 unregistered objects**, and **2 metadata rows**. This does not establish that all registered objects are referenced by an active business workflow; profile files have separate semantics.

## 5. Foreign keys and cascades
Hosted catalog confirms invoices/payments/maintenance reference tenant_profiles with RESTRICT. Room assignments reference tenants and rooms with RESTRICT. Maintenance requests independently retain room_id and tenant_id. Attachments reference Auth uploader with RESTRICT; audit actor references Auth with RESTRICT. tenant_profiles.user_id alone has Auth ON DELETE CASCADE, but dependent restrictive historical relationships can block the upstream deletion. Do not change any of these constraints as part of routine archiving. Account reviewer references use SET NULL; activated applicant identity uses RESTRICT. Contract attachment association also uses RESTRICT.

## 6. Tenant lifecycle
The actual profile constraint supports **active / inactive only**, not moving_out. `mapsilip_private.deactivate_tenant` checks owner approval authority, marks the profile inactive, ends current assignments, and inserts operational audit history. It does not delete Auth, profiles, invoices, payments, maintenance, or attachment records. No implemented checkout inspection, moving_out state, violations table, or owner clearance record was found in the inspected public schema/code. Exports must honestly mark these categories unavailable. Adding these workflows is a separate business/schema decision; do not fabricate clearance history.

## 7. Security findings
The live bucket is private. Storage download policies require authenticated download operations and matching registered attachments. Payments require uploader ownership plus active tenant status, or finance.read. Maintenance requires uploader ownership plus active status, or staff.access.inspect. Contract policies require tenant ownership of the associated assignment plus active status, or tenant.application.approve. Caretaker financial/contract access must remain denied. Profile downloads are restricted by uploader ownership; the profile-photo proxy needs separate role coverage testing.

Storage INSERT requires matching uploader metadata and an unlinked object. The only inspected DELETE policy is owner-authorized unused-contract discard; no general cleanup policy exists. No broad Storage listing policy was present. UUID paths reduce guessing but authorization, rather than unpredictability, must remain the security boundary. Runtime anonymous/cross-tenant/caretaker/owner tests were not performed during this read-only audit; policy inspection alone is not proof of enforcement.

## 8. Orphan and duplicate risks
Metadata is inserted before upload; Storage failure can leave metadata without an object. Successful upload followed by failed business submission can leave an unlinked object. Profile replacement may leave old profile objects. Upload retries generate fresh UUIDs; no content checksum deduplication exists. Existing DELETE `/api/attachments` marks an unused contract discarded, removes its object through the Storage API, then removes unused metadata; a failure between steps needs visible reconciliation. This existing discard workflow is not a verified archive/retention cleanup workflow and must not be reused as such.

## 9. Reusable implementation
Reuse attachments registry, upload policy/client/server utilities, `requireStaffAccess`, origin checks, verified Auth sessions, existing private Storage bucket, guarded RPC conventions, operational_audit, notifications and existing MapSilip overlays/forms. Existing upload tests cover malformed MIME, size bounds and re-encoding. Do not add an email provider.

## 10. Recommended forward-only implementation
1. Category-specific compression; preserve original contract PDFs; improve extension/content validation and upload failure visibility.
2. Add only necessary attachment lifecycle/checksum/original-name fields, immutable archive manifests, owner confirmations, retention reviews and operation failure/audit tables. Record existing attachments as active without asserting unverified checksums.
3. Owner-only RPCs and RLS; bounded owner inventory queries; no public private-file URLs. No existing foreign-key modifications.
4. Bounded export preparation and file streaming with manifest, IDs, record-to-file mapping, checksums, missing-file report and retry. An incomplete export cannot be verified. Owner download and safe-storage confirmation are separate events.
5. Owner-set review dates and existing in-app reminders; configurable 70/85/95 percent warnings only when genuine quota is configured/retrieved.
6. Cleanup requires verified complete archive, external-storage confirmation, completed review, no active/shared dependencies and additional explicit confirmation. Storage API deletion succeeds before lifecycle becomes deleted. No automatic deletion.

## 11. Decisions and production authorization
No statutory retention period is assumed. Owner/legal/accounting guidance is needed for retention dates and legal holds. Moving_out/inspection/clearance requirements need a separately documented model if added. An ordinary ZIP is **not necessarily encrypted**; archives should be stored on an owner-controlled encrypted device/drive/volume. No separate ZIP password or cloud integration is proposed.

Hosted migration application, bucket/policy changes, production deployment and actual object deletion require separate explicit authorization. A completed archive never authorizes deletion. Existing FK behavior must stay intact absent documented approval.

## 12. Unverified items and phase status
Provider quota/billing usage, physical object byte integrity, download checksums, full runtime role matrix, representative image legibility/orientation across mobile browsers, large export resource limits and archived download durability remain unverified. No archives or retention system currently exist, so phases 4–8 cannot be represented as implemented.

Phase 0 inventory and findings are documented; subsequent phases must implement and verify the above changes in order. This audit changed no application code, migrations, buckets, policies, database records or Storage objects. `.gitignore` was not modified. Previously uncommitted repository changes, including the tenant dashboard fix, were preserved.


## Follow-up implementation status

Phase 0 above remains the dated read-only baseline. Local Phases 1–8 are now prepared; see [STORAGE_IMPLEMENTATION.md](STORAGE_IMPLEMENTATION.md) for files, migration, verification evidence, limits and release requirements. Reconnected read-only hosted checks on 2026-11-12 confirm the new migration remains unapplied, required pgcrypto functions are present, and live bucket usage remains 2 objects / 80,517 metadata bytes. Hosted policies and objects remain unchanged. Provider quota remains unavailable. Local tests do not establish production safety.
