# Quick Log and planned nights

Both clients share their platform's circular logging controls between standalone Quick Log, linked Quick Log and ordinary planned nights. Planned logging continues to use the existing measured-drink commands, confirmations, permissions, offline queue and shared-bottle checks. The UI change does not modify database schemas or import earlier entries as measured drinks.

Quick Log stays visible on web Home and mobile Tonight with or without an active session. Start Tonight retains the Quick Log / Plan a Night choice. A linked night exposes Back to Quick Log for the matching session and membership, even if another quick session exists. Choose another drink opens the existing drink picker; Edit plan and Shared bottles remain separate actions.

Planned and linked loggers highlight the main drink above the circle, including its name, serving size and strength. Imported count-only drinks consume the planned number of drinks without receiving invented alcohol measurements. Every additional drink beyond the plan asks for its own confirmation, whether logged from the circle, drink picker or shared bottle. The same check applies offline; missed entries retain individual review in the queue. Reaching the plan exactly does not trigger the count warning, and chasers and deleted entries do not count toward it. Existing measured-alcohol and planned-end confirmations remain in effect.

## Screens to verify on web and mobile

1. **Home / Tonight:** Quick Log is prominent before any session exists. Start Tonight offers Quick Log and Plan a Night.
2. **Quick Log:** log drinks and chasers, Undo, expand activity, correct an entry, finish and reopen history. Guest logging still works offline without signing in.
3. **Plan a Night → active night:** confirm the highlighted Main drink card above the circle shows the drink's name, size and strength. Choose another drink should include every planned drink; native also retains recent drinks and custom choices. Try a chaser, Undo, a managed guest and a chaser-only plan.
4. **Quick Log → Add to a night:** transfer to an existing or newly created night. Use Back to Quick Log and log a planned drink. Counts should combine earlier quick entries and new measured drinks without duplicating the import. Exceed the planned number, cancel once, then confirm two separate drinks; each must prompt independently. Repeat offline and after refresh/reopening. Try an alternate drink and a shared-bottle pour too.
5. **Invitation → join → Add logs:** after importing, return to Quick Log and check the invitee's own plan. Not now must leave earlier entries untouched. Another account or departed member must not gain logging access.
6. **Shared bottles / Night options / Group or People:** verify bottle inventory, joining, last partial pours through the shelf, plan edits, missed entries, check-ins, reminders, invitations, help and end/leave actions. Undo should restore bottle inventory through the existing command.
7. **First-time tour or replay:** the Quick Log step highlights its real entry even when the account has no session. Next, Back, Skip and Done work; the tour creates no real entries.
8. **Home / Tonight and Quick Log banners:** order is Baby Steps, Super Badass Records, Sundiata Beach Resort, Kuri Hotel, then The Link Up memories. The final banner links to the existing event album and no longer expires at the past event date.

Check a narrow phone, dark mode and enlarged text. Native touch feel, safe areas, keyboard behavior, VoiceOver/TalkBack and haptics require an installed build on a physical iOS/Android device.

Deploy the web app and shared feed for browser/campaign changes. Ship an updated mobile build for native UI and tour changes. No backend migration is introduced by this update.

## Verification on 21 October 2026

- 651 shared/web unit tests and 170 native renderer tests passed. The shared suite was run with two workers after an image-encoding test exceeded its timeout during concurrent builds.
- 54 distinct browser checks passed across desktop Chromium, mobile Chromium and mobile WebKit. Coverage includes planned drink choices, confirmations, offline logging, Undo, managed guests and realtime updates, account/guest sync, invitation and creation handoffs, lost-response recovery, tours and bundled banners. The final 12-check pass includes the linked logger, tour replay, ordinary logging and managed guests on all three browsers.
- Six optional external-feed browser checks were skipped because no external test feed was configured. The actual bundled campaign order, post-event availability, rotation and artwork were checked.
- Workspace typechecks, repository lint, production web build, formatting and diff checks passed. A final native typecheck and focused lint pass covered the missing-plan routing guard.
- iOS and Android JavaScript/Hermes exports passed under `.tmp/planned-logger-native`. These are compilation checks, not signed native builds or device interaction checks.

No physical device was connected. The phone checks above remain necessary before release. This update did not deploy the website, publish the campaign feed, change the hosted database or distribute a mobile build.

### Main drink and repeated-confirmation follow-up

- 656 shared/web tests and 174 native renderer tests passed. New coverage checks count-only imports, exact plan boundaries, repeated confirmations, cancellation, custom drinks, shared bottles and retry identity after a lost response.
- 15 distinct browser checks passed across desktop Chromium, mobile Chromium and mobile WebKit over two runs. They cover ordinary and linked planned logging, independent confirmations for consecutive drinks, cancellation, alternate drinks, offline/reconnect/reload behavior, missed-entry review and tours. A phone test was corrected to wait for navigation to Quick Log before tapping its logger.
- Web and native typechecks, lint for the changed files, formatting and diff checks passed. The main-drink card was visually checked in desktop and phone-browser screenshots. Native device appearance and interaction still require an installed build.

## Production-focused review on 22 October 2026

Quick Log history now keeps fully transferred sessions visible on both clients. Each linked session shows its original Quick Log counts, an Added to a night status and an Open night action for current totals. Partially transferred sessions show how many entries remain. History shortcuts are available in standalone and linked loggers; local deletion is under Session options. The web header wraps correctly at 320 px with enlarged text.

- 112 focused shared/web tests and 66 native renderer tests passed, including backdated Undo, Undo during upload, transfer recovery, repeated plan confirmations and fully/partially transferred history.
- 19 browser scenarios passed: the main logging/transfer flows on desktop Chromium, phone Chromium and phone WebKit, plus phone checks for ordinary logging, shared-bottle Undo, tour navigation and bundled campaign rotation.
- Narrow dark-mode Quick Log and history with 150% text were visually checked and have no horizontal overflow. Desktop and phone transfer-history screenshots were also reviewed.
- Android emulator interaction checks used an isolated local backend: drink/chaser logging, Undo, correction, finish, history, sign-in handoff, import into an existing planned night, main-drink logging, over-plan cancellation/confirmation and Undo.
- Workspace typechecks, lint for changed code, formatting, diff checks and the final production web build passed. The generated test-specific Next.js type paths were restored before committing.

No additional production-critical defect was found in the reviewed changes. No physical phone was connected; iOS native interaction, hardware touch feel, safe areas, haptics and assistive technology remain unverified on hardware. No database migration or backend deployment is required.
