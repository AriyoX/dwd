# Country expansion: campaigns and emergency help

Status: future development. DWD currently targets Uganda for pre-plot campaigns and labels Help's call actions as Uganda numbers. The recurring calendar works across years; supporting another country requires the changes below.

## Shared country profile

Introduce a validated ISO 3166-1 alpha-2 country setting, with Uganda (`UG`) as the launch default. Let users choose/change it in onboarding/account settings, migrate existing accounts explicitly, and report the selected campaign country alongside installation timezone. Do not infer country solely from language, timezone, SIM, IP, or GPS: zones cover multiple countries and people travel.

Use one shared registry for web/mobile display and matching server configuration:

| Field                                                        | Purpose                                           |
| ------------------------------------------------------------ | ------------------------------------------------- |
| Country code/name and supported IANA zones                   | Selection and local wall-clock conversion         |
| Weekend days, cap-period anchor, primary/backup windows      | Locally tested planning times and frequency rules |
| Fixed/calculated holidays, dated overrides, official sources | Annual recurrence and one-off/substitute holidays |
| Solemn/religious suppression and uncertain-date policy       | Locally appropriate campaigns                     |
| Notification locales/copy and neutral fallback               | Regional language and tone                        |
| Emergency services/numbers, source URL, review date          | Verified country-specific call actions            |

Keep campaign country and **current country for emergency help** distinct. A traveller can retain home campaign preferences while needing help where they are now. Let them confirm the current country in Help, with an offline stored selection.

## Pre-plot backend changes

1. Add country context to account/installation preferences, validate supported profiles, and version changes to suppress queued campaigns from the old country. Retain account-wide caps across devices and country changes.
2. Key `private.preplot_holidays` by `(country_code, day)` and `private.preplot_annual_holidays` by `(country_code, month, day)`. Migrate existing Uganda rows to `UG`. Store calendar/rule types; Gregorian Easter and tabular Hijri estimates do not cover every country's observances.
3. Pass market profiles into `private.preplot_holiday_for`, `private.preplot_windows`, `private.preplot_user_eligible`, `private.native_notification_current`, and `private.create_due_preplot_events`. Replace hardcoded Kampala/Nairobi targeting with each user's selected country, local date/time, quiet hours, weekend anchor, and windows. Define skipped/repeated DST handling while preserving one campaign per local window.
4. Scope Kampala/Luganda copy to Uganda. Review regional language and holiday tone locally. Preserve deep links, measured opens, active/recent-Night suppression, and the two-campaign cap.
5. Add server-only country enable flags and calendar freshness monitoring. Release one verified market/cohort at a time. Official Eid dates, substitute days, and one-off events should be updated from primary sources without disabling future weekend reminders.

## Help button and call action

Native call buttons are in `apps/mobile/app/night/[nightId]/help.tsx`. They use `EMERGENCY_NUMBERS_UGANDA` in `packages/core/src/config/constants.ts` and open `tel:<number>` through React Native Linking. Web Help also uses shared Uganda constants. The native country label, source URL, and review date are currently screen-specific.

Replace those values with the selected current country's verified emergency profile. Both web/mobile should display country/service names, numbers, source, and review date from the shared registry. Bundle/cache supported profiles so opening Help and launching the dialler never waits for Supabase, location permissions, or a lookup request.

Verify each country's numbers and service routing with government/emergency-service primary sources before enabling call buttons. Dial short emergency numbers in their local form; do not mechanically add international calling codes. Uganda's existing 112/999 source is the [Uganda Police Force](https://upf.go.ug/public-safety-crime-response-and-security-operations-update/). Define a review owner/schedule. For unknown/unsupported countries, let the user select their current country and show local-emergency guidance; do not silently dial Uganda's numbers.

Preserve explicit **Call <number>** actions, failed-launch recovery with the exact number, shared emergency signs, and the distinction that a DWD check-in does not call emergency services. Help's country choice should be independent of Night timezone and notification settings.

## Acceptance and rollout

- Database: country isolation, recurrence across years, dated overrides, solemn suppression, different weekends, midnight/DST, travel/account switching, and caps across countries/devices.
- App: per-account country persistence, migrated Uganda default, notification attribution, and offline Help when its current country differs from campaign country.
- Calls: mock Linking/window navigation to verify exact `tel:` URIs, visible country/source, and failure recovery. Do not place emergency calls during automated/manual QA.
- Release: additive migrations, worker deployment, shared profiles and mobile/web settings, signed-device checks, then the country's enable flag. Monitor opens, Night conversions, opt-outs, and late suppression before widening rollout.
