# Agent Work Log

**Purpose:** A running record of changes made by the coding agent so they can be independently reviewed later (for example, in Codex).

**Rule:** Append a new entry for every future task. Include the date, request, files changed, verification performed, deployment status, and anything still unverified. Do not rewrite history; correct it with a follow-up entry.

---

## 2026-11-10 — UI cleanup and onboarding behavior

### Request 1 — Remove the footer "Notification settings" link

- **File changed:** `app/components/PwaManager.tsx`
  - Removed the `Notification settings` button rendered under the page footer.
- **File changed:** `app/globals.css`
  - Removed the now-unused `.pwa-settings-link` styles.
- **Result:** Notification settings remain available from:
  - Notifications page → **Settings**
  - Header bell menu → **Notification settings**
  - Tenant **More** → **Notification settings**

### Request 2 — Modernize the focus highlight

- **File changed:** `app/globals.css`
  - Global `:focus-visible` changed from `3px` / `3px` offset to `2px` / `2px` offset.
  - Removed the forced `border-radius: 5px` on focused elements so the ring follows each element's real radius.
  - Standardized all remaining `3px` focus outlines to `2px`.
  - Visitor form inputs now use a brand-colored border plus a soft `3px` halo instead of a thick hard ring.
- **Why:** 2px ring + 2px offset is the common modern pattern used by Tailwind/shadcn/Radix-based systems. It stays accessible while looking less heavy.
- **Build:** `npm run build` passed.

### Request 3 — Remove the mobile tap highlight

- **File changed:** `app/globals.css`
  - Added `html { -webkit-tap-highlight-color: transparent; }`.
- **Why:** Removes the square/overlay browsers paint over buttons and links when tapped on touch devices. The app’s own press feedback remains.

### Request 4 — Welcome splash on mobile becomes swipe-only

- **File changed:** `app/components/WelcomeOnboarding.tsx`
  - Added `welcome-actions` / `welcome-actions--finish` classes to the control row.
  - Marked the Back button with `welcome-back`.
- **File changed:** `app/globals.css`
  - On screens `max-width: 767px`:
    - Next/Back buttons are hidden.
    - **Get Started** still appears on the final slide.
    - Progress dots remain as the slide indicator.
- **Desktop:** unchanged; Next/Back remain.
- **Build:** `npm run build` passed.

### Deployment — 2026-11-10

- **Request:** “deploy it now”
- **Target:** Vercel Production, project `mapsilip`, team `lupalogic-2108s-projects`.
- **Method:** Uploaded the same 190-file production inventory used by the previous READY deployment, then created a new Production deployment from those file references.
- **Deployment ID:** `dpl_8s5vZgm8Pdt5q4ofkUSjHWfmqZK9`
- **Deployment URL:** `https://mapsilip-3pccw9yvr-lupalogic-2108s-projects.vercel.app`
- **Final status:** `READY`
- **Production alias:** `https://mapsilip.vercel.app` assigned to this deployment
- **Region:** `hnd1`
- **Post-deploy checks:**
  - `/login` → 200
  - `/manifest.webmanifest` → 200
  - `/sw.js` → 200
  - Production CSS contains `-webkit-tap-highlight-color:transparent` and `outline:2px solid var(--focus-ring)`, confirming the new styles are live.

### Verification summary for this session

| Check | Result |
|---|---|
| `npm test` | 292 passed, 15 skipped, 0 failed |
| `npm run typecheck` | Passed |
| `npm run lint` | 0 errors, 1 existing warning in `RoomContextPanel.tsx` |
| `npm run build` | Passed |

### Things intentionally not changed

- Welcome splash placement on `/login` was left as-is. The approved implementation spec placed welcome slides **before** authentication, and the user confirmed that was acceptable.
- No Git commit or push was made.
- No Supabase data, migrations, authentication settings, or environment values were changed.

---

## Earlier context reviewed

### Why the welcome splash appears on the login page

- Codex mounted `WelcomeOnboarding` in `app/login/page.tsx`.
- The approved implementation prompt defined the flow as:
  **A. Welcome slides → B. Authentication → C. Notification setup → D. PWA installation → Dashboard**
- Post-login notification/install onboarding is separate and is mounted through `PwaManager` in `app/components/AppShell.tsx`.
- This was intentional according to the approved plan, not an accidental placement.

