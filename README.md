# MapSilip

A responsive dormitory management frontend for **Mathea’s Dormitory**, with dedicated workspaces for the owner, caretakers, and tenants. Built with **Next.js, React, and TypeScript**, MapSilip brings room information, payment records, maintenance requests, and resident services into a shared interface.

**Current status:** Phase 1 frontend preview. Portal layouts and local interactions are implemented; authentication, database access, file storage, and persistent operations are pending. The application is not ready for production use.

## Features

- **Management workspace** — dashboard, room map/list views, payment-record layout, and tenant, maintenance, visitor, notification, and profile screens.
- **Tenant workspace** — home, personal details, payments, maintenance, concerns and suggestions, planned visitors, notifications, and profile screens.
- **Caretaker workspace** — maintenance dashboard, request list/details layout, notifications, and profile forms, with separate navigation from Management.
- **Account entry screens** — shared login page, tenant account-request form, and accessible password visibility controls.
- **Responsive navigation** — desktop sidebars and mobile navigation, with role-specific destinations.
- **Light and dark themes** — shared colors, surfaces, controls, and a local theme toggle.
- **Keyboard-friendly interactions** — profile menus, notification popovers, mobile sheets, Escape dismissal, and focus restoration.
- **Subtle motion** — short page and popup transitions that respect reduced-motion preferences.
- **Browser review tooling** — Playwright checks and screenshots at mobile and desktop widths.

Data-dependent screens use neutral placeholders or empty states. Forms, filters, and menus operate locally where implemented; save, submit, approval, upload, and export operations remain disabled or unavailable.

## Technology

| Area | Tools |
| --- | --- |
| Application | Next.js 16, App Router |
| UI | React 19, TypeScript 5, shared CSS |
| Code quality | ESLint 9, TypeScript typechecking |
| Tests | Node.js test runner, Playwright |
| Web assets | Supplied MapSilip logos, web app manifest, and app icons |

Dependency versions are recorded in `package.json` and `package-lock.json`. No backend service or SDK is integrated yet.

## Project Structure

```text
MapSilip/
├── app/
│   ├── caretaker/          # Caretaker pages and layout
│   ├── management/         # Management pages and layout
│   ├── tenant/             # Tenant pages and layout
│   ├── login/              # Login route
│   ├── request-account/    # Tenant account-request route
│   ├── components/         # Shared shells, controls, and workspaces
│   ├── lib/                # Navigation helpers and illustrative content
│   ├── globals.css         # Shared styles and theme tokens
│   ├── layout.tsx          # Root layout and metadata
│   └── page.tsx            # Default login entry point
├── public/                 # Runtime logos, manifest, and app icons
├── scripts/
│   └── visual-review.mjs   # Playwright interaction checks and screenshots
├── tests/
│   └── navigation.test.mjs
├── docs/                   # Local documentation and references; excluded from Git
├── AGENTS.md               # Contributor guidelines
├── eslint.config.mjs
├── next.config.ts
├── package.json
├── package-lock.json
└── tsconfig.json
```

## Installation

### Prerequisites

- **Node.js 20.9 or newer** and npm.
- Access to the private GitHub repository.
- Playwright Chromium for browser review; it is not required to run the app.

### 1. Clone the repository

```sh
git clone https://github.com/Aiidz/MapSilip.git
cd MapSilip
```

### 2. Install dependencies

```sh
npm ci
```

The current frontend does not require environment variables, backend credentials, or a database setup.

### 3. Start the development server

```sh
npm run dev
```

Open **http://localhost:3000**. Both `/` and `/login` display the same login screen; the account-request link opens `/request-account`.

## Portal Routes

| Portal | Entry route | Main screen areas |
| --- | --- | --- |
| Management | `/management` | Dashboard, rooms, tenants, payments, maintenance, visitors, notifications, profile |
| Tenant | `/tenant` | Home, details, payments, maintenance, concerns, visitors, notifications, profile, preferences |
| Caretaker | `/caretaker` | Dashboard, maintenance, notifications, profile |

Routes can be opened directly in this preview. Navigation visibility does not enforce roles or restrict access to records.

## Available Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm test` | Run navigation tests with Node.js |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run the full TypeScript check |
| `npm run build` | Generate the production build |
| `npm run start` | Serve an existing production build |
| `npm run visual:review` | Run Playwright interaction checks and capture screenshots |

For a production build, run `npm run build`, then `npm run start`. Use a separate checkout or copy when the development server is active, because development and production builds both write to `.next`.

Mixed development/build output has caused conflicting generated `.next/dev` and `.next/types` route declarations during typechecking. Use a clean, isolated copy to verify the source when this occurs; preserve the output used by an active server.

## Browser Review

With the app running, install the browser if it is not already available, then run the review:

```sh
npx playwright install chromium
npm run visual:review
```

The script uses **375×812** and **1440×1000** viewports. It checks navigation, selected local controls, themes, popovers, keyboard focus, reduced motion, console errors, and horizontal overflow.

- Default app URL: `http://localhost:3000`
- Default screenshot directory: `/tmp/mapsilip-visual-review`
- Overrides: `VISUAL_REVIEW_URL` and `VISUAL_REVIEW_DIR`

Screenshots and generated browser artifacts are kept outside the committed project files.

## Documentation and Design References

Requirements, UI evidence, and review notes are maintained locally under `docs/`, including:

- `UI_FEATURE_INVENTORY.md` — screen references and current frontend behavior.
- `BACKEND_READINESS_AUDIT.md` — integration gaps, decisions, and planning prerequisites.
- `CLIENT_REQUIREMENTS_QUESTIONS.md` — unresolved product and workflow questions.
- `PHASE1_ASSUMPTIONS.md` — frontend assumptions and scope boundaries.
- `reference/MapSilip UI/` and `reference/UI.pdf` — design references.
- `MapSilip Assets/` — original brand assets.

**The entire `docs/` folder is excluded from Git and GitHub.** Obtain it separately for design or requirements work and maintain a separate backup. A repository clone includes runtime assets in `public/`, but does not restore these local documents or original references.

## Development Notes

- Authentication, sessions, database operations, uploads, notification delivery, and server-enforced permissions remain unimplemented.
- Local form input and filter selection do not save records or complete business operations.
- `app/lib/preview-data.ts` contains illustrative content; sample values must not become billing, occupancy, or permission rules.
- Environment files, credentials, dependencies, build output, and caches are excluded by `.gitignore`. Commit environment templates only when they contain placeholders.
- Follow [AGENTS.md](AGENTS.md) for repository conventions and verification guidance.
