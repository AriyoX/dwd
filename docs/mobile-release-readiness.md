# Mobile release readiness — 6 October 2026

Use this document for the current release; earlier implementation notes describe the state before hosted deployment. The app is ready for a signed testing build after credentials are configured, but physical push, authentication, deep links and server-writing journeys still need acceptance testing.

## Pre-plot backend update — 6 October

Both pre-plot migrations are applied and `dispatch-notifications` is deployed as active version 4. The existing minute Cron returned HTTP 200 with `ok: true`; an unauthenticated request returned HTTP 401. Recurring campaigns continue beyond 2026, including Friday/Saturday, optional Sunday, holiday eve/day, and New Year's Eve. See [pre-plot notifications](preplot-notifications.md) for scheduling, suppression, verification, and the remaining physical-device checks.

The first pass verified 445 database assertions, 374 unit tests, 22 mobile tests, 18 worker tests, and workspace type checks. Mounted mobile integration suites live in `apps/mobile/tests/integration/`. The subsequent country implementation passed 495 database assertions, 389 unit tests, 27 mobile tests and 18 worker tests. Its migration is applied and the dispatcher is active version 5, with successful scheduler checks at 08:34/08:35 UTC. Country-specific campaign calendars and Help call numbers are now implemented for the [supported countries](country-expansion.md). No signed mobile build or store upload was started.

## Completed in the 5 October verification

- Reviewed the five P2 flows, shared components, notification worker, migration and web parity.
- Applied `20261004070828_native_push_notifications.sql` to the dedicated **drink-with-desire** project, `kdplbebaotvgcvjggacz`, after its dry run and 29 isolated database assertions passed. Earlier Apple and shared-bottle migrations were already hosted.
- Redeployed `dispatch-notifications`. The existing minute scheduler returned HTTP 200 with `ok: true` and an empty native queue. The hourly account-deletion scheduler is active; its worker was already deployed.
- Verified native tables have RLS and no authenticated table-read grant; registration is authenticated-only, and queue claiming is service-role-only. No native devices were registered at verification time.
- Fixed permission denial → Settings → return registration, retained an explicit off choice while permission is denied, and added regression coverage.
- Inbox opening no longer waits for its read acknowledgment. Failed Settings opening has recovery instructions. Inbox headings, unread count and primary text are clearer.
- Bound account-query RPC reads to the initiating access token, including deferred requests across account switches. Added a mounted regression test.
- Support fields stay locked until draft recovery finishes or unreadable storage is resolved. History retains the current list during refresh/failure. Buttons show readable progress and an accessibility busy state; choice labels include their essential detail. Existing 120 ms press feedback and Reduce Motion handling remain, with native navigation and no added decorative motion.
- Added `testing`, `preview` (alias) and `production` profiles in `apps/mobile/eas.json`, plus `GOOGLE_SERVICES_JSON` support in the native app config.

Validation is recorded in [the regression guide](mobile-regression-tests.md). The October 5 UI review had source/type validation; the October 6 automated checks are recorded above. Physical-device visual sign-off, signed builds and manual QA remain release steps.

## 1. Use the correct app directory and identity

Run **all EAS commands from `apps/mobile`**. The resolved native configuration is:

| Setting                      | Native app                             |
| ---------------------------- | -------------------------------------- |
| EAS project                  | `dd1a6538-e07e-47b2-baed-7d6d9f6c009b` |
| Android package / iOS bundle | `com.dwd.app`                          |
| Slug                         | `drink-with-desire`                    |
| Callback scheme              | `dwd`                                  |

The pre-existing root `app.json` / `eas.json` / `tsconfig.json` were preserved. Root config points at EAS project `3c42e920-8d7a-4f61-8870-db43b3aa45ad` and Android package `com.ahumuza.dwd`; it is not the mobile workspace configuration. Do not build from the repository root. If that alternative package is the identity already registered in your store, decide on the permanent identity before publishing, then align native config, Firebase, Apple, EAS and website associations together. A package/bundle ID change is a different installed app.

