# iOS mobile baseline

The native client is an Expo workspace in `apps/mobile`. It uses React Native components and Expo Router, with the existing `@dwd/core`, `@dwd/contracts`, and `@dwd/data` packages. Expo SDK 57 is the current stable SDK selected for this baseline; SDK 58 remains in beta.

## Included

- iOS-first app configuration, deep-link scheme, and three-tab shell for Tonight, History, and Account.
- Web light-theme colors, the supplied DWD wordmark and app icon, matching heading weights, and accessible native controls.
- A typed Supabase client using the dedicated DWD project URL and publishable key.
- Session persistence through Expo SQLite's `localStorage` adapter, plus app foreground/background token refresh handling.
- Sign-in, active-night list, and paginated finished-night list connected to the existing Supabase Auth and `@dwd/data` RPCs, with retry controls for failed list requests.
- A no-secret `.env.example` template. No database changes are required.

Night creation, invite redemption, full auth onboarding/recovery, logging, Realtime, offline replay, native sharing, and notifications remain follow-up features. The web product remains the complete client while these native flows are built.

The three native screens follow the web app's light-mode design: warm white surfaces, plum actions and active badges, rounded cards, and dated history entries with drink/chaser counts. Native tokens live in `src/theme/tokens.ts` and mirror `apps/web/src/app/globals.css`. The PNG wordmark and 1024px app icon are rendered from the existing web vectors; no additional image or font dependency is needed. Forms scroll above the iOS keyboard, and the tab bar hides while typing.

Night entries remain read-only until native night and recap routes are implemented. Profile editing, the product tour, account settings, and dark mode are also outside this shell's current scope.

## Start the app

From the repository root:

```powershell
Copy-Item apps/mobile/.env.example apps/mobile/.env.local
# Set the same dedicated DWD Supabase URL and publishable key used by apps/web/.env.local.
npm install
npm run mobile
```

The iOS Simulator requires macOS and Xcode. A signed device build requires an Apple Developer account; EAS can build iOS binaries from Windows. The baseline can run in Expo Go, but features that add a native module or extension need a development build. For physical iPhones, the current Expo Go app requires the same Expo account to be signed in on the CLI and in Expo Go; this does not apply to simulators or development builds ([Expo notice](https://expo.dev/changelog/expo-go-57-login)).

Only `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` belong in the app environment. Mobile bundles are public clients; never expose a Supabase secret or service-role key. These session and client choices follow [Supabase's Expo setup](https://docs.expo.dev/guides/using-supabase/) and [Supabase's Expo React Native quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/expo-react-native).

## iOS Live Activities

The best-fit implementation is [Expo Widgets](https://docs.expo.dev/versions/latest/sdk/widgets/), now stable for iOS in Expo. It exposes ActivityKit Live Activities through `createLiveActivity`, `start`, `update`, and `end`, and supplies a built-in WidgetKit target. Layouts use Expo UI's SwiftUI components and run in a separate widget runtime: pass the activity's display state as props, keep the layout pure and synchronous, and do not expect React hooks, app context, or network access inside it. Expo Widgets and its extension target are researched but are not installed in this baseline yet.

Live Activities are available from iOS 16.1. The app can start and update one locally while it is running, then end it when the user leaves or the night ends. Expo Widgets is not included in Expo Go, so implementation and device checks need a development build. Expo's SDK 56 release promoted iOS Widgets to stable; this app uses the following stable SDK line rather than the SDK 58 beta.

For updates while the app is backgrounded, the backend would need to send ActivityKit pushes through APNs using the activity's push token. Remote push-to-start requires iOS 17.2 or later. That work would add the Expo Widgets push capability, Apple signing/APNs setup, token registration and cleanup, and a server-side sender. It must reuse canonical night data and never send directly from a mobile secret.

For DWD, start the activity only after a user chooses to track a real active night. Keep the lock-screen content opt-in and minimal—such as a generic night label and planned end time. Do not show drink counts, pace warnings, alcohol calculations, or anything that implies sobriety or driving safety. Refresh the displayed end time after canonical snapshot changes and end the activity when the night ends. Treat Live Activities as a glanceable status surface, not as guaranteed real-time delivery: iOS can limit updates and the user can disable them.

References: [Apple ActivityKit](https://developer.apple.com/documentation/ActivityKit), [Apple Live Activity update guidance](https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities), [Expo development builds](https://docs.expo.dev/develop/development-builds/use-development-builds/), and [Expo SDK 56 release notes](https://expo.dev/changelog/sdk-56).
