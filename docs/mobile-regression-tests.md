# Mobile regression tests

Updated 5 October 2026. Aim: repeatable release confidence without asking an agent to rerun every check. See [release setup](mobile-release-readiness.md) first.

## What was run in this review

- Mobile TypeScript.
- Native notification provider tests (13 cases), including denial → Settings recovery and withdrawing opt-in.
- Native offline/provider integration tests (8 cases), including access-token pinning across an account switch.
- `tests/mobile-p2-features.test.ts` (17 cases).
- `native_notifications.sql` (29 isolated PostgreSQL assertions).
- Native/browser notification worker tests (15 cases).
- Hosted migration/RLS/grant checks and a real scheduled worker HTTP 200 with an empty native queue.
- Follow-up: 14 memories/tour tests, 16 onboarding/route tests, the 17 P2 tests and an Android Metro export. The new photo modules still need a rebuilt native binary.

Physical devices, the new Maestro flow, signed binaries, lint and the complete suites were **not** run in this review. Previous implementation-pass results are historical, not evidence for a newly signed release.

## Commands for you to run

Use the repository root unless noted. Install dependencies with `npm ci` if needed. Database tests start disposable Docker containers; Docker Desktop must be running. Do not point fault-injection or deletion tests at real users.

Quick changed-feature checks:

```powershell
npm run typecheck --workspace @dwd/mobile
npx vitest run tests/mobile-p2-features.test.ts tests/mobile-onboarding.test.ts tests/mobile-memories-tour.test.ts
npm run test:mobile
node scripts/test-database.mjs native_notifications.sql
deno test --config supabase/functions/dispatch-notifications/deno.json supabase/functions/dispatch-notifications/handler_test.ts supabase/functions/dispatch-notifications/native_test.ts
```

Run these broader checks once before a release, or when shared auth/contracts/storage change:

```powershell
npm run typecheck
npm run test:unit
npm run test:db
deno check --config supabase/functions/dispatch-notifications/deno.json supabase/functions/dispatch-notifications/index.ts
npx eslint apps/mobile tests/mobile-p2-features.test.ts --max-warnings=0
git diff --check
```

For web/shared behavior changes, also run `npm run test:browser` with the isolated backend from [the existing CI workflow](../.github/workflows/checks.yml). Do not use a live hosted project for that suite. Full-repository `npm run lint` and `npm run format:check` are existing CI gates; prior notes record baseline failures, so separate unrelated failures from this diff instead of disabling the gates.

Check both native bundles without purchasing cloud builds:

```powershell
Push-Location apps/mobile
npx expo install --check
npx expo export --platform android --output-dir ../../.tmp/mobile-release/android
npx expo export --platform ios --output-dir ../../.tmp/mobile-release/ios
Pop-Location
```

Exports validate bundling, not native compilation, signing, permissions or delivery. Finish with the standalone `testing` APK and real iOS build.

## Manual acceptance matrix

Use accounts A (host), B (member), C (unrelated), a consenting managed guest, a finished night, and a separate disposable account for deletion. Use a second phone or the web app for multi-user actions. Record pass/fail plus build/device/OS and evidence for each row.

