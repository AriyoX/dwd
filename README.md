# DWD — Drink with Desire

Code name: **dwd**. Shared packages use the `@dwd` scope.

Live app: **https://dwdug.vercel.app** (the original address remains available). Public email delivery is deferred until SMTP setup.

Drink with Desire is a mobile-first web application for adults who want a shared, factual record of drinks during a night out. Account participants keep ownership of their own plans and logs; a host can separately manage guests who do not have accounts.

Drink with Desire is not a drinking game, competition, medical device, BAC calculator, sobriety detector, or driving-safety tool. A personal plan is an intention, never a medically safe allowance. Do not use this product to decide whether anyone should drive.

## MVP scope

The working web MVP includes email/password authentication, audited profile creation, transactional night creation, personal and managed-guest plans, hashed invitations, idempotent redemption, one-tap alcohol and water logging, deterministic checkpoints, Realtime snapshot refresh, offline queuing, corrections, prospective end-time extensions, irreversible ending, and factual summaries.

It deliberately has no marketing site, native/mobile project, social login, PIN or delegated-edit flow, spending, food logging, GPS, analytics, ads, achievements, public rankings, AI recommendations, BAC or sobriety estimation, or guaranteed notification delivery when a browser is fully closed.

## Self-service onboarding

Use **Try a demo** on the sign-in/sign-up screen to explore a fictional night without an account. Demo actions remain in browser storage with Reset and Exit controls. DWD includes light/dark mode, email-confirmation recovery, water-only participation, saved night setup, finished-night history, and private feedback/deletion requests. Invite someone uses their account and phone; Track for someone lets the host manage a guest without an account.

The repository is private and connected to the existing Vercel `dwd` project. Branch pushes create previews; `main` deploys production. Database migrations are an explicit separate release step, never part of a preview build. See [deployment and Git workflow](docs/deployment.md) and [support operations](docs/support-operations.md).

## Repository

```text
apps/web                 Next.js App Router web application and browser adapters
packages/core            Pure rules, configuration, schemas, domain/API/database types
packages/contracts       Infrastructure and platform interfaces used by the web MVP
packages/data            Injected-client Supabase repositories and RPC mapping
supabase/migrations      Database schema, constraints, RPCs, RLS, grants, Realtime setup
docs                     Architecture, security, QA, and portability notes
```

The only npm workspaces are `@dwd/web`, `@dwd/core`, `@dwd/contracts`, and `@dwd/data`. The three shared workspaces are exactly `core`, `contracts`, and `data`; there is no mobile workspace.

## Prerequisites

- Node.js 22 or newer (implemented with Node 22.15.0)
- npm 10 or newer (implemented with npm 10.9.2)
- Supabase CLI 2.111.0 or newer (the installed global CLI was 2.75.0; the final type-generation pass used 2.111.0 through `npx`)
- Docker Desktop or another Docker-compatible runtime for local Supabase
- A completely separate Supabase project named for Drink with Desire for remote use

## Local installation

```powershell
npm install
supabase start
supabase db reset
supabase status
Copy-Item .env.example apps/web/.env.local
npm run dev
```

Update `apps/web/.env.local` with the local URL and publishable key reported by `supabase status`. Open `http://localhost:3000`.

Local email confirmation is disabled in `supabase/config.toml`, so browser-created test accounts can sign in immediately. The local SMTP testing UI is available at `http://localhost:54324` if confirmation is enabled locally. Do not put test passwords in `seed.sql`; create accounts through the app or Supabase Studio.

Both migrations pass 73 pgTAP assertions in isolated Supabase PostgreSQL. Six mobile/desktop browser flows pass against a separate local Supabase stack. See the deployment notes for reproduction and remaining email setup.

## Root commands

```powershell
npm run dev
npm run typecheck
npm run lint
npm test
npm run test:unit
npm run test:db
npm run test:watch
npm run format:check
npm run build
```

All commands run from the repository root. `npm test` runs both Vitest and the isolated PostgreSQL integration suite, so it requires Docker; use `npm run test:unit` for the fast non-Docker suite. `npm run build` builds shared declarations before the production Next.js application.

## Environment variables

| Variable                               | Exposure                   | Purpose                                                                 |
| -------------------------------------- | -------------------------- | ----------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Browser and server         | Dedicated Drink with Desire Supabase URL                                |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser and server         | Supabase publishable key                                                |
| `NEXT_PUBLIC_SITE_URL`                 | Browser-safe configuration | Canonical application origin used for auth and invite links             |
| `NEXT_PUBLIC_DWD_VAPID_PUBLIC_KEY`     | Browser and server         | Optional public Web Push key; leave unset for in-app-only notifications |
| `SUPABASE_SECRET_KEY`                  | Server only, optional      | Reserved for future maintenance; unused by normal MVP flows             |

