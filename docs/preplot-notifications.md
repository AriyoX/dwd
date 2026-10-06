# Pre-plot notifications

DWD uses its existing minute Cron → `dispatch-notifications` → Expo pipeline for planning reminders. Only registered iOS/Android installations with an active sign-in, enabled device delivery, and a recorded target timezone qualify. The new mobile build records the installation's IANA timezone on registration and foreground return. Existing builds have no timezone context and receive no pre-plot campaigns until upgraded.

## V1 schedule

All times are Kampala local time, `Africa/Kampala` (UTC+3). Devices reporting `Africa/Nairobi` also qualify because some East African device settings use that zone. This is timezone targeting; it does not establish that a person is physically in Uganda. A user's most recently updated, enabled installation determines timezone eligibility, and individual out-of-zone installations cannot receive the campaign.

| Moment                  | Send time           | Window closes       |
| ----------------------- | ------------------- | ------------------- |
| Friday                  | 5:15 PM             | 5:30 PM             |
| Friday backup           | 7:30 PM             | 7:45 PM             |
| Saturday                | 3:30 PM             | 4:00 PM             |
| Saturday backup         | 7:15 PM             | 7:30 PM             |
| Sunday, separate opt-in | 4:00 PM             | 5:00 PM             |
| Holiday eve             | 5:15 PM             | 6:00 PM             |
| Holiday                 | 3:00 PM             | 4:00 PM             |
| New Year's Eve          | 3:00 PM and 7:00 PM | 4:00 PM and 7:30 PM |

The two New Year's Eve opportunities obey the same cap and unopened-primary rule. No late catch-up sends occur after a window closes. Title/body variants rotate deterministically by account, day, and campaign; retries retain the same copy. They use the supplied Ugandan English, Luganda phrases, and safety copy.

