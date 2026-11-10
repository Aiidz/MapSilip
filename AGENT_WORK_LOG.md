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
- **File changed:** `app/globals.css`
  - Added classes for `.tenant-modal-form`, `.tenant-custom-dropdown`, `.tenant-dropzone`, `.tenant-calendar-picker`, and smooth scale/fade animations.
- **File created:** `tests/tenant-popups-ui.test.mjs`
  - Added unit test suite covering dropdown hidden inputs, file dropzone states, calendar date formatting, and visitor modal integration.
- **Files created:**
  - `docs/superpowers/specs/2026-11-10-tenant-popups-enhancement-design.md`
  - `docs/superpowers/plans/2026-11-10-tenant-popups-enhancement.md`

### Verification
- `npm run lint`: 0 errors, 1 pre-existing warning in `RoomContextPanel.tsx`.
- `npm run typecheck`: Passed.
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
    - Base body font: Bumped from 15px to 15.5px with 1.6 line height.
    - Global Shell & Navigation: Desktop sidebar links enlarged from 12px to 14.5px, captions from 9px to 11.5px (750 weight, .08em spacing), topbar search from 12px to 14px, profile text from 11px to 13.5px, mobile nav labels from 10px to 11.5px.
    - Interactive Controls: Buttons updated from 12px/13px to 14px/14.5px (650 weight), input fields/textareas/selects from 11px-13px to 14px-14.5px (preventing mobile zoom and improving accessibility), labels from 11px-12px to 13px-13.5px.
    - Cards & Panels: Panel headers updated to 16.5px-17.5px, subheadings from 12px to 13.5px, stat panel titles from 10px to 12px, values 22px-32px, empty state titles to 14.5px-15.5px.
    - Tables & Lists: Table headers enlarged from 10px-13px to 13.5px (650 weight), cell secondary timestamps/room tags from 10px to 11.5px-12.5px, status badges from 10px-11px to 12px.
    - Tenant, Management & Caretaker Portals: Tenant overview, details DL lists (dt 12.5px, dd 14px), contract viewers (13px), management payment summary cards (14.5px titles, 12px subtitles), and directory modal details (dt 12px, dd 14px).
    - Mobile Media Queries (`@media (max-width: 699px)`, `@media (max-width: 559px)`, `@media (max-width: 420px)`): Removed aggressive 8px–10px shrinkages, enforcing a minimum legible floor of 11.5px–12.5px for secondary metadata on mobile.

### Verification
- `npm test`: 302 passed, 15 skipped, 0 failed.
- `npm run typecheck`: Passed (0 errors).
- `npm run lint`: 0 errors, 1 pre-existing warning in `RoomContextPanel.tsx`.
- `npm run build`: Production build compiled successfully in Turbopack.
- Playwright verification screenshots captured for Tenant Payments, Management Payments, Tenant Details, and Mobile 390px viewports.

## Future entries

(Add new entries below this line.)

