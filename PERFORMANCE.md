# MapSilip performance pass — 2026-11-02

## Implemented

- `RoomManagementWorkspace.tsx` and `CaretakerPages.tsx`: load the map workspace through a separate dynamic chunk, with a reserved loading surface. Selecting the map still downloads its code; this defers work rather than removing it.
- `DashboardOverview.tsx`: dynamically load the account-review dialog only when opened; request eight recent records instead of 25; run caretaker count queries alongside the initial requests and retrieve only one record for each count.
- `ToolbarPopovers.tsx`: only the currently visible desktop/mobile header requests unread notifications. A breakpoint change refreshes the newly visible header. Existing mutation invalidation and request-generation guards remain. No shared private-data cache was introduced.
- `ManagementToolbar.tsx`: abort superseded searches and discard their results, preventing older responses from replacing the current query's results.
- `BuildingMapWorkspace.tsx`: calculate occupancy in one pass over assignments rather than scanning all assignments for every room. Coalesce drag updates with requestAnimationFrame, cancel on unmount, and flush the last position when dragging ends. There is no idle render loop.
- `tenant.ts`: separate request-scoped access verification from room/invoice enrichment. Tenant layout access no longer waits on unrelated room and billing queries. Verified identity, ownership and active status checks remain.
- `WorkspaceLoading.tsx` and the three role loading boundaries: lightweight, static responsive placeholders during route loading. No shimmer or motion is required.
- `password-recovery.test.mjs`: repair mocks left incomplete by the interrupted prior feature and cover missing-account responses. Password recovery behavior was preserved.
- `tenant-loading.test.mjs`: cover deferred detail queries and rejection of inactive tenants.

## Bundle comparison

Measured against production builds before and after this pass by collecting unique JavaScript chunk paths from each route's `page_client-reference-manifest.js` and summing gzip sizes of those files.

These are route client-reference chunk sizes, **not total browser downloads**, Lighthouse scores, or Core Web Vitals. Framework bootstrap, CSS, fonts, network latency and subsequent dynamic chunk requests are not included.

| Route | Before, bytes | After, bytes | Change |
| --- | ---: | ---: | ---: |
| Management dashboard | 23,764 | 23,895 | +0.6% |
| Management rooms | 35,023 | 25,594 | -26.9% |
| Management maintenance | 33,247 | 23,780 | -28.5% |
| Tenant home | 23,764 | 23,895 | +0.6% |
| Tenant details | 18,282 | 18,385 | +0.6% |
| Login | 17,677 | 17,701 | +0.1% |

Small increases outside map routes reflect loader/dynamic-import plumbing and header logic; no blanket bundle reduction is claimed.

## Request and computation changes

- Unread header fetch: two mounted responsive headers previously made requests; now only the visible header fetches.
- Caretaker dashboard count fetches: moved out of the second dependency round into the first. Count-only result payloads are one row instead of the default 25. No latency improvement in milliseconds is claimed without authenticated network measurements.
- Recent dashboard list: at most eight rows requested instead of 25, matching the displayed eight.
- Tenant shell: two unrelated detail queries removed from the authorization path; details consumers still fetch them, in parallel.
- Occupancy: O(rooms × assignments) becomes O(rooms + assignments).
- Dragging: at most one scheduled React pan update per animation frame, with the final position flushed on pointer release.

## Verification

- 192 tests pass, including existing map geometry, security and authentication tests.
- Typecheck and production build pass.
- ESLint completes with four pre-existing warnings in ManagementConcernsWorkspace and RoomContextPanel.
- `git diff --check` passes.
- Production browser smoke check using Playwright: login to forgot-password navigation and a mocked successful recovery response at widths 390 and 1440, with reduced motion enabled. Confirmation appeared, no page JavaScript errors occurred, and document width did not exceed viewport width. No email was sent by this test and no screenshots were taken.
- No schema migration, deployment, dependency removal or .gitignore change was made.

## Remaining verification and bottlenecks

