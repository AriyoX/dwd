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
- Creation and planning use the existing atomic `shareBottleAndPlan` and `planSharedBottle` RPCs with the draft’s revision and stable request UUID. Creation includes the actor and the tracked guest in restricted access.
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
- The complete unit suite passed: 302 tests across 35 files.
- iOS and Android Metro/Hermes exports, written under `.tmp/mobile-features-export/` for local verification.
- Read-only calls with the mobile publishable key confirmed that anonymous access to night snapshots, notification preferences and notification events is denied (`42501`). No authenticated nights, guests, bottles or messages were created during verification.

An installed-build/device pass is still required. No device was connected for this implementation pass. Test light/dark rendering, largest Dynamic Type, VoiceOver/TalkBack, keyboard reachability, sheet interruption/dismissal and haptic timing. With test accounts, verify guest consent/add/edit/remove, check-in receipt/read/cooldown, reminder pause expiry, restricted bottle access, plan conflicts, last partial servings, undo/remaining volume, leaving/putting away and sign-out during a pending request. Do not place emergency calls as part of QA.

Persistent offline logging remains the next independent feature.
