# Native offline logging

Implemented 3 October 2026. Existing uncommitted night-feature work was saved first in commit `6721c1f`.

## Behavior

- Ordinary planned/custom drinks and chasers are written to the existing SQLite-backed device storage before any logging request. Each intentional entry has one UUID and original consumption timestamp, preserved through retries and restarts. Managed-guest entries retain the original actor and target.
- Pending entries appear in an expandable section on Tonight, the night screen and the recap. The collapsed section shows the count and flags entries needing attention, keeping logging controls reachable with a long queue. Expanded entries show the person, drink measurements, original time, sync/review/failure state, and retry/removal controls. Confirmed activity counts remain separate; canonical idempotency keys, including deleted logs, are excluded from pending display and projected-plan calculations.
- Replay uses the existing `log_drink`/`log_water` APIs, runs sequentially, and reconciles created/duplicate results by refreshing the night. It runs on startup, foreground return, live connection recovery, manual retry and a 15-second foreground interval. A connection failure stops that replay pass. This is foreground sync, not an OS background delivery service.
- Plan warnings include confirmed and queued alcohol. Locally detected warnings are persisted before the native acknowledgment dialog; cancelling removes an unattempted entry. Server-discovered warnings wait for explicit review. A newly discovered warning requires another acknowledgment, while earlier acknowledgments remain intact.
- Ended-night entries remain reachable from Tonight and the recap. The server accepts entries consumed before actual ending within its existing 24-hour grace period; entries consumed after actual ending or received after that period stay visible as rejected entries. Removed participants, inaccessible bottles and other permanent failures are not retried automatically.
- Queues and cached reads use separate actor keys. Sign-out/account changes invalidate the coordinator immediately, stop subsequent requests, and discard stale UI completions. Requests pin the original actor's access token so a session change during Supabase's asynchronous authentication cannot send the entry as another user. Signing back in as the original actor resumes their queue.
- Unattempted entries can be removed offline. If an earlier attempt may have saved, removal first resolves the original key online and uses the normal server undo API. Failed checks or undo retain the record; the UI never silently discards an ambiguous save. A record that synced during removal uses the normal activity Undo control.
- A successfully read profile, active-night list and individual night snapshots are cached by actor and query scope. Connection failures can restore these reads after restarting offline with a restored session. Explicit authentication/authorization denials invalidate the affected cache. New accounts and nights that have never loaded still require a connection. Device write/read failures are reported without pretending the entry is durable or overwriting an unreadable queue.
- Shared-bottle pours retain the existing online inventory check and immediate warning flow; they are not added to the offline queue. Creation, joining, plan edits, invitations, end/leave actions and undo of confirmed activity still require a connection.

No backend migration or hosted data changes are required.

## Review and fixes — 4 October 2026

Reviewed commit `254dc61`. Its original 336 unit tests and 42 database lifecycle assertions passed, but additional integration checks exposed gaps:

- **Expired sign-in on offline restart:** Supabase can retain the session on disk while returning `session: null` and emitting `INITIAL_SESSION` with null after a failed token refresh. The app now restores the existing SDK session only for transport failures; it still requires the account's previously verified profile. Initial null events no longer invalidate that queue. Explicit rejection, sign-out, recovery mode, and account changes retain their access boundaries. No second copy of auth tokens is stored.
- **Stalled requests:** reads, sync, and removal checks now have a 10-second deadline; supported data requests receive an abort signal. Uncertain writes retain their original key and time, and late responses cannot remove the local entry. Replaying resolves server duplicates safely.
- **Storage recovery:** a successful retry republishes the queue even if it is empty or every entry needs review, clearing a stale storage error.
- **UI:** pending entries are compact and expandable, review/rejection states remain visible in the summary, removal shows progress on the removal control, and cached activity uses a neutral notice instead of an error panel.

Verification: `npm test` passed 348 unit/integration tests (341 existing/pure tests plus 7 native React integration tests) and 349 database assertions across 14 suites in isolated local Postgres. Added cases exercise the actual Supabase SDK's expired-session behavior and aborted requests, as well as mounted auth/offline providers, cache recovery, sign-out races, and pending-entry interactions. Run just the native component/provider tests with `npm run test:mobile`.