Holiday campaigns replace overlapping weekend campaigns. Christmas Day takes precedence over Boxing Day eve. Good Friday, Easter Sunday, Eid, Janani Luwum Day, Martyrs' Day, and election holidays suppress campaigns on the day and eve. The initial dated overrides come from the [Ugandan consulate's 2026 calendar](https://arusha.mofa.go.ug/basic-page/public-holidays) and [embassy calendar](https://washington.mofa.go.ug/index.php/node/262).

**Campaigns continue across years without an annual cutoff.** Friday, Saturday, optional Sunday, and New Year's Eve use recurring rules. `private.preplot_annual_holidays` supplies fixed-date holidays every year, including January 1, Independence Day, Christmas, and Boxing Day. Gregorian Easter, Good Friday, and Easter Monday are calculated with the [US Naval Observatory's computus](https://aa.usno.navy.mil/faq/easter).

`private.preplot_holidays` remains the server-owned table for official dated overrides, substitute days, and one-off holidays. Overrides take priority over recurring rules. Add/update official moon-sighting dates there. Without a dated Eid override, a tabular Hijri forecast suppresses the estimated day ±2 days, plus the eve of the resulting quiet period. This is a conservative suppression estimate, not a declaration of official holiday dates; [Hijri calendar adjustments vary by country and observation](https://learn.microsoft.com/en-us/dotnet/api/system.globalization.hijricalendar.hijriadjustment). A nearby official Eid entry replaces that estimate. The original `preplot_calendar_coverage` metadata is retained for historical compatibility and no longer gates scheduling.

## Eligibility and suppression

- Account-level **Pre-plot reminders** defaults on for users who enable device delivery; **Include Sundays** defaults off. Both are in mobile Reminders and independent of in-Night reminders.
- Suppress users participating in an active Night, including hosts and joined members. A Night started or joined in the past 12 hours also suppresses delivery, even after ending or leaving it.
- Respect reminder pause, pending account deletion, disabled or revoked device registrations, and quiet hours (10 PM–8 AM by default). Quiet-hour fields are currently operator-controlled in `private.preplot_preferences`; equal start/end suppresses the full day.
- Allow at most two campaign events per account per Friday–Thursday period, including holiday campaigns, across all devices. Reserved events count toward the cap even if delivery fails, keeping retries and outages conservative.
- Require at least two hours between campaign windows. A second campaign is suppressed if an earlier campaign in the period was opened, marked read, or converted to a Night. Evening backups additionally require an accepted, unopened primary on the same date.
- A transaction-scoped advisory lock and unique account/day/campaign key prevent competing Cron ticks from creating duplicates. Delivery claims retain existing leases and bounded retries.
- Starting or joining an active Night immediately suppresses its outstanding campaigns and discards queued, failed, or claimed deliveries. The worker rechecks eligibility immediately before every Expo send. Once Expo/APNs/FCM has accepted an in-flight message, the server cannot retract it; the existing short TTL and campaign expiration bound late arrival.

Pre-plot events use a separate category. The browser push worker does not send them. Native check-ins and personal reminders retain their existing generic lock-screen copy; only pre-plot jobs expose campaign text.

## Routing and measurement

Push data carries account/event IDs; the app loads that specific owned event before routing. The destination is `/night/new?source=push&campaign=friday_preplot&notificationId=<event-id>` (also accepted as `dwd://night/new?...`). The allowlist preserves this destination through authentication. Expired events can still resolve when tapped; no arbitrary URL from a push is followed.

`private.preplot_campaigns` records window, Expo acceptance, receipt delivery, actual push open, suppression, and attributed Night start. Marking an inbox event read is not an open. Opens are idempotent and account-scoped. Night creation/join attributes the most recent accepted campaign in the past 12 hours; this is attribution, not proof that the push caused the Night. Expo's delivered receipt means APNs/FCM accepted delivery, not confirmed human/device receipt, per the [Expo delivery documentation](https://docs.expo.dev/push-notifications/sending-notifications/).

`private.preplot_app_sessions` records 15-minute foreground/registration buckets without tokens or credentials. Existing Night/member timestamps supply Night start history. These tables are private with RLS and no client table grants.

Personalized send timing is deferred until enough history exists. Use session buckets, actual opens, and Night start times to evaluate sending two to four hours before a person's usual start time, within relevant windows and all existing caps. Keep V1 fallback times for sparse histories, and compare conversion by campaign before enabling an optimizer. This follows the history-based approach described in [Braze's Intelligent Timing documentation](https://www.braze.com/docs/user_guide/brazeai/intelligence_suite/intelligent_timing).

## Release and verification

On October 6, 2026, both `20261006072232_preplot_notifications.sql` and `20261006074348_recurring_preplot_calendar.sql` were applied to the dedicated DWD project, `kdplbebaotvgcvjggacz`. A subsequent migration dry run found no pending changes. `dispatch-notifications` was redeployed as active version 4 with its existing shared-secret authentication and minute Cron.

Live verification confirmed HTTP 200 and `ok: true` from the existing Cron at 07:54 and 07:55 UTC, with empty browser/native queues. An unauthenticated request returned HTTP 401. Hosted SQL checks confirmed recurring Friday windows in 2027, Christmas in 2030, Good Friday suppression in 2027, private-table RLS, and service-only queue claiming/rechecking. No manual dispatch or extra notification was sent during verification.

Hosted advisors retained expected notices for the private tables with no client policies and account-scoped SECURITY DEFINER RPCs. Their grants and account boundaries were verified; broad table access must not be added to clear these notices. The existing Auth leaked-password-protection warning remains a separate release setting, described in [mobile release readiness](mobile-release-readiness.md).

The backend is deployed. The hosted project had no registered native devices at verification time. Remaining mobile acceptance steps:

1. Release the mobile build containing timezone context, settings, tap tracking, and routing. Enable device notifications on a signed test build.
2. Verify a pre-plot push on physical iOS/Android, including background/cold-start routing, opting out, account switching, and starting/joining a Night before dispatch.

At this deployment, the first upcoming holiday campaign was Independence eve on October 8, 2026 at 5:15 PM, followed by Independence Day on October 9 at 3:00 PM, Kampala time. The holiday campaign replaces the usual Friday 5:15 PM opportunity.

Automated checks: `node scripts/test-database.mjs preplot_notifications.sql recurring_preplot_calendar.sql native_notifications.sql notification_scheduler.sql notification_message_details.sql`, `npm run test:unit`, `npm run typecheck`, and `deno test supabase/functions/dispatch-notifications/`. Database coverage includes permission boundaries, timezone/quiet-hour suppression, duplicates, two-event caps, backups, holiday precedence, future years, expired-tap lookup, delivery/open attribution, and cancellation on Night creation.

The final October 6, 2026 verification passed all 445 database assertions across 17 suites, 374 unit tests, 22 mobile tests, and 18 dispatch-worker tests. Workspace type checks, changed-file lint/formatting, the Edge Function type check, and local Supabase security/performance advisors passed. Repository-wide lint reported existing issues in other files. For the Edge Function type check, use `deno check --config supabase/functions/dispatch-notifications/deno.json supabase/functions/dispatch-notifications/index.ts` so Deno uses the function's dependency configuration.

## Other notifications and future development

Friday and Saturday primaries/backups, optional Sunday, holiday eve/day, and New Year's Eve campaigns are included. Existing group attention, direct check-ins, personal pace, planned end, and periodic logging reminders continue through their existing preference, lifecycle, and delivery rules. Pre-plot frequency caps do not mute those in-Night notifications.

Country-specific calendars, targeting, copy, and the Help call action are planned in [country expansion](country-expansion.md). Personalized send-time optimization remains the separate history-based follow-up described above.