### Existing verification before this session

- Codex reported deploying the onboarding experience to Production.
- Codex also reported that no Git commit or push was made, so the onboarding source remains uncommitted in the working tree.

---

## 2026-11-10 — Hide scrollbars everywhere

### Request
“remove any scroll bar here no scroll bar should be see anywhere”

### Changes
- **File changed:** `app/globals.css`
  - Hid WebKit scrollbars (`::-webkit-scrollbar`) globally.
  - Set `scrollbar-width: none` and `-ms-overflow-style: none` on all elements.
  - Changed `html` from `scrollbar-gutter: stable` to `scrollbar-gutter: auto` so no gutter space is reserved.
  - Updated the tenant filter row from `scrollbar-width: thin` to `none`.
- **Behavior:** scrolling still works; only the visible scrollbar UI is hidden.

### Verification
- `npm run build` passed.

### Deployment
- Not deployed yet.

---

## 2026-11-10 — Foreground notification settings popup and mobile positioning

### Earlier setup and context work

- Configured the Supabase MCP server for project `atuqxpiandeutimdkgag`.
- Configured the Vercel MCP server and verified access to the `mapsilip` project.
- Installed the Supabase agent skills, including PostgreSQL best-practices guidance.
- Read repository context and deployment/onboarding Markdown files, including the prior OpenCode handoff.
- Confirmed the previous Production deployment was:
  - Deployment: `dpl_8s5vZgm8Pdt5q4ofkUSjHWfmqZK9`
  - Alias: `https://mapsilip.vercel.app`
  - Status: `READY`

### Request

Open the existing Notification Settings popup whenever a notification is received, and make mobile popups appear in the upper-right like desktop.

### Design and planning

- **File created:** `docs/superpowers/specs/2026-11-10-notification-settings-popup-design.md`
  - Documents the approved event-based behavior.
  - Records the selected mobile behavior:
    - Standard PWA dialogs/drawers become upper-right floating cards.
    - Onboarding/install remains full-screen.
- **File created:** `docs/superpowers/plans/2026-11-10-notification-settings-popup.md`
  - Defines the event contract, manager subscription, mobile CSS change, focused tests, and full verification.

### Implementation

- **File changed:** `app/lib/pwa/foreground.ts`
  - Added `foregroundNotificationReceivedEvent`.
- **File changed:** `app/components/ForegroundNotifications.tsx`
  - Dispatches the payload-free receipt event only after a notification passes the existing account/read/malformed/duplicate guard.
- **File changed:** `app/components/PwaManager.tsx`
  - Listens for the receipt event.
  - Opens the existing settings mode using `openSettings()`.
  - Removes the listener during cleanup.
- **File changed:** `app/globals.css`
  - Standard mobile `.ps-overlay` dialogs/drawers now use an upper-right floating card:
    - `inset: 12px 12px auto auto`
    - bounded width of `min(390px, calc(100vw - 24px))`
    - rounded corners on all sides
    - top-right entrance animation
  - `.onboarding-overlay.ps-overlay` remains full-screen.
- **File changed:** `tests/foreground-notifications.test.mjs`
  - Added receipt-event assertions for valid, duplicate, and foreign-recipient notifications.
- **File changed:** `tests/pwa-settings-ui.test.mjs`
  - Added settings-opening and listener-cleanup coverage.
  - Added the mobile floating-overlay/full-screen-onboarding CSS regression check.

### Verification

| Check | Result |
|---|---|
| Focused foreground/settings tests | 21 passed, 0 failed |
| `npm test` | 295 passed, 15 skipped, 0 failed |
| `npm run lint` | 0 errors, 1 existing warning in `RoomContextPanel.tsx` |
| `npm run typecheck` | Passed |
| `npm run build` | Passed |

### Git and deployment

- Committed the deployable application changes:
  - Commit: `4b5f56e`
  - Message: `feat: deploy foreground notification settings`
- Pushed the feature branch:
  - `push-delivery-latency`