| ID  | Steps                                                                                                           | Required result                                                                                                       | Automation path                                                 |
| --- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| N1  | Enable → deny → allow in OS Settings → return                                                                   | Device becomes On without another prompt; inbox always available                                                      | Mounted provider regression exists; Maestro for OS interaction  |
| N2  | Enable; send B a check-in; background, lock, then cold-open B                                                   | Generic lock-screen copy, correct night/inbox and read state                                                          | Worker/SQL tests exist; real device delivery required           |
| N3  | Revoke OS permission; disable in app; sign out; switch accounts during enable                                   | No stale-account navigation or ongoing registration; retry failed disable                                             | Provider/SQL tests exist; device confirmation                   |
| N4  | Pause/category off; read event; leave/end night; schedule deletion                                              | Ineligible queued jobs suppressed; stale tokens disabled; accepted ticket distinct from receipt                       | SQL + Deno tests exist                                          |
| N5  | Block only acknowledge RPC; tap inbox event                                                                     | Opens destination; returning still offers Mark read                                                                   | Add mounted NotificationsScreen interaction test / proxy E2E    |
| P1  | Setup solo/group, custom drink, guest consent; move between steps; force-stop/reopen                            | Same account draft restored; other account cannot see it; quantities/ABV intact                                       | Pure tests exist; add Maestro restart flow                      |
| P2  | Drop response after start commits; restart and retry, including after planned end                               | Same night ID, exactly one night for creation key                                                                     | SQL recovery test exists; add proxy + database assertion        |
| P3  | Invalid/past end, DST gap/ambiguous time, unreadable draft, storage-write failure                               | Actionable error; no blind duplicate start or overwritten unreadable draft                                            | Extend existing draft tests and instrumented native tests       |
| L1  | Load night; airplane mode; ordinary drink/chaser/guest log; force-stop; reconnect                               | Same keys/times replay once; totals reconcile; no cross-account replay                                                | Offline unit/provider coverage; add Maestro + DB count          |
| L2  | Catch-up both kinds; exceed plan; use shared-bottle main; inject failure after first local save                 | Warnings wait for review; original times retained; retrospective inventory unchanged; partial save does not duplicate | P2/outbox tests; injected store failure + UI test               |
| L3  | Planned end passes; host extends/ends, B leaves/keeps logging; end from second device                           | Correct role actions; after-end acknowledgment; end routes to recap                                                   | Add native UI journey; shared DB permission tests               |
| I1  | Share/copy HTTPS link; open signed out/cold; join; replace/revoke old link                                      | Destination survives auth; old links fail; existing members stay                                                      | Existing invite tests; add two-account device flow              |
| I2  | Commit replacement/revoke but drop response; restart and retry; rotate from another device                      | Original operation key retained; late revoke cannot revoke later replacement                                          | P2 + database tests; proxy E2E                                  |
| A1  | Edit display name; revisit Account and an archived recap                                                        | Current profile updates; archive keeps historic name; errors allow retry                                              | Add native form test; shared profile tests                      |
| A2  | Send support request; drop response; retry; check history/reply                                                 | One request; pending content frozen; draft survives restart; fields locked on storage error                           | P2 input/draft tests; add native screen + database assertion    |
| A3  | Pending entry then delete attempt; resolve it; schedule deletion; fail logout; retry; sign in before processing | Pending data protected; one schedule; logout retry; cancellation; only owner's device data cleared                    | Existing deletion/cleanup tests; disposable account E2E         |
| AU1 | Signup/adult confirmation, resend, expired reset, Google/Apple success/cancel, cold invitation                  | Correct callback/profile completion; protected screens remain guarded                                                 | Existing auth tests; provider/device sign-off                   |
| B1  | Create/join bottle, adjust glass/main, pour/undo, leave/put away; race two pours                                | Inventory and plan revisions consistent; no offline inventory mutation                                                | Existing shared-bottle DB tests; two-client device journey      |
| U1  | Light/dark; largest text; TalkBack/VoiceOver; keyboard open on every form                                       | No clipped actions; reading order, details, selected/busy states understandable                                       | Manual + Maestro screenshots; accessibility review              |
| U2  | Reduce Motion; rapid taps; sheet drag/dismiss; background/return; slow Android                                  | No double submit, lost context or disruptive motion; haptics timely                                                   | Manual on release builds; automate double taps/state assertions |
| R1  | Install testing APK, stop Metro, launch/restart; upgrade with queued logs                                       | Starts independently; durable entries survive compatible upgrade                                                      | Maestro smoke plus upgrade flow                                 |

Notification checks must include Android and iOS; an Android emulator pass does not establish APNs behavior. Test denied permission and account switching before considering delivery complete.

### Memories, detailed recaps and practice tour

- **M1 — upload recovery:** choose an image, force-stop before upload, reopen and upload. Drop the response after Storage upload and again after registration; retry the saved task. Assert one object/row with the original ID. Check the two-photo quota, unsupported images and preparation errors. Run with staging fixtures and the proxy described below.
- **M2 — privacy and removal:** A uploads, B views, C is denied. B has no delete control and cannot delete through the API. A deletes from web; mobile refresh removes the photo. Fail Storage deletion: keep the row and offer retry. Switch accounts during preparation/upload; never show the old account's task or signed URLs. Schedule deletion on a disposable account and verify only its local photo files are cleared.
- **M3 — viewer:** open, close, previous/next, rotation, failed/expired URL, light/dark, large text and screen reader. On iOS check pinch zoom. Check limited/denied photo access and JPEG conversion on installed Android and iOS builds. No camera/microphone permission should be requested.
- **R2 — detailed recap:** use a fixture with an extended end, actual end, after-end and catch-up entries, removed logs, archived plans and a managed guest. Compare displayed quantities/grams with the shared calculations and web recap. A personal-scope recap must not expose other members.
- **T1 — practice isolation:** exercise all nine steps, exceed the sample plan, cancel/confirm, undo a bottle serving, skip, restart and replay from Account. No real night/log/invitation/check-in/photo/permission/call mutation may occur. Progress belongs to the signed-in account on that device; sample entries reset on remount. Verify this with network/DB assertions alongside a Maestro UI flow.

