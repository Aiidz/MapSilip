# MapSilip

A responsive dormitory management frontend for **Mathea’s Dormitory**, with dedicated workspaces for the owner, caretakers, and tenants. Built with **Next.js, React, and TypeScript**, MapSilip brings room information, payment records, maintenance requests, and resident services into a shared interface.

**Current status:** Local backend integration milestone. Authentication and operational modules are connected to the existing Supabase project. Credentialed owner, caretaker, and tenant workflows still need manual end-to-end verification before production use.

## Features

- **Management workspace** — data-backed dashboard, room records and assignments, invoices and payment review, tenant access review, maintenance, visitors, notifications, and profile.
- **Tenant workspace** — home, personal details, payments, maintenance, concerns and suggestions, planned visitors, notifications, and profile screens.
- **Caretaker workspace** — maintenance dashboard, request list/details layout, notifications, and profile forms, with separate navigation from Management.
- **Account entry screens** — shared login, owner-reviewed tenant access requests, password reset, and first-login staff password change.
- **Responsive navigation** — desktop sidebars and mobile navigation, with role-specific destinations.
- **Light and dark themes** — shared colors, surfaces, controls, and a local theme toggle.
- **Keyboard-friendly interactions** — profile menus, notification popovers, mobile sheets, Escape dismissal, and focus restoration.
- **Subtle motion** — short page and popup transitions that respect reduced-motion preferences.
- **Browser review tooling** — Playwright checks and screenshots at mobile and desktop widths.

Records are stored in Supabase. Unsupported exports, room maps, and maintenance heat maps are intentionally deferred. Tenant requests use the password chosen at submission; owner approval and an available room assignment are required before portal access. Password recovery still requires a deliverable email address.

## Technology

| Area | Tools |
| --- | --- |
| Application | Next.js 16, App Router |
| UI | React 19, TypeScript 5, shared CSS |
| Code quality | ESLint 9, TypeScript typechecking |
| Tests | Node.js test runner, Playwright |
| Web assets | Supplied MapSilip logos, web app manifest, and app icons |

Dependency versions are recorded in `package.json` and `package-lock.json`. The Supabase browser/server clients use the publishable key; the narrow staff security executor remains server-only.

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

The frontend preview does not require environment variables or a database connection. The Supabase client factories are groundwork only and are not used by the portal screens.

### Optional Supabase foundation

No Supabase project is connected yet. Project creation and connection require separate authorization. Once an isolated development project is authorized, prepare the local environment:

1. Copy `.env.example` to `.env.local`.
2. Set `NEXT_PUBLIC_SUPABASE_URL` to the HTTPS project origin and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to its `sb_publishable_…` key from API settings. Blank values, template placeholders, secret keys and legacy JWT keys are rejected when a factory is called. Never put a secret/service-role key in a `NEXT_PUBLIC_` variable. Validation checks configuration syntax, not connectivity or whether a key belongs to a project.
3. Run `npm run dev` as usual.

The application does not test connectivity during startup, and the current UI does not call Supabase. Missing configuration therefore does not prevent the frontend preview from running. The client utilities report a setup error only if called without valid configuration. No authentication flow, session-refresh proxy, database schema, migration, or live operation is enabled. See the local-only `docs/BACKEND_IMPLEMENTATION_PLAN.md` for the proposed architecture and unresolved decision gates.

The intended production stack is Vercel and hosted Supabase. Docker and a local Supabase stack are not required for development or deployment. Offline foundation tests run without credentials; proving password replacement, session revocation, RLS and private Storage access still requires a separately authorized isolated runtime.

Backend helper boundaries and test conventions are recorded in `app/lib/backend/README.md`. Server clients default to read-only cookies and surface attempted refresh writes. Future Actions/Route Handlers must explicitly request writable cookies, and the eventual Next.js 16 `proxy.ts` must persist refreshed cookies across responses and redirects. No Proxy or authentication guard is activated yet.

### 3. Start the development server

```sh
npm run dev
```

Open the origin configured in `MAPSILIP_APP_ORIGIN` (for example **http://127.0.0.1:3000**). Both `/` and `/login` display the shared login screen; approved tenant access starts at `/request-account`.

## Portal Routes

| Portal | Entry route | Main screen areas |
| --- | --- | --- |
| Management | `/management` | Dashboard, rooms, tenants, payments, maintenance, visitors, notifications, profile |
| Tenant | `/tenant` | Home, details, payments, maintenance, concerns, visitors, notifications, profile |
| Caretaker | `/caretaker` | Dashboard, maintenance, notifications, profile |

Portal routes require a verified Supabase session and role. Database RLS and transactional commands enforce row and mutation permissions independently of navigation.

## Available Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm test` | Run Node.js tests (these do not replace credentialed browser checks) |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run the full TypeScript check |
| `npm run build` | Generate the production build |
| `npm run start` | Serve an existing production build |
| `npm run visual:review` | Run Playwright interaction checks and capture screenshots |

For a production build, run `npm run build`, then `npm run start`. Vercel environment and GitHub Actions setup are described in [DEPLOYMENT.md](DEPLOYMENT.md).

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

- Authentication, operational records, private evidence uploads, and in-app notifications use the existing Supabase project. New tenant requests use server-side Auth Admin provisioning without a signup confirmation email. Account requests and decisions use in-app notifications and applicant status checks; only password recovery sends email, through Supabase Auth.
- Billing amounts, currency, six-month coverage, and due dates are entered by the owner because the source documents do not approve automatic pricing rules.
- `app/lib/preview-data.ts` contains illustrative content; sample values must not become billing, occupancy, or permission rules.
- Local environment files, credentials, dependencies, build output, and caches are excluded by `.gitignore`. `.env.example` is the placeholder-only template and is safe to commit.
- Follow [AGENTS.md](AGENTS.md) for repository conventions and verification guidance.
