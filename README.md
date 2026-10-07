# dwd

Code name: **dwd**. Shared packages use the `@dwd` scope.

See the [September 28 product update](docs/product-update-2026-09-28.md) for night memories, Chaser logging, mid-night participants, plan adjustments, reminders, and release verification.

Live app: **https://dwdug.vercel.app** (the original address remains available). Public email delivery is deferred until SMTP setup.

dwd is a web and Expo Android/iOS app for adults who want a shared, factual record of drinks during a night out. Account participants keep ownership of their own plans and logs; a host can separately manage guests who do not have accounts.

dwd is not a drinking game, competition, medical device, BAC calculator, sobriety detector, or driving-safety tool. A personal plan is an intention, never a medically safe allowance. Do not use this product to decide whether anyone should drive.

## MVP scope

The working web MVP includes email/password authentication, audited profile creation, transactional night creation, personal and managed-guest plans, hashed invitations, idempotent redemption, one-tap alcohol and water logging, deterministic checkpoints, Realtime snapshot refresh, offline queuing, corrections, prospective end-time extensions, irreversible ending, and factual summaries.

The Expo mobile app shares the core night, account, safety and legal flows with the web app. Optional foreground device location selects the supported country on-device, with Uganda as the fallback. Native notifications include recurring weekend and holiday planning reminders; delivery depends on permission, credentials and the operating system. Native Sign in with Apple requires the server setup described in the [App Store audit](docs/app-store-readiness.md).

Supported markets are Uganda, Kenya, Tanzania, Rwanda, South Africa, UAE (including Dubai), UK, US and Canada. Coordinates stay on-device; only country and holiday region are saved. Planning reminders use local time, suppress active/recent Nights, enforce frequency caps and continue beyond 2026. One-off holidays and official moon-sighting dates still need calendar maintenance. See [country support](docs/country-expansion.md) and [pre-plot notifications](docs/preplot-notifications.md).

## Release status — verified 6 October 2026

