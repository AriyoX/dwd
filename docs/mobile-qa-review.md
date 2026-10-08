# Independent mobile QA review — 7 October 2026

Current recommendation: **NOT READY**. This is a preliminary code review, pending local validation and device evidence. The implementation report's historical test results have not been independently reproduced.

Reviewed the working-tree diff and `mobile-qa-implementation.md`, including startup providers, routes, setup recovery, offline logging, invitations, bottle commands, custom forms, shared UI, native configuration, relevant tests and the bottle recovery migration. Ancillary web changes received code review only.

## Verification matrix

PASS here means code evidence is sufficient for the stated requirement; it does not imply device acceptance.

| Requirement | Status | Evidence |
|---|---|---|
| Location popup | PASS | Home prompt removed; default location opt-in is false; only the explicit Settings action requests permission. |
| Tour behaviour | PARTIAL | Settings replay and persisted seen state exist; cold-start notification resolution is not coordinated with automatic touring (F2). |
| Pending entries | UNVERIFIED | Integrated into expandable Entries, with global saved-entry access and missing-night fallback. Offline/reconnect acceptance remains. |
| Connectivity copy | PASS | Reviewed changed notices use plain language; saved API errors are sanitized. |
| Dismissible messages | UNVERIFIED | Close control and horizontal swipe implemented; actual gesture/scroll interaction remains untested. |
| Collapsible activity | UNVERIFIED | Local expanded state, accessible header and conditional entries implemented; simulator interaction remains untested. |
| Link text | PASS | Share invite, Copy link, Open invitation and Email DWD support replace raw or unclear labels. |
| Setup cleanup | UNVERIFIED | Unsubmitted state is ephemeral; submitted commands retain identity; completion marker protects cleanup. Bottle recovery migration deployed and inspected; runtime recovery remains unverified. |
| Shared bottles | PARTIAL | Creation, joining, partial pours, adjustment and undo exist; uncertain form identity is lost on unmount (F3). |
| Custom drinks | UNVERIFIED | Shared validated form, busy guard, wrapping categories and keyboard changes exist. Keyboard/scroll/safe-area acceptance remains. |
| Automatic invites | PARTIAL | Persist-before-send, account/night coalescing, expiry and revocation handling exist; reconnect can be dropped during an in-flight failure (F4). |
| Logging buttons | UNVERIFIED | Main/chooser controls are at least 84 points; secondary large actions are 72 points; one-tap path and duplicate guard exist. Real interaction remains untested. |
| Android notifications | UNVERIFIED | All 25 targeted tests pass; user reports Settings works normally in Expo Go. Installed-build push delivery explicitly deferred. |
| General UX | PARTIAL | Simpler labels, larger controls and fewer panels are present. Tour interruption (F2) and unavailable-notification retry controls (F5) remain. |

## Findings

### F1 — Startup blocker: Expo Go guard ran after the SDK import

- **Files:** `apps/mobile/src/providers/notifications-provider.tsx`; installed SDK `src/DevicePushTokenAutoRegistration.fx.ts`, `src/TokenEmitter.ts`, `src/warnOfExpoGoPushUsage.ts`.
- **Cause:** The static `expo-notifications` import evaluates auto-registration, calls `addPushTokenListener`, and throws in Android Expo Go. Guards inside the provider cannot prevent module evaluation. The affected routes do have default exports. Their warnings are consistent with this failed dependency load; the reported ErrorBoundary error is likely downstream and must be checked after reload.
- **Reproduction:** Open the reviewed app in Android Expo Go.
- **Expected:** The app and inbox open; unsupported remote push stays unavailable.
- **Fix applied:** Added `src/lib/notification-sdk.ts`, which checks Expo Go before dynamically importing the SDK. Provider registration, listeners, response clearing and sign-out cleanup use it. Listener setup checks unmount and cleans up subscriptions after asynchronous loading.
- **Coverage added:** `tests/integration/notification-sdk-loading.test.tsx` verifies that the SDK is never evaluated in Expo Go and concurrent installed-build callers share loading. Extended the existing Expo Go provider case to cover deactivation. All three targeted notification test files now pass per user report; simulator acceptance remains pending.
- **Limit:** This fix does not enable remote push in Expo Go. Expo documents that Android remote push requires a development/installed build: <https://docs.expo.dev/versions/latest/sdk/notifications/>.

