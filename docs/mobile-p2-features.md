# Native notifications and remaining P2 flows

Implemented 4–5 October 2026 against [the mobile UI and parity review](mobile-ui-and-parity-review.md). Previous offline/session changes were committed first as `7a4ea0d`. This is native implementation work; no hosted migration, worker deployment, support submission or account deletion was performed.

## Native notifications

- Account opens a device notification status screen and an authenticated inbox. Permission is requested only after tapping Enable. Denied permission leads to Settings; unavailable credentials, token lookup, registration and unregister failures have retry controls. The inbox remains usable without push.
- Enablement is account scoped. One installation UUID identifies this device, while registration binds its Expo token to the current account and GoTrue session. Registration, foreground permission reconciliation, token rotation, explicit disable and sign-out are serialized. Requests retain their original actor token, and results from an account that has since changed are ignored.
- Reminder categories and pause/resume reuse the existing shared APIs. Delivery rechecks current preferences, pause, event freshness/read state, night membership, planned end, account deletion and the registration's live Auth session. An installation or token transferred to another account loses the previous account's delivery records.
- Cold-start and running-app taps wait for account restoration, verify the payload recipient, load the authenticated event and derive its destination from that event. Arbitrary payload URLs are ignored. Successful opens acknowledge the event; acknowledgment failure leaves the inbox's read control available.
- The existing server scheduler dispatches browser and native channels independently. Native jobs have leases, attempt checks, five bounded send attempts, backoff and stale-token disabling. Expo ticket acceptance is separate from receipt confirmation. Receipt outages allow new sends to continue, and missing receipts expire after 24 hours. Successful receipts mean acceptance by APNs/FCM, not proof that a person saw a notification.
- Native lock-screen copy is generic. Drink, person and check-in details remain in the authenticated app. Delivery is at least once: a lost provider response can cause a duplicate. A push already accepted by the provider cannot be recalled; its payload still cannot open another account's night.

## Planning and draft recovery

`night/new` now has Details, People & plans and Review steps: native date/time pickers, an IANA time zone, duration shortcuts, explicit solo/group choice, consenting managed guests, drink presets, custom serving details and main-drink selection. Review shows quantities, volume, ABV and who the host will log for. Solo excludes stored guest drafts from the command.

Setup is saved in SQLite-backed device storage under the account's key. Restored drafts can be resumed or discarded; unreadable drafts are preserved until explicit discard. Before starting, the exact validated command and creation UUID are persisted. An uncertain response freezes editing and retries that command. The new actor-owned `start_night_out_recoverable` RPC finds a committed creation before checking the planned-end date, allowing recovery after the end has passed without creating another night. The web's original start RPC remains unchanged. New starts still use the existing consent, plan, authorization and future-end validation.

Existing plan revisions continue through the shared revision API. Ordinary custom items can be edited in place, retaining their IDs. Shared-bottle entries retain the dedicated bottle controls.

## Catch-up and planned end

The Add missed entries sheet accepts up to ten drinks and ten chasers with approximate times. Each entry has a distinct UUID, preserved consumption time and the main drink's measured serving. Times are clamped after joining and initial plan setup. Following the web behavior, retrospective shared-bottle drinks record a measured ordinary serving without deducting inventory.

All entries enter the durable outbox before replay. Projected totals include earlier queued entries; warnings wait for explicit review in Pending entries. A partial device-write failure reports how many entries were saved and prevents submitting the batch again blindly. Counts continue to describe activity, without consumption goals or rewards.

When an active night passes its planned end, the native decision sheet opens once per account/night/end timestamp. Hosts can extend by 15/30/60/120 minutes or confirm ending for everyone; other members can leave or keep logging. Extending to a new end creates a new decision point. Logging after the planned end retains the existing acknowledgment requirement. Actual ended nights open their recap.

## Invitations

Hosts create, share or copy full HTTPS invitation links. Share/Copy verifies that the link is still active before opening native controls. Replacement and revocation explain that earlier links stop working while existing participants stay joined. Saved link state includes the pending operation's original token and expiry; an uncertain mutation is retried before another mutation is allowed. Revocation uses the existing request-key API so a late retry cannot revoke a later replacement.