- The branch was later merged with the latest remote `main` and pushed as commit `d4331a8`.
- Initial deployment attempts failed because the Vercel deployment API returned GitHub API rate-limit errors (`429`).
- Verified the Vercel project Git connection was then active for `Aiidz/MapSilip`.
- Deployed the requested feature branch directly instead of deploying a new `main` build:
  - Deployment: `dpl_HTf38vyu5fQyJxRXMp1b6msVo2EH`
  - Source branch: `push-delivery-latency`
  - Source commit: `4b5f56e5433e0f6d835bcd5e85fee3dc399516eb`
  - Final status: `READY`
  - Production alias: `https://mapsilip.vercel.app`
  - Deployment URL: `https://mapsilip-ic5njc56g-lupalogic-2108s-projects.vercel.app`
  - Region: `hnd1`

### Current deployment note

- The deployed Production build is from `push-delivery-latency` commit `4b5f56e`.
- The later `main` commit `d4331a8` exists in GitHub but was not used for the successful deployment.

## 2026-11-10 — Correct mobile header notification popover positioning

### Report

- The deployed screenshot showed the mobile header **Notifications** panel
  still opening above the bottom navigation.
- Root cause: this is `ToolbarPopovers`, not the PWA `ResponsiveOverlay`.
  The mobile CSS explicitly used a bottom inset:
  `inset: auto 12px calc(86px + env(safe-area-inset-bottom))`.

### Changes

- **File created:** `docs/superpowers/specs/2026-11-10-mobile-toolbar-popover-design.md`
- **File created:** `docs/superpowers/plans/2026-11-10-mobile-toolbar-popover.md`
- **File changed:** `app/globals.css`
  - Mobile toolbar popovers now use:
    - `inset: 78px 12px auto auto`
    - `width: min(390px, calc(100vw - 24px))`
    - `transform-origin: top right`
    - top-right entrance animation
  - Bottom navigation positioning was not changed.
- **File changed:** `tests/pwa-settings-ui.test.mjs`
  - Added a regression assertion preventing the old bottom inset.

### Verification

| Check | Result |
|---|---|
| Focused settings UI tests | 12 passed, 0 failed |
| `npm test` | Passed, 15 skipped, 0 failed |
| `npm run lint` | 0 errors, 1 existing warning in `RoomContextPanel.tsx` |
| `npm run typecheck` | Passed |
| `npm run build` | Passed |
| Impeccable UI detector | No findings |

### Deployment status

- This correction is currently verified in the working tree.
- It has not yet been deployed after the correction.

## 2026-11-10 — Deploy corrected popup behavior

### Request

Record all work completed for the mobile popup correction and deployment.

### Final correction

- **File changed:** `app/globals.css`
  - Restored `.ps-overlay` and `.ps-overlay--drawer` to the default mobile bottom-sheet layout.
  - Kept `.toolbar-popover` as the only mobile popup positioned in the upper-right.
  - Preserved the onboarding overlay's separate full-screen behavior.
- **File changed:** `tests/pwa-settings-ui.test.mjs`
  - Corrected the regression test to assert the intended split:
    - PWA settings remain bottom sheets on mobile.
    - Header toolbar popovers use the upper-right position.
  - Renamed the standard-overlay test to reflect the restored behavior.
- **File changed:** `AGENT_WORK_LOG.md`
  - Added this follow-up entry without rewriting earlier history.

### Verification

| Check | Result |
|---|---|
| `node --test tests/pwa-settings-ui.test.mjs` | 12 passed, 0 failed |
| `npm test` | Passed |
| `npm run lint` | 0 errors, 1 existing warning in `RoomContextPanel.tsx` |
| `npm run typecheck` | Passed |
| `npm run build` | Passed |
| `git diff --check` | Passed |

### Git

- Created commit `9b7bcd6`
- Commit message: `fix: keep PWA settings as mobile sheet`
- Pushed to `origin/push-delivery-latency`
- Existing unrelated modified and untracked files were not staged or reverted.

### Deployment

- The first explicit Production deployment for commit `9b7bcd6` was canceled after Vercel also created the matching Git-connected build.
- The Git-connected deployment completed successfully:
  - Deployment: `dpl_GeQSesykjy3JaMCwj6ZW36RnKGGS`
  - Source branch: `push-delivery-latency`
  - Source commit: `9b7bcd63fb9f94feb7994d13256612f8ac9cc64b`
  - Status: `READY`
  - Deployment URL: `https://mapsilip-hi2m38va4-lupalogic-2108s-projects.vercel.app`
