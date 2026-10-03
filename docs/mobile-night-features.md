# Native help, managed guests and shared bottles

Implemented 2 October 2026, using the web flows and existing shared contracts/data APIs.

## Help and check-ins

- Get help stays near the top of a night and opens a native sheet without waiting for a network request. It includes the shared emergency signs, Uganda’s 112/999 call actions, phone-launch recovery, country context and the sobriety/driving boundary. Numbers were checked against the [Uganda Police Force update](https://upf.go.ug/public-safety-crime-response-and-security-operations-update/) on 2 October 2026. The [NHS alcohol-poisoning guidance](https://www.nhs.uk/conditions/alcohol-poisoning/) supports the symptom and stay-with-the-person copy.
- Each eligible participant has Check in. For a managed guest, Ask host to check in uses the existing recipient routing. Self, the host’s own guests, departed participants and ended nights do not offer remote check-ins.
- Duplicate taps are guarded. An uncertain response retains its request UUID, scoped by account, night and recipient. Cooldown/local-only responses are shown without claiming delivery.
- Unread check-ins and reminders for this account/night appear in the active night. Read state uses the existing acknowledgment API. Focus, foreground and 15-second polling refresh incoming events; expired requests and another account’s events are excluded.
- Reminders exposes log nudges, 15/30/45/60-minute intervals, pause for an hour/resume, and group/direct/pace/planned-end preferences. These are account preferences shared with the web. Pause expiry updates while the app is open and on foreground.
- Native push permissions, token registration and delivery outside the app remain the separate notifications integration. The UI states that boundary. DWD check-ins do not call emergency services.

## Managed guests

- The active host can add a person, confirm their agreement to tracking and choose a drinks or chaser-only plan. Consent context explains who logs and who can see the name, plan and entries.
- Creation uses `addManagedGuest` with a stable request key for immediate retries. Form validation reuses the shared guest/plan schemas.
- The logging selector and grouped people list expose guest logging and plan editing. Guest management opens on demand; removal confirms that previous entries remain in the recap.
- Plan sheets accept a member destination and apply the shared ownership/host permission rules. The original plan revision stays attached to the draft; external changes require reopening it. Unsaved plan changes must be saved before switching to bottle planning.
- Account members retain control of their own plans/logs. A host cannot edit or log for another account member. Removed guests and ended nights lose mutation controls.

## Shared bottles

- The native shelf supports creating a bottle for everyone or selected people, joining with a planned quantity/serving size, adjusting that plan, choosing it as the main drink, logging, undo, leaving and putting it away.
- Creation and planning use the atomic `shareBottleAndPlan` and `planSharedBottle` RPCs with the draft’s revision and stable request UUID. Sharing while tracking a guest adds the bottle to both the creator’s plan and the guest’s plan, with independent main-drink choices and revision checks. Both saves roll back if either fails. Creation includes both people in restricted access; other account members choose whether to join.
- Main-drink switches are visible when creating, joining and adjusting. An existing main is kept by default. The first planned drink becomes main automatically; changing a bottle that is already main requires choosing another drink in the full plan. The form explains each outcome.
- Adjust edits a person’s quantity, serving size and main-drink selection, matching the web. The existing API fixes the bottle’s name, volume and strength once shared; this pass does not introduce global bottle-detail updates.
- Remaining-volume display measures inventory. Logged/plan counts remain text, with no consumption completion rings or celebrations.
- Bottle logs use the common warning-confirmation flow and retain the action UUID/time. Closed, unjoined, inaccessible and insufficient bottles are blocked locally and checked again by the server. Shared bottles require a connection; they are not queued for offline replay.
- Undo uses the existing activity correction API/window, which restores the bottle’s volume. Only the bottle creator can put it away. Past entries remain saved.
- Leaving requires removing the bottle’s active plan item first. The shelf opens the full plan for that step. Removing an item selects a surviving main drink; matching ordinary presets do not accidentally select/remove a bottle item.

## Native presentation and account boundaries

The implementation follows the Apple design, animate-expo, concise-ui-copy and Supabase skills. It retains the warm light/dark palette, scalable system text, flexible rows, 48-point controls and native switches/form sheets. Disclosures expose their expanded state. Press feedback remains the shared 120 ms transform/opacity transition with Reduce Motion handling; native navigation owns sheet motion. No new motion dependency is needed.

Protected route registration and authentication handoff include the new sheets. Forms are scoped to account/member. Mutations drop stale completions after sign-out, account changes or unmount; logging also checks the account again before a warning-confirmation retry. Private pace alerts use the shared visibility filter.

## Verification

- Mobile TypeScript and targeted ESLint.
- Fourteen focused feature tests in `tests/mobile-night-features.test.ts`, plus the existing mobile flow/auth/onboarding and shared bottle/permission tests (76 tests in the focused run).
- The complete unit suite passed: 304 tests across 35 files after the shared-bottle follow-up.
- All 349 database assertions passed, including 28 new checks for both plans, independent main choices, stale/full plans, retries and account ownership. Local database schema lint found no errors.
- Both bottle browser scenarios passed on desktop Chromium, mobile Chromium and mobile WebKit. The new scenario adds a guest through the UI, shares while tracking them, and confirms both saved plans after refresh. A WebKit sign-in/navigation race in the test was resolved by waiting for the home screen before continuing.
- iOS and Android Metro/Hermes exports, with the latest verification under `.tmp/mobile-shared-bottle-export/`.
- Read-only calls with the mobile publishable key confirmed that anonymous access to night snapshots, notification preferences and notification events is denied (`42501`). Authenticated bottle verification used disposable local test accounts. No hosted user data was changed.

The shared-bottle follow-up requires `supabase/migrations/20261002181638_shared_bottle_creator_plan.sql` on the app’s backend. It was applied to the isolated local browser backend, not the hosted project. Five-argument calls from older builds and initial night creation remain compatible.

An installed-build/device pass is still required. No device was connected for this implementation pass. Test light/dark rendering, largest Dynamic Type, VoiceOver/TalkBack, keyboard reachability, sheet interruption/dismissal and haptic timing. With test accounts, verify guest consent/add/edit/remove, check-in receipt/read/cooldown, reminder pause expiry, restricted bottle access, plan conflicts, last partial servings, undo/remaining volume, leaving/putting away and sign-out during a pending request. Do not place emergency calls as part of QA.

Persistent offline logging for ordinary drinks and chasers is now implemented; see [Native offline logging](mobile-offline-logging.md). Shared-bottle pours retain their online inventory check.

## UX verification — 3 October 2026

- Bottle creation now uses compact category choices, a quantity stepper and expandable bottle measurements. The measurements remain visible in the summary, and validation opens the fields. Returning to the shelf resets scrolling and confirms whose plans were updated.
- Web and native bottle shelves can log the last partial pour directly, with its exact volume in the button. Personal serving sizes and planned quantities stay unchanged; undo restores the poured volume.
- The native participant picker scrolls horizontally. Managed guests have a direct log button and a shared-bottle shortcut under Manage.
- Check-in results appear beside the recipient. Marking a reminder read only shows a spinner on that reminder. Settings switches can be tapped anywhere in their row.
- Emergency call buttons precede the warning-sign list. Emergency numbers and guidance are unchanged; no emergency calls were made during QA.
- Guest creation retains its submitted details and original participant list for retries. A realtime refresh no longer makes a successfully created guest disappear from the post-save selection. Ambiguous matches return to the night without selecting the wrong guest.

Verification: 306 unit tests, all 349 database assertions, workspace type checks, targeted lint, and iOS/Android Metro/Hermes exports passed. Nine browser scenarios passed across desktop Chromium, mobile Chromium and mobile WebKit, including guest/host main-drink choices, reload persistence, last partial pours and undo. Browser captures are under `.tmp/ui-review/bottle-last-pour-*.png`; native bundles are under `.tmp/feature-review-native/`.

Repository-wide lint still reports environment-variable typing errors in unchanged web files and scripts; the feature files pass targeted lint. No device was connected, so native rendering, large text, screen readers, keyboard reachability and switch touch behavior still require a device pass.

A read-only hosted migration check confirmed that `20261002181638_shared_bottle_creator_plan` is absent. It was applied to the local browser-test backend for this review only. The hosted backend must receive that existing migration before the latest sharing flow can work there.

Deployment follow-up: at the user's request, `20261002181638_shared_bottle_creator_plan` was subsequently pushed to the hosted project. The migration history, updated function signature, creator-plan update and execution permissions were verified; no migrations remain pending.
