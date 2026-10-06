# Country support: campaigns and emergency help

Implemented on October 6, 2026 for Uganda, Kenya, Tanzania, Rwanda, South Africa, Dubai/UAE, the United Kingdom, the United States, and Canada. African profiles appear first in both mobile and web country lists. The shared registry is `packages/core/src/config/countries.json`; the migration contains a tested snapshot of it.

## Choosing countries

**Campaign country** is an authenticated account setting in mobile Profile/Reminders and web Account. Existing accounts are migrated explicitly to Uganda. New accounts must select a country before pre-plot delivery becomes eligible. Country is never inferred from a timezone, language, IP address, or GPS. UK users select England & Wales, Scotland, or Northern Ireland.

**Current country in Help** is a separate device-local choice. It works offline with bundled numbers and sources, without Supabase or location permissions. No calls appear until a supported country is chosen; an unsupported country clears a previous selection and shows local-emergency guidance. Returning travellers should confirm the visible country before calling. Changing this choice does not change campaign preferences.

## African calendars

| Profile      | Recurring campaigns and observances                                                                                                       | Suppression                                                                                               |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Uganda       | Existing annual holidays, including Independence Day; calculated Easter                                                                   | Existing religious/solemn dates and estimated Eid                                                         |
| Kenya        | Madaraka, Mazingira, Mashujaa, Jamhuri, Labour Day, New Year, Christmas/Boxing Day; calculated Easter; Sunday observances                 | Good Friday/Easter Sunday and estimated Eid                                                               |
| Tanzania     | Zanzibar Revolution, Union Day, Saba Saba, Nane Nane, Independence, Labour Day, Christmas/Boxing Day; calculated Easter                   | Karume, Nyerere, Good Friday/Easter Sunday, estimated Eid/Maulid                                          |
| Rwanda       | New Year and January 2, Independence, Liberation, Labour Day, first Friday of August Umuganura, Christmas/Boxing Day; weekend observances | April 7–13 mourning week and its eve, Heroes Day, Assumption, Good Friday/Easter Sunday, estimated Eid    |
| South Africa | Freedom, Workers', Women's, Heritage, Christmas/Goodwill, New Year, calculated Family Day; Sunday observances                             | Human Rights, Youth, Reconciliation, Good Friday/Easter Sunday; the November 4, 2026 election holiday/eve |

