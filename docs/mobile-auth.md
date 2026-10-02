# Native authentication and onboarding

Implemented on 1 October 2026 as the first feature task from the [mobile parity handoff](mobile-ui-and-parity-review.md).

First launch opens a three-step illustrated introduction: plan a night, log drinks and chasers, and stay together. Completing, skipping, or choosing Sign in saves a device preference in SQLite. Returning signed-out users see a welcome screen with account choices. Restored accounts proceed to the product after profile verification. The introduction contains no real nights, practice logs or backend writes.

Sign-in, signup, confirmation/code/resend, password recovery/reset and complete-profile have distinct native routes under `/auth`. Earlier `/auth?mode=…` links still redirect to the corresponding screen. Google uses its current, unmodified multicolor logo and the system authentication browser through `expo-web-browser`. All forms use the existing theme, native navigation, controls and shared validation. Signup and complete-profile require explicit confirmation that the person is 18 or older. Terms and Privacy open the current web documents and remain accessible during onboarding.

The intro uses an occasional 180 ms Reanimated opacity entrance to explain a step change. Reduced Motion removes that entrance. Existing 120 ms press feedback and platform screen navigation remain in use; no animation dependency was added. Main intro actions sit outside the scrolling content so large text does not hide navigation.

## Product access

Expo Router `Stack.Protected` guards the entire tabs group, Join, and every night/planning/logging/recap route. No product screen mounts until session restoration finishes, the current actor's profile is complete, and the session is outside recovery. Losing that access removes product screens from navigation history. Failed profile loads provide Retry and Sign out; missing profiles require completion. Password recovery stays in its dedicated flow. Onboarding, auth callbacks and legal documents are the public exceptions.

The route inventory test checks that every product file is declared inside the authenticated guard, preventing a new screen from accidentally falling through Expo Router's default route inclusion. This navigation guard complements the existing backend authorization. See [Expo protected routes](https://docs.expo.dev/router/advanced/protected/).

The native client uses Supabase PKCE and the existing `complete_signup` RPC. No schema or authorization changes are required. The existing email templates support direct token-hash callbacks as well as entering the signup code on another device. Password changes validate the user with Supabase, then sign out. Supabase continues to own sessions and token refresh.

## Authentication destinations

Invitation links are rewritten to `/join?token=…` through Expo Router's native-intent handler. The handler preserves destinations before the navigator rejects a protected route, for both initial and incoming links. A SQLite-backed handoff stores the validated native destination, pending confirmation email and resend cooldown for up to 24 hours. No passwords or callback credentials are stored in that handoff. Email and Google redirects carry the same validated destination. Root launches, intro steps, auth cancellation and legal screens do not overwrite a pending invitation.

Only known native routes are accepted as return destinations. The handoff stays stored until an authenticated product screen actually opens, avoiding duplicate redirects during profile completion. Missing profiles go to complete-profile first. Account changes reset Join's form and ignore stale request results. Explicit sign-out clears the handoff. A validated recovery session is restricted to its account and survives a cold start until the password is updated or the session signs out.

## Hosted integration

Add these exact native redirects to the existing project's Supabase Authentication → URL Configuration allowlist:

- `dwd://auth/callback`
- `dwd://auth/callback?**`

These entries are included in both local and hosted source configuration. On 2 October the user reported adding these two-slash entries to hosted Supabase after its dashboard rejected the earlier three-slash format. The mobile callback builder now matches those entries exactly. Hosted settings have not been independently queried. Keep unrelated Auth settings and website redirects. The existing confirmation/recovery templates append the token hash and type to the requested callback, which already includes a query string. Incoming older three-slash links still parse for compatibility.

Use a development or installed build for external authentication. Expo Go does not register the app's `dwd` scheme. Google must also be enabled on the existing Supabase project. See [Supabase native deep linking](https://supabase.com/docs/guides/auth/native-mobile-deep-linking) and [Expo authentication browser](https://docs.expo.dev/versions/latest/sdk/webbrowser/).

`EXPO_PUBLIC_SITE_URL` configures the website opened by Terms and Privacy; it defaults to the documented production domain. The only other public app configuration remains the Supabase URL and publishable key.

Universal links and Android verified app links still require website association files, signing identifiers and native build configuration. The native intent handler understands the existing `/join/<token>` and `/?join=<token>` web formats when the OS delivers them to the app; OS association is a separate invitation integration task.

## Verification

The 45 focused tests in `tests/mobile-auth.test.ts`, `tests/mobile-onboarding.test.ts` and `tests/mobile-flows.test.ts` cover first-launch persistence, every product route's guard, account/profile/recovery states, adult confirmation, shared validation, invitation persistence/expiry, sign-out cleanup, cold/warm native links, callback privacy, Google success/cancellation/error handling, confirmation/resend, recovery and the existing profile RPC. They use mocked Auth responses and do not create accounts or send emails.

