# Four-session manual QA checklist

Do not use one browser profile for this test. Open four isolated sessions so cookies and browser storage cannot bleed between identities.

| Session | Identity                                          | Suggested container                  |
| ------- | ------------------------------------------------- | ------------------------------------ |
| A       | Host account                                      | Chrome normal profile                |
| B       | Invited account                                   | Chrome Incognito or a second profile |
| C       | Third account participant                         | Firefox/private profile              |
| D       | Authenticated non-member, then signed-out visitor | Edge/InPrivate                       |

Record the dedicated Supabase project name, organization, and project reference before testing. Stop if any value identifies Baby Steps or is unknown.

## Setup

- [ ] Apply the migration to local Supabase or the dedicated Drink with Desire project.
- [ ] Confirm all public product tables show RLS enabled.
- [ ] Configure exact auth redirect URLs and production-like email confirmation behavior.
- [ ] Open DevTools Network and Console in all four sessions; verify no raw token, password, JWT, refresh token, email address, or secret is printed.
- [ ] Use distinct display names and test-only email accounts.

## A. Authentication and transactional creation

- [ ] In A, sign up with display name, email, password, and adult confirmation.
- [ ] Try a signup without adult confirmation; it must fail without a malformed profile.
- [ ] Complete all three wizard screens, add two host plan items with one quick item, and add one managed guest with a plan.
- [ ] Submit once and verify one night, one host membership, host plan, guest, and guest plan exist.
- [ ] Simulate a failed network submission, restore connectivity, and retry with the same wizard state. Verify no duplicate night is created.
- [ ] Confirm the night start time is the successful final submission time, not the time the wizard opened.
- [ ] Confirm the real invite appears only after creation and can be copied/shared.

## B. Invite redemption and ownership

- [ ] Open A’s raw link in B while signed out. Confirm only title, host display name, and planned times appear.
- [ ] Sign up or sign in from the invite route. Confirm the browser returns to the same join flow.
- [ ] Redeem twice. Verify one membership and one use-count increment.
- [ ] Confirm B enters the night with a personal plan setup sheet and does not inherit A’s plan.
- [ ] Before planning, verify B can view, log water, leave, and open emergency help, but cannot log alcohol.
- [ ] Create B’s plan; verify B can quick-log itself and cannot see controls to log for A or the managed guest.
- [ ] In A, verify B’s update appears without manual reload. In B, verify A’s update appears.
- [ ] Try calling the plan/log RPC for the other account using DevTools or a test client. It must return permission denied and create no row.

## C. Realtime and guest management

- [ ] Redeem the invite in C and create C’s own plan.
- [ ] Confirm group cards are not ranked or sorted by consumption.
- [ ] In A, log alcohol and water specifically for the managed guest. Each confirmation and success message must name the guest.
- [ ] In B and C, verify the same guest status is visible but all guest controls are absent.
- [ ] In A, edit the guest plan; verify old plan rows are archived and earlier logs keep snapshots.
- [ ] Undo the latest guest drink and water within 15 minutes; verify soft deletion and summary totals change.
- [ ] Try deleting B’s log as A. It must fail.
- [ ] Remove the managed guest in A. Verify controls disappear but history remains in all snapshots and the final summary.

## D. Non-member and unauthenticated access

- [ ] In D as an authenticated non-member, request `/night/{night UUID}` and its summary. Expect not-found/denied and no night payload.
- [ ] Query each exposed table by guessed UUID. Expect no rows.
- [ ] Call `get_night_snapshot`, `extend_night`, `end_night`, `replace_member_plan`, `log_drink`, and `log_water` for the night. Expect denial and no mutation.
- [ ] Sign D out and repeat direct route/table/RPC requests. Only the constrained invitation preview may return safe fields.
- [ ] Test invalid, expired, revoked, full, and ended-night invite links. The UI must use one generic unavailable presentation and disclose no participant/activity/email data.

## Warnings and time behavior

- [ ] Log less than 20 g in 60 minutes; no personal pace alert.
- [ ] Reach at least 20 g in the rolling hour; only the participant (or guest manager) sees the private wording.
- [ ] Reach at least 40 g in two hours; all current members see the factual check-in wording.
- [ ] Trigger both once, then add another log inside each cooldown. Verify no duplicate alert.
- [ ] Reach the plan exactly. It logs without pre-confirmation and shows the non-celebratory plan-reached checkpoint.
- [ ] Project beyond the plan. Verify one explicit “Log anyway” dialog.
- [ ] Move the planned end into the past. Verify the night becomes overdue but stays `active`.
- [ ] Log after the planned end and beyond plan. Verify one combined dialog and `after_end = true`.
- [ ] Extend in A. Verify B/C cannot extend, one immutable history row is added, and an older after-end log is not reclassified.
- [ ] End in A. Verify all clients become read-only and reach the summary; B/C cannot end.

## Offline and grace-period behavior