- `https://mapsilip.vercel.app` was assigned to the READY deployment and returned HTTP 200.

## Future entries

(Add new entries below this line.)


---

## 2026-11-10 — Modernize tenant request popups & calendar UI

### Request
Enhance the UI of the popups in tenant view for payment, maintenance, concerns, and visitor requests:
- Implement custom dropdown menus using the project's details/summary pattern.
- Auto-stamp the payment date on upload/submission without an unnecessary calendar.
- Modernize the file upload zone with a dashed dropzone layout, file details, and remove action.
- Build an interactive, modern calendar date picker for visitor requests.
- Add smooth entrance and interactive transitions with light/dark theme parity.
- Keep icons minimal and copy concise.

### Changes
- **File created:** `app/components/TenantFormControls.tsx`
  - `TenantDropdown`: Accessible custom dropdown using `<details>` and `<summary>` with chevron rotation, listbox menu, and checkmark. Includes hidden input for native form payload.
  - `TenantFileDropzone`: Modern dashed upload area with drag-and-drop, title, subtitle, file details badge, and remove button.
  - `CalendarDatePicker`: Modern accessible calendar popover for visitor date selection with month navigation, day grid, today marker, and past-date disabling.
- **File changed:** `app/components/TenantWorkspace.tsx`
  - Redesigned `SubmissionForm` for Payments, Maintenance, and Concerns with the new controls, clean input styling, auto-stamped Manila payment date, and room badge.
- **File changed:** `app/components/VisitorFormPreview.tsx`
  - Integrated `CalendarDatePicker` for the visit date, modernized the planned arrival/departure time row, and streamlined labels.
- **File changed:** `app/components/ui.tsx`
  - Added optional `description?: string` to `UiDialogProps` to support descriptive subheaders in custom modal dialogs.
- **File changed:** `app/globals.css`
  - Added classes for `.tenant-modal-form`, `.tenant-custom-dropdown`, `.tenant-dropzone`, `.tenant-calendar-picker`, and smooth scale/fade animations.
- **File created:** `tests/tenant-popups-ui.test.mjs`
  - Added unit test suite covering dropdown hidden inputs, file dropzone states, calendar date formatting, and visitor modal integration.
- **Files created:**
  - `docs/superpowers/specs/2026-11-10-tenant-popups-enhancement-design.md`
  - `docs/superpowers/plans/2026-11-10-tenant-popups-enhancement.md`
- **Visual Artifacts:**
  - `live-payment-modal.png`: Live rendered screenshot of Payment Proof modal.
  - `live-maintenance-modal.png`: Live rendered screenshot of Maintenance Request modal.
  - `live-concerns-modal.png`: Live rendered screenshot of Concerns & Suggestions modal.
  - `live-visitor-modal.png`: Live rendered screenshot of Visitor Request modal with interactive Calendar UI.
  - `tenant-popup-ui-preview.md`: Presentation artifact for modal UI review.

### Verification
- `npm run lint`: 0 errors, 1 pre-existing warning in `RoomContextPanel.tsx`.
- `npm run typecheck`: Passed (0 errors).
- `node --test tests/tenant-popups-ui.test.mjs`: 4 passed, 0 failed.
- `npm test`: 302 passed, 15 skipped, 0 failed.
- `npm run build`: Production build compiled successfully in Turbopack.
- Generated live rendered screenshots for all 4 popups using Playwright.

### Git
- Created commit `b1b5949`
- Commit message: `feat: modernize tenant request popups and visitor calendar UI`
- Pushed branch `push-delivery-latency` to `origin/push-delivery-latency`
- Pushed branch `push-delivery-latency` to `origin/main`

### Deployment
- Git-connected Vercel production deployment completed successfully:
  - GitHub Deployment ID: `7686697774`
  - Source branch: `main` / `push-delivery-latency`
  - Source commit: `b1b59490aa7e44d48baa9f8407d2ce2ea761f90b`
  - Environment: `Production`
  - Status: `READY` / `success`
  - Deployment URL: `https://mapsilip-6ahrjmz1h-lupalogic-2108s-projects.vercel.app`
- Production alias `https://mapsilip.vercel.app` verified live and returned HTTP 200.

