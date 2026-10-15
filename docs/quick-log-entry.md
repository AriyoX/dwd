# Quick Log as DWD’s starting experience

Checkpoint: `a4585be` preserves the prior Quick Log, transfer, count-only Night representation and existing tests. Next-generated `apps/web/AGENTS.md` and `CLAUDE.md` were excluded from that checkpoint. Existing work was not reset or stashed.

## Product behavior

- Guests opening `/` are in the existing logger under “Just log it.” The large Drink circle, Chaser, exact Undo, corrections, session options and persistence remain. Shot is available in session options and keeps its original source kind. Drink totals include shots; session history identifies included shots separately.
- The existing inline adult/local legal-age acknowledgment remains the only eligibility step. Branding, a visible Sign in / Create account entry, Get the App, Terms, Privacy and safety links surround the logger. Get the App opens the installed native app or explains browser home-screen installation. No public store listing URLs are configured in this repository.
- Account benefits open only on demand in the existing accessible web dialog or native form sheet. They cover history across devices, photo memories, planned Nights, invitations and tracking with friends. Dismissal returns to logging; taps never trigger a promotion.
- Signed-in web users keep Home; native users keep Tonight. Start Tonight presents Quick Log or Plan a Night. Planning uses the existing wizard. An active session has one natural Resume Quick Log entry, so resuming skips the choice.
- Native introduction and welcome retain their existing structure with a clear Start logging as a guest action. Choosing it marks the introduction seen. Profile completion remains required for account features; returning complete accounts are not sent through onboarding again. Permissions are deferred away from logging, benefits and Start Tonight.
- Root invitation parameters take priority over normal entry for guests and accounts. Invalid parameters reach the invalid-invitation screen. Existing authentication return paths and native invitation identifiers remain intact.

## Account persistence and ownership

The shared coordinator associates all unclaimed guest sessions with the signing-in account without creating a Night. It saves the binding before making requests, saves an account copy before retiring the guest active pointer, and preserves entry IDs, kinds, recording timestamps, sequence, revisions, tombstones, Undo and pending transfer intent. Failed local writes stop the handoff and retain recovery data. Guest archives remain bound to their first account.

`public.quick_log_sessions` and `public.quick_log_entries` store standalone count-only history. RLS permits only owner reads. Direct client inserts and updates are revoked; authenticated private RPC boundaries validate identity and revisions. A session or entry already owned by another account cannot be claimed or transferred. Existing legacy Night imports also prevent reassignment to another account. Account erasure cascades to standalone sessions and entries.

Synchronization uses stable IDs and monotonically increasing entry revisions. Repeating identical requests does not append duplicates; old revisions cannot restore an undone entry, and conflicting equal revisions are rejected with local data retained. Requests freeze their bearer token and verify the current account before accepting receipts. Source copies are not advertised as backed up before server confirmation. Failed requests show pending account saving and Retry; reconnect, foreground/focus and bounded retries attempt recovery. Saving occurs in the foreground.

The guided sign-in handoff checks local saving first when there are guest entries, so a storage failure cannot discard memory-only taps during an authentication redirect. The benefits dialog keeps its sign-in links on the page and offers Retry saving; native logging keeps the user with their entries until that save succeeds.

Account history is merged into its cache without replacing unrelated local sessions. Distinct entries appended concurrently on two devices can share a source sequence; deterministic timestamp/ID ties preserve both without renumbering recording positions. Concurrent modifications of the same entry at the same revision require review instead of silently overwriting one device.

Browser writes retain the existing Web Locks and storage conflict checks. The coordinator takes the relevant writer locks for local mutations, without holding new locks across network requests. Browsers without Web Locks remain read-only, as in the existing implementation. Native writes reuse SQLite’s synchronous transactional update callback.

## Nights, history and calculations

The existing explicit transfer flow remains: choose an active membership, create a planned Night using its normal setup, or redeem an invitation. Sign-in and profile completion preserve the selected session and invitation/destination. Import confirmation uses the original durable operation and transactional receipt, including after a lost response or a Night ending. New entries stay outside an unresolved batch.

Transferred entries keep their source IDs, positions, revisions and recording times. Unknown volume, strength and ethanol remain null in Night snapshots. The existing measured drink/water collections, bottle stock and detailed calculations are unchanged. Night views retain their existing incomplete-subtotal labels and suppress complete plan comparisons/pacing when unmeasured alcoholic entries are present. Quick chasers remain distinct non-alcoholic counts.

New imports must match the current account revision and cannot resurrect a remote Undo. Committed receipts still reconcile after later changes. Once transferred, further edits use the Night’s correction path. Account refresh keeps unresolved local source revisions frozen, and the logger keeps result recovery available even if the server has already supplied the destination.

History on both platforms links to standalone Quick Log sessions. It displays counts, included shot counts, dates and “Drink sizes and alcohol strength not recorded.” Already-transferred sources are excluded from standalone history totals; partial transfers show the remaining entries. Transferred copies are still visible from the session’s activity with their Night reference. Local deletion removes only the device copy, as explicitly labeled; account history can restore it.

## Backend changes

Already present: count-only Night entries, authenticated ownership/membership checks, idempotent import receipts, source uniqueness, corrections, invitation validation/redemption, recoverable Night creation, and unknown-measurement handling in reports.

Added:

1. `20261014110000_quick_log_account_sessions.sql`: standalone account sessions/entries, owner RLS and restricted grants, sync/read RPCs, account erasure, and an ownership guard around the existing import transaction.
2. `20261014120000_quick_log_multidevice_order.sql`: concurrent append ordering and indexes; owned account sessions may transfer tied source positions while guest-only imports retain their existing validation.

Both migrations were verified in isolated Postgres and the existing local browser-test Supabase stack. They were applied to the linked hosted `drink-with-desire` project on October 14, 2026 with user approval; read-only verification confirmed the migration versions, owner RLS and restricted grants. Web/native clients were not deployed by this migration step. See [follow-up QA](quick-log-qa.md) for the subsequent fixes and checks.

## Verification and release checks

Automated coverage combines shared store/coordinator tests, native rendered screens, pgTAP with independent concurrent connections, and Playwright with the dedicated local backend. The main scenarios include immediate guest entry, rapid logging, Drink/Shot/Chaser/Undo, sign-in/signup and profile completion, preserved session/intent, Start Tonight choices, resume, standalone/cross-device history, local and network failures, lost responses, repeat saves/imports, account isolation, invitations and unknown alcohol measurements.

Final results:

- 546 shared/web unit tests and 154 native renderer tests passed.
- 670 database assertions across all 26 suites passed, including concurrent account appends, imports, ownership, erasure and stale/undone transfer rejection.
- All 45 Quick Log browser cases passed across desktop Chromium, mobile Chromium and mobile WebKit. A further 13 desktop regression cases covering authentication, onboarding, detailed logging and the tour passed; the combined desktop run passed 27 cases before the final storage-failure case was added.
- All workspace type checks, lint with zero warnings, the production Next.js build, changed-file formatting and whitespace checks passed.
- iOS and Android JavaScript/Hermes exports passed. These are not native binaries or physical-device tests.

Physical iOS/Android checks remain: VoiceOver/TalkBack, large accessibility text, one-handed use, safe areas, native sheet dismissal, background/process death, OS deep/universal-link association and real device storage restrictions. JavaScript/Hermes exports and browser emulation do not establish those results. Completing live Google/Apple consent and delivery of public signup mail also require real provider/sender setup. Add actual public store listing links when available.

The full deletion database fixture now models memberships predating the deletion transaction; this removes an existing `clock_timestamp()` versus transaction `now()` timing assumption without changing the production deletion code.
