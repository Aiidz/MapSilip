# MapSilip tenant mobile UI guide

Use the tenant Home page as the sizing reference for future mobile page corrections.
These values describe its existing CSS in app/globals.css, not the pixel size of a scaled design screenshot.

## Scope

Apply below 768px only. Keep desktop layouts and real data intact.
Use the existing Montserrat font, semantic colors, shared top bar, and bottom navigation.
Do not shrink text to fit a screenshot or use transforms/browser zoom.

## Layout and spacing

- Main content: 20px top, 16px bottom; horizontal padding 18px on content-wrap.
- Avoid adding horizontal padding to both main-content and content-wrap.
- Page stack: flex column, 24px gaps.
- Available content height: min-height calc(100dvh - 176px), matching Home's shell.
- Main summary: 20–24px padding, 18px radius.
- Main list card: 14px padding, 18px radius, minimum height 320px.
- Let the list card flex to occupy available vertical room; let the document scroll on shorter phones.
- List rows: minimum 76px height, 12px padding, 12px radius, 10px gaps.
- Do not fabricate entries to fill space. Sparse lists remain honest.
- Hide the desktop brand footer on mobile task pages; keep contextual help concise.

## Typography

| Element | Size | Notes |
| --- | --- | --- |
| Page heading | 27px | 750 weight, 1.25 line height |
| Primary summary value | 25px | 1.3 line height |
| Section heading | 17px | 1.4 line height |
| Main body | 15px | 1.5 line height |
| List title/action | 14px | 1.4 line height |
| Secondary text, labels, status | 12px | Never reproduce 8–9px screenshot text |
| Secondary header action | 13px | Example: View All |

## Icons and controls

- Summary/shortcut icon container: 54px square.
- Icon inside: 25px square.
- Notification icon container: 38px.
- Primary action: minimum height 44px, 14px text.
- Compact filters: minimum 36px, 12px text, 6px gaps; wrap at narrow widths.
- Keep status badges readable and allow long labels/values to wrap.

## Details on mobile

Use MobileDetailSurface to show selected records in the existing ResponsiveOverlay.
Desktop continues to render the same details inline.
Use the sheet header and close control once; hide duplicate inner headings and close buttons.
Preserve drag dismissal, Escape/back handling, focus management, reduced motion, and private attachment access.
Do not compress detail text to the scale of a thumbnail reference.

## Reference implementation

- Home: tenant-home rules near the end of app/globals.css.
- Payments: tenant-workspace--payments mobile rules in app/globals.css.
- Payment popup: app/components/TenantWorkspace.tsx and MobileDetailSurface.tsx.

## Review before handoff

Inspect 360px, 390px, and wider mobile widths plus desktop.
Check wrapping, page scrolling, bottom navigation clearance, filters, selected record popup, keyboard focus, and reduced motion.
Compare computed dimensions with this guide and Home.
Clearly report when browser verification is unavailable; do not claim a visual match from code inspection alone.

## Shared application rollout

The shared mobile rules at the end of app/globals.css apply the scale to all role shells,
page headings, panels, common empty states, buttons, and overlay forms.
Form inputs use 16px to avoid mobile browser focus zoom.
Use content-driven heights for sparse lists and empty states; do not stretch cards solely
to fill the viewport. The shared shell still reserves bottom navigation clearance.
Custom maps, charts, and uncommon page components require individual rendered review.
