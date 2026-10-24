# Repository Guidelines

## Project Structure

This is a Next.js App Router project. Route pages and layouts live in `app/`; shared presentation components are in `app/components/`, reusable route logic and illustrative data are in `app/lib/`, and static PWA assets are in `public/`. Local project decisions are recorded in `docs/PHASE1_ASSUMPTIONS.md`; planning documents and visual references are under `docs/reference/`. The entire `docs/` folder is intentionally excluded from Git and must be backed up separately.

## Commands

Run `npm install` to install the pinned package ranges, `npm run dev` for local development, `npm run build` for a production build, `npm run start` to serve that build, `npm run lint` for ESLint, `npm run typecheck` for TypeScript, and `npm test` for Node’s built-in test runner.

## Style and Components

Use TypeScript and React Server Components by default. Add `'use client'` only for browser state or event handling. Keep shared visual styles in `app/globals.css` and use semantic CSS variables for colors and status states. Use PascalCase for component files and names, camelCase for functions and values, and descriptive kebab-free route folders. Prefer native semantic HTML and small shared components over adding a component library for simple controls.

## Preview Data and Product Rules

All content in `app/lib/preview-data.ts` is illustrative and must remain separate from future backend logic. Do not turn sample amounts, dates, tenant details, or navigation into approved policy. This phase has no authentication, Supabase access, role enforcement, persistence, or real submissions. Keep reference files unchanged.

## Verification

Run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build` before handing off changes. For UI work, check narrow widths (360–390px) and desktop, keyboard focus, reduced motion, and dark mode. Record any unavailable command or browser check in the completion report.
