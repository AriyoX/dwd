# Quick Log implementation

Both milestones are implemented. Migration `20261013115257_quick_log_count_only_import.sql` was applied to the linked `drink-with-desire` remote (`kdplbebaotvgcvjggacz`) on 13 October 2026. The additive migration `20261014081225_quick_log_drinks_and_chasers.sql` was applied on 14 October 2026. Remote checks confirmed chaser constraints, import/correction support, finished-history counts and unchanged access restrictions. The UI changes are in the workspace; this review did not deploy the web app or submit an app-store build.

## Review follow-up: 13 October 2026

- Fixed reload discarding a failed deletion of the last local session or an unsaved age acknowledgement. Unsaved mutations now remain in memory for Retry saving even when there are no sessions left.
- Fixed transfer setup/sign-in continuing before the source intent was saved. Failed writes now keep the user on the review screen with a retry action on both platforms.
- Scoped a remembered destination to its source session so opening another session cannot reuse the earlier session's destination.
- Rejected null source session IDs and malformed entry fields before importing. Previously SQL null comparisons could accept a null source session ID.
- Fixed account erasure retaining imported Quick Log entries. The owner foreign key now cascades deletion; regression coverage confirms receipts disappear and other participants' entries survive.
- Moved the browser appearance control below Quick Log content so it cannot cover the full-width logging/transfer actions.

Verification: 532 shared/web tests and 148 native-renderer tests passed. The full 23-suite database run passed; after the account-erasure change, all 90 assertions in the three affected suites passed (46 Quick Log, 4 concurrency, 40 account deletion). Browser coverage includes the original 18 passing cases plus three signed-in handoff cases across desktop Chromium, mobile Chromium and mobile WebKit. Workspace typechecks, production build, and lint checks passed; formatting and diff checks passed.

Remote migration history matches local history. A remote SQL check confirmed RLS, authenticated-only imports, denied direct inserts, strict source-session validation, and cascading owner deletion. The security advisor introduced no new warnings; the new private receipt table intentionally has RLS without client policies and no client table grants.

Mobile access: the onboarding screen has a Quick Log action; skipping onboarding reaches welcome with Quick Log as its primary action. Sign-in also exposes it. Signed-in Tonight shows a Quick Log or Resume Quick Log card above active nights, with current counts when a session exists. It resumes the account session first, or a guest session when there is no active account session. Guest sessions stay labeled on the card and are not silently assigned to the account. History links to past quick sessions. The logger has one circular Log drink action, a smaller Chaser action beside Undo, counts, expandable activity, finish and optional Add to a night. Session options contains history and account/guest switching. Physical iOS/Android touch feel, large-text layout and VoiceOver/TalkBack still require hardware checks; browser emulation and native renderer tests do not establish those results.

## UX follow-up: 14 October 2026

- Drink includes all alcoholic drinks, including legacy shots. Chaser means a non-alcoholic follow-up. The main circle always logs a drink; the smaller Chaser action logs a separate chaser without changing the drink count or switching modes.
- Existing shot records retain their stored kind and immutable import payloads so pending retries still reconcile. They display and count as drinks. New chaser records use their own kind and never enter alcohol calculations or fabricate measured water.
- Chaser-only entries remain visible in active nights, group views, finished history and recaps, without marking measured alcohol totals incomplete. Drink entries still retain unknown quantities and strengths.
- Removed routine saved-status and count-only explanations from the main logger. Save failures and Retry saving remain visible when needed; retention information stays in Session options.
- Centered counts, added a soft rim to the logging circle, placed Chaser and Undo below it, and moved history/account switching into Session options. Web press feedback now matches native: a 120ms scale to 0.97 with opacity feedback, respecting reduced motion. Native retains one light haptic per successful log.
- Fixed signed-in native direct entry returning to Welcome: it now returns to Tonight when there is no previous route.
- Home uses a full-width resume card on its own row, avoiding narrow-screen compression beside the greeting. Native Tonight uses the same placement above active nights.
- Verified the circular control and visible Undo at 390 × 844, plus no horizontal overflow at 320 pixels with 200% browser text. Captured light, dark and enlarged-text previews in `.tmp/quick-log-drinks-chasers-*.png`.
- Verification: all 27 browser cases passed across desktop Chromium, mobile Chromium and mobile WebKit. The shared/web suite had 534 passes and one test-fixture boundary failure; after removing the fixture's Node import, the affected security suite and new domain suite passed all 26 tests. All 148 native renderer tests passed, followed by all 9 focused Quick Log tests after adding correction/finish and signed-in Back regressions. Workspace typechecks, focused lint, formatting, production web build and Android/iOS JavaScript/Hermes exports passed.
- Database checks: all 62 assertions passed across Quick Log, concurrent imports and the new chaser suite. Remote security-advisor findings were unchanged by the migration. Emulator interaction remains unverified: the Windows control helper was unavailable, Expo Go initially failed to load, and automatic approval review blocked the subsequent deep-link launch command.