### F2 — First-use tour races notification navigation

- **Files:** `src/components/tour-navigation.tsx:34`; `src/providers/notifications-provider.tsx`, `openTap`.
- **Cause:** A zero-delay timer on Home starts and marks the tour seen, while notification navigation waits for `getMyNotificationEvent`. There is no shared pending-destination gate. Existing tour tests set the pathname directly; they do not mount notification resolution alongside the tour.
- **Reproduction:** With an unseen tour, cold-open a notification in an installed build and delay the event lookup while Home is the current route. The tour can open first; notification routing can then cover it. Its seen marker has already been written.
- **Expected/fix:** Finish or deliberately resolve the pending startup destination before considering the tour. Expose startup navigation readiness and gate the tour on it; add a delayed-response integration case. Do not replace the timer with a longer arbitrary delay.
- **Status:** Confirmed missing coordination by code inspection; exact device presentation is unverified.

### F3 — Shared-bottle retry identity survives only the mounted form

- **Files:** `app/night/[nightId]/bottles.tsx:483` and `:677`; `src/lib/recoverable-command.ts`.
- **Cause:** The frozen command/key is held in component state. After an uncertain failure, `onBusy(action.busy)` releases All bottles even while `submitted` remains true. Leaving the form or force-closing loses the recovery command. Header/back navigation also bypasses this recovery state.
- **Reproduction:** Let a share/adjust request commit but lose its response. After the timeout, leave the form and reopen it. The original command/key cannot be replayed. Recreating a bottle with fresh IDs can duplicate the intended bottle.
- **Expected/fix:** Preserve unresolved command identity across navigation/restart and reconcile it with server state before allowing a fresh replacement operation. The existing new-night draft recovery is durable; it does not cover these separate bottle forms. Persistence plus a targeted remount/recovery test is preferable to only disabling a button.
- **Status:** Confirmed in-memory recovery limitation; duplicate-inventory outcomes require targeted fault injection. Do not treat the command-class unit test as restart coverage.

### F4 — Automatic invitation retry can miss reconnection

- **Files:** `app/night/[nightId]/invite.tsx:74`, `:159`, `:165`; `src/lib/automatic-invite.ts`.
- **Cause:** If connectivity returns while a failed request is still pending, the focus callback reruns but exits through `inFlight.current`. When that request finally rejects, clearing the ref does not retrigger preparation. The expiry effect explicitly excludes pending operations; there is no pending-operation retry timer.
- **Reproduction:** Start preparing an invite, lose and restore connectivity before the request times out, then let the original request reject. Stay on Invite. It can remain failed until manual Try again or refocus.
- **Expected/fix:** Remember a reconnect requested during active work and replay the persisted operation after settlement, or add bounded retry for pending operations while focused and online. Preserve the existing token/key deduplication.
- **Status:** Code-level race identified; runtime fault-injection verification pending.

### F5 — Unsupported notification state offers an ineffective retry

- **File:** `app/notifications.tsx`, unavailable-state actions.
- **Problem/cause:** Expo Go and missing build configuration use the same Try again/Turn off controls as recoverable states. Try again cannot supply a different installed binary or Firebase configuration.
- **Reproduction:** Open Notifications in Expo Go after the startup fix; tap Try again.
- **Expected/fix:** Show the unsupported-build explanation and usable inbox; offer retry for recoverable registration failures. Distinguish unsupported environment from temporary failure in the UI state.
- **Priority:** Minor UX follow-up, below startup and recovery correctness.

## Android notification trace