All workspace typechecks and the Android/iOS Metro/Hermes exports passed. Export artifacts are in the ignored `.tmp/mobile-offline-review/` directory. Formatting and whitespace checks passed for the changed files. The full repository ESLint run reported no errors in changed files, but failed with 54 errors in untouched web, configuration, script, and browser-test files, primarily unsafe `process.env` typing; that repository-wide check is not green.

The native React tests mock platform components, device storage, and app-state events. They verify state and control behavior, not actual SQLite durability, operating-system lifecycle behavior, visual layout, or screen-reader output. The installed-build checklist below remains required for those device-specific checks.

## Focused verification

- `npx vitest run tests/mobile-offline-logging.test.ts tests/mobile-flows.test.ts`: 38 tests passed, including 30 new offline cases. Coverage includes persistence/restart, planned/custom drinks and chasers, lost responses, concurrent retries, interrupted syncing, additional warning acknowledgments, permanent rejection, account isolation, stale requests, token pinning using the actual Supabase client, storage failures, safe removal, canonical reconciliation, and offline profile/cache boundaries.
- `node scripts/test-database.mjs database_lifecycle.sql`: all 42 existing database lifecycle assertions passed against isolated local Postgres. These verify real RPC idempotency, archived plan versions, authorization, combined historical warnings, pre-end uploads, actual-end rejection and grace-period expiry.
- Mobile TypeScript, targeted ESLint and iOS/Android Metro/Hermes exports. Bundle output is under `.tmp/mobile-offline-logging/`, an ignored local verification artifact rather than an installable build.

No phone or emulator was connected (`adb devices` returned no devices). Native storage durability, navigation, alert presentation and operating-system connectivity behavior still need the installed-build pass below.

## Installed-build checklist

Use disposable test accounts and a test night.

1. While online, open Tonight and an active night with a completed plan. Enable airplane mode. Log an ordinary planned drink, a custom drink and a chaser, including one entry for a consenting managed guest. Expand Pending entries and check the person, time and measurements; confirmed counts should not include unsynced entries.
2. Force-close and reopen while still offline, including after the access token has expired. The previously opened night and queue should remain accessible for the same restored account. Log another ordinary entry. Remove an unattempted entry and check that it stays removed after another restart. Shared-bottle pours should require a connection.
3. Exceed the plan or log after the planned end. Cancel one warning and accept another. Reconnect, keeping the app open. Accepted entries should sync exactly once and retain their original times; review any additional server warning. Switch between the log sheet, night and Tonight while syncing.
4. Cut connectivity during a request, restart, then reconnect. Verify a single server entry per action. Remove an uncertain save: a connection is needed to check/undo it, and a failed check must keep the entry visible.
5. Queue entries, sign out, and sign into a different test account while online. The second account must see none of the first account's pending entries or cached nights. Sign back into the first account to resume. Also switch accounts during replay or while a warning dialog is open.
6. With a second device/account, end the night while the first device is offline. Reconnect within 24 hours: pre-end entries should save; entries recorded after actual ending should remain rejected. Check the recap controls. Grace expiry is covered by the database suite and can be checked in a controlled test environment without altering real nights.
7. Check light/dark mode, large text, VoiceOver/TalkBack, warning dismissal and returning from background. Confirm pending controls remain reachable and status text is announced clearly.

## Next P2 work

Completed 5 October 2026: the five areas below now have native implementations. See [Native notifications and remaining P2 flows](mobile-p2-features.md) for behavior, tests and remaining hosted/build/device integration. The list records the order used for this implementation.

Shared bottles are implemented. The proposed remaining order is:

1. **Native notifications:** permission flow, device-token lifecycle, delivery, inbox/read state and navigation to the correct night. Existing reminder preferences and check-ins are already available.
2. **Planning/setup:** explicit date/time/timezone, solo/group selection, draft recovery, guest setup, custom plan-item editing and review, retaining revision checks.
3. **Logging/ending:** catch-up entries and the planned-end decision flow; verify serving details and group visibility against the web.
4. **Invitations:** full invitation links, replace/revoke, failure/retry states and universal/app-link integration. Authentication destination preservation already exists.
5. **Account/support:** profile editing, account deletion, feedback/support and request history. Terms/Privacy entry points, appearance and sign-out already exist.
