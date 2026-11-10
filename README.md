# MapSilip

**Dormitory management, all in one place.**

MapSilip is a web application for **Mathea’s Dormitory** that connects owners, caretakers, and tenants through dedicated workspaces. It brings room assignments, billing, maintenance, visitor records, and resident communication into one responsive application.

## Features

### Management

- View dormitory activity, occupancy, and analytics from the dashboard.
- Manage rooms, tenant records, and room assignments.
- Review tenant account requests and approve access with an available room.
- Create invoices, track balances, and review payment submissions.
- Coordinate maintenance requests and respond to tenant concerns.
- Review visitor records and receive notifications.

### Tenants

- View room information and personal account details.
- Check invoices and payment records, and submit payment evidence.
- Submit maintenance requests, concerns, and suggestions.
- Register planned visitors and follow request updates.
- Manage profile details and notification preferences.

### Caretakers

- View assigned maintenance work and request details.
- Update maintenance progress.
- Receive notifications and manage profile information.

### Across the application

- Role-based sign-in and access controls.
- Private file uploads backed by Supabase Storage.
- In-app notifications and configurable Web Push notifications.
- Installable progressive web app with mobile and desktop layouts.
- Light and dark themes, keyboard navigation, and reduced-motion support.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16 with App Router |
| Interface | React 19, TypeScript, CSS |
| Backend | Supabase Auth, PostgreSQL, and Storage |
| Notifications | Web Push |
| Hosting | Vercel |
| Quality checks | ESLint, TypeScript, Node.js test runner, Playwright |

## Getting Started

### Prerequisites

- Node.js **20.9 or newer** and npm.
- A configured Supabase project with the repository’s database migrations applied.
- Access to the application’s environment configuration.

### Installation

```sh
git clone https://github.com/Aiidz/MapSilip.git
cd MapSilip
npm ci
cp .env.example .env.local
```

Populate `.env.local` with your environment’s values:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public Supabase client key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only account provisioning credential |
| `MAPSILIP_SECURITY_DATABASE_URL` | TLS database connection for the application’s restricted security executor |
| `MAPSILIP_RATE_LIMIT_HASH_KEY` | Server-only secret for rate-limit hashing |
| `MAPSILIP_APP_ORIGIN` | Exact application origin, such as `http://localhost:3000` |
| `MAPSILIP_STAFF_AUTH_ENABLED` | Enable staff authentication for the configured environment |
| `MAPSILIP_TENANT_AUTH_ENABLED` | Enable tenant authentication for the configured environment |

Optional Web Push settings are listed in [.env.example](.env.example). Keep server credentials in local environment files or your hosting provider’s secret settings.

Database setup, authentication configuration, and hosting instructions are documented in [DEPLOYMENT.md](DEPLOYMENT.md). Review these when configuring a new environment.

### Run Locally

```sh
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The browser origin must match `MAPSILIP_APP_ORIGIN`.

### Production Build

```sh
npm run build
npm run start
```

## Project Structure

```text
app/
├── management/       # Owner and management workspace
├── tenant/           # Tenant workspace
├── caretaker/        # Caretaker workspace
├── components/       # Shared UI and workspace components
├── lib/              # Application logic and backend integrations
├── auth/             # Authentication callbacks and account flows
└── globals.css       # Shared styles and theme variables
public/               # Logos, icons, and PWA assets
supabase/             # Database migrations and review utilities
scripts/              # Development and verification tools
tests/                # Automated tests
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Build the application for production |
| `npm run start` | Serve the production build |
| `npm run lint` | Check code with ESLint |
| `npm run typecheck` | Check TypeScript types |
| `npm test` | Run automated tests |
| `npm run visual:review` | Run browser checks and capture screenshots |
| `npm run security:preflight` | Run security configuration checks |

## Contributing

Follow [AGENTS.md](AGENTS.md) for repository conventions. Before submitting a change, run:

```sh
npm test
npm run lint
npm run typecheck
npm run build
```

For interface changes, also check mobile and desktop layouts, keyboard navigation, dark mode, and reduced motion.

Design references and internal project documentation are maintained separately in `docs/`, which is excluded from Git and backed up independently.