The onboarding update passed mobile TypeScript, mobile ESLint, all 45 focused tests and iOS/Android Metro exports. The user reviewed the onboarding screens and accepted them. Further simulator testing stopped at their request after environment failures; simulated cold-start callback and accessibility checks were not completed. Local QA artifacts are under `.tmp/mobile-onboarding/`; no existing emulator data was wiped.

The earlier auth pass covered signup in light/dark, adult selection, local validation, confirmation, recovery and an invalid callback on Android. That emulator's initial Dark appearance was restored. Those earlier captures are in `.tmp/mobile-auth/` and do not verify the subsequent onboarding UI.

Before release, verify email and Google callbacks in installed iOS/Android builds, including cancellation, cold starts, expired links, a missing profile, sign-out and account switching. Review VoiceOver/TalkBack, largest text sizes, keyboard reachability and both appearances on real devices. Source tests and Metro exports do not establish that hosted redirects or real email delivery are configured.

## Focused code review — 2 October 2026

This pass reviews onboarding, authentication, route guards and destination handoff. It does not implement the other parity features. No emulator, native export, database test or unrelated test suite was run.

- Password updates and sign-out are separate operations. If the password was saved but sign-out fails, the reset screen reports that success and retries only sign-out. Recovery also has a Cancel and sign out action; the recovery guard remains active until sign-out succeeds.
- Password fields have accessible show/hide controls and explicit autofill hints. Fields and the header Back action are disabled during requests. Forgot password sits beside the password field; resend has its own loading indicator and its cooldown follows the entered email.
- Onboarding artwork adapts to short displays. Narrow-screen headings are smaller, deliberate line breaks relax at large text sizes, and introduction progress exposes a spoken step value. Existing Reanimated entrance and reduced-motion behavior remain in place.
- Invalid auth `next` parameters no longer replace a saved invitation with the home destination. Each incoming callback gets fresh loading/error state instead of showing the previous link's error during its exchange.

Verification: **40 tests passed** across `mobile-auth.test.ts` and `mobile-onboarding.test.ts`; mobile TypeScript and targeted ESLint passed. The three new regression tests cover sign-out retry after a saved password, cancelling recovery without changing a password, and a rejected password update. These are mocked service and routing tests, not native component or hosted authentication tests. The earlier 45-test count also included the separate eight-test mobile-flow suite, which was intentionally not rerun here.

### Commands from the repository root

```powershell
# Mobile TypeScript
npm run typecheck --workspace @dwd/mobile

# Only authentication and onboarding tests
npx vitest run tests/mobile-auth.test.ts tests/mobile-onboarding.test.ts

# Mobile lint, including the focused tests
npx eslint apps/mobile tests/mobile-auth.test.ts tests/mobile-onboarding.test.ts --max-warnings=0

# Start Metro when you are ready to inspect the app yourself
npm run mobile
```

This pass linted the auth routes, root layout/native-intent handler, onboarding/welcome screens, auth components and helpers, TextField, onboarding/Supabase providers, and the two focused test files. The command above is a convenient broader mobile-only lint command. Avoid `npm test` for this focused check: it also runs database and unrelated unit tests.

### Manual emulator/device checks

Use a throwaway installation for first-launch checks. On Android, Settings → Apps → Drink with Desire → Storage → Clear storage resets onboarding, sessions and local preferences. Do not clear an installation whose local state you want to keep. On iOS, delete and reinstall the test app.

| Check | How | Expected result |
| --- | --- | --- |
| First launch | Open the fresh app; advance, go back, then finish or skip. Close and reopen. | Three intro steps on first launch; welcome after completion/skip; no tabs before authentication. |
| Forms | Try empty/invalid fields, mismatched reset passwords, age unchecked, and show/hide password while typing. | Clear errors, age requirement enforced, password text and caret retained, no duplicate request from repeated taps. |
| Confirmation | Request a resend; edit the email during the cooldown after the request finishes. | Resend shows its own spinner; the cooldown applies to the address it was requested for. |
| Protected links | While signed out, open the account and night links below, both while running and after force-stopping the app. | Authentication/onboarding opens; no product content is exposed. The valid destination resumes after sign-in/profile completion. |
| Invitation | Open a real test invitation, skip the intro, open Terms, return, cancel Google, then sign in. | Invitation preview survives; joining still requires the normal confirmation. |
| Callback replacement | Open the expired callback below, then open a fresh real confirmation/reset link while that screen is still open. | The new link shows loading rather than the previous error, then completes normally. |
| Recovery | Open a real reset email, try a mismatch, update the password, then sign in again. Also try Cancel and sign out. | Product access stays blocked during recovery; successful reset leads to sign-in; cancellation signs out without changing the password. |
| Appearance/accessibility | Switch light/dark with the header control; use the largest text setting, TalkBack/VoiceOver and Reduce Motion. Open the keyboard on each field and scroll. | Headings and buttons remain readable/reachable; password visibility controls have clear names; intro progress is spoken; no movement with Reduce Motion. |
| Session boundaries | Sign out, press system Back, open a protected link, then sign in as another test user. | Old product history is inaccessible; no previous invitation/account state leaks to the new user. |