- All 22 migrations through `20261006103849_apple_revocation_and_release_audit` are applied to the dedicated DWD backend.
- Hosted functions match the reviewed source: `dispatch-notifications` v6, `delete-accounts` v2 and `apple-account-token` v1. Minute notification and hourly deletion Cron jobs are active; recent dispatch requests returned HTTP 200.
- Public [privacy](https://dwdug.vercel.app/privacy), [terms](https://dwdug.vercel.app/terms), [account deletion](https://dwdug.vercel.app/delete-account) and [support](https://dwdug.vercel.app/support) pages return HTTP 200. Native legal pages also work offline.
- Review fix `b56708c` awaits photo copying before temporary-file cleanup, adds regression tests, separates native/web lint inputs and updates Sharp to `0.35.5`. These client/dependency fixes need a new mobile build and web deployment; they require no new backend migration or function deployment.
- That review passed 99 focused unit tests, 13 mobile tests, 33 worker tests, mobile typechecking and targeted lint. The complete suite, full lint after the configuration fix, signed builds and physical-device QA remain separate checks.

This is not a store-approval claim. Apple readiness returns HTTP 503 until its server credentials are configured. Production SMTP, signing/push credentials, leaked-password protection, moderation coverage, final store declarations and real-device acceptance remain release gates. See [mobile release setup](docs/mobile-release-readiness.md), [Google Play audit](docs/google-play-readiness.md) and [App Store audit](docs/app-store-readiness.md).

The product has no marketing site, PIN or delegated account editing, spending, food logging, advertising analytics, ads, achievements, public rankings, AI recommendations, BAC or sobriety estimation.

## Self-service onboarding

Use **Try a demo** on the sign-in/sign-up screen to explore a fictional night without an account. Demo actions remain in browser storage with Reset and Exit controls. DWD includes light/dark mode, email-confirmation recovery, water-only participation, saved night setup, finished-night history, and private feedback/deletion requests. Invite someone uses their account and phone; Track for someone lets the host manage a guest without an account.

The repository is private and connected to the existing Vercel `dwd` project. Branch pushes create previews; `main` deploys production. Database migrations are an explicit separate release step, never part of a preview build. See [deployment and Git workflow](docs/deployment.md) and [support operations](docs/support-operations.md).

## Repository

```text
apps/web                 Next.js App Router web application and browser adapters
apps/mobile              Expo React Native Android and iOS application
packages/core            Pure rules, configuration, schemas, domain/API/database types
packages/contracts       Infrastructure and platform interfaces used by the web MVP
packages/data            Injected-client Supabase repositories and RPC mapping
supabase/migrations      Database schema, constraints, RPCs, RLS, grants, Realtime setup
docs                     Architecture, security, QA, and portability notes
```

The npm workspaces are `@dwd/web`, `@dwd/mobile`, `@dwd/core`, `@dwd/contracts`, and `@dwd/data`. Both clients consume the same three shared packages: `core`, `contracts`, and `data`.

## Prerequisites

- Node.js 22 or newer (implemented with Node 22.15.0)
- npm 10 or newer (implemented with npm 10.9.2)
- Supabase CLI 2.111.0 or newer (the installed global CLI was 2.75.0; the final type-generation pass used 2.111.0 through `npx`)
- Docker Desktop or another Docker-compatible runtime for local Supabase
- A completely separate Supabase project named for dwd for remote use

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

## Native mobile development and testing builds

The Expo app lives in `apps/mobile` and uses the same Supabase backend and shared packages. Copy `apps/mobile/.env.example` to `apps/mobile/.env.local`, fill in the same project URL and publishable key as the web environment you want it to use, then run:

```powershell
npm run mobile
```

Use an installed development build for native development. An iOS Simulator requires macOS and Xcode; EAS cloud builds can be started from Windows. Use signed builds on physical devices to verify push, authentication and native permissions.

For a standalone Android testing APK, run from the repository root:

```powershell
cd apps/mobile
npx eas-cli login
npx eas-cli build --platform android --profile testing
```

Download the APK from the EAS build page. The `testing` profile bundles JavaScript and assets, does not require Metro, and uses the EAS **preview** environment. Configure `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `EXPO_PUBLIC_SITE_URL` there; local ignored env files are not cloud-build configuration. Android push also needs `GOOGLE_SERVICES_JSON` as an EAS file variable and FCM V1 credentials. Use disposable QA accounts; the testing profile does not automatically select an isolated backend.

Run all EAS commands from **`apps/mobile`**, whose package/bundle ID is `com.dwd.app`. The root app config uses a different identity. The `production` profile produces an Android AAB or an iOS store build; see [release setup](docs/mobile-release-readiness.md) before building or submitting.

The optional Android smoke flow requires [Maestro CLI](https://docs.maestro.dev/maestro-cli/how-to-install-maestro-cli), Java 17+, `adb`, a connected device/emulator, the installed app and a signed-in QA account. From the repository root:

```powershell
adb devices
maestro --version
maestro test .maestro/mobile-smoke.yaml
```

If PowerShell cannot find `maestro`, install the Windows CLI ZIP, add its `bin` directory to your user PATH and reopen PowerShell. This smoke flow checks navigation; it does not replace notification, offline-sync, photo, moderation or deletion QA.

Local email confirmation is disabled in `supabase/config.toml`, so browser-created test accounts can sign in immediately. The local SMTP testing UI is available at `http://localhost:54324` if confirmation is enabled locally. Do not put test passwords in `seed.sql`; create accounts through the app or Supabase Studio.

Database tests apply all committed migrations to isolated Supabase PostgreSQL. For earlier full-suite results and the remaining device checks, see [mobile release readiness](docs/mobile-release-readiness.md).

## Root commands

```powershell
npm run dev
npm run mobile
npm run typecheck
npm run lint
npm test
npm run test:unit
npm run test:mobile
npm run test:db
npm run test:watch
npm run format:check
npm run build
```

All commands run from the repository root. `npm test` runs both Vitest and the isolated PostgreSQL integration suite, so it requires Docker; use `npm run test:unit` for the fast non-Docker suite. `npm run build` builds shared declarations before the production Next.js application.

`test:unit` includes the mobile suite; `test:mobile` runs it separately. Mounted native tests live in `apps/mobile/tests/integration/`, outside production source directories. After pulling dependency changes, run `npm ci`, then lint, typecheck and the relevant tests before building.

## Browser tests in GitHub Actions

The `Checks` workflow runs Playwright after validation on pull requests, pushes to `main`, and manual runs from **Actions → Checks → Run workflow**. Desktop Chromium, mobile Chromium, and mobile WebKit run sequentially against a disposable local Supabase backend. No GitHub secrets or production credentials are required.

`scripts/prepare-browser-ci.mjs` copies the committed migrations, seed, email templates, and configuration into `.tmp/browser-ci`, changes the local ports and app URL, and raises test-only authentication rate limits. Supabase CLI is pinned in the workflow. Playwright starts the development app on port 3100; production builds remain a separate check.

Failed tests retry once. Download the `playwright-report` artifact from the workflow run for the HTML report, screenshots, and traces (retained for seven days). CI fails if test credentials are missing instead of silently skipping account flows. New commits cancel older runs on the same branch or pull request.

To rerun just the participant-switching test locally with your existing E2E backend:

```powershell
npx playwright test tests/e2e/handoff.spec.ts --project=webkit-mobile --grep "a host adds"
```

## Environment variables

| Variable                               | Exposure                   | Purpose                                                                 |
| -------------------------------------- | -------------------------- | ----------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Browser and server         | Dedicated dwd Supabase URL                                              |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser and server         | Supabase publishable key                                                |
| `NEXT_PUBLIC_SITE_URL`                 | Browser-safe configuration | Canonical application origin used for auth and invite links             |
| `NEXT_PUBLIC_DWD_VAPID_PUBLIC_KEY`     | Browser and server         | Optional public Web Push key; leave unset for in-app-only notifications |
| `SUPABASE_SECRET_KEY`                  | Server only, optional      | Reserved for future maintenance; unused by normal MVP flows             |

Never use a Baby Steps project credential. Never prefix a Supabase secret or service-role key with `NEXT_PUBLIC_`.

## Dedicated Supabase setup

The dedicated project `kdplbebaotvgcvjggacz` is linked and migrated. See [deployment status](docs/deployment.md). For a future separate environment, use this sequence:

1. In the Supabase Dashboard, create a new project specifically for dwd. Do not select or reuse Baby Steps.
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

The schema starts with [the initial migration](supabase/migrations/20260906121948_initial_dwd_schema.sql); all subsequent changes are in [supabase/migrations](supabase/migrations). Apply the complete ordered history when creating a new environment.

After a successful local reset, regenerate and review the checked-in database types:

```powershell
supabase gen types typescript --local > packages/core/src/types/database.ts
```

Review generated changes against the full migrated schema before replacing the checked-in `packages/core/src/types/database.ts`.

## Authentication behavior

The web app uses request-scoped `@supabase/ssr` clients with cookie-backed sessions. `apps/web/src/proxy.ts` refreshes sessions and forwards refreshed cookie/cache headers. Protected server routes and every mutation validate `supabase.auth.getClaims()`; they do not trust `getSession()` or user-editable metadata for authorization. Email signup creates the profile after checking the display name and adult confirmation. Google sign-in uses PKCE through `/auth/callback`; new Google identities complete their name and adult confirmation at `/complete-signup` before a profile is created. Returning Google users continue directly to their destination.

Pending email signups use a one-hour HttpOnly cookie so confirmation survives refresh without placing the email in the URL or storing a password. Confirmation resumes the original invitation, including when a link opens in another tab. Set the server-only `DWD_EMAIL_CONFIRMATION_CODE_ENABLED=true` only after installing the code-and-link email template with a custom SMTP sender; the default link flow works without that flag.

## Deployment to Vercel

1. Use the existing Vercel project `ariyoxs-projects/dwd` with **Root Directory `apps/web`**, **Framework Next.js**, and **Node.js 22.x**. Keep files outside the root directory enabled so the shared workspaces can build.
2. Use the checked-in `apps/web/vercel.json`. It installs dependencies from the repository root, checks deployment environment variables, builds shared packages and Next.js, and uses `.next` as output relative to `apps/web`.
3. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for the dedicated dwd backend. Set `NEXT_PUBLIC_SITE_URL` to the HTTPS production origin. Preview links automatically use `VERCEL_URL`.
4. Configure Supabase email confirmation, recovery templates, SMTP, and allowed redirects as described in [the deployment guide](docs/deployment.md).
5. Run `npm run deploy:check` with deployment values in `apps/web/.env.production.local`, then deploy and run the four-session QA checklist. The check rejects local backends, placeholders, and known Baby Steps projects.

See [docs/deployment.md](docs/deployment.md) for the live project settings, CLI commands, and deferred SMTP setup.

## Known MVP limitations

- Persistent in-app notifications are available without browser permission. The hosted dispatcher and scheduler are deployed; browser/native delivery still depends on subscription, permission and channel credentials. Native pre-plot campaigns require a valid mobile subscription. See [deployment](docs/deployment.md).
- The compact outbox uses guarded `localStorage`, not a general offline database. It stores only pending activity data needed for retry and is isolated by account and night.
- Invite lookup throttling is an in-process best-effort limiter. Production should add an edge or durable rate limiter after the vertical MVP is stable.
- Account deletion is available in-app and at `/delete-account`, with a cancellable 30-day countdown and an hourly cleanup worker. Personal activity and photos are removed; other participants retain a minimal anonymous membership timeline. Data export is not implemented.
- Vercel and the dedicated Supabase backend are deployed. The user deferred SMTP setup; public signup and password-reset email delivery still need it. See [deployment status](docs/deployment.md).
- Database authorization is covered by isolated PostgreSQL tests; mobile and desktop onboarding checks use Playwright. See the deployment guide for the latest validation and deferred SMTP work.
- Optional foreground location chooses local campaigns and Help numbers on mobile/web, with Uganda as the default. Supported markets and African expansion priorities are in [country support](docs/country-expansion.md).
- Native auth tokens use encrypted SecureStore with migration from legacy storage. Activity caches and pending entries remain unencrypted device data; test upgrades, offline recovery and account switching on real devices.
- Shared photos require operator approval before other participants can see them. Reporting and blocking are implemented, but a person must monitor the moderation queue; see [moderation operations](docs/moderation-operations.md).
- The 6 October dependency review reduced npm audit findings from 20 to 18 high entries by updating Sharp. Remaining entries trace to the unpatched [braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) and [node-forge](https://github.com/advisories/GHSA-86w9-cpqp-85rv) advisories. Rerun `npm audit` before release; do not use `npm audit fix --force` to downgrade Expo to clear the count.

See [architecture](docs/architecture.md), [database and RLS](docs/database-and-rls.md), [manual QA](docs/manual-qa-checklist.md), and [mobile portability](docs/mobile-portability.md) for operational detail.