Universal/app-link configuration and website association endpoints are included. The website join page also offers Open in DWD app through the existing `dwd://` scheme. Verified HTTPS links require the signing configuration below; adding the routes alone does not activate association.

## Profile, deletion and support

Account has icon-led navigation to profile, notifications, support and deletion alongside existing appearance, Terms and Privacy controls. Profile editing validates the display name through the shared RPC; account email stays visible and completed recaps retain archived names.

Deletion uses the existing 30-day schedule/cancel API and native confirmation. The screen explains fresh-sign-in cancellation, anonymous shared history, hosted-night closure and photo removal. Pending entries and storage failures must be resolved first. A successful schedule can retry sign-out without scheduling again; registration is removed before global sign-out, then only that account's drafts, cached reads and outbox are cleared. Appearance, installation identity and other accounts' saved data are retained. The existing deletion worker still requires its normal server deployment/scheduler configuration.

Support offers Problem/Idea, an account-scoped recoverable draft, idempotent send/retry, validation/rate-limit errors and request history with status and replies. Unreadable drafts require explicit discard. Submitting the same uncertain message preserves its key and content.

## Native UI and motion

The screens reuse the review's warm palette, system typography, continuous corners, wrapping layouts, compact choice controls, grouped rows and quiet secondary actions. Date/time dialogs, Share, destructive alerts, stacks and form sheets use platform presentation. Android form sheets have a fixed title and Close control because native-stack omits their navigation header; nested scrolling remains enabled. Duration shortcuts use compact visible labels with full spoken labels, setup steps scroll to the top, and custom plan editing appears in place. Existing Reanimated press feedback respects Reduce Motion; tabs have no added animation. Catch-up gives one success haptic for saving the batch, without celebrating consumption.

Controls retain spoken labels, selected/disabled states, at least 48-point press targets, live error/status text and keyboard-aware scrolling. Android notifications and profile were inspected in light/dark mode. Largest text, VoiceOver/TalkBack and physical sheet/haptic feel remain installed-build checks.

## Build and server integration

1. Apply `supabase/migrations/20261004070828_native_push_notifications.sql` before releasing this mobile build. It adds session-bound device registration/delivery RPCs and recoverable starts. Review the migration and use the existing deployment dry-run workflow. New mobile start and registration requests require these RPCs.
2. Redeploy `dispatch-notifications` after applying the migration. Keep the existing `DWD_PUSH_DISPATCH_SECRET` and minute scheduler/Vault configuration described in [deployment.md](deployment.md). Native dispatch uses Expo rather than VAPID; browser credentials remain necessary for browser delivery. If Expo project access-token security is enabled, configure `DWD_EXPO_ACCESS_TOKEN` as an Edge Function secret only.
3. Set `EXPO_PUBLIC_EAS_PROJECT_ID` to the app's EAS project UUID. Configure valid APNs/FCM credentials for the matching `com.drinkwithdesire.mobile` signing identities, and build/install the app with the new notifications and date-picker plugins. Native dependency/plugin changes require rebuilding the binary; an OTA JavaScript update is insufficient. Expo Go is not a native push test environment.
4. Set the mobile `EXPO_PUBLIC_SITE_URL` to the production HTTPS origin. Set `DWD_APPLE_TEAM_ID` in the mobile build and website runtime, and `DWD_ANDROID_SHA256_FINGERPRINTS` in the website runtime to comma-separated SHA-256 signing certificate fingerprints. Rebuild the app and deploy the website association routes on that exact origin. Without valid identifiers, the routes return 404. Include the actual Play signing certificate for a Play-distributed app; development signing can differ.
5. Verify `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` over HTTPS, then test an external `/join/{token}` link with the app installed, absent, signed out and cold-starting. Links must preserve the invitation through authentication.

Public configuration examples are in [apps/mobile/.env.example](../apps/mobile/.env.example) and [the root .env.example](../.env.example). Service-role keys and Expo access tokens never belong in the mobile environment.

