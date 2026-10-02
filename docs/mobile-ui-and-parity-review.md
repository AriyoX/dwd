# Mobile UI and web parity review

Date: 1 October 2026. Scope: a focused native UI pass and source-level comparison, not a full product or backend audit. Use this as the handoff to Sol; implement the feature work separately.

## UI direction implemented

The original screens gave almost everything the same bordered-card/full-width-button treatment. The new hierarchy keeps DWD's warm palette, system type, native tabs and form sheets, while giving each task a distinct shape:

- **Tonight:** original theme-aware vector artwork, prominent start action, separate compact join row, lighter empty state.
- **Active night and recap:** paired, large drink/chaser counts; quick-log drink details; quieter plan editing; clearer destructive action; participant avatars.
- **Account:** compact identity row and visual System/Light/Dark previews with explicit selection indicators.
- **Planning:** compact duration selection with full spoken labels and wrapping layouts; simpler main-drink wording.
- **Activity:** a grouped timeline with separators and accessible Undo actions instead of a card for every entry.
- **Shared surfaces:** softer borders, continuous corners, icon-supported actions, and clearer error presentation. Existing 120 ms Reanimated press feedback, reduced-motion behavior and OS-owned navigation remain in use. No new animation library.

Counts describe logged activity, not goals to fill. No completion rings or celebrations for consuming more. Required warnings, acknowledgments and privacy boundaries stay intact.

## Sol handoff: features missing or partial

These findings compare `apps/mobile/app` and `apps/mobile/src` against the referenced web features. “Partial” means a basic native implementation exists; extend it rather than duplicate it.

| Priority | Area                | Native gap and implementation target                                                                                                                                                                                                                | Web reference                                                                                            |
| -------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| P1       | Auth and onboarding | Sign-in exists. Add signup, age confirmation, confirmation/resend, recovery/reset, Google sign-in and complete-profile flows. Preserve invitation destinations across authentication and cold-start deep links.                                     | `features/auth`, `app/auth`, `features/invites`                                                          |
| P1       | Offline logging     | Immediate in-memory retries exist. Add persistent actor-scoped outbox, pending indicators, replay/reconciliation, ended-night handling and sign-out isolation. Preserve each action's ID and timestamp; warnings must still require acknowledgment. | `features/offline`, `adapters/pending-log-store.browser.ts`                                              |
| P1       | Help and check-ins  | No native Get help surface, participant check-in/request-help actions, or equivalent reminder controls. Port the web's behavior and required explanatory copy with native presentation.                                                             | `features/nights/night-content.tsx`, `features/nights/active-night-client.tsx`, `features/notifications` |
| P1       | Managed guests      | Host logging for existing managed guests exists. Add person creation, consent context, guest plan editing, removal and relevant group controls; preserve authorization rules.                                                                       | `features/nights/active-night-client.tsx`                                                                |
| P2       | Shared bottles      | No native bottle shelf, create/edit, join/leave, glass logging/undo, remaining-volume display or main-bottle selection. Reuse shared contracts and data APIs.                                                                                       | `features/bottles`                                                                                       |
| P2       | Notifications       | Add native permissions, token lifecycle, preferences, pause/resume, inbox/read state and navigation to the relevant night. Native push delivery is separate from browser push.                                                                      | `features/notifications`, `providers/connection-provider.tsx`                                            |
| P2       | Planning and setup  | Partial: duration presets and drink presets exist. Add explicit date/time/timezone, solo/group choice, draft recovery, guest setup, custom plan-item editing and the web's review step. Keep plan revision checks.                                  | `features/nights/new-night-wizard.tsx`, `features/plans/plan-editor.tsx`                                 |
| P2       | Logging and ending  | Partial: drink chooser, water/chaser, undo, extend/end/leave exist. Add catch-up entries and the web's planned-end decision flow. Verify unit/serving details and group visibility against the web rather than adding new semantics.                | `features/nights/active-night-client.tsx`, `features/nights/night-content.tsx`                           |
| P2       | Invitations         | Partial: paste/preview/join and native share of a code exist. Add full invitation links, replace/revoke controls and failure/retry states. Make universal/app links an explicit integration task.                                                   | `features/invites/share-invite-dialog.tsx`                                                               |
| P2       | Account and support | Add profile editing, account deletion, feedback/support and request history; accessible Terms and Privacy entry points. Appearance and sign-out already exist.                                                                                      | `features/account`, `features/support`, `app/privacy`, `app/terms`                                       |
| P3       | Memories and recaps | Personal/group recaps exist. Add photos, upload/error/limit states, viewer, deletion and sharing where supported. Preserve recap visibility scope.                                                                                                  | `features/photos`, `features/nights/summary-screen.tsx`                                                  |
| P3       | Guided tour         | Add a native walkthrough with isolated sample state, skip/replay and persistent completion. Never write practice logs to real nights.                                                                                                               | `features/tour`                                                                                          |

Live Activities and Home Screen widgets are **native roadmap additions**, not missing web parity. Their existing plan remains in [mobile-ios-baseline.md](mobile-ios-baseline.md).

## Verification limits

Passed mobile TypeScript, mobile ESLint, all eight mobile-flow tests, and iOS/Android Metro exports. Reviewed Android screenshots and navigated Tonight, an existing active night, Account, History and an existing personal recap. Verified the Light appearance selection and light/dark rendering. No logs, invitations or nights were submitted during this review.

The emulator disconnected before the final compact-duration screen check and before restoring its original Dark preference; it was last set to Light for QA. Join and the revised planning flow still need a final device pass. Screenshot captures are under `.tmp/mobile-ui/` (local QA artifacts, not committed).

The parity table is a source-level comparison, not a complete end-to-end audit. iOS sheet feel, VoiceOver, largest Dynamic Type, Reduce Transparency, haptic timing and release-build performance still need real-device QA.

For each Sol task, require: native light/dark layouts, loading/error/empty states, permission and account-switching boundaries, relevant idempotency/revision checks, and a focused test. Avoid replacing the UI primitives or expanding the backend unless the feature actually needs it.

## Feature implementation progress

1 October 2026: the first P1 task now has native signup/adult confirmation, confirmation/code/resend, password recovery/reset, Google browser authentication, complete-profile routing and a persisted invitation destination. See [Native authentication and onboarding](mobile-auth.md) for the implementation, focused tests and remaining hosted/device integration. The table above records the original review; the other feature gaps remain follow-up work.

The subsequent onboarding pass adds an illustrated first-launch introduction, persistent completion/skip, distinct auth pages and Google branding. All product routes are now guarded until session restoration and profile completion succeed; recovery sessions stay in the password-reset flow. Native links preserve their destination before protected navigation redirects them. The focused test suite includes the actual product route inventory.

2 October 2026: native help/check-ins, managed guests and shared bottles are implemented. Help has a native emergency sheet; people have check-in actions and account-scoped incoming/read state; reminder preferences include pause/resume. Hosts can add consenting guests, edit their plans and remove them while preserving entries. Bottles have a native shelf, create/join/adjust/main selection, logging/undo, remaining volume, leave and put-away controls. These reuse the shared authorization, warning, idempotency and revision APIs. See [Native night features](mobile-night-features.md) for verification and the installed-build test checklist. Native push delivery and persistent offline logging remain follow-up work.