- Authenticated owner/caretaker/tenant dashboards, live Supabase timings, room interactions, heatmaps and assignment workflows were not browser-tested in this pass: no test-account credentials were supplied. Unit/security tests do not substitute for those checks.
- No Lighthouse, field INP, or authenticated LCP/CLS comparison is available. Ordinary Android hardware and throttled mobile connections remain unmeasured.
- Map views still load whole authorized datasets through existing paginated endpoints; large properties may require dedicated summaries or spatial/page queries. Database/index work needs measurement and separate authorization.
- Full SVG geometry still renders when scene state changes. The pass reduces pan-update frequency, not geometry complexity.
- The previously requested recovery email-existence lookup scans paginated Auth Admin users on the server. It is bounded and rate limited, but an indexed private lookup would scale better; no schema change was authorized here.
- Profile images retain private no-store delivery; storage proxy time and image resizing should be measured with real uploaded images before changing cache/access behavior.
- Existing font loading uses next/font with swap, and static branding assets are small; no speculative font/asset rewrite was performed.


## Production performance and dormitory repair — 2026-11-03

Vercel function execution moved from Washington (`iad1`) to Tokyo (`hnd1`), near the existing hosted Supabase project. Verified with production response headers (`sin1::hnd1`). Build location is independent of function execution location.

First sequential authenticated HTTP samples from the same runner (response-body completion, not browser paint timings):

| Request | Before | After |
| --- | ---: | ---: |
| `/api/auth/signin` | 3551 ms | 2296 ms |
| `/management` | 2391 ms | 1090 ms |
| `/api/dashboard` | 1577 ms | 385 ms |
| `/api/operations?resource=rooms&page=1&pageSize=100` | 862 ms | 347 ms |
| `/api/tenants/directory?page=1&pageSize=100` | 1858 ms | 294 ms |
| `/api/operations?resource=maintenance&page=1&pageSize=100` | 1235 ms | 221 ms |

These are individual samples, including initial connection/cold-start effects, not latency percentiles or a guarantee for every device. A subsequent browser login request measured 994 ms. Field Core Web Vitals and ordinary phone hardware remain unmeasured.

Room Management now shares authorized room/assignment results with the map. Live browser resource entries showed exactly one rooms, one assignments, one tenant-directory and one maintenance request on initial entry. Room edits and assignment changes refresh both the shared records and maintenance data. No cross-user data cache was added.

Dollhouse overview corridors support pointer and keyboard floor selection; decorative seams no longer intercept input. Selecting a persisted room opens its details in one click. Expired/revoked sessions can be rejected during read-only rendering without turning cookie deletion into a server error; session verification and writable refresh requirements remain enforced.

Verification: 188 tests pass, typecheck/build pass, lint completes with four existing warnings. Browser checks at 390px and 1440px found no horizontal overflow; room selection, closing the mobile details sheet and floor controls were exercised. Dark mode and reduced-motion checks passed locally. Owner and caretaker login and role navigation passed on Production; anonymous API requests returned 401 and caretaker access to the owner tenant directory returned 403. No new runtime errors were reported during the sampled five-minute window. No configured server-secret values were found in the local client static build.

The user-authorized readiness tenant, request/assignment and synthetic room were removed with guarded cleanup; 24 normal rooms remain. No real tenant data, existing migration SQL, security controls or `.gitignore` were changed. Full tenant login/isolation and mutation workflows were not repeated after deleting the readiness identity; prior hosted evidence is retained in HOSTED_VERIFICATION.md.

### Final released build confirmation

Deployment `dpl_4VAcMvWvNT7Hsnqpcf7pss9qjhJt`, snapshot `9dab4426b883fdbce156b23029c61b4cb1912527`, is READY in Production at https://mapsilip.vercel.app. The final seam-pointer fix was verified on the actual deployed SVG: clicking the second-floor corridor selected 2nd Floor and displayed eight persisted room controls. No injected styles were present after full navigation.

| Request | Final sample |
| --- | ---: |
| `/api/auth/signin` | 1659 ms |
| `/management` | 490 ms |
| `/api/dashboard` | 476 ms |
| `/api/operations?resource=rooms&page=1&pageSize=100` | 252 ms |
| `/api/tenants/directory?page=1&pageSize=100` | 331 ms |
| `/api/operations?resource=maintenance&page=1&pageSize=100` | 311 ms |

All requests returned 200 from hnd1. The same single-sample/cold-start limitations apply.


## Lightweight motion polish — 2026-11-03 (deployed after user approval)

### Changes

