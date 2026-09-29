# Night memories and active-night update

Completed nights now keep private shared photo memories while drink and chaser logging stays closed. Active nights support fast participant switching, adding managed guests, catch-up entries, prospective plan adjustments, reminder setup, and an optional factual Quick Check.

## Release review

- Verified the applied `20260920080842_memories_reminders_and_plan_adjustment` migration in the dedicated DWD project, including the private `night-memories` bucket and its 10 MB image limit. This release does not require another migration.
- Verified the active `dispatch-notifications` Edge Function, enabled minute scheduler, and recent successful scheduler runs.
- Verified the Vercel project uses `apps/web`, deploys production from `main`, and has the Supabase URL, publishable key, site URL, and public VAPID key configured for production.
- Preserved account ownership, managed-guest permissions, immutable completed activity, plan history, and idempotent offline queues.

## Corrections found during review

- Catch-up saves the whole batch into the existing outbox before sending. Entries requiring confirmation survive refresh and reconnect instead of replacing one another in a dialog. The dialog identifies the participant and drink being recorded.
- Catch-up rounds the earliest permissible time up to the next millisecond. This avoids rejecting a timestamp truncated from PostgreSQL microsecond precision as occurring before joining or plan setup.
- Photo deletion removes the Storage object while its metadata still permits a SELECT, then hides the metadata. The regression test checks that a previously issued signed URL stops retrieving the file.
- Photo galleries reconcile on focus, reconnection, and while visible, renewing signed URLs and removing photos that no longer pass Realtime authorization after deletion.
- Added full-photo previews, larger delete targets, mobile gallery header wrapping, upload stage labels, and explicit reload recovery.
- Allowed images from the configured Supabase origin in Content Security Policy, and verified that gallery photos decode rather than merely rendering an image element.
- Scoped API and Realtime connections to that same configured backend instead of all Supabase projects. Browser tests now exercise the real CSP without bypassing it.
- Reminder saves recover from transport failures. Pause controls update when the pause expires. Unsupported browsers get an actionable status instead of an ineffective enable button.
- The tour highlights the complete reminder setup, including its action. Compact status rows keep the final step usable on mobile.
- Quick Check uses existing theme colors and compares subsequent attempts within the same visit. It retains the non-sobriety and driving disclaimer.

## Verification

Run from the repository root:

```sh
npm run test:unit
npm run test:db
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run test:browser
```

Browser tests use the dedicated local Supabase stack with Storage enabled, not production data. Coverage includes desktop Chromium, mobile Chromium, and mobile WebKit; private photo upload/deletion, cross-user denial, participant Realtime, exact-one-drink plan adjustment, offline catch-up, onboarding, and notification settings.

Physical-device background push remains a manual check. “Send test notification” checks this device's local notification display; it does not simulate the complete server scheduler and remote push delivery path. Test an installed iPhone/iPad and Android with the app backgrounded, then check deep links and that reminders stop after ending the night.

The hosted security advisor still reports intentional authorized `SECURITY DEFINER` RPCs and the existing disabled leaked-password check. This review did not change authentication configuration. See [Supabase's RPC advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) and [password protection guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
