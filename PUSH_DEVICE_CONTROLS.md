# Device-only push controls — 2026-11-06

## Behavior

Push controls now offer Enable notifications on this device / Disable notifications on this device. No category selector, account checkbox, Save-account-preferences control or account-wide opt-out is exposed. Browser permission is still requested only from an explicit Enable click. Ordinary in-app notifications, installation and the existing delivery/category policy remain intact.

Device enrollment is read authoritatively from a narrow authenticated RPC bound to the current user, live session and installation cookie. A browser subscription alone no longer marks an account/device enrolled. Disabling a device revokes only that session/installation; browser unsubscribe is best effort after server revocation. Other devices stay enabled. A browser permission denial is handled through existing browser/OS settings; the app cannot override it or guarantee a provider works in Helium.

The existing private preferences table is retained as internal delivery policy/first-enrollment state. Additional-device enrollment preserves saved policy. The legacy user-facing account preferences PATCH returns405, and authenticated EXECUTE on the legacy global setter is revoked. No authentication, rate limiting, account eligibility, installation ownership or worker fencing checks were weakened.

## Compatibility migration

Local migration: supabase/migrations/20261106081010_push_device_controls.sql.
Hosted MCP version/name:20261106081617 / push_device_controls. Do not reapply merely because the generated hosted timestamp differs from the local filename.

The migration adds mapsilip_push_device_get with empty search_path, SECURITY DEFINER, authenticated-only execute and no direct private table grants. It respects earlier global opt-outs by disabling any previously enabled push subscriptions belonging to globally disabled accounts before normalizing their internal policy. Those devices must explicitly enroll again; enabling one device does not reactivate them. No business records or passwords are modified. Existing active subscriptions on already-enabled accounts are preserved.

## Application changes

Only these4 application files are overlaid onto the previously verified176-file production source archive:

- app/components/PushPreferences.tsx
- app/api/push/preferences/route.ts
- app/api/push/subscription/route.ts
- app/lib/backend/push/repository.ts

No CSS/library/animation changes or added runtime dependency. No polling; one device-status request replaces the prior preferences request. Private keys, worker credentials, scheduler and runtime gates are unchanged.

## Verification

- Standard suite:272tests,259pass,0fail,13isolated-database skips.
- Isolated PostgreSQL:12existing database cases pass, then the new device-isolation test passes after applying the new migration locally. All13 database cases executed successfully.
- New coverage: per-account/session/capability status; one device disable preserving another; legacy opt-outs not resurrected; global setter inaccessible to API users; status reads consume no mutation quota. UI checks assert one device action, no checkboxes/account/category controls, and DELETE-only disable without an account PATCH.
- Typecheck and production build pass. Lint has0errors and1pre-existing RoomContextPanel dependency warning. Client artifact scan passes31artifacts.
- Local browser fixture:390×844 and1440×1000, enable/disable transition, no horizontal overflow, no checkboxes, dark/reduced-motion state. Fixture uses synthetic local responses/permission; no protected portal bypass or real push request.
- Hosted metadata: device RPC exists, authenticated global setter privilege=false, push runtime/scheduler remain active. No synthetic production notification or physical-device delivery test performed.

Evidence: docs/superpowers/evidence/push-device-controls-20261106/. No commit/GitHub push, old migration rewrite, .gitignore edit or unrelated tenant/payment/room/concern/account change. Source inventory remains176paths with only the four application overlays above; manifest preserved alongside evidence. The original Helium enrollment failure was not reproduced with real credentials and is not claimed fixed by this UI change.

## Deployment

Production build requested: dpl_Hrw24bSnFuhPAVMGp1tWvHF3FSgv. Final status/alias will be recorded below after completion.

Final result: READY in Production; mapsilip.vercel.app alias verified against dpl_Hrw24bSnFuhPAVMGp1tWvHF3FSgv. Hosted source-tree comparison confirms all176expectedpaths and content hashes match. No extra source files uploaded.