---

## 2026-11-10 — Modernize and enlarge typography across all pages

### Request
Fix font sizing across all pages and surfaces to make them more modern, legible, and easy to read.

### Changes
- **File changed:** `app/globals.css`
  - Upgraded global typography scale and set minimum legible floors:

| UI Surface / Element | Previous Size | New Modern Size | Weight / Line-Height |
|---|---|---|---|
| Base Body (`body`) | `15px` | `15.5px` | Regular, `line-height: 1.6` |
| Sidebar Navigation Links (`.side-nav .nav-link`) | `12px` | `14.5px` | `550` |
| Sidebar Section Captions (`.sidebar-caption`) | `9px` | `11.5px` | `750`, `letter-spacing: .08em` |
| Mobile Bottom Nav Links (`.nav-link`) | `10px` | `11.5px` | `650` |
| Topbar Search Input (`.toolbar-search input`) | `12px` | `14px` | Regular |
| Topbar Profile & Avatar (`.toolbar-profile`) | `11px` | `13.5px` | `650` (avatar: `12.5px`) |
| Primary / Secondary Buttons (`.button`, `.button--primary`, `.button--secondary`) | `12px`–`13px` | `14px`–`14.5px` | `650`, `min-height: 42px` |
| Tenant Hero Action Button (`.tenant-hero-action`) | `13px` | `14px` | `650`, `min-height: 42px` |
| Form Labels (`label`) | `11px`–`12px` | `13px`–`13.5px` | `600` |
| Form Inputs, Textareas, Selects (`input`, `textarea`, `select`) | `11px`–`13px` | `14px`–`14.5px` | Regular, `min-height: 42px–44px` |
| Filter Pills (`.tenant-filter`, `.caretaker-filters button`) | `10px`–`11px` | `13px` | `650`, `min-height: 35px–36px` |
| Panel & Card Headers (`.panel__heading h2`, `.context-panel h2`) | `15px`–`16px` | `16.5px`–`18.5px` | `650` / `700` |
| Stat Panel Numbers & Labels (`.stat-panel`) | `9px`–`10px` label | `11.5px`–`12px` label, `22px`–`32px` value | `650` |
| Table Headers (`.payment-table th`) | `10px`–`13px` | `13.5px` (desktop), `12px` (mobile) | `650` |
| Table Subtitles & Timestamps (`time`, `.payment-submitted-time`) | `10px`–`11px` | `11.5px`–`12.5px` | Regular |
| Status Badges (`.status-badge`, `.payment-status`, `.tenant-payment-status`) | `10px`–`11px` | `12px`–`12.5px` | `650` |
| Tenant Details DL Lists (`dt`, `dd`) | `dt: 12px`, `dd: 13px` | `dt: 12.5px`, `dd: 14px` | `dd: 650` |
| Management Payment Summary Cards | `12px` / `10px` | `13.5px`–`14.5px` / `12px` | `650` |
| Directory Dialog Meta & Details (`.tenant-directory__details`) | `dt: 11px`, `dd: 13px` | `dt: 12px`, `dd: 14px` | `dd: 700` |
| App Settings (`.app-settings h3`, `p`, badge) | `14px` / `12px` / `11px` | `15.5px` / `13.5px` / `12.5px` | `h3: 600`, `badge: 650` |
| Mobile Media Queries (`max-width: 699px`, `559px`, `420px`) | `8px`–`10px` | `11.5px`–`12.5px` minimum floor | Eliminates unreadable micro-text |

- **Visual Artifacts:**
  - `verified-typography-tenant-payments.png`: Verified typography scale on Tenant Payments page.
  - `verified-typography-mgmt-payments.png`: Verified typography scale on Management Payments board.
  - `verified-typography-tenant-details.png`: Verified typography scale on Tenant My Details surface.
  - `verified-typography-mobile-390px.png`: Verified mobile viewport (390px) typography and spacing.
  - `typography-modernization-preview.md`: Detailed presentation artifact with responsive carousels.

### Verification
- `npm test`: 302 passed, 15 skipped, 0 failed.
- `npm run typecheck`: Passed (0 errors).
- `npm run lint`: 0 errors, 1 pre-existing warning in `RoomContextPanel.tsx`.
- `npm run build`: Production build compiled successfully in Turbopack.
- Playwright verification screenshots captured for Tenant Payments, Management Payments, Tenant Details, and Mobile 390px viewports.