- Shared 120 ms press feedback, 180 ms content/menu transitions and 240 ms overlay entrances, using natural easing. Controls use individual scale so existing positioning transforms stay intact. Lists animate as groups without row staggering; cards retain the existing design and feedback colors.
- Menus retain their existing visibility/focus handling, with shorter exits than entrances. Native dialogs, room sheets, tabs, notification groups, detail sections and existing status/result messages receive bounded fades or small translations. Closing dialogs/sheets is immediate; no delayed unmount or interaction lock was introduced.
- Page navigation animates the existing wrapper's opacity without changing its React key, scheduling a state update, or transforming ancestors of fixed mobile sheets. Data updates do not restart the entrance. Superseded page motion is cancelled.
- Removed looping skeleton shimmer. Placeholder geometry is reserved immediately; its visual entrance has a CSS-only 120 ms grace period. This does not delay requests, screen-reader loading status, or displaying returned data. Skeletons become static after that single entrance.
- Replaced the 650 ms full-page theme blur with a short desktop crossfade; touch, unsupported and reduced-motion modes update theme immediately. Removed the fallback timer and fixed repeated theme clicks queued during native snapshots.
- Reduced-motion mode disables CSS motion while preserving visibility, state changes and focus behavior. Page motion also checks the preference. No animation library, dependency, perpetual layer hint, per-frame application timer or recurring animation was added.

### Preserved performance and behavior

Source hashes match for all 68 existing API/backend/Supabase/migration files. `.gitignore` matches its pre-task bytes. Previous map request sharing, authoritative authorization, RLS, TLS, rate limiting, production region and existing data were not changed. Initial room-page browser resource entries contained one rooms request and one assignments request, plus the existing directory, maintenance, photo and unread-header requests. Account-review dialog's separate room lookup was distinguished from room-page loading. No synthetic records or production data mutations were used for this UI verification. A designated staff session was used to view the local built application; localhost sign-in restrictions were preserved.

### Measurements

Generated production static assets, sums of independently gzip-compressed emitted files (not total browser transfer):

| Asset | Before gzip | After gzip | Delta |
| --- | ---: | ---: | ---: |
| JavaScript | 253,506 B | 253,548 B | +42 B |
| CSS | 29,503 B | 29,992 B | +489 B |

Same emitted file counts: 28 JS, 2 CSS. Combined added compressed assets: 531 bytes (about 0.52 KiB). No new network requests are introduced by motion.

After-change Chromium lab samples, six repeated profile-menu toggles per viewport with 4× CPU throttling:

| Viewport | p95 frame gap | Maximum frame gap | Long tasks (>50ms) | Layout shift during sample | Running animations after settle |
| --- | ---: | ---: | ---: | ---: | ---: |
| 390 px | 17.6 ms | 18.4 ms | 0 | 0 | 0 |
| 1440 px | 17.8 ms | 19.2 ms | 0 | 0 | 0 |

These are short after-change lab observations, not a before/after FPS comparison, field INP score or guarantee for physical phones. The menu sample included opacity/transform and small control color transitions plus discrete visibility changes; no animated blur or layout properties were observed in that sample.

### Verification

PASS: 195 automated tests, including seven motion regressions (demonstrated failures before fixing page remounts, fallback timers, touch-theme snapshots and queued theme clicks). PASS: typecheck, production build, and lint with four existing warnings in ManagementConcernsWorkspace and RoomContextPanel. `git diff --check` passes; mechanical design scan returned no findings.

PASS on the local production build: desktop 1440px and mobile 390px without horizontal overflow, menu repetition, Escape dismissal/focus restoration, one-click room details and mobile close control, floor selection, account-review dialog entrance/close, tab selection and arrow-key navigation, dark mode, reduced-motion open menu with animation none/transition 0s, and no browser JavaScript errors. No perpetual animations remained after settling. Unit regressions cover pending native theme snapshots; that final theme callback ordering adjustment was not separately re-profiled.

NOT VERIFIED: physical lower-powered Android/iPhone hardware, Safari/iOS rendering, field performance percentiles, every role-specific screen, and successful production form mutations. Backend workflows and email delivery were not retested or changed. No deployment was made; the current live release remains unchanged.


### Approved Vercel release

After user review and explicit approval, motion snapshot `82f03f7bbd2aec408dacae6265be47ed23539b06` was deployed as Production `dpl_7gXaDhDhxB6wPEaNefNHjuRSB8TJ` at https://mapsilip.vercel.app. Vercel build and alias assignment passed; hnd1 execution remains. Live owner login/navigation, room details, mobile sheet/menu dismissal, keyboard focus, 390px/1440px layout and preserved single room/assignment loads passed. New motion styles were verified on the permanent domain. Anonymous staff API access remains 401. No browser errors or sampled Vercel runtime errors were observed. No backend, environment setting, production record or .gitignore change accompanied this deployment. The implementation-stage “not deployed” note above records the state before this later authorization.


