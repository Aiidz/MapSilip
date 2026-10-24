# MapSilip

MapSilip is a dormitory management frontend for Mathea’s Dormitory, with separate Management, Tenant, and Caretaker portals. It uses Next.js App Router, React, TypeScript, shared CSS, and Playwright for browser review.

The current application is a frontend preview. Navigation, theme switching, popovers, filters, and some form controls work locally. Authentication, persistence, uploads, payments, approvals, and server-enforced permissions are still pending. Empty states and disabled actions preserve that boundary; illustrative data is not approved dormitory policy.

## Run locally

Use Node.js 20.9 or newer and npm. Install the versions recorded in the lockfile:

```sh
npm ci
npm run dev
```

Open `http://localhost:3000` for login. `/login` uses the same screen; the tenant account-request form is at `/request-account`. Portal entry routes are `/management`, `/tenant`, and `/caretaker`. They are directly accessible in this frontend preview and do not enforce roles.

## Checks

```sh
npm test
npm run lint
npm run typecheck
npm run build
npm run visual:review
```

`npm test` runs the navigation tests; lint and typecheck check the source. `npm run build` creates a production bundle, which `npm run start` serves. Run builds in a separate checkout/copy when a development server is active, because both commands use `.next`.

The visual review needs the app running and Playwright Chromium available. It defaults to `http://localhost:3000`, checks 375×812 and 1440×1000 viewports, and writes screenshots to `/tmp/mapsilip-visual-review`. Override the server or output path with `VISUAL_REVIEW_URL` and `VISUAL_REVIEW_DIR`.

Existing frontend verification is recorded in the local audit documents. Workspace typechecking has encountered conflicting generated `.next/dev` and `.next/types` route declarations; isolated-copy typechecking and builds passed in the reported acceptance review. Do not remove an active server’s output to resolve this conflict.

## Project layout

- `app/` contains routes, layouts, shared components, styles, and frontend logic.
- `app/lib/preview-data.ts` contains illustrative content separate from future backend logic.
- `public/` contains the supplied runtime logos, web manifest, and app icons.
- `scripts/visual-review.mjs` and `tests/` contain browser review tooling and navigation tests.
- Local `docs/` contains the UI inventory, backend-readiness audit, client questions, and Phase 1 notes. UI references are in `docs/reference/MapSilip UI/` and `docs/reference/UI.pdf`; original brand assets are in `docs/MapSilip Assets/`.

The entire `docs/` folder is intentionally excluded from Git and GitHub. Keep a separate backup of those local requirements and references; cloning this repository will not restore them. Runtime assets already copied into `public/` are included.

Environment files, local credentials, dependencies, build output, caches, and generated screenshots are also excluded. An `.env.example` may be committed only with placeholders. There are no backend credentials or environment values required for the current frontend.

See `AGENTS.md` for contributor conventions.