### Git
- Created commit `fd061ee`
- Commit message: `feat: modernize and enlarge typography across all pages`
- Pushed branch `push-delivery-latency` to `origin/push-delivery-latency`
- Pushed branch `push-delivery-latency` to `origin/main`

### Deployment
- Git-connected Vercel deployment completed successfully:
  - Source branch: `main` / `push-delivery-latency`
  - Source commit: `fd061eec64b7cffd84a8c5d54e6471b579f7a9c8`
  - Status: `READY` / `success` (Vercel deployment: `9CtqDoiX3TKd7rS5wyBGj3J4aBcC`)
- Production alias `https://mapsilip.vercel.app` verified live and returned HTTP 200.

## Future entries

(Add new entries below this line.)


## 2026-11-11 — Review and deploy notification workspace

- Reviewed the earlier log against TenantFormControls, its submission callers, PWA event handling, notification APIs and current local changes.
- Fixed TenantDropdown disabled interaction and replaced its hidden value input with a visually hidden native select so required selection participates in browser validation.
- Deployed notification All/Unread filters, list/detail layout, request links and authorized staff photo endpoint support. The photo RLS migration remains a local candidate: hosted Supabase administration tools are unavailable and no hosted migration was applied.
- Verification: 302 tests passed, 15 skipped, zero failed; typecheck and production build passed; lint zero errors with the existing RoomContextPanel dependency warning. Authenticated visual and hosted photo-policy tests remain unverified.
- Vercel Production: dpl_HCCA2nMPjeSQNxWtahJ2bzsvtW7e READY, alias mapsilip.vercel.app assigned. Package contains 190 allowlisted files; no environment files, backups, tests, SQL migrations or Markdown reports uploaded. Supabase CA certificate included.
- Package inventory, SHA256SUMS and source archive: docs/superpowers/evidence/notification-review-20261111/.
- Live checks: /login 200, /forgot-password 200, /sw.js 200; anonymous management/caretaker notification pages 307; staff-targeted profile photo endpoint 401 anonymously.
- No Git commit/push, Supabase changes, credential changes or environment changes performed. Existing unrelated work preserved.

## 2026-11-11 — Reduce oversized UI text locally

- Reduced explicit 13–24px font-size declarations in app/globals.css by 1px. Smaller captions and large display typography retain their sizes.
- This changes text sizing only. UI detector returned no findings and git diff --check passed.
- Local only; no deployment or hosted changes. Rendered mobile/desktop verification remains pending.

## 2026-11-11 — Deploy smaller typography

- Owner authorized Production deployment of the local text-size adjustment.
- Verified the same 190-file application inventory; only app/globals.css changed. Public Supabase CA included; local secrets, Markdown, tests and SQL migrations excluded.
- Local production build passed. Vercel deployment dpl_2Q3dnbo3Cb1T4RR7TAruSLTcgbmF is READY with mapsilip.vercel.app assigned. /login returned HTTP 200.
- No hosted Supabase, environment, credential or Git changes performed. Device visual verification remains pending.