References: [Expo notifications](https://docs.expo.dev/versions/latest/sdk/notifications/), [Expo push sending and receipts](https://docs.expo.dev/push-notifications/sending-notifications/), [Supabase Auth sessions](https://supabase.com/docs/guides/auth/sessions), [iOS universal links](https://docs.expo.dev/linking/ios-universal-links/).

## Verification

- `npm run test:unit` and `npm run test:db`: 376 unit/native integration tests and 378 database assertions across 15 isolated Postgres suites.
- Seventeen new shared/pure cases cover draft ownership/consent, expired recovery, time-zone boundaries, catch-up times/warnings/servings, payload routing, invitation retry state, association identifiers, support validation/retry, account cleanup and actual Supabase SDK token pinning.
- Eleven mounted notification-provider cases cover explicit permission, denial, unregister and failed-disable recovery, foreground permission revocation, registration retry, device-storage failure, account changes during token retrieval, deduplicated cold taps, restoration before navigation and suppression of another account's notification. Together with the seven existing native cases, `npm run test:mobile` runs 18 tests. Platform modules, storage and app-state events are mocked.
- Twenty-nine native database cases cover RLS/grants, live-session registration, token validation/rotation, leasing/stale attempts, privacy, ticket/receipt separation and expiry, stale receipt rejection, preferences/pause, ended nights, scheduled deletion, logout, account transfer and expired creation recovery. The isolated runner bootstraps minimal GoTrue session/JWT fixtures; hosted Auth supplies its real equivalents.
- Fifteen Deno worker tests cover browser and native dispatch, generic native payloads, Expo errors/receipts, retries and receipt-service failure. Deno typecheck passes separately from workspace TypeScript.
- Workspace typechecks, changed-file ESLint, formatting/whitespace checks and Android/iOS Metro/Hermes exports pass. Bundles in `.tmp/mobile-p2-export/` are local artifacts, not signed installable builds. The repository-wide ESLint baseline still has unrelated errors recorded in the prior offline review.

No physical device delivery has been tested. The mobile app now has an EAS project ID, but APNs/FCM credentials and signing association have not been verified. Android emulator review does not establish native push delivery or iOS presentation. Complete the checklist below before release.

The supplied Android development APK was installed and connected to Metro with the current source and its existing session. Read-only checks covered the notification status/inbox, all three setup steps, native date dialog, profile, support history, deletion explanation and Account navigation. Setup restored the same review step after a force-close, exercising SQLite-backed draft persistence; the QA setup was then discarded and System appearance restored. No hosted night, log, invitation, profile, support or deletion mutations were performed. This is a limited installed-build review, not full acceptance of the server-writing flows. Separate root-level EAS/app configuration and the downloaded APK are preserved outside the feature commit.

Automated approval review rejected local test-connection configuration access and disposable admin-account setup, without a stated reason. That prevented device checks against the local test backend. Local schema application and isolated database tests succeeded separately without touching hosted data.

## Installed-build checklist

Use disposable test accounts and a test night.

1. Enable notifications, deny once, retry through Settings, background/terminate and receive a check-in. Check generic lock-screen copy, warm/cold navigation and inbox read state. Revoke OS permission, disable delivery, sign out and switch accounts during registration; no former account's event may open for the new one. Confirm paused preferences, ended nights and scheduled deletion suppress queued sends. Inspect Expo ticket and delayed receipt separately.
2. Start a solo and group setup, add/edit a custom drink and consenting guest, change date/time/time zone, review and restart midway. Lose the response after Start and retry after reopening: one night must exist. Repeat after the original planned end, using a controlled test environment.
3. Add missed entries, including plan-exceeding entries and a shared-bottle main drink. Check approximate original times, explicit pending warnings, one entry per key and unchanged retrospective bottle inventory. Test a partial storage failure in an instrumented build.
4. Pass the planned end, dismiss/keep logging, extend as host and end from another device. Check the member's leave choice, recap and existing after-end/grace rules.
5. Share a full invitation, replace/revoke, retry an uncertain operation after restart and try an earlier link. Verify existing people remain joined and cold HTTPS links survive authentication.
6. Edit a profile and compare an archived recap. Submit a disposable support request, lose its response, retry and confirm one history entry. Schedule/cancel deletion on a disposable account and check the local cleanup and sign-in cancellation. Never use a real account for deletion QA.
7. Inspect every new surface in light/dark mode, largest text and VoiceOver/TalkBack, including keyboard overlap, large guest plans, pending warnings, narrow widths, reduced motion and background return. Check haptic timing and form-sheet dismissal on physical iOS and Android devices.
