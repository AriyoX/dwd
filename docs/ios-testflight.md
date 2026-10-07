# Build and test dwd on iPhone

Updated 7 October 2026. These steps use the existing Expo app in `apps/mobile`, with bundle ID `com.dwd.app` and EAS project `dd1a6538-e07e-47b2-baed-7d6d9f6c009b`. The installed name is **dwd**. The internal Expo slug stays unchanged to preserve the linked project; it is not the name shown under the app icon.

EAS builds and submits iOS apps from Windows. No local Mac is required for this route. Use the **production** profile for TestFlight: it produces a signed App Store build. The **testing/preview** profiles use internal distribution and are not the TestFlight route. See [Expo's iOS submission guide](https://docs.expo.dev/submit/ios/).

## 1. Set up Apple and Expo

- Confirm your paid Apple Developer membership is active and accept any pending agreements.
- In Apple Developer, register the explicit App ID `com.dwd.app` under your team, with Sign in with Apple and Push Notifications capabilities. If that identifier is already yours, reuse it. If another team owns it, choose a new identifier and update the app config, Apple Auth configuration and website association together before building.
- In App Store Connect, create an **iOS** app named **dwd**, select that bundle ID, choose your primary language, and use a unique internal SKU such as `dwd-ios`. If an app record already exists, update its name to **dwd**. App Store name availability is controlled by Apple.
- Sign in to the Expo account that has access to the existing EAS project. Do not create a second Expo project just to rename the app.

From the repository root:

```powershell
npm ci
Set-Location apps/mobile
npx eas-cli@latest login
npx eas-cli@latest project:info
```

Check that the printed project ID matches the ID above. All remaining EAS commands run from `apps/mobile`.

## 2. Configure the cloud build environment

In the Expo dashboard, open this project and add these variables to its **production** environment:

| Variable                               | Value                                                              |
| -------------------------------------- | ------------------------------------------------------------------ |
| `EXPO_PUBLIC_SUPABASE_URL`             | Your intended dwd Supabase project's HTTPS URL                     |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | That project's public/publishable key                              |
| `EXPO_PUBLIC_SITE_URL`                 | `https://dwdug.vercel.app` (or your configured production website) |
| `DWD_APPLE_TEAM_ID`                    | Your Apple Developer team ID                                       |

The checked-in EAS project ID is already configured; leave `EXPO_PUBLIC_EAS_PROJECT_ID` unset unless deliberately changing projects. Local `.env.local` files do not configure EAS cloud builds. Supabase public keys are bundled into the app; never put a service-role key or Apple private key in these public variables. Android's Firebase file is not needed for an iOS build. See [EAS environment variables](https://docs.expo.dev/eas/environment-variables/manage/).

For working Apple sign-in and account deletion, complete the provider setup in [App Store readiness](app-store-readiness.md). The last recorded audit found missing Apple server credentials; this pass has not changed or rechecked those remote settings. Configure the native bundle ID in Supabase Apple Auth and set the listed `DWD_APPLE_*` secrets on the server. The Sign in with Apple key, EAS signing credentials, APNs key and App Store Connect submission key serve different purposes. Check Apple token readiness and real sign-in/deletion before public release.

Check the same readiness document for hosted auth redirects, website association, and migrations/functions. TestFlight runs against whichever Supabase project you choose above; use dedicated test accounts.

## 3. Create the signed build

```powershell
npx eas-cli@latest build --platform ios --profile production
```

Choose your Apple Developer team when prompted. Let EAS create/manage the distribution certificate and provisioning profile if you do not already manage them. Configure the APNs credential when requested for notification delivery. The profile increments the remote build number automatically.

Wait for the EAS build to finish successfully. It must contain the new splash plugin, so a Metro refresh or JavaScript-only update cannot replace this build. If signing fails, inspect the EAS log and resolve the named team, agreement, capability or credential issue before retrying.

## 4. Upload to TestFlight

In App Store Connect, open **App Information** and copy the numeric **Apple ID** for dwd. For repeatable submissions, merge this into the existing `submit.production` object in `apps/mobile/eas.json` (keep the `build` profiles):

```json
{
  "ios": {
    "ascAppId": "YOUR_NUMERIC_APPLE_ID"
  }
}
```

This is the app's numeric ID, not your login email, team ID or `com.dwd.app`. Then run:

```powershell
npx eas-cli@latest submit --platform ios --profile production
```

Select the successful iOS build you just created and follow the Apple authentication prompts. For API-key submission setup, run `npx eas-cli@latest credentials --platform ios`, choose production, then the App Store Connect API-key setup. Store private keys outside source control. [Expo documents both submission options](https://docs.expo.dev/submit/ios/).

Uploading makes a build available for TestFlight after Apple processes it. Publishing to the public App Store is a separate App Review/release step.

## 5. Install on your iPhone

In App Store Connect, select **dwd → TestFlight**. Resolve any processing or export-compliance questions truthfully, create an **Internal Testing** group, add the build and add yourself as a tester. Install Apple's **TestFlight** app on your iPhone, accept the invitation and install dwd. Internal testers must be eligible App Store Connect users with access to the app. See [Apple's internal testing instructions](https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers/). Friends without that access should use an external testing group, which can require Beta App Review.

For each later test build, repeat build and submit. EAS increments the build number; testers update through TestFlight.

## 6. Test before submitting for public release

- Confirm the icon label says **dwd**; force-close and cold-launch in system light and dark modes to see the matching splash. The native splash follows the system appearance before an in-app theme preference can load. Expo Go does not accurately represent the final splash; test the installed release build. See [Expo splash screens](https://docs.expo.dev/versions/latest/sdk/splash-screen/).
- On a small iPhone and a larger iPhone, check large text, VoiceOver, keyboard dismissal, sheets and bottom logging controls. Tablet support is currently enabled, so include iPad acceptance before public release.
- Start/join a night, log the main drink, a chaser and another drink, add a bottle mid-night, and have a second account explicitly join it/use it as their main drink. Existing plans should remain intact until changed by their owner.
- Share an invitation immediately and after closing/reopening the app more than five minutes later. Check renewal after expiry and that revoked invitations remain disabled.
- Test airplane-mode logging, closing/reopening, reconnecting and undo without duplicates. Check reminders, notification opens, photo permissions, Apple/Google/email sign-in, password recovery and account deletion on the installed build.
- Before public App Review, complete screenshots, description, support/privacy URLs, privacy disclosures, age-rating questions and reviewer access/instructions in App Store Connect. Use **dwd** for the store listing too. Redeploy the web app to publish the renamed legal pages and web manifest. Use [App Store readiness](app-store-readiness.md) for remaining release gates.

Live Activities/widgets and ads remain future work. No ad SDK or ad tracking was added to this build; reassess consent and privacy disclosures when that implementation is selected.