With an installed Android development/test build and an emulator already running, send links from PowerShell:

```powershell
adb shell am start -W -a android.intent.action.VIEW -d 'dwd:///account'
adb shell am start -W -a android.intent.action.VIEW -d 'dwd:///night/new'
adb shell am start -W -a android.intent.action.VIEW -d 'dwd://auth/callback?code=expired'

# Replace this value with a real invitation token for a test night.
$inviteToken = 'REPLACE_WITH_REAL_INVITE_TOKEN'
adb shell am start -W -a android.intent.action.VIEW -d "dwd:///join/$inviteToken"
```

For cold-start checks, use Settings → Apps → Drink with Desire → Force stop before each link command. On macOS with an already running iOS simulator, the equivalent is `xcrun simctl openurl booted 'dwd:///account'`.

For UI-only checks in Expo Go, use the Metro URL shown by `npm run mobile`, followed by `/--/account` or `/--/night/new`. Real Google and email callbacks require an installed build registering `dwd` and the hosted redirect allowlist described above; Expo Go is not sufficient. See [Supabase native deep linking](https://supabase.com/docs/guides/auth/native-mobile-deep-linking).

The saved-password/sign-out-failure branch has automated regression coverage. To inspect its UI, use a debugger or network proxy to fail only the sign-out request after a successful password update; retry should show “Sign out and continue” and send no second password update. Simply going offline before submitting tests the password request failure instead.

## Apple sign-in and Google callback correction — 2 October 2026

The previous onboarding/auth work was committed as `cdd981f`. This subsequent feature adds Apple sign-in exclusively on iOS and corrects the native callback format.

### Apple implementation and activation

`apple-button.ios.tsx` uses Expo's official native Apple button, black in light mode and white in dark mode, and checks native availability before rendering. The default `apple-button.tsx` returns nothing on Android/web. Metro source-map inspection confirms the Android bundle contains neither the iOS component nor the Apple authentication library or action helper.

If Apple sign-in is missing on iPhone Expo Go, restart Metro from `apps/mobile` with `npx expo start --go --clear` and scan the new QR code. The iOS component now shows a checking status, then either the Apple button or an availability message with a retry action. Previously, both an unavailable native module and a failed availability check silently hid the control. Apple Developer enrollment and Supabase provider settings do not control whether this button renders. Expo Go includes the native capability; use an up-to-date Expo Go version compatible with this app's SDK. The running Metro server was checked directly and serves the iOS component. The user reported an unavailable result on iPhone Expo Go 57. Development builds now show whether ExpoAppleAuthentication is registered, the execution environment, the exact Expo Go version and the iOS version beneath that message. This diagnostic contains no auth credentials and is excluded from release UI. The installed native implementation returns true; its JavaScript fallback returns false when the native module is absent. A matching SDK major alone does not establish that the native module loaded correctly. The exact phone diagnostic is still needed; no emulator was used.

On 2026-10-02 the user reported `Apple native module: missing`, `Runtime: storeClient; Expo Go: 1017880; iOS: 27.0`. This confirms that `ExpoAppleAuthentication` is not accessible in that phone's running Expo Go session. It does not establish whether the cause is the Expo Go binary or native module registration. No verified upstream issue for this exact build was found. Apple Developer/Supabase configuration cannot supply a missing native module, and a JavaScript reload cannot install native code into Expo Go. Testing in the app's own iOS development build is the next supported route if an Expo Go update does not restore the module. The development build configuration below is already present; actual Apple sign-in on the phone remains unverified.

The iOS adapter requests the name/email scopes, sends a SHA-256 nonce to Apple, verifies the returned request state, and sends the original nonce and identity token to Supabase. Cancellation is recoverable. Apple credentials and nonces are never added to the persisted invite handoff. First-login names are saved as optional metadata and used as editable form defaults; they do not establish adulthood or create a profile. Existing accounts keep their profile. New users must complete the existing name/18+ flow, including users who choose Hide My Email.

Before testing against the hosted project:

1. Apply `supabase/migrations/20261002120508_apple_native_signup.sql` through the project's migration deployment process. It adds Apple to the trusted-provider branch of `private.handle_new_user`; the previous Google-only branch rejected new Apple users. It retains email validation, profile/RLS restrictions, audit behavior and explicit adult attestation. **This migration was tested locally and has not been applied to hosted Supabase.**
2. In Apple Developer → Certificates, Identifiers & Profiles, enable **Sign in with Apple** for the App ID `com.drinkwithdesire.mobile`.
3. In Supabase → Authentication → Sign In / Providers → Apple, enable Apple and add `com.drinkwithdesire.mobile` to **Client IDs**. Native-only sign-in does not require a Services ID, web client secret or secret rotation. Keep nonce verification enabled.
4. Build/install a new iOS binary. `ios.usesAppleSignIn` and the `expo-apple-authentication` plugin are configured; reloading JavaScript alone does not add native entitlements.

Apple can also be tested on a real iPhone in Expo Go with `host.exp.Exponent` in the **test project's** Apple Client IDs. That shared Expo identifier is different from the installed DWD App ID, so installed-build testing is still required. Android has no Apple button or browser fallback. See [Supabase Apple configuration](https://supabase.com/docs/guides/auth/social-login/auth-apple) and [Expo Apple Authentication](https://docs.expo.dev/versions/latest/sdk/apple-authentication/).

### Why Google went to the website

The app previously requested `dwd:///auth/callback`, while the hosted allowlist contained `dwd://auth/callback`. The two strings are different redirect targets. A website sign-in completes the website's session; it cannot complete the mobile app's pending PKCE exchange. Returning manually to Expo Go dismisses the authentication browser without delivering a successful app callback.

The callback builder and both source configs now use **`dwd://auth/callback`**. The Google action refuses to launch OAuth in Expo Go and explains that an installed DWD build is required, instead of leading into a web-only session and then claiming it was cancelled. Email/password sign-in remains available in Expo Go. [Expo explicitly requires a development build for this OAuth workflow](https://docs.expo.dev/guides/authentication/).

Keep these two entries in Supabase's redirect allowlist:

```text
dwd://auth/callback
dwd://auth/callback?**
```

Keep the website's Site URL and existing web redirects. Google Cloud's authorized redirect URI remains the Supabase provider callback (`https://<project-ref>.supabase.co/auth/v1/callback`); the DWD custom URL belongs in Supabase's allowlist, not in Google Cloud.

### Install a development build

`expo-dev-client` and an internal `development` EAS profile are included. Both native bundle/package IDs are `com.drinkwithdesire.mobile`. No cloud build was submitted and no emulator was launched.

From the repository root, for a physical iPhone using EAS (also works when your computer runs Windows):

```powershell
cd apps/mobile
npx eas-cli login
npx eas-cli build --platform ios --profile development
# After installing the resulting DWD build on the registered iPhone:
npx expo start --dev-client
```

Follow the first-build prompts to link/create the Expo project and register the device. EAS device signing requires an Apple Developer membership. Set the public Supabase URL/key in the build environment if EAS needs them; ignored `.env.local` files are not uploaded automatically. The local Metro server already loads the app's `.env.local`.

For Android, use `npx eas-cli build --platform android --profile development` in `apps/mobile`, install its APK, then use the same Metro command. Alternatively, with Android SDK/JDK and a USB-debugging phone already set up, `npx expo run:android --device` builds locally. Open the installed **Drink with Desire** app rather than Expo Go. See [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/).

Once installed, Google should open provider consent and return directly to DWD. Test cancellation, a cold-start callback, and a pending invitation. On iOS, test Apple first authorization, returning authorization, cancellation, Hide My Email and profile completion. Confirm the Apple button is absent on Android. Hosted redirects, provider credentials, native signing and real authentication remain device/integration checks.

### Focused verification

Passed 52 tests across the three native auth/onboarding files, 26 database assertions across only Apple/Google signup suites, mobile TypeScript, targeted ESLint, and iOS/Android Metro exports. Export source maps confirm iOS-only Apple module inclusion. No unrelated test suites or emulator/device tests were run.

```powershell
# Repository root
npm run typecheck --workspace @dwd/mobile
npx vitest run tests/mobile-auth.test.ts tests/mobile-onboarding.test.ts tests/mobile-apple-auth.test.ts
npx eslint apps/mobile tests/mobile-auth.test.ts tests/mobile-onboarding.test.ts tests/mobile-apple-auth.test.ts --max-warnings=0
# Docker required; disposable local test database, no hosted changes
node scripts/test-database.mjs apple_signup.sql google_signup.sql
```