## Milestone 1: device logging

The Expo logger is `/quick-log`, with `/quick-history` and `/quick-transfer` as public routes. Quick Log is visible on welcome, introduction, sign-in, and the signed-in Tonight tab. The matching Next.js routes are `/quick-log`, `/quick-log/history`, and `/quick-log/add`.

Logging creates a session on the first tap, retains every deliberate Drink/Chaser tap, derives counts from entries, and persists exact Undo, corrections, removals, finishing and history. Returning after midnight keeps the session. After 12 hours without activity, the dated continue/start-new choice is a product heuristic, never an estimate of alcohol or sobriety.

Guest storage and each signed-in account have separate scopes. Guest logging started before authentication finishes remains selected as guest logging. Signing in does not assign that history to an account or upload it. Account changes switch account scopes; signing out resumes guest data. An account user can explicitly open guest logs on the device.

The existing age rule is retained as a small inline acknowledgement for guests or accounts without an existing acknowledgement. Existing confirmed account metadata avoids repeating it. Logging never requires a profile, permissions, a tour, location, connectivity, or night setup. Startup permission requests are deferred away from welcome, authentication, Tonight and Quick Log.

Native persistence reuses Expo SQLite's key-value store with its transactional synchronous update callback. A whole versioned scope record is the commit boundary. Web uses browser storage under an exclusive Web Lock, waits for another tab to release the writer, and reacquires after browser page restoration. Supported web logging needs a current browser in a secure context (HTTPS or localhost). Browsers without Web Locks can view records but cannot mutate them. A loaded page can keep logging offline; obtaining the site's assets for the first visit still requires a connection.

Version 1 and 2 records migrate to version 3 without changing entry IDs, stored kinds, timestamps or transfer payloads. Earlier version 2 records without Undo metadata remain readable. Older clients reject version 3 instead of overwriting chasers they cannot understand. Invalid or unsupported records stay intact and block replacement; session information exposes the original data for recovery. Failed writes retain recoverable memory, show a failure notice, and offer Retry. Local storage is not advertised as encrypted. Clearing app/browser data or uninstalling can remove untransferred records. Web, native, and different devices do not have automatic DWD sharing or guest backup.

## Milestone 2: explicit authenticated transfer

The review shows the selected counts, unknown measurements and recording-time meaning. Sign-in uses existing return destinations and a durable source intent. The destination choices use existing active memberships (including invitations), existing invite redemption, or normal night setup. The participant always comes from the caller's authorized membership. A final confirmation is required.

Opening an ordinary invite and choosing an invite from Quick Log both offer the local session after a successful join. Not now leaves it available for later. Existing memberships are reused, including when an invitation's new-member quota is full. Anonymous previews remain public without granting access to the private schema. Expired, revoked, unavailable and ended invitations retain their original restrictions.

Each batch has a stable operation UUID and immutable entry IDs/revisions, saved before the request. The server imports entries and its receipt in one transaction. Transaction locks plus operation and source uniqueness prevent concurrent retries or a new operation ID from duplicating sources in another destination. A changed request under the same operation ID is rejected. Lost responses reconcile using the same request, including after restart or a night ending.

Only entries in an unresolved batch are frozen. New logs remain usable and are excluded from that batch. Confirmed source copies remain read-only locally; the night owns later corrections. Transfer never enters the unrelated detailed-log offline queue and never automatically retries with another account's credentials. Foreground transfer requires connectivity.

Night creation remains a separate existing setup operation. Its creation key is retained on response loss, the recoverable creation RPC returns the original night, and the created destination is saved before setup is cleared. Web setup also checks that credentials still match the initiating account. If destination saving fails, retry the same setup. Tests deliberately lose both creation and import responses and recover one night and one batch.

## Representation and consumers

Detailed `drink_logs` still require category, volume, strength and measured ethanol. Full nights still require their normal planned end and setup. Count-only entries use `public.quick_night_logs`; they never become a default beer, spirit measure, or zero-dose entry. Their volume, ABV and ethanol appear as null in snapshots. Original source IDs, revisions, sequence and recording timestamps are retained, and timestamps before a night are labelled earlier logging. Source sequence remains ordered when the device clock moves backwards.

Active and finished snapshots, local and full-night histories, participant counts, recaps, corrections, plan labels and pacing displays handle count-only entries. Measured subtotals are labelled incomplete when unknown amounts coexist; reassuring complete-plan comparisons and pacing advice are suppressed. Count-only imports do not invoke detailed-drink triggers, dose alerts, notification schedules or historical checkpoints. Normal detailed entries, managed guests, shared bottles, plans, invites and the existing offline queue continue to use their original algorithms. There is no existing BAC or export engine to extend.

## Files