Never use a Baby Steps project credential. Never prefix a Supabase secret or service-role key with `NEXT_PUBLIC_`.

## Dedicated Supabase setup

The dedicated project `kdplbebaotvgcvjggacz` is linked and migrated. See [deployment status](docs/deployment.md). For a future separate environment, use this sequence:

1. In the Supabase Dashboard, create a new project specifically for Drink with Desire. Do not select or reuse Baby Steps.
2. Copy the new project reference from **Project Settings → General** and record the project name, organization, and reference in the deployment change record.
3. Run `supabase projects list` and compare all three values with the Dashboard.
4. Only after that comparison, run `supabase link --project-ref YOUR_DWD_PROJECT_REF`.
5. Run `supabase migration list --linked` and inspect the target again.
6. Run `supabase db push --dry-run`, review the output, then run `supabase db push`.
7. Run `supabase migration list --linked` again and verify the new migration is applied.
8. In **Project Settings → API**, copy the project URL and publishable key into the deployment environment. No secret key is needed for ordinary application traffic.
9. In **Authentication → URL Configuration**, set the production Site URL and add exact local, preview, and production redirect URLs for `/auth/confirm`.
10. In **Authentication → Providers → Email**, keep email/password enabled. Enable email confirmation for production and configure production SMTP.
11. In **Database → Replication**, verify the migration-added `supabase_realtime` tables are present.
12. Run the four-session checklist in [docs/manual-qa-checklist.md](docs/manual-qa-checklist.md).

The migration is [supabase/migrations/20260906121948_initial_dwd_schema.sql](supabase/migrations/20260906121948_initial_dwd_schema.sql). Its timestamp matches the version generated by Supabase when the migration was applied.

After a successful local reset, regenerate and review the checked-in database types:

```powershell
supabase gen types typescript --local > packages/core/src/types/database.ts
```

The checked-in `packages/core/src/types/database.ts` was generated by Supabase CLI 2.111.0 from the applied migration rather than maintained by hand.

## Authentication behavior

The web app uses request-scoped `@supabase/ssr` clients with cookie-backed sessions. `apps/web/src/proxy.ts` refreshes sessions and forwards refreshed cookie/cache headers. Protected server routes and every mutation validate `supabase.auth.getClaims()`; they do not trust `getSession()` or user-editable metadata for authorization. The `auth.users` trigger rejects missing display names or missing adult confirmation and creates the profile even when signup has no active session.

## Deployment to Vercel

1. Use the existing Vercel project `ariyoxs-projects/dwd` with **Root Directory `apps/web`**, **Framework Next.js**, and **Node.js 22.x**. Keep files outside the root directory enabled so the shared workspaces can build.
2. Use the checked-in `apps/web/vercel.json`. It installs dependencies from the repository root, checks deployment environment variables, builds shared packages and Next.js, and uses `.next` as output relative to `apps/web`.
3. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for the dedicated Drink with Desire backend. Set `NEXT_PUBLIC_SITE_URL` to the HTTPS production origin. Preview links automatically use `VERCEL_URL`.
4. Configure Supabase email confirmation, recovery templates, SMTP, and allowed redirects as described in [the deployment guide](docs/deployment.md).
5. Run `npm run deploy:check` with deployment values in `apps/web/.env.production.local`, then deploy and run the four-session QA checklist. The check rejects local backends, placeholders, and known Baby Steps projects.

See [docs/deployment.md](docs/deployment.md) for the live project settings, CLI commands, and deferred SMTP setup.

## Known MVP limitations

- Persistent in-app notifications are available without browser permission. Standards-based Web Push integration is included but remains disabled until the server-only VAPID keys, dispatch Edge Function, and scheduler are configured; see [deployment](docs/deployment.md).
- The compact outbox uses guarded `localStorage`, not a general offline database. It stores only pending activity data needed for retry and is isolated by account and night.
- Invite lookup throttling is an in-process best-effort limiter. Production should add an edge or durable rate limiter after the vertical MVP is stable.
- Account deletion is a private request for operator review, not an automatic destructive action. Data export is not implemented.
- Vercel and the dedicated Supabase backend are deployed. The user deferred SMTP setup; public signup and password-reset email delivery still need it. See [deployment status](docs/deployment.md).
- Database authorization is covered by isolated PostgreSQL tests; mobile and desktop onboarding checks use Playwright. See the deployment guide for the latest validation and deferred SMTP work.
- Uganda emergency numbers `112` and `999` were rechecked against the [Uganda Police Force FAQ](https://upf.go.ug/faq/) on September 6, 2026.

See [architecture](docs/architecture.md), [database and RLS](docs/database-and-rls.md), [manual QA](docs/manual-qa-checklist.md), and [mobile portability](docs/mobile-portability.md) for operational detail.
