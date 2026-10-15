# dwd: manual QA for the internal build

Run this on the installed app, not Expo Go. This checklist is based on the current mobile implementation. It records what to test; it does not claim these device checks have passed.

Start with sections 1–8 for the main journey (roughly 30–45 minutes). Do sections 9–14 afterward. Invitation expiry and scheduled notifications may need a later follow-up.

## Before starting

- Use test accounts and clearly named nights such as `QA iPhone 07 Oct`. All logging in this checklist is simulated; no drinking is needed.
- Prepare account A as the host and account B as an invited participant. A second phone is ideal; the web app on another device can act as B for group tests. Mark phone-only checks blocked if you cannot run them.
- Install the internal build on a registered iPhone with Developer Mode enabled. The repository's `testing`/`preview` profiles use the EAS **preview** environment; confirm the build points at the intended Supabase project.
- Use a disposable account C for deletion testing, performed last. Use a test participant for report/block checks; reports may reach the real moderation inbox.
- Record each result as **Pass**, **Fail**, **Blocked** (missing account/device/configuration), or **Deferred** (waiting for a timer). Untested is not a pass.

| Run detail | Record |
| --- | --- |
| Tester / date | |
| EAS build link / version / build number | |
| Commit, if known | |
| iPhone model / iOS version | |
| Build profile / environment | |
| Account A / B test aliases (no passwords) | |
| Network / appearance / text size | |

## 1. Install, splash and first launch

| ID | Do this | Expected result |
| --- | --- | --- |
| LA-1 | Launch from the Home Screen. | Icon name is **dwd**. The logo splash is centered and undistorted; no old expanded name, crash or permanently blank screen. |
| LA-2 | Force-close and launch in system light mode, then system dark mode. | Splash matches the system appearance and moves naturally into the app. No artificial wait. An in-app appearance preference may differ from the native splash. |
| LA-3 | On a genuinely new account/install, complete onboarding; separately check Skip where offered. | Both paths work. Location and notification permission dialogs do not interrupt startup. Age/eligibility requirements remain enforced. |
| LA-4 | Complete or skip the practice tour, then restart twice. | Tour does not repeatedly return. Practice actions do not create real drink entries. |

Reinstalling alone may retain iOS account/keychain state. Record whether this was genuinely a first launch rather than assuming it was.

## 2. Authentication and profile

| ID | Do this | Expected result |
| --- | --- | --- |
| AU-1 | Tap Continue with Apple, then cancel Apple's sheet. | Return to sign-in with usable controls, no endless spinner and no account accidentally created by cancellation. |
| AU-2 | Complete Apple sign-in using a new test identity; select Hide My Email when offered. | Sign-in succeeds. Required profile/age steps appear, then Tonight opens. No requirement to reveal the original email address. |
| AU-3 | Force-close and reopen, then sign out and sign in with Apple again. | Session restores after restart; returning Apple sign-in works even when Apple does not provide the name again. |
| AU-4 | In the project's Auth users view, verify the test user. | Correct Apple identity is attached to the expected account/project. Check grant capture/readiness separately; successful login alone does not prove deletion/revocation works. |
| AU-5 | If using email accounts, test signup/confirmation, wrong password and password reset from the email link. | Errors are understandable; confirmation/reset returns to the intended app flow. Password reset does not strand the app in recovery mode. |
| AU-6 | Test Google sign-in if offered. Cancel once, then complete it. | Cancellation recovers normally and successful sign-in reaches the correct account. |

Use a fresh Apple test identity for first-authorization behavior when possible. Do not revoke access to a personal account merely to repeat a test.

## 3. Tonight and setup

| ID | Do this | Expected result |
| --- | --- | --- |
| ST-1 | Open Tonight with no active nights. | Clear empty state and obvious Start a night / Join with an invite actions. |
| ST-2 | Start a group night with default duration. Change the duration, expand exact end time, then continue. | Defaults are useful; selected duration and displayed end time agree with the phone's time zone. Keyboard does not cover Continue. |
| ST-3 | Add a planned drink, change its quantity and select the main drink. Inspect another drink and custom drink options. | Selection and quantity are clear; selected plan is easy to find; less common options do not bury Continue. |
| ST-4 | Go back one step and forward. Then finish setup once. | Current choices survive step navigation. Exactly one night is created; host role and main drink are correct. |
| ST-5 | In a separate attempt, leave setup before submitting and start again. | No unintended night exists. An unsubmitted setup starts fresh. |
| ST-6 | Later, create a separate solo/chaser-only night and a night starting with a shared bottle. | Each mode is usable. Bottle setup creates one bottle and the intended plan, without logging a drink automatically. |

## 4. Active night: highest-priority regression check