## 2026-11-11 — Confirmed dormitory L-shaped map (local only)
- Request: replace illustrative rectangular map with the supplied identical second-/third-floor layout and photographed navy walls, red railings, tiled corridor and open covered kitchen. Confirmed numbering: front right-to-left 1–4, above 4 bottom-to-top 5–6, kitchen-side top-to-bottom 7–9; door rectangles followed.
- Changed: `app/components/IsometricBuilding.tsx`, `DollhouseBuilding.tsx`, `BuildingMapWorkspace.tsx`, map-only styles appended to `app/globals.css`, `app/lib/building-map.mjs` and declarations, `tests/building-map.test.mjs`, `tests/dollhouse.test.mjs`.
- Shared lightweight SVG geometry, cutaway walls/windows/doors, illustrative furnishings in 1–6 only, kitchen appliances/cabinetry/cutaway roof, continuous front corridor and stair access beyond walking space. No invented occupancy or backend room creation. Actual dimensions/internal furnishing counts remain illustrative.
- Map binding uses unique room numbers 1–9 (including 01/Room 1), not array indexes. Unknown/ambiguous numbers and unconfirmed floors remain selectable in an explicit unmapped-record list; no guesses that 201 means Room 1. All nine spaces fit without pagination. No synthetic ground-floor dorm rooms. Same render used by both existing renderer exports.
- Preserved request endpoints and room IDs, occupancy/status/maintenance information, keyboard selection, zoom/pan. Pan now uses SVG screen scale; mobile has 44px room shortcuts and a compact single-floor canvas. No animation loops, dependency additions or extra backend requests.
- Verification: npm test 305 passed / 15 skipped / 0 failed (320 total); typecheck and production build passed. Lint zero errors, one pre-existing RoomContextPanel useCallback dependency warning. UI detector no findings; git diff --check passed.
- Browser verification with isolated synthetic fixtures, real renderer and workspace: 1440px and 390px, dark/reduced motion, room/floor selection including Room 9, keyboard, correct room-context request ID, unknown-room access, occupancy, heatmap, zoom/reset; no horizontal overflow or page errors. Used existing Playwright because agent-browser CLI unavailable. Screenshots/logs: `docs/superpowers/evidence/dormitory-layout-20261111/`.
- Not verified: authenticated production data mapping, real-device performance and exact surveyed dimensions/interiors. Production room numbers outside the approved labels require an explicit mapping before displaying them in physical slots.
- Deployment: none. No hosted operations, migrations, auth/API changes, real data changes, commits or pushes; `.gitignore` and prior unrelated work preserved.

## 2026-11-11 — Architectural dollhouse and floor inspection (local)
- Refined the existing shared SVG geometry: volumetric wall faces/caps, gray tile material, six uncluttered furnished rooms per dormitory floor with one illustrative bed, wardrobe/table and CR. Kitchen-side rooms remain bed-free. Door clearances in Rooms 5/6 and front rooms adjusted; room positions and authoritative record IDs preserved.
- `DollhouseBuilding.tsx` now presents aligned three-level building with exterior-only business base and cutaway upper levels. Existing selectedFloor controls a 520ms transform/opacity inspection transition; other levels stay mounted/visible, structural connectors fade during separation, reduced-motion disables transitions. No animation framework, timers, new backend calls or animation state introduced.
- The inspected workspace had no Map/Dollhouse switch; added a compact switch using the same selected floor/room state. 2D renderer remains accessible. Ground-floor button controls presentation only; no business records created. Shared floor helper declares deterministic assembled/exploded offsets with regression coverage.
- Changed files: `app/components/DollhouseBuilding.tsx`, `IsometricBuilding.tsx`, `BuildingMapWorkspace.tsx`, `app/lib/building-map.mjs`, `building-map.d.mts`, appended map-only `app/globals.css`, `tests/building-map.test.mjs`, `tests/dollhouse.test.mjs`.
- Verification: full suite 307 passed, 15 skipped, zero failed; 15 focused map tests passed after final label adjustment. Typecheck and production build passed. Lint zero errors, one existing RoomContextPanel dependency warning. UI detector zero findings; diff whitespace check passed.
- Isolated browser testing of real workspace/components at 1440px/390px with synthetic fixtures: assembled/exploded/return, both upper floors, room pointer/keyboard selection, view switching retains selection, mobile overflow, dark/reduced motion. Three levels remain mounted, zero additional operations requests from floor selection/animation, zero page errors. Existing Playwright used because agent-browser is not installed. Evidence: `docs/superpowers/evidence/architectural-dollhouse-20261111/`.
- Limitations: real-device frame rate and authenticated live backend mapping not tested. Architectural proportions/interior furnishings/storefront treatment illustrative, no claimed survey measurements or business identities. Existing unmatched room-number safeguard retained.
- No deployment, hosted writes, database/auth/API/RLS modifications, dependency additions, commits, pushes or `.gitignore` edits. Prior uncommitted work preserved.

