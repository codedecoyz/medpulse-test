# MedPulse

> **Always ready. Before the emergency arrives.**

**Designed & developed by Rajiv Kumar Singh**

MedPulse is a Hospital Warehouse & Emergency Readiness System built with Expo / React Native, Supabase (Postgres, Auth, RLS, Realtime, Storage, Edge Functions, pg_cron), and server-side Google Gemini AI.

## Project Structure

- `app/` — Expo Router screens (`(auth)`, `(tabs)`)
- `src/components/` — Reusable UI primitives (`MedPulseLogo`, `StatusChip`, `ScreenState`)
- `src/features/` — Domain feature modules (`auth`, etc.)
- `src/lib/` — Core clients and utilities (`supabase`, `secureStorage`, `i18n`, `flags`, `queryClient`, `database.types`)
- `src/theme/` — Design tokens, WCAG 2.1 contrast checker, and `ThemeProvider`
- `src/locales/` — English (`en.json`) and Hindi (`hi.json`) translations
- `supabase/` — SQL migrations, RLS policies, seed data, pgTAP tests, and Edge Functions documentation
- `specs/MedPulse-SPEC.md` — Single source of truth specification

## Environment Variables

1. Copy `.env.example` to `.env` and fill in your Supabase project URL and anon key:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
2. Never put `GEMINI_API_KEY` in client `.env` files. Set it strictly via Supabase Edge Function secrets (`MP-NFR-001`).

### Supabase Cloud Email OTP Setup (`MP-AUTH-001`)

By default, Supabase Cloud's **Magic Link** email template sends `{{ .ConfirmationURL }}` (a clickable link) instead of a numeric OTP code. In your Supabase Dashboard:
1. Open **Authentication → Email Templates → Magic Link**.
2. Replace `{{ .ConfirmationURL }}` with `{{ .Token }}` (the numeric one-time passcode).
3. Under **Authentication → Providers → Email**, set **Email OTP Expiration** to `600` seconds (10 minutes).

## Setup & Scripts

```bash
npm install
npm run typecheck
npm run lint
npm run test:ci
```

Start the Expo dev server:

```bash
npm start
```

Reset and test the Supabase database locally (requires Docker Desktop and Supabase CLI):

```bash
npm run db:reset
npm run db:test
```

## Delivery Phase Status

- [x] Phase 0: Foundation (Expo TS + Router + CI, Supabase schema + RLS + pgTAP + seed, Email OTP auth + SecureStore + idle lock, Design tokens + EN/HI i18n + feature flags)
- [x] Phase 1: Inventory and manual movements (100-item catalog, UoMs, batches, PAR levels, append-only ledger + atomic stock levels, FEFO issuing, offline SQLite cache + idempotent queue)
- [ ] Phase 2: Manual Stock Counter
- [ ] Phase 3: Alerts and dashboard
- [ ] Phase 4: Requisitions and procurement
- [ ] Phase 5: AI tasks and assistant
- [ ] Phase 6: Scenario engine
- [ ] Phase 7: Activation
- [ ] Phase 8: Scanner beta
- [ ] Phase 9: Reports, localisation, polish