- [ ] In B DevTools, select Offline and quick-log twice. Verify two optimistic entries and two persisted, actor-scoped outbox records.
- [ ] Undo one before reconnection. Verify it disappears locally and is never inserted remotely.
- [ ] Restore Online. Verify one canonical log, no double count when Realtime arrives, and the local record is removed.
- [ ] Interrupt a sync after server acceptance. Retry and verify the idempotency key resolves as one row.
- [ ] Queue an entry without an end warning, then let the night become overdue before reconnecting. Verify it moves to `needs_confirmation`, does not auto-retry, and shows Review/Remove.
- [ ] End the night with a pre-end entry still queued. Open the summary within 24 hours and verify it syncs if permissions held at `consumed_at`.
- [ ] Test a queued entry after actual `ended_at`; verify permanent rejection.
- [ ] Test the same pre-end entry after 24 hours; verify permanent grace-expired state and device removal option.
- [ ] Sign out with a pending queue, sign in as a different account, and verify the other account’s pending names/entries neither display nor retry.

## UX, emergency, and browser limitations

- [ ] Test at 320 px and 390 px widths, 200% browser zoom, keyboard-only navigation, and reduced-motion preference.
- [ ] Confirm major controls are at least 48 px high and the dominant quick-log action is visually clear.
- [ ] Verify dialog focus trapping, Escape/close behavior, visible focus, labels, and screen-reader names.
- [ ] Open “Someone needs help” from every active-night segment. Verify all six signs, the warning not to leave the person alone, and manual `tel:112`/`tel:999` links.
- [ ] Grant and deny browser notification permission. Verify the in-app overdue dialog remains the fallback.
- [ ] Fully close the browser and verify documentation does not promise an alert; no false reliable-notification claim should appear.

## Final evidence

- [ ] Save screenshots and database row counts for A–D.
- [ ] Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run format:check`, and `npm run build` from root.
- [ ] Run migration status, RLS/policy/index queries, and Supabase advisors.
- [ ] Record failures honestly before release; do not mark this checklist complete from code inspection alone.

## DWD handoff regressions

- [ ] Start a fresh host setup and confirm every new drink row says `Choose a drink`; Beer appears only after selecting Beer. Test a custom row, removing all rows, switching to water only, and saving an intentional water-only plan.
- [ ] Join with an account, finish setup, log a drink, refresh the original `setup=1` URL, use back/forward, hide/show the tab, and reconnect. No new plan or drink chooser should open after setup is complete. Repeat with a water-only setup and blocked browser storage.
- [ ] In A, B, and the host-managed guest card, compare the saved drink count, label/category breakdown, serving ml/ABV detail, water count, planned count, and departed label. Undo a log and verify both count and breakdown update. Queue one log offline and confirm only A shows it as pending until synchronization.
- [ ] Trigger plan-exceeded and after-end warnings together. Tap `Log anyway` repeatedly on a phone-sized viewport, reload during confirmation, lose the response after commit, restore connectivity, and retry. Verify one canonical idempotency key and a recoverable local record for storage/auth failures.
- [ ] Edit a plan in two tabs. Save one tab, then save the stale tab and verify the draft remains with a reload/review error. Confirm archived logs retain their old label, category, volume, ABV, and plan version.
- [ ] From the group segment, send a check-in to another active account. Verify the sender receives sent feedback, the recipient sees one in-app event without reloading, denied browser permission does not block it, and repeated taps obey the cooldown. For a guest managed by someone else, use `Ask host to check in` and verify the host receives the request.
- [ ] Rename an account in two sessions. Active cards and initials update after canonical refresh; a finished summary keeps the captured historical name. Try whitespace-only and a 61-character name.
- [ ] Create finished nights as host, joined member, water-only member, and a member who leaves before the end. Verify history contains each real account participant, former members see only their own summary, and an outsider sees neither list nor summary.
- [ ] Create nights in `Africa/Nairobi`, `UTC`, `America/New_York` across both DST transitions, and `Asia/Kathmandu`. Compare creator/viewer text, midnight/month rollover, draft restore after travel, invite preview, summary, and reminder schedule. Verify all shared times carry the night zone label.
- [ ] In Account, enable/disable each notification category, change periodic interval, refresh in two tabs, leave/end/extend a night, and verify no stale or duplicate schedules. Test unsupported, default, granted, denied, and revoked browser permission states; in-app events must still work.
- [ ] Run the mobile confirmation and dialog cases in Chromium and the `webkit-mobile` Playwright project. Chromium mobile emulation is Android-like coverage; it is not Safari coverage.

## Device-only checks

- [ ] Receive a push queued before signing out, then sign in as another user on that device. It must show only a generic update, without the old account’s event text or night link. Test a temporarily unreachable push-verification endpoint: a generic notification must still appear (Safari requires visible push), and the correct account’s inbox must retain the event after reconnect.

- [ ] On a real iOS/iPadOS 16.4+ Home Screen web app, grant push permission from the Account gesture, background/close the app, receive a generic push, and follow its deep link. Test uninstall/reinstall and account switching.
- [ ] On real Android Chrome, repeat permission, background, endpoint replacement, logout/account switch, and expired endpoint checks.
- [ ] If those devices or configured VAPID/scheduler credentials are unavailable, record them as unverified. Do not treat a foreground timer or a Chromium mobile run as closed-browser push evidence.

- [ ] Grant permission, simulate a push-provider or registration failure, retry setup, refresh, and turn off this device. Verify the server registration is removed and category preferences persist. Test stale/expired subscriptions and VAPID key rotation.
- [ ] On phone and desktop, inspect Account in both themes, expand/collapse the active-night inbox, mark an event read while refreshing, and check that settings/notification links have usable touch targets and no horizontal overflow.