| ID | Do this | Expected result |
| --- | --- | --- |
| AN-1 | Open the group night. Before scrolling, identify the next action. | Name/status and primary logging action are obvious. The screen is not reduced to only People, Share and the footer. |
| AN-2 | Locate **Log chaser**, **Log another drink**, **Shared bottles** and **Entries**. | All are reachable in the active-night body. The main drink button stays comfortably reachable above the bottom safe area. |
| AN-3 | Tap the main drink once. Expand Entries. | One entry appears for the correct person, amount and time. Count increases once and feedback is clear. |
| AN-4 | Tap again while that same save is visibly in progress. | The pending action cannot submit a duplicate. Separate completed actions may legitimately create separate drinks. |
| AN-5 | Log a chaser, then use Log another drink to select a different drink. | Correct entry types and counts change. Main drink stays unchanged unless you explicitly edit the plan. |
| AN-6 | Undo one newly logged drink inside the allowed correction window. | Correct entry is undone and counts update once. Other entries remain intact. |
| AN-7 | Open More night options, inspect Edit plan, missed entries and reminders, then return. | Options remain available without competing with the main logging action. Returning does not reset the night or selected person. |

## 5. Drink chooser and custom drinks

| ID | Do this | Expected result |
| --- | --- | --- |
| DR-1 | Open Log another drink after logging a drink outside the plan. | Relevant recent options are available; the same choice is not redundantly shown as both planned and recent. |
| DR-2 | Change an amount, cancel, then open again and save a chosen amount. | Units and resulting serving are clear. Cancel writes no entry; Save records exactly the chosen amount. |
| DR-3 | Open Custom drink. Enter `QA custom`, a valid serving and strength. Expand drink type if needed and save. | Required fields are obvious, numeric keyboards are usable, and less common details are optional to expand. Entry matches the submitted values. |
| DR-4 | Try a blank name and invalid numeric values, then correct them. | Inline feedback points at the issue. No invalid entry is saved; valid correction can be submitted without reopening the screen. |
| DR-5 | With the keyboard open, scroll to Save/Cancel and dismiss the sheet using its supported gesture. | Controls remain reachable; no clipped fields, trapped keyboard or accidental submission. |

## 6. Invitations and second participant

| ID | Do this | Expected result |
| --- | --- | --- |
| IN-1 | As A, tap Share invite and share to a test destination. Also copy the link. | Native share sheet opens. Share is primary; no need to manage invite tokens. Cancelling the share sheet leaves the night usable. |
| IN-2 | Save the link. Continue testing for at least six minutes, force-close/reopen dwd and share again. | The still-valid link remains available. No "cannot save/share on this phone" loop and no forced manual replacement. |
| IN-3 | Open the saved link as B, first signed out, then follow sign-in and joining. | Destination survives authentication. Preview identifies the intended night; B joins once and sets their own plan. |
| IN-4 | Open the link with the installed app closed, then with it already running. | Both reach the correct invitation/night. If the website opens instead, record the association/routing issue; do not mark native linking passed. |
| IN-5 | Turn A offline after a valid invite is saved and try sharing. | Existing valid link can still be shared. Creating/replacing a link explains that internet is needed; the app does not enter an error loop. |
| IN-6 | After B has joined, revoke an invite using Invite options. Reopen the invite screen and test the old link using a non-member test account. | Revocation remains off; the app does not silently recreate a deliberately revoked invite. Old link cannot admit a new participant. |
| IN-7 | Separately test a naturally expired or exhausted invite. | While online, an unusable link renews automatically and the replacement works. Existing default links last 24 hours. Mark Deferred if no suitable link is available; do not change the phone clock to simulate server expiry. |

## 7. Shared bottle added after the night starts

Keep A and B in the same active group night. Record the bottle's displayed starting stock.

| ID | Do this | Expected result |
| --- | --- | --- |
| SB-1 | As A, open Shared bottles → Add shared bottle. Use `QA bottle`, 750 ml, 40% strength and 30 ml serving; allow B to join. | Bottle is added once and returns to the shelf with confirmation. Adding it does not record consumption. |
| SB-2 | As B, refresh/reopen the active night. | Eligible bottle appears under **On the table**. Joining is easy to discover. |
| SB-3 | Tap Join, choose planned quantity and **Use as my main drink**, then save. | B's main action changes to this bottle. Existing drink history is preserved; joining does not consume stock. A's plan is not changed by B's choice. |
| SB-4 | Log one 30 ml portion as B. | B gets one entry and stock changes from 750 to 720 ml if no one else logged. A sees the updated stock after refresh/reconciliation. |
| SB-5 | Open Adjust my plan; change planned quantity or serving without logging. | Plan changes are distinct from consumption. Stock does not fall merely because the plan changed. |
| SB-6 | Undo B's portion within the permitted window. | Entry/count and bottle stock are restored once. |
| SB-7 | Try a bottle log offline. | Clear connection requirement; no false success and no locally invented stock change. Reconnect, retry and verify exactly one portion. |
| SB-8 | Test People and options, leaving a bottle and putting it away with the appropriate account. | Ownership/plan restrictions are explained. Closed bottles do not offer usable logging actions. Historical entries remain. |