- `packages/core/src/quick-log/quick-log.ts`: schemas, validation/migration, identity scopes, counts, time labels and imported-entry types.
- `packages/contracts/src/storage/quick-log-store.ts` and `repositories/quick-transfer.ts`: serialized local lifecycle, exact Undo, immutable batches and recovery.
- `packages/data/src/quick-log/quick-log.ts`: authenticated import and authoritative correction RPCs.
- `apps/mobile/app/quick-*.tsx`, `src/lib/quick-log.ts`, `src/hooks/use-quick-log.ts`, and `src/components/quick-*.tsx`: native logging, history, transfer and invite offer.
- `apps/web/src/app/quick-log/` and `src/features/quick-log/`: browser logging, writer ownership, history, transfer and invite offer.
- Existing welcome/auth/Tonight routing, invitation components, night creation, history and recap components were connected to these flows. Shared domain/database types and package exports were extended.
- `supabase/migrations/20261013115257_quick_log_count_only_import.sql`: count-only collection, private receipts, constrained RPCs, RLS/grants, snapshot/history extensions, and existing-member invitation preview.
- Focused unit, native-renderer, browser and pgTAP tests accompany the feature. Existing guard expectations were updated for the public routes; the CSP test now ignores insignificant whitespace.

## Local setup

Verified environment: Node 22.15.0, npm 10.9.2, Expo 57.0.27, React Native 0.86.3, Next.js 16.3.8, Supabase JS 2.111.0, and global Supabase CLI 2.75.0. No packages were added. The repository recommends newer CLI tooling for type generation; the local migration commands below are supported by the installed CLI.

From the repository root, with Docker running and local environment variables configured:

```powershell
supabase start
supabase migration up --local
supabase migration list --local
npm run mobile
npm run dev
```

The expected migration evidence is the new quick-log migration in the **local** list, `import_quick_log` available only to authenticated callers, and count-only history visible after confirmation. No linked or production command is needed. Configure web `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and mobile `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for local transfer. Device-only logging works without backend configuration.

Focused checks:

```powershell
npm run test:unit
npm run test:db
npm run typecheck
npm run lint
npm run build
npx playwright test tests/e2e/quick-log.spec.ts tests/e2e/quick-transfer.spec.ts
```

Browser transfer tests require the repository's local E2E Supabase configuration and credentials. Database tests run isolated Postgres containers. Browser tests reject non-local backend URLs. Native compilation was verified with these commands from `apps/mobile`:

```powershell
npx expo export --platform ios --output-dir ../../.tmp/quick-log-ios --max-workers 2
npx expo export --platform android --output-dir ../../.tmp/quick-log-android --max-workers 2
```

These are local JavaScript/Hermes exports, not native app-store builds or physical-device tests.

## Verification results

- Shared/web unit checks: 53 files, 530 tests passed.
- Native renderer checks: 22 files, 145 tests passed.
- Isolated database checks: 23 suites, 612 tests passed, including real concurrent imports, receipt recovery, RLS and invitation attribution.
- Focused browser checks: 18 passed across desktop Chromium, mobile Chromium and mobile WebKit. These cover backend-unavailable logging, rapid taps, corrections, refresh/history restoration, failed saves, tab handoff, sign-in cancellation, both invitation entry paths, Not now, invalid links, and lost creation/import responses.
- Workspace typechecks, lint with zero warnings, the production web build, changed-file formatting and `git diff --check` passed.
- iOS and Android JavaScript/Hermes exports passed. Native hardware and assistive technology remain manual checks.

## Manual device checks

- On an existing iOS and Android test build, enable large text and verify the circular logging button, Chaser action, header, Undo and recent entries remain readable and easy to reach with one hand. Try rapid separate taps and a dragged-away cancelled tap.
- Use VoiceOver/TalkBack: verify Drink and Chaser names, distinct counts, log announcements, correction actions, expanded state, save failures and read-only transferred entries. Feel one light haptic per log; reduced motion must keep useful feedback.
- Close/kill and reopen: restore an active session, exact Undo and finished history. Check midnight continuity and the dated stale-session choice. Switch accounts and sign out; confirm only the correct account scope or guest scope appears.
- In airplane mode, keep logging and correcting. Add to a night should ask for connectivity and retain the session. Reconnect and confirm explicitly. Cancel sign-in and choose Not now after joining.
- In actual Safari/Chrome, refresh and reopen, inspect browser persistence, test another tab's writer handoff, and try unavailable/quota-limited storage. Verify a different browser or native installation joins an invite without receiving or fabricating another context's local logs.

Physical-device feel, OS lifecycle behavior, VoiceOver/TalkBack and actual storage restrictions remain manual checks. Optional water logging, widgets, watches, lock-screen actions, favourites and cloud backup remain outside this implementation.

Reference choices follow [Expo storage guidance](https://docs.expo.dev/develop/user-interface/store-data/), [Supabase functions](https://supabase.com/docs/guides/database/functions), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), and [PostgreSQL SQL function bodies](https://www.postgresql.org/docs/17/sql-createfunction.html).
