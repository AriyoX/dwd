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

- `dwd:///auth/callback`
- `dwd:///auth/callback?**`

These entries are included in both local and hosted source configuration. They have **not** been applied to the hosted project. Apply the URL entries without replacing unrelated Auth settings. The existing confirmation/recovery templates append the token hash and type to the requested callback, which already includes a query string.

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
adb shell am start -W -a android.intent.action.VIEW -d 'dwd:///auth/callback?code=expired'

# Replace this value with a real invitation token for a test night.
$inviteToken = 'REPLACE_WITH_REAL_INVITE_TOKEN'
adb shell am start -W -a android.intent.action.VIEW -d "dwd:///join/$inviteToken"
```

For cold-start checks, use Settings → Apps → Drink with Desire → Force stop before each link command. On macOS with an already running iOS simulator, the equivalent is `xcrun simctl openurl booted 'dwd:///account'`.

For UI-only checks in Expo Go, use the Metro URL shown by `npm run mobile`, followed by `/--/account` or `/--/night/new`. Real Google and email callbacks require an installed build registering `dwd` and the hosted redirect allowlist described above; Expo Go is not sufficient. See [Supabase native deep linking](https://supabase.com/docs/guides/auth/native-mobile-deep-linking).

The saved-password/sign-out-failure branch has automated regression coverage. To inspect its UI, use a debugger or network proxy to fail only the sign-out request after a successful password update; retry should show “Sign out and continue” and send no second password update. Simply going offline before submitting tests the password request failure instead.