## 8. Offline recovery and Entries

Use an ordinary non-bottle drink for these checks. Open the active night online first so it is cached.

| ID | Do this | Expected result |
| --- | --- | --- |
| OF-1 | Turn on airplane mode and ensure Wi-Fi is also off. Log an ordinary drink. | Action is saved on the phone with compact, understandable pending feedback. No repeated failure dialogs. |
| OF-2 | Open Entries, force-close dwd, then reopen while still offline. | Saved entry survives restart and remains associated with the correct account/night. Cached content remains usable. |
| OF-3 | Restore internet and wait for reconciliation; reopen/refresh if needed. | Saved action reaches the night exactly once. Pending state clears; counts and Entries agree. |
| OF-4 | During a separate save, interrupt the network, then recover/retry. | An uncertain result does not create duplicates. Any review requirement remains visible and actionable. |
| OF-5 | Create a pending ordinary entry as B; have A end the night online; reconnect B. | Any required review is shown rather than silently bypassed or losing the entry. Record the actual recovery steps. |
| OF-6 | Inspect pending/saved Entries and expand available adjustments. | List is easy to scan, actions affect the selected entry only, and feedback avoids technical queue terminology. |

## 9. People, activity, help and moderation

| ID | Do this | Expected result |
| --- | --- | --- |
| PE-1 | Add a clearly named managed test guest and complete the required consent. Select that guest and log once. | Selected person is obvious; only that guest's count changes. Switching back restores your own controls. |
| PE-2 | As host A, inspect account-member B's controls. | A cannot alter B's self-managed plan/logs as if B were a managed guest. |
| PE-3 | Expand/collapse activity while B adds an entry. | New activity becomes visible after updates; collapsing does not hide essential logging controls or cause abrupt navigation. |
| PE-4 | Open Get help and inspect check-ins/help numbers. | Useful controls are reachable and readable. Do not place a real emergency call during QA. Test any real check-in only with consenting test participants. |
| PE-5 | Open report/block for a test participant, cancel, then complete an intentional test block. | Cancellation makes no change; completed action has clear feedback. Inspect Blocked people in Settings and test unblocking. Only submit a report if a test moderation record is intended. |

## 10. Settings, notifications and permissions

| ID | Do this | Expected result |
| --- | --- | --- |
| SE-1 | Open Settings and inspect Your nights, Appearance, Help & privacy, Account options. | Grouping is clear, rows are easy to tap, destructive actions are secondary, and the page scrolls to the end. |
| SE-2 | Select Light, Dark and System; restart after a selection. | App preference persists; System follows the phone. Text, icons, selected controls and disabled controls stay distinguishable. |
| SE-3 | Edit the profile, save, leave and return. | Valid changes persist. Cancel does not save unintended edits. |
| SE-4 | Open Terms, Privacy, Support & feedback and Explore DWD. | Correct destination opens, Back works and tour replay is intentional. Legal text contains the new app name. |
| SE-5 | Open Local help numbers and exercise the explicit location action: deny first, then enable from phone settings and return. | No repeated permission nagging. Fallback remains usable after denial; the app recovers after a grant. |
| NO-1 | Enable notifications from Notifications. | Permission is requested in context. UI does not claim successful registration before registration succeeds. |
| NO-2 | Separately test denial and returning after enabling permission in phone Settings. | Clear recovery action and accurate current status. No endless spinner or automatic repeated prompt. |
| NO-3 | Configure a supported reminder and leave dwd in the background until due. | Actual push arrives; opening it reaches the intended screen. Merely seeing an inbox item is not proof of push delivery. |
| NO-4 | Turn notifications off and exercise a later eligible event. | Preference remains off after restart and no new opted-out push is delivered. Distinguish already delivered/previously queued notifications when recording results. |

If delivery cannot be exercised because server scheduling or credentials are unavailable, mark Blocked and record which prerequisite is missing.

## 11. Photos, planned end and recap

