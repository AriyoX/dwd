# Native iOS follow-up — verified 8 October 2026

## Changes

- Apple keeps the system sign-in button at 44 points; Google's label is 17 points with a matching visible button height.
- Notification and foreground location permissions are requested sequentially on first launch, before sign-in. A failed notification check does not block the location prompt, and network registration waits until after both OS prompts. Denied permissions produce a compact floating reminder. Dismissal lasts until the next return from the background. The reminder opens phone settings when the OS cannot prompt again. Existing opt-outs remain off until the user enables them.
- Native pushes carry each notification event's title and body, matching the inbox. Campaign text is preserved. Campaign delivery expires at the earlier of its deadline or two minutes after sending; it no longer sets `ttl`, which would override the deadline in Expo. Existing recipient, session, preference, expiry and delivery checks remain in effect. See [Expo's payload reference](https://docs.expo.dev/push-notifications/sending-notifications/#message-request-format).
- Temporary notices float above screen content, including inside native sheets. They enter in 180 ms, can be swiped away, and expire after eight seconds; errors remain until dismissed. Screen updates do not restart that timer. Swipes run on the UI thread, preserve position when interrupted, and hand release velocity to a 300 ms spring. Reduced Motion removes the entrance translation and swipe travel.
- Entries and night options use consistent grouped rows; pending status sits beneath the Entries label. Bottle categories are inside a Drink type disclosure with roomier choices, matching custom drinks. Bottle details use smaller headings and show the spirit/mixer instruction beside the editable serving fields.
- The tour highlights actual Home controls with Back, Next, Skip and Done. It performs no practice tasks or product mutations. The new device/account preference is independent of the old practice tour and web tour; Settings can replay it.
- Accepted logs bridge pending entries until a read begun after acceptance is applied to the screen. Superseded responses do not clear that bridge. Reads started before acceptance cannot roll back the count. Later authoritative reads also respect undone entries, which the snapshot API omits.
- Background reads do not animate the pull-to-refresh control. Realtime keeps nights current, with silent periodic reconciliation for disconnected subscriptions and undo updates hidden by row permissions. Inline query loaders no longer restart focus subscriptions on each render.

## Rollout

Apply `supabase/migrations/20261007201619_native_notification_content.sql` and deploy the `dispatch-notifications` Edge Function. Both are needed for specialized native push text. Rebuild the iOS app for the permission-purpose text in `app.json` and the native UI changes. No hosted deployment is performed by these source changes.

## Device QA

1. Compare Apple and Google sign-in in light/dark appearance and at larger text sizes.
2. On a fresh install, accept both permission prompts, then repeat with denials. Confirm one OS prompt at a time, Settings recovery, and a reminder after reopening while either permission remains off. Also try Location Services off and notifications revoked in iOS Settings.
3. Finish onboarding: the tour should begin automatically after permissions settle. Advance/back/skip, reopen the app, and replay from Settings. Check highlight placement and large text, especially for controls near the bottom of the screen.
4. Log drinks and chasers with slow/offline connectivity. Counts should increase once and remain steady when entries sync. Undo a saved entry; it must stay removed. Undo from another device and confirm the active screen catches up after its next background check (every 15 seconds, plus network time). Pull to refresh manually, then verify background updates cause no spinner or scroll jump.
5. Check bottle creation, Entries and Night options. Trigger a pace message and logging feedback: messages should float at the top without moving the log button. Swipe, dismiss and try Reduce Motion.
6. Receive direct check-ins, pace/chaser reminders, planned-end reminders and a campaign on a locked device. Each should contain its own title/message and open the correct destination. Confirm opt-outs and expired campaigns still suppress delivery.

## Automated verification — 8 October

- Unit tests: **489 passed** (`npm run test:unit`, which also runs mobile tests).
- Mobile integration tests: **100 passed** (`npm run test:mobile`, including the final regression additions).
- Native/web dispatcher: **20 passed** (`npx deno test --config supabase/functions/dispatch-notifications/deno.json supabase/functions/dispatch-notifications/handler_test.ts supabase/functions/dispatch-notifications/native_test.ts`).
- Isolated database: **186 assertions passed** across `country_preplot_notifications.sql`, `native_notifications.sql`, `notification_message_details.sql`, `notification_scheduler.sql`, `preplot_notifications.sql`, and `recurring_preplot_calendar.sql` using `node scripts/test-database.mjs` with those filenames. All migrations were applied to disposable Postgres. The message-detail suite checks native titles and bodies for all five night notification types.
- Mobile TypeScript, repository lint and changed-file formatting passed.

No emulator or simulator was launched. These tests exercise mocked native controls and transport, plus real isolated Postgres; visual layout, permission sheets, swipe feel and APNs delivery still require the installed-app checks above.