1. Explicit enable persists account-scoped opt-in; startup does not request OS permission.
2. Android creates `dwd-reminders` before checking/requesting permission. App config declares POST_NOTIFICATIONS and the notification plugin's default channel.
3. `canAskAgain` controls prompting. Permanent denial offers phone Settings; foreground synchronization rechecks permission.
4. EAS project ID is validated; token retrieval is timed out. The installed SDK contains the failed-token-promise retry patch.
5. Backend registration calls `register_native_push`, then `update_native_push_context`. A pending marker precedes the call; registered state follows success. The database upserts by installation ID and handles token/account reassignment.
6. Offline opt-in is retained; reconnect, foreground and a 15-second foreground pending retry reconcile it. Simultaneous synchronization is coalesced. Separate foreground events still retrieve/register again, including context refresh; they do not inherently create duplicate subscription rows.
7. Opt-out retains cleanup responsibility after an uncertain registration. Owner/generation checks prevent late token acquisition from registering for a newly selected account. Listeners are removed on effect cleanup.
8. Errors become user-visible states, but most underlying errors are not retained in diagnostics; configuration failures emit only a generic warning.

**Not proven:** Native permission behavior, valid Firebase/FCM credentials, build-to-project association, background delivery, or delivery after logout/login. The implementation report says its resolved local configuration lacked a Firebase client file. Remote migration history now confirms the native-push migrations and bottle recovery migration are deployed, but that alone does not prove push delivery. Current Expo documentation supports Android emulators with Google Play services as well as physical devices; Expo Go is the unsupported environment, not simply the fact that an emulator is being used.

## Validation ledger and next step

- Performed: read-only diff/source/test inspection and `git diff --check` (passed).
- Changed in this review: notification SDK loading helper, provider loading/cleanup, loader regression test and Expo Go deactivation assertion.
- User-run mobile TypeScript check: passed twice before the follow-up loading correction.
- User-run targeted notification tests: 23 passed, 2 failed, 1 unhandled rejection across three files. The failures were permission-revocation setup and cold-start account restoration; the unhandled error was `__DEV__ is not defined` from the real Expo runtime. React test renderer deprecation messages are warnings, not failed assertions.
- Follow-up diagnosis: simultaneous dynamic imports from synchronization, listeners and tap handling can bypass the installed Vitest manual mock because its shared import call stack treats overlapping imports as self-imports. The installed runner explicitly documents this limitation. The loading helper now shares a single promise, resets it on rejection, and still guards Expo Go before using it. Tap handling now catches SDK-loading errors as well as backend errors. Loader coverage asserts concurrent callers share the same promise.
- User-reported rerun after correction: all 25 tests across the three notification test files passed. No tests were executed by the reviewer.
- User simulator result: Settings works normally; remote notifications remain unavailable in Expo Go. User explicitly deferred installed-build notification testing.
- Next requested validation: a short online shared-bottle creation/logging/adjustment/reopen check in Expo Go, following deployment below.
- Not run: builds, exports, installs, browser suites, Maestro, database behavior tests or device automation.

## Remote migration deployment

- User authorized applying pending migrations on 7 October 2026.
- Target verified from the local Supabase link and project API: `drink-with-desire`, project `kdplbebaotvgcvjggacz`.
- `supabase db push --linked --dry-run`: exactly one pending migration, `20261006191320_mobile_bottle_start_recovery.sql`.
- `supabase db push --linked --yes`: applied successfully.
- `supabase migration list --linked`: all 23 local/remote migration versions match.
- Read-only SQL verification: migration recorded; deployed function calls `start_night_out_recoverable`; duplicate starts return before bottle mutation; anonymous EXECUTE is denied; authenticated EXECUTE is granted; empty function search path retained.
- No seed/reset commands or test fixtures were run against the remote project. Behavior after deployment still needs the manual check.
- Security advisor returned INFO notices for 17 RLS-enabled tables without policies, WARN notices for 58 authenticated SECURITY DEFINER RPCs and the anonymous invite-preview RPC, and disabled leaked-password protection. These cover existing objects/settings; this migration retains its existing SECURITY DEFINER access model. Its specific auth gate/permissions were inspected; broader warnings were not remediated as part of deployment. References: [RLS policy advisory](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [authenticated function advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [anonymous function advisory](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Highest remaining correctness risks: unresolved shared-bottle form requests and first-use notification navigation. The deployed migration fixes recovery of initial night creation; it does not fix the separate in-memory bottle form recovery finding. Final release acceptance remains pending.