This follows [Expo's monorepo build layout](https://docs.expo.dev/build-reference/build-with-monorepos/).

## 2. Configure the EAS environments

In the native EAS project, configure **preview** for testing and **production** for store builds. Ignored local `.env.local` files are not your cloud-build configuration.

| Variable                               | Where / value                                                                                       |
| -------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_SUPABASE_URL`             | Public URL for the intended backend; production DWD uses `https://kdplbebaotvgcvjggacz.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Matching public client key; never service-role/secret                                               |
| `EXPO_PUBLIC_SITE_URL`                 | Your deployed HTTPS website origin, currently `https://dwdug.vercel.app`                            |
| `EXPO_PUBLIC_EAS_PROJECT_ID`           | Native EAS UUID above, or omit to use the checked-in UUID; do not use the root project's UUID       |
| `GOOGLE_SERVICES_JSON`                 | EAS **file** variable containing Firebase's `google-services.json` for `com.dwd.app`                |
| `DWD_APPLE_TEAM_ID`                    | Your Apple Developer team ID for iOS signing/universal links                                        |

The local resolved config currently has **no Firebase file configured**. Create/register the Android app in Firebase using the exact package, download its client JSON, and upload it as that EAS file variable. Separately upload an **FCM V1 service-account key** through `npx eas-cli credentials --platform android`; that private key is server-side EAS credentials and must not be included in the mobile app. Configure APNs credentials through EAS for iOS. See [Expo FCM setup](https://docs.expo.dev/push-notifications/fcm-credentials/) and [EAS environment variables](https://docs.expo.dev/eas/environment-variables/).

If Expo push access-token security is enabled for this project, set `DWD_EXPO_ACCESS_TOKEN` in **Supabase Edge Function secrets**. Keep the existing `DWD_PUSH_DISPATCH_SECRET`; the database scheduler and worker already agree on it. Browser VAPID credentials are separate.

Testing is a release build configuration, **not an isolated database**. The preview environment's URL chooses the backend. Use a dedicated staging backend for destructive/fault-injection automation; if using hosted DWD for acceptance, use disposable QA accounts and nights.

## 3. Build and install without an Expo server

From the repository root in PowerShell:

```powershell
Set-Location apps/mobile
npx eas-cli project:info
npx eas-cli build --platform android --profile testing
```

Download/install the resulting **APK** from its EAS build page. JavaScript/assets are bundled and `developmentClient` is false: close Metro and verify the app opens from its icon. Internet is still required for online server operations; cached activity/outbox behavior is tested separately. Native plugins or build-time environment changes require another binary.

For Play internal testing or production, build the **AAB**:

```powershell
npx eas-cli build --platform android --profile production
```

An AAB is for Play distribution, not direct phone installation. `testing` and `production` use the same package identity. A matching-signed APK can replace an earlier build; a different signing certificate cannot. Avoid uninstalling an app containing unsynced entries. For a Play-installed app, test upgrades through Play's internal track using the real Play signing identity. See [Expo APK distribution](https://docs.expo.dev/build-reference/apk/).

iOS internal testing uses `npx eas-cli build --platform ios --profile testing` and registered ad-hoc devices. For TestFlight use `--profile production`, then upload through your App Store Connect/EAS submission workflow. No build or store upload was started during this review.

## 4. Finish auth and invitation links

- In Supabase Auth, retain web redirects and allow `dwd://auth/callback` and `dwd://auth/callback?**`. Check Google returns to the installed app and email confirmation/reset preserve invitation destinations. Use custom SMTP and the existing templates/code configuration described in [mobile-auth.md](mobile-auth.md).
- Enable Sign in with Apple for the matching App ID and Supabase Apple provider before iOS acceptance. The Apple signup migration is already hosted; provider credentials are a separate task.
- Set website runtime `DWD_APPLE_TEAM_ID` and `DWD_ANDROID_SHA256_FINGERPRINTS`. The latter is comma-separated SHA-256 signing certificate fingerprints, including the actual Play app-signing certificate for Play builds and the APK certificate if testing direct installs.
- Deploy the website with these settings and its association routes. The app's `EXPO_PUBLIC_SITE_URL` must match that exact HTTPS origin. Check `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` return valid JSON without authentication/redirects, with the identities above.
- Open an HTTPS `/join/{token}` link from outside the app when installed/absent, signed in/out and cold-started. Custom-scheme opening alone does not prove HTTPS association works.

## 5. Release gates you own

1. Run the commands and critical scenarios in [mobile-regression-tests.md](mobile-regression-tests.md), recording device, OS, build ID and result. Prioritize physical Android/iOS push, cold auth callbacks, offline restart/replay and invitation revocation.
2. Test a scheduled deletion and sign-in cancellation with a disposable account; verify support requests have someone responsible for replies. The deployed worker/scheduler alone does not validate these user journeys.
3. Enable leaked-password protection in Supabase Auth if available for your plan; the hosted security advisor currently flags it as disabled. Its other findings flag the deliberate RPC-only/SECURITY DEFINER architecture and deny-all tables; do not enable broad table access merely to clear those warnings.
4. Set up crash/error reporting and operational alerts for repeated dispatch failures, receipts remaining unconfirmed, and account-deletion failures. Avoid recording tokens, invitation links or message/drink contents in telemetry. Run [verify-mobile-release.sql](../supabase/operations/verify-mobile-release.sql) in the DWD SQL editor for aggregate diagnostics. `accepted` means an Expo ticket, and `delivered` means the provider accepted delivery; verify visible phone delivery separately.
5. Review native session storage before broad release: refresh/access tokens currently persist through SQLite-backed localStorage (`src/lib/supabase.ts`). A move to platform secure storage needs migration and offline-recovery testing, not a blind storage replacement.
6. Prepare store signing, privacy/support URLs, store privacy/data-safety declarations, age/content rating, screenshots and review-account access based on the features actually shipped. Verify Terms/Privacy open from the installed binary and that account deletion is reachable. Follow current [Google Play release guidance](https://developer.android.com/distribute/best-practices/launch) and [App Store Connect guidance](https://developer.apple.com/help/app-store-connect/).

Keep the additive migration during any app rollback; use forward migrations for fixes. Do not drop native RPCs while an installed build can still call them. If delivery misbehaves, disabling the shared notification scheduler also stops browser push, so account for both channels.

## Web parity update

The three gaps from the source comparison now have native implementations. This is not physical-device acceptance of every shared behavior.

| Area                 | Native implementation                                                                                                             | References                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Photo memories       | System photo picker, JPEG resize, durable upload recovery, two-photo quota, gallery/viewer and owner-only deletion                | `apps/mobile/app/night/[nightId]/photos.tsx`; shared Storage/RPC authorization                 |
| Guided practice tour | Nine isolated sample steps, warning/undo and bottle practice, skip/replay and account-scoped progress                             | `apps/mobile/app/tour.tsx`; completion is local to each device, not synced with the web tour   |
| Recap detail         | Original/current/actual end timeline, per-person drink breakdown, alcohol/plan amounts, after-end counts and catch-up annotations | `apps/mobile/src/components/recap-details.tsx`; preserves server-supplied personal/group scope |

No new migration is needed for these additions. Rebuild the native binary for the new photo modules. Focused tests cover account isolation, Storage/RPC token pinning, lost upload responses, deletion and isolated practice state. The Android export passed; photo permissions, native file handling, accessibility and layouts still require installed-build acceptance. Signed URLs are renewed while the gallery is visible and are not persisted for offline viewing.

The five P2 areas and earlier auth/offline/help/guest/bottle work have native implementations. Credentials, real-device QA and HTTPS links are integration gaps, not missing screens. Live Activities/widgets remain separate native roadmap work, not web parity requirements.