The calendar rules were checked against [Kenya Law](https://new.kenyalaw.org/akn/ke/act/1912/21/eng@2024-04-26/source), the [Tanzanian embassy's fixed holiday list](https://www.om.tzembassy.go.tz/services/public-holidays-in-tanzania), [Rwanda's presidential order](https://www.mifotra.gov.rw/fileadmin/user_upload/Mifotra/Publication/4.PRESIDENTIAL_ORDERS/PO_on_Mission__delegations_of_powers_and_public_holidays_2022__1_.pdf), and [South African Government](https://www.gov.za/about-sa/public-holidays). Solemn-date suppression is DWD's messaging policy. The Rwanda mourning week follows the [official remembrance order](https://www.rlrc.gov.rw/fileadmin/user_upload/RLRC/Laws_of_Rwanda_v2/Domestic_laws/Laws_in_force/7._Administrative/7.6._Heritage_and_tradition/7.6.3._Genocide_remembrance/7.6.3.2._Commemoration_of__the_Genocide_against_the_Tuts_MO_16-MOJ-19-_of_2019.pdf).

## Other profiles and calendar limits

- **Dubai/UAE:** UAE national holidays and neutral planning copy. DWD conservatively suppresses estimated Ramadan, the multi-day Eid periods, Islamic New Year, Mawlid, and Commemoration Day. This is a product policy, not a statement that going out is prohibited. The profile does not determine a user's emirate.
- **UK:** nation-specific recurring bank holidays and substitute dates, plus 82 official dated overrides fetched from [GOV.UK's calendar](https://www.gov.uk/bank-holidays.json). Recurrence continues after the imported dates. Refresh official exceptions such as one-off bank holidays through dated overrides.
- **US:** [federal holiday baseline](https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/), including nth-weekday holidays and Saturday/Friday or Sunday/Monday observances. Memorial, MLK, Juneteenth, Veterans, and the October observance use suppression. State/local holidays and US territories need additional profiles.
- **Canada:** [federally regulated general holiday baseline](https://www.canada.ca/en/services/jobs/workplace/federal-labour-standards/vacations-holidays.html), including Victoria Day, Labour Day and Thanksgiving. Truth and Reconciliation and Remembrance suppress campaigns. Provincial/territorial calendars and employer-specific substitute dates need dated overrides; the app does not claim a universal Canadian day off.

Official dated entries are keyed by `(country_code, calendar_region, day)` in `private.preplot_holidays`. Region-specific entries take priority over national entries. Annual rows are keyed by country/month/day. Fixed and calculated dates have no year cutoff.

Lunar dates remain forecasts for suppression, not official declarations. Add confirmed country-specific dates under `eid_al_fitr`, `eid_al_adha`, `mawlid`, and `islamic_new_year` as applicable. Official dates replace nearby estimates; Dubai's conservative Ramadan envelope remains. Tanzania substitute days, extraordinary African holidays, and collisions not explicitly established by a rule require official dated entries. Sources that list an old year's weekdays are used only for fixed month/day recurrence.

## Local times, copy, and queued messages

All profiles launch with Friday 17:15/19:30, Saturday 15:30/19:15, optional Sunday 16:00, holiday eve 17:15, holiday 15:00, and New Year's Eve 15:00/19:00 in the installation's local IANA zone. These are starting defaults, not researched optimal times for every city. Prioritize African engagement data when tuning them.

The newest enabled installation with an active sign-in determines account timezone context. It must match an allowed zone/alias for the selected profile; otherwise campaigns are suppressed. East African equivalent zones and Rwanda's Maputo canonical alias are accepted. Postgres IANA conversion handles UK/US/Canadian daylight saving. Afternoon windows avoid the usual repeated/skipped transition hours, and the unique account/day/campaign key prevents duplicates. Government timezone-rule changes still require up-to-date backend tzdata.

Country, UK region, or installation timezone changes invalidate queued/claimed campaigns. The worker checks the saved context before sending. The account-wide two-event Friday–Thursday cap and a conservative rolling seven-day guard prevent travel from resetting frequency. Existing quiet hours, recent/active Night suppression, unopened-primary backups, opt-outs, and account deletion remain enforced. In-flight messages already accepted by Expo cannot be retracted.

Uganda keeps Kampala/Luganda copy. Other profiles use concise English; Kenya/Tanzania retain “plot” where appropriate. Dubai copy avoids alcohol or party references. Review Swahili, Kinyarwanda, South African languages and local tone before adding translated variants.

## Emergency call profiles

| Country      | Visible local numbers and services                  | Primary source                                                                                              |
| ------------ | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Uganda       | 112 / 999 emergency                                 | [Uganda Police](https://upf.go.ug/public-safety-crime-response-and-security-operations-update/)             |
| Kenya        | 999 / 112 / 911 police emergency                    | [National Police Service](https://nationalpolice.go.ke/sites/default/files/2026-04/NPS%20Handbook_2025.pdf) |
| Tanzania     | 112 police; 114 fire/rescue                         | [Government portal](https://www.tanzania.go.tz/faqs)                                                        |
| Rwanda       | 912 ambulance; 112 emergency                        | [Government portal](https://www.gov.rw/emergency)                                                           |
| South Africa | 112 mobile emergency; 10177 ambulance; 10111 police | [Government News Agency](https://www.sanews.gov.za/south-africa/arrive-alive-road-safety-tips)              |
| Dubai/UAE    | 998 ambulance; 999 police; 997 fire                 | [UAE Government](https://u.ae/en/information-and-services/justice-safety-and-the-law/handling-emergencies)  |
| UK           | 999 / 112 emergency                                 | [UK Government](https://www.gov.uk/guidance/999-and-112-the-uks-national-emergency-numbers)                 |
| US           | 911 emergency                                       | [National 911 Program](https://www.911.gov/calling-911/)                                                    |
| Canada       | 911 emergency                                       | [CRTC](https://web.crtc.gc.ca/eng/phone/911/)                                                               |

Verified October 6, 2026. Service labels are deliberate: Tanzania's maternal m-mama line is not advertised as a general ambulance number, and Kenya's listed contacts are police emergency lines. Call availability depends on local services/network; unsupported locations receive guidance instead of a guessed number.

Native Help and web EmergencyPanel use the same bundled registry and exact local `tel:` URI. Short numbers are never given an international prefix. Native dialler failure shows the exact number to dial manually; practice-tour calls stay disabled. No emergency calls are made during QA.

## Operations, verification, and next development

The additive migration is `20261006080503_country_campaigns_and_emergency_help.sql`. Market enable flags are server-only in `private.preplot_markets`. All new configuration remains private with RLS and no client table grants; account RPCs check ownership through `auth.uid()`.

Automated verification covers every market, future years, observed days, national/UK region isolation, lunar/solemn suppression, DST, timezone compatibility, travel caps, opt-in, queued cancellation, offline country restoration, exact dialler targets, failed launches, and shared registry consistency. A signed mobile release and physical-device acceptance remain required; web changes ship with the next web release.

On October 6, 2026, the migration was applied to DWD project `kdplbebaotvgcvjggacz` and `dispatch-notifications` was redeployed as active version 5. The existing scheduler returned HTTP 200 with `ok: true` at 08:34 and 08:35 UTC; an unauthenticated request returned HTTP 401. Hosted queries verified all nine enabled profiles, zero invalid configured timezones, future African holidays, Rwanda/Ramadan suppression, UK/US/Canadian timezone conversion, private-table RLS and denied client access to internal context. No manual dispatch or emergency call was made, and no native devices were registered at verification time.

Validation passed: 495 database assertions across 18 suites, 389 unit tests, 27 mobile integration tests, 18 worker tests, workspace type checks, the production web build, changed-file lint/formatting and local Supabase advisors. The final context/alias adjustment also passed the 97 country/pre-plot database checks. Hosted advisors retain the deliberate private-table/account-scoped RPC notices and the pre-existing [disabled leaked-password-protection setting](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection); no new missing foreign-key index was introduced.

Future development priorities:

1. Appoint an African calendar/emergency-number review owner and review cadence. Add official lunar and exceptional-date overrides without replacing recurring weekend rules.
2. Tune country/city windows from Night starts, opens and conversions, starting with Kenya, Tanzania, Rwanda and South Africa. Keep the caps and quiet hours while personalizing.
3. Add locally reviewed languages, province/state/territory calendars, and explicit emirate selection. Keep emergency country independent of campaign country.
4. Monitor per-market acceptance, opens, conversion, opt-outs and suppression with aggregated telemetry. Use enable flags for incremental cohorts.
5. Verify supported call buttons and offline Help on signed Android/iOS builds, with Linking mocked or dialler opening cancelled before a call is placed.