## 2026-11-11 — Join stairwell, exterior side wall and navy roofs (local)
- Latest scope: close exposed foundation/sidewall seams; join stair roof into main roof; restore the stair roof's original dark navy palette across the roofs and close the center roof junction.
- Changed `app/components/DollhouseBuilding.tsx`: continuous right exterior wall on all three levels in overview, floor bands meeting annex landings, storefront plinth ending at annex, right columns inside the wall boundary and above ground. Annex roof valleys now meet the main ridge at the same height; center main-roof flashing closes the different pitch profiles. Selected-floor cutaways and backend/data handling unchanged.
- Enlarged overview SVG framing to include the complete roof and labels at narrow widths. This did not change room geometry or selected-floor framing.
- Verification: `npm test` 311 passed / 15 skipped / zero failed (326 total); `npm run typecheck` and `npm run build` passed; `npm run lint` zero errors, one existing RoomContextPanel useCallback dependency warning; `git diff --check` passed.
- Browser checks on real workspace components with synthetic records/mocked APIs: desktop 1440px, mobile 390px/360px, dark/light mode, reduced motion, keyboard room selection, touch floor/room selection, correct Room 9/Room 10 headings, overview-only roof/exterior geometry, no page errors, no extra operations requests from visual transitions. Foundation/landing/eave joins measured within 0.000011 screen pixels. Reviewed screenshots at desktop and mobile; evidence in `docs/superpowers/evidence/roof-connections-20261111/`.
- Local only: no deployment, commit/push or hosted/backend changes. Live authenticated data and physical-device performance were not tested.

## 2026-11-11 — Corridor barriers and photographed room façades
- Added navy concrete corridor barriers with red trim, connected rails/end posts, and missing roof supports. Raised overview room walls to the ceiling/slab and doors to proportional height; retained floor-inspection cutaways.
- Corrected narrow third-floor room transforms to preserve vertical edges. Added pale doors and square/rectangular barred façade windows based on client photographs.
- Changed IsometricBuilding.tsx, DollhouseBuilding.tsx and the existing wall-height assertion in tests/dollhouse.test.mjs. Renamed saved browser evidence script to .txt so ESLint does not treat the archived script as source.
- Verification: 311 tests passed, 15 skipped; typecheck/build passed. Lint zero errors and one existing RoomContextPanel hook warning. Fixture browser checks passed desktop/mobile 360/390, dark mode, reduced motion, keyboard/touch, room selection; no page errors or extra data requests for visual transitions.
- User explicitly authorized production deployment of accumulated work. Vercel deployment dpl_6tCPg3tW8z8NFzNC8JiwzgGN6uGe created; status verification pending. Used prior deployment inventory with updated application files; no secrets, docs or migrations uploaded. No backend mutations or maintenance neon implementation.

## 2026-11-11 — Maintenance glow overlay (local)
- Added MaintenanceGlow.tsx, integrated with DollhouseBuilding and existing room summaries, plus scoped CSS and two renderer regression tests.
- Pending red / ongoing yellow overlays remain visible over architecture; overview overlay clicks choose only the floor. Inspection keeps existing room controls with stronger selected/hovered glow and separate pending/ongoing counts. Clear/unlinked rooms receive no glow. No continuous animation; reduced motion disables hover transitions.
- Floor summaries display open request counts; neutral base hover remains separate from maintenance status. No new backend request, data store, permissions or backend changes.
- Verification: 313 tests passed, 15 skipped; lint has zero errors and one existing RoomContextPanel dependency warning. Typecheck passed. Browser fixture verification covered red/yellow states, overview floor-only clicks, keyboard room selection, mobile 390px, reduced motion, no page errors and one data load. Live authenticated maintenance records were not tested. No deployment.

## 2026-11-11 — Deploy pulsing maintenance hotspots
- User authorized production deployment. Published current application inventory (191 files), including MaintenanceGlow.tsx, text-free radial hotspots, size based on openCount capped at 1.2, reduced-motion static state, floor-only overview selection and hover refinements.
- Predeployment verification from final local change: 313 tests passed, 15 skipped; typecheck/build passed; lint zero errors, one existing RoomContextPanel warning. Browser fixture verified counts 1/2/5/50 produce increasing capped sizes. No additional verification suites rerun for deployment alone.
- Vercel deployment dpl_BbPm5oEuyyLkLSSe1oCJyqneXC2W READY. Confirmed mapsilip.vercel.app resolves to this deployment; /login HTTP 200. Authenticated production maintenance view not exercised.
- No database, environment, credentials, Git or .gitignore changes. Docs, secrets and migrations excluded from deployment.