| ID | Do this | Expected result |
| --- | --- | --- |
| EN-1 | Open photos for a test night, cancel the picker, then choose a non-sensitive test image. | Cancellation leaves the screen usable; a valid upload appears once. Selection/limited-access states recover without requesting unnecessary access. |
| EN-2 | Interrupt an upload, reconnect and retry. | Clear recovery feedback; no duplicate photo and no permanent busy state. |
| EN-3 | Create a short separate test night and let its planned end pass. | Planned-end check-in is understandable. Keep logging does not bypass required acknowledgment; members cannot use host-only extension/end actions. |
| EN-4 | As host, extend by 30 minutes. | End time updates once and participants see the change. |
| EN-5 | Open End night, cancel, then reopen and confirm. | Cancel preserves the active night; confirmation ends it. Active logging no longer appears usable as if the night were still open. |
| EN-6 | Open recap from the finished night and from Entries. | Correct night, people, counts and permitted history scope. Pending/review items are not silently lost. |
| EN-7 | As B, leave a separate active test night. | Leave affects B's participation, not the whole night. Returning through an old link handles current membership correctly. |

## 12. Accessibility and layout sweep

Repeat this sweep on Tonight, setup, active night, chooser, custom drink, bottle join, invitation, Entries and Settings. Record the screen and device for each failure.

- [ ] At normal text size, screen purpose and primary action are clear in a glance.
- [ ] At the largest accessibility text size, labels wrap and controls remain reachable; no text overlaps or cut-off Save/Cancel buttons.
- [ ] With VoiceOver, primary actions have useful names; selected person, selected option, expanded/collapsed state and disabled state are understandable.
- [ ] Collapsed sections do not expose hidden controls to VoiceOver. Closing a sheet returns focus sensibly.
- [ ] One-handed taps work across the full visible button, including small icon controls. Scrolling across a button does not accidentally activate it.
- [ ] Light and dark appearance remain readable in dim lighting. Status is not conveyed only by color.
- [ ] Keyboard, bottom home indicator and top safe area never cover essential controls.
- [ ] Sheet dismissal, Back and interrupted navigation recover without accidental saves or stuck overlays.
- [ ] Reduce Motion remains usable; no motion is necessary to understand a successful action.
- [ ] Repeat on a smaller and larger iPhone when available. Tablet support is enabled: perform an iPad pass before public release, or mark it untested.
- [ ] If checking Android too, repeat keyboard resizing, hardware Back, sheet dismissal and notification-permission behavior; an iOS pass does not certify Android.

## 13. Account isolation and deletion — last

| ID | Do this | Expected result |
| --- | --- | --- |
| AC-1 | Sign out of A and sign into B on the same phone. Repeat with locally pending test work, following any shown handling requirements. | A's cached/pending data does not appear under B or submit as B. No automatic cross-account writes. |
| AC-2 | On disposable account C, open Delete account, inspect the explanation and cancel. | No deletion is scheduled by merely opening/cancelling the screen. |
| AC-3 | For an Apple-linked disposable account, inspect deletion readiness; complete Apple reconnection if requested. | Missing grant capture is explained and reconnect recovers. Presence of an Apple identity alone must not be treated as proof of a captured revocable grant. |
| AC-4 | Intentionally schedule deletion for C, then test Cancel deletion while allowed. | Status accurately describes scheduled deletion; cancellation updates it. Do not expect immediate erasure if a delay is stated. |
| AC-5 | On an account intentionally left scheduled, check after its stated deletion deadline. | Confirm actual deletion and Apple grant revocation through the appropriate server checks. Mark Deferred until the scheduled job runs; scheduling alone is not a pass for completed deletion. |

## 14. Results and handoff

Stop and report a blocker if the app crashes repeatedly, signs into the wrong account, loses saved entries, duplicates a recovered action, changes another person's plan unexpectedly or miscalculates bottle stock. Record lesser visual issues and continue independent tests.

Use one report per issue:

```text
Test ID / screen:
Build / phone / iOS:
Account role: host / participant / managed guest
Network: online / offline / reconnecting
Steps:
Expected:
Actual:
Reproduces: every time / intermittent / once
Screenshot or recording:
Impact: blocker / major / minor
```

Do not include passwords, private keys, full invitation links or other people's personal information in reports. For screenshots, capture the whole screen so spacing, keyboard and safe-area problems are visible.

| Area | Pass / Fail / Blocked / Deferred | Issue IDs / notes |
| --- | --- | --- |
| Launch, onboarding and login | | |
| Setup and active-night actions | | |
| Drinks, chasers and custom drink | | |
| Invitations and joining | | |
| Shared bottles and stock | | |
| Entries and offline recovery | | |
| People, activity and help | | |
| Settings and permissions | | |
| Actual push delivery | | |
| Photos, ending and recaps | | |
| Accessibility / small phone / large phone / iPad | | |
| Account isolation and deletion | | |

After the core checks pass, repeat launch, Apple login, invite opening, logging and push delivery on the TestFlight build. An ad hoc pass does not replace verification of the separately built TestFlight artifact. Live Activities, widgets and ads are future work and are not expected in this build.
