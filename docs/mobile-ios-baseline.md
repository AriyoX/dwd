# React Native mobile development

The native client lives in `apps/mobile`, using Expo SDK 57, React Native, Expo Router, and the existing `@dwd/core`, `@dwd/contracts`, and `@dwd/data` packages. The web app remains the reference for product behavior. This mobile update does not change its UI or database.

## Implemented

- Tonight, History, and Account use the platform's native tab bar, with SF Symbols on iOS.
- The supplied DWD vector wordmark retains its trimmed bounds and aspect ratio. It renders in plum in light mode and warm white in dark mode. Regenerate it with `node scripts/generate-mobile-brand.mjs` when the source vector changes.
- System, Light, and Dark appearance choices persist on the device. The palette covers screens, forms, sheets, native navigation, and status bar. System follows the device's appearance setting.
- Illustrated first-launch onboarding with persistent completion/skip, distinct native sign-in, signup/adult confirmation, confirmation/code/resend, password recovery/reset, branded Google browser authentication and complete-profile flows. All product screens require a restored session and completed profile; recovery sessions remain isolated. Sessions persist through Expo SQLite with foreground/background token refresh. Invitation destinations survive onboarding, authentication and cold starts. Hosted callback setup and installed-build verification remain pending; see [Native authentication and onboarding](mobile-auth.md).
- Start a night: name, planned duration, an explicit water-only or drinks plan, planned quantities, and a quick-log drink.
- Join a night: paste a web invite link or code, preview the host and night, join, and set a personal plan.
- Active night: plan status, quick logging, planned/preset/custom drinks, water, activity timeline, and undo within the existing 15-minute correction window.
- Hosts can log for their existing managed guests, share an invite code through the native share sheet, extend the night, or end it. Account members log for themselves; members can leave a night.
- Plan editing uses the existing revision check. Drink logging preserves server-required plan/end-time acknowledgments and reuses the action's UUID/timestamp for warning confirmation and an immediate retry after an uncertain save.
- RLS-protected Realtime changes invalidate the canonical snapshot. Focus, foreground, pull-to-refresh, and periodic reconciliation recover missed updates.
- Finished-night history and individual recaps preserve the server's group/personal history scope.

## Design and interaction

Apply `.agents/skills/apple-design/SKILL.md` as the main design reference, translated into native components. `animate-expo` supplies native implementation details. Keep the warm DWD palette and concise labels from the web flow: start/join → plan → log → recap.

Use the system font, size-specific tracking, scalable text, flexible row heights, and at least 48-point controls. Buttons respond on press-in; the action commits on release. Reanimated animates only transform/opacity for 120 ms, with scale removed under Reduce Motion. Successful logging pairs visible completion with a single success haptic; unavailable haptics never block saving.

Use native stack transitions and native form sheets for joining, logging, and plans. The OS owns gesture tracking, velocity, interruption, and dismissal. Tabs are peer destinations; keep their platform default behavior. Native tab materials honor Reduce Transparency with a solid alternative. Avoid stacking translucent content surfaces or introducing custom drag physics where the platform already handles the interaction. Keep cancel, back, and Undo easy to reach.

## Start the app

From the repository root:

```powershell
Copy-Item apps/mobile/.env.example apps/mobile/.env.local
# Set the same DWD Supabase URL and publishable key used by apps/web/.env.local.
npm install
npm run mobile
```

`EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` configure the account connection. Optional `EXPO_PUBLIC_SITE_URL` sets the website opened by Terms and Privacy. Expo requires static `process.env.EXPO_PUBLIC_…` access to inline these values. Never bundle a Supabase secret or service-role key. Use the existing typed data APIs and shared schemas, with server RPCs enforcing membership, idempotency, and warnings. See [Supabase's Expo setup](https://docs.expo.dev/guides/using-supabase/).

The iOS Simulator requires macOS and Xcode. Windows can run Metro and export the native JS bundle; EAS can build signed iOS binaries. Expo Go is useful for basic development; custom extensions require a development build. See [Expo development builds](https://docs.expo.dev/develop/development-builds/use-development-builds/).

## Planned: Live Activities and Home Screen quick logging

We shall add an opt-in Live Activity for an active night, including quick actions to log the selected drink, log water, and open the night. Add a companion Home Screen widget for the same everyday logging actions. Live Activities primarily live on the Lock Screen and Dynamic Island; a Home Screen widget is the persistent Home Screen entry point. Both should reuse the app's canonical night and personal plan, rather than create a separate tracking flow. See [Apple's Live Activities guidance](https://developer.apple.com/design/human-interface-guidelines/live-activities) and [interactive widgets and Live Activities](https://developer.apple.com/documentation/widgetkit/adding-interactivity-to-widgets-and-live-activities).

Implementation sequence:

1. Add `expo-widgets` and its WidgetKit target in a development build. Use `createLiveActivity` to start/update/end the activity, with pure synchronous layouts and display props. Build the Home Screen widget alongside it. See [Expo Widgets](https://docs.expo.dev/versions/latest/sdk/widgets/).
2. Start only after the person explicitly chooses to track a night. Show the selected quick-log drink, planned end time, and last successful action; let people choose whether the night title and counts appear on locked surfaces. Adapt layouts to light/dark, large text, and accessibility settings. Never imply sobriety or driving safety.
3. Begin with deep links into the existing logging/confirmation flow. For logging without opening the app, validate the Expo interaction runtime and native App Intent requirements on a real device, including background/cold-start execution. Interactive buttons need the supported OS version (Apple introduced them in iOS 17); gate against both API availability and this app's deployment target.
4. Route every action through the same constrained `log_drink`/`log_water` RPC and actor-scoped idempotency UUID. Repeated taps, uncertain network responses, foreground/background handoff, and app restarts must not create duplicates. Persist pending operations in an app/extension-safe store before offering background actions. A warning requiring acknowledgment must open the app; never pre-acknowledge it on a locked surface. Show pending, success, and failure distinctly, and offer Undo only within the server's correction window.
5. Keep credentials in the authenticated app's native security boundary; define the extension/app-group handoff before implementing background logging. Handle expired sessions and ended nights by opening the app or marking the action unavailable. Never put access tokens in URLs, activity props, or widget timelines.
6. Reconcile display state with canonical snapshots after commits, plan edits, extensions, sign-out, and membership changes. End the Live Activity when the night ends or the person leaves. Clear sensitive widget state on sign-out. Opening from a stale widget must still recheck membership and night status.
7. For remote background updates, add APNs ActivityKit token registration/cleanup and a server-side sender. Remote push-to-start requires the appropriate OS support. This is separate from local updates; delivery is not guaranteed and the user may disable Live Activities.

The activity/widget extension is planned, not installed or shipped in this update.

## Remaining mobile work

See [Mobile UI and web parity review](mobile-ui-and-parity-review.md) for the October 2026 UI pass, emulator verification and prioritized feature handoff to Sol.

Hosted native auth redirects and installed-build callback verification, persistent offline replay, photo memories, native push delivery, and profile/account editing remain follow-up work. Help/check-ins, reminder controls, managed-guest creation/editing/removal and shared-bottle tracking are implemented; see [Native night features](mobile-night-features.md). Logging currently needs a connection; immediate retries retain their identity while that screen remains mounted, but no persistent offline outbox is shipped yet.

## Verification and device checks

Run mobile TypeScript, targeted ESLint, mobile flow unit tests, and native Metro exports. These validate types, code paths, and bundling; they do not validate physical gesture feel or signed extensions. This update passed the mobile compatibility check, workspace TypeScript, targeted ESLint, all 236 unit tests, and iOS/Android bundling. A read-only Supabase RPC check verified anonymous access is denied. Authenticated end-to-end and physical-device checks remain pending; the Android emulator disconnected during visual QA.

On a release build on a real iPhone and the slowest supported Android device, check:

- Logo bounds/colour; persisted System/Light/Dark choices; system appearance changes; status bar and keyboard appearance.
- VoiceOver/TalkBack labels, largest text size, Reduce Motion, Reduce Transparency, keyboard dismissal, and scroll reachability in all sheets.
- Press cancellation by dragging away, sheet flick dismissal, interruption/reversal, and same-moment visual/haptic logging feedback.
- Start/join/plan/log/water/undo/end/history flow against a test account; duplicate taps and dropped responses; account-user versus managed-guest permissions.
- Realtime reconnect, missed-update recovery, foreground refresh, stale-plan revision errors, expired invites, and sign-out/account switching without stale personal data.