## Fluid motion and overlay review — 2026-11-04 (not deployed)

The existing system was refined in place: 180ms press feedback with gentler scaling, 320ms state changes, 440ms overlays, 260ms exits, and 520ms theme crossfades. Easing now settles more gradually. The shared treatment covers the new popups, drawers, mobile sheets, existing account/tenant dialogs and sidebar card.

Review findings fixed:

- The desktop-only profile card fetched data on phones. Its name request and photo mount now follow desktop visibility; browser checks showed zero profile calls on initial phone entry, one on desktop, and correct profile links. The profile-update event was verified with a browser-only synthetic response, then restored. No profile record was edited.
- Generic dialog keyframes competed with the new transition-based overlays. Managed dialogs now use one motion path with matching discrete display/top-layer timing and no click interception after closing.
- Closing a responsive overlay removed its column flex direction while the exit was still visible, collapsing the header and fields into a row. Column structure now persists through dismissal. Browser Back, Escape, draft retention and reopen were checked without submissions.
- Shared JavaScript scroll-lock classes could interfere across dialogs. Native open-state CSS now locks scrolling; a stable scrollbar gutter prevents page jumps.
- Full-screen backdrop blur made the large drawer expensive. The dimmed backdrop and soft shadow remain; the costly blur was removed from animated form overlays. In controlled 4x CPU samples, drawer p95 frame gaps improved from about 50ms to about 18ms.
- Operational forms could consume their modal history entry while a busy guard rejected closing. Dismissal now honors that guard before changing history.

Theme switching now crossfades on touch and desktop, with no per-frame React state or timers. Temporary snapshot styling suppresses redundant color tweens and snapshot resizing. Older-browser fallback color transitions were verified to show an intermediate color and clean up after completion. Reduced motion changes theme immediately. The existing theme control is also available in the mobile header, and CSS keeps icons synchronized across controls.

Final verification: 201 automated tests pass, typecheck and production build pass, lint has zero errors and one existing RoomContextPanel warning. Mechanical UI scan returned no findings; git diff --check passes. Auth/API/Supabase/migration hashes match for all 68 protected files; package/dependency files and .gitignore match the pre-review baseline. The client static build scan found no configured server-secret values. CA tracing and upload configuration were preserved, and a successful designated-owner login was verified on the existing live release.

Final local Chromium samples at 390px and 1440px with 4x CPU throttling: menus about 18ms p95; sheets/drawers 17.7/18.3ms p95, with zero measured layout shift and no additional API requests or idle animations. One desktop drawer sample had a brief 52ms entry/layout task. Theme crossfades were about 26ms p95 on the map page; a cold mobile sample included a 51ms task. Snapshot creation has a small one-off cost, so these are lab observations rather than a promise of physical-phone frame rates. Native dialog display/overlay transitions are discrete; movement/fading uses transform and opacity.

Aggregate generated JS/CSS gzip grew by 408 bytes (132 JS, 276 CSS), about 0.4 KiB, compared with the other AI's starting build. These are sums of emitted assets, not total browser transfer. No dependencies or motion-related network requests were added.

Not verified: physical iPhone/Mac/Android hardware, Safari rendering, every role-specific form submission, actual profile/photo saves and end-to-end production writes. No tenant records were created, modified or deleted. No deployment or environment change was made by this refinement. Evidence and the plan are backed up separately below.


### Approved release — 2026-11-04

The user authorized Production deployment of the fluid-motion review. Snapshot `f05aa462bdee9edd7d7bd4ec01d2d6ca2a0d3ca5` is live at https://mapsilip.vercel.app as `dpl_F2zioqLdc3DPyzEouj1HipdQTfhu`. Vercel reports READY with the permanent alias and hnd1 functions. Live owner login, motion styles, drawer/mobile-sheet behavior, stable exit layout, theme cleanup, public pages and anonymous rejection were checked without submitting records. Previous release `dpl_7wrSumerJGjWHd8vQctQSm6VwHB9` is the recorded rollback target. Implementation-stage not-deployed notes above describe the state before this later authorization.