The 14 focused tests cover protocol/reducer boundaries; M1–M3, R2 and T1 installed-device journeys are still manual until their Maestro and staging fixture flows are added.

## Automate progressively

The existing Vitest suites cover pure rules and mocked providers. The SQL runner applies all migrations to disposable Postgres and checks permission/idempotency boundaries. Deno tests fake push transport. Keep each failure at its cheapest useful layer; do not replace a real permission/signing test with mocks.

### Starter device smoke

Added [.maestro/mobile-smoke.yaml](../.maestro/mobile-smoke.yaml). It opens Account, Notifications and History on Android; it performs no explicit product mutations and retains sign-in. It has **not yet been executed**. Install the testing APK, sign in with a QA account, dismiss any existing sheet and return to Tonight. Install [Maestro CLI/Studio](https://docs.maestro.dev/maestro-cli/how-to-install-maestro-cli.md), connect the phone/emulator, then run:

```powershell
maestro test .maestro/mobile-smoke.yaml
```

If a native-tab label differs on your OS, inspect the accessibility tree in Maestro Studio and adjust that selector; avoid screen coordinates. Add stable `testID` props to the few repeated/ambiguous controls as the suite grows. Keep real accessible names and states. Build a separate iOS flow for its navigation controls; Android `back` is not an iOS acceptance test. See [Maestro flow authoring](https://docs.maestro.dev/get-started/quickstart.md).

### Server-writing journeys and fault injection

1. Use a staging Supabase project or the isolated local backend, with the APK configured to reach it. Emulator `10.0.2.2` is not the physical phone's localhost. Prefer a staging HTTPS origin for phone testing.
2. Create a fixture runner outside the app using a server-only test credential. Generate run-scoped accounts/night IDs and clean up only those IDs. Refuse to run if the backend is `kdplbebaotvgcvjggacz` or outside an explicit staging allowlist. Do not ship a bypass/test admin endpoint in the app.
3. Log in through UI or supported Auth APIs using ordinary QA credentials. Use shared data APIs to seed an active night, finished night, plan, guest and invitation. Never put service-role credentials in Maestro flows, APKs or committed files.
4. Add one Maestro flow per matrix ID. Assert user-visible states, then have the fixture runner query authoritative row counts/creation keys/inventory. A toast or route change alone is not a persistence assertion.
5. For lost-response cases, use an external proxy (for example mitmproxy) to forward the selected RPC to the staging server and then drop its response **after commit**. Simply switching airplane mode on before sending does not exercise this case. Capture the operation key before the interruption and compare it after restart.
6. Test partial device-storage failures in mounted provider/screen tests with an injected store that throws on the Nth write. Keep such injection outside shipping application behavior. Test end-time transitions with fixture timestamps in staging instead of changing production records.
7. Save failure screenshots/video, redacted app logs and the final database assertion report. Do not upload real-user screenshots, bearer tokens or support message contents.

### CI wiring

`.github/workflows/checks.yml` already runs typechecks, tests and isolated database checks on pushes/PRs, plus web browser checks. To add native device regressions:

- Add a small Deno worker-test job; use the exact Deno commands above and the checked-in lockfile.
- On a release candidate or manual dispatch, build one testing APK, reuse it across device flows, install with `adb install -r <apk>`, provision staging fixtures and run `maestro test .maestro`.
- Use a Linux Android emulator runner for Android UI tests; use macOS/simulator builds for iOS UI tests. Keep physical push/auth/signing acceptance as a release gate.
- Publish test reports/screenshots as short-lived CI artifacts. Pin action/tool versions; store only staging credentials in CI secrets; do not expose them to untrusted pull-request jobs.
- Add P1/P2/L1/I2/A3 journeys first. Run the small deterministic tests per PR, device smoke per candidate, and the full manual matrix before store rollout. Fail the release if a required scenario is untested or failing.

This plan is intentionally incremental: only the starter flow is supplied; fixture/proxy/device CI automation remains to be implemented and verified. No paid build/device service was started.
