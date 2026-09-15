# Drink with Desire: implementation handoff

You are implementing changes in the existing Drink with Desire (DWD / drink-mates) repository. This is an implementation task: inspect the code, fix the bugs, build the features, add meaningful regression coverage, and verify the result. Do not stop after proposing a plan.

Work with the model selected for this session. Do not switch to Astra or spawn other agents. Keep compute focused: use targeted searches, reuse existing architecture, and avoid unrelated refactors, repeated full-repository reads, and redundant test runs. Use enough reasoning to resolve cross-layer bugs correctly.

## Goal and scope

Deliver these user-visible changes:

1. Group cards show each participant's actual drink quantities and types.
2. Refreshing an ongoing night does not unexpectedly reopen a drink logging or completed plan setup prompt.
3. Beer is no longer automatically selected for a new plan or drink selection; start with no selection.
4. Users can enable notifications for relevant group attention and pace events.
5. "Log anyway" works reliably on phones, including warning and offline retry flows.
6. "Check in" on another participant is an actionable control that notifies that participant.
7. Editing plans behaves correctly across lifecycle, validation, concurrency, and offline edge cases.
8. Personal history includes nights the user participated in, including nights someone else hosted.
9. Timezone handling is consistent across setup, active nights, history, and reminders.
10. Users can opt into useful personal reminders.
11. Users can edit their own display name. Customizable animated avatars are a future feature; document a short follow-up, but do not build an avatar editor, uploads, or animations now.

The detailed defaults below resolve ambiguities so you can proceed. If existing product behavior requires a different choice, explain the evidence and choose the smallest coherent implementation. Ask only when a missing decision genuinely blocks safe progress; continue independent work while waiting.

Preserve the current mobile-first visual style, theme support, demo/tour, accessibility, ownership rules, offline logging, and factual, noncompetitive tone. Keep interface text brief. Do not introduce BAC estimates, medical safety claims, rankings, or reminders encouraging another alcoholic drink. Existing thresholds are product rules, not a medical assessment; do not change them as part of this work.

## Repository context and first steps

The following observations came from a read-only inspection on September 7, 2026. Recheck them against the current checkout; they are navigation aids, not proof of a bug's root cause.

- npm workspaces: `apps/web`, `packages/core`, `packages/contracts`, `packages/data`.
- Web app: Next.js App Router, React, TypeScript, browser adapters, Server Actions, Supabase SSR authentication, Vercel deployment.
- `packages/core`: pure domain rules, schemas, types, calculations, time and permission helpers. Keep it independent of React, Next.js, Supabase, and browser globals.
- `packages/contracts`: platform interfaces, including notifications and pending log storage.
- `packages/data`: injected-client Supabase repositories and RPC mapping; no Next.js routing or cookies.
- `supabase/migrations`: schema, RPCs, grants, RLS, and Realtime setup. Read both existing migrations; the second replaces some functions from the first.
- `docs/architecture.md`, `docs/database-and-rls.md`, `docs/manual-qa-checklist.md`, `docs/deployment.md`, and `docs/mobile-portability.md` explain intended behavior.
- `README.md` documents commands and existing operational limits.

Start by reading applicable `AGENTS.md` instructions, checking `git status`, and inspecting those relevant docs. Preserve existing user changes. Use relevant installed skills, including Supabase and concise UI copy, when applicable. Verify unfamiliar or changing API/browser behavior against current official documentation. Do not spend time researching model selection.

Make a concise implementation checklist covering all eleven requests and their tests. Keep it updated across long sessions; if context is compacted, resume unfinished items instead of redoing completed work.

Do local implementation and validation autonomously. Do not push, merge, deploy, apply migrations to a hosted database, enable paid services, or send real notifications to production users as part of this handoff. Prepare complete migrations, configuration examples, and release instructions. These boundaries must not become a reason to leave local implementation unfinished. Use only the dedicated DWD backend when inspecting configuration; do not touch unrelated projects or expose secrets.

## 1. Actual drink quantities and types in Group

Start with `apps/web/src/features/nights/night-content.tsx`, especially `ParticipantCard` and `TonightView`, and the shared totals helpers. The personal card already uses category totals. Group cards currently show an overall logged count and a planned quantity, but lack a useful breakdown.

Requirements:

- Show the current night's consumed alcohol count and a readable breakdown per participant, such as `3 drinks` and `2 beers · 1 wine`.
- Use canonical non-deleted drink logs and their historical snapshots, not the participant's current plan, to describe consumption.
- Show water separately as water entries; do not include water in the alcohol count or invent water volumes, which the current water log model does not record.
- If useful, provide a compact expandable detail list showing actual labels, serving volume in ml, and ABV from log snapshots. Keep the main card easy to scan on a narrow phone. Different custom drinks must remain distinguishable in detail even if the category summary groups them under Other.
- Planned quantities remain visibly identified as planned, distinct from drinks consumed.
- Show zero, water-only, mixed categories, singular/plural, custom labels, and departed participants correctly.
- Mark locally queued entries as pending; reconcile by idempotency key so a queued log and its canonical copy never count twice. Another device cannot see unsynced local activity, so do not imply that it can.
- Undo/correction, reconnect, and another participant's successful log update the group display through the existing canonical snapshot flow.

Acceptance: in a night with host A, account participant B, and managed guest C, A and B both see accurate saved breakdowns for all three. A's pending entry for C is visibly pending only on A's device until synchronized. Undo updates counts and types without changing historical drink definitions.

## 2. Refresh unexpectedly opens a prompt

Inspect `apps/web/src/app/(protected)/night/[nightId]/page.tsx`, `active-night-client.tsx`, invite redirects, and offline restoration.

Observed lead: the route passes `query.setup === '1'` as `setupPlanInitially`. `ActiveNightView` uses it to initialize an open plan dialog. Invite-opening code consumes its URL flag, but there was no equivalent setup-flag cleanup in the inspected section. This could be the reported "new drink" prompt, but reproduce and identify the actual dialog before claiming a fix.

- Trace every automatic modal opener: setup query parameters, first join, empty plans, outbox confirmations, overdue state, hydration/remount, browser back/forward, and focus/reconnect.
- A reload or visibility change must not generate a fresh drink draft or open the drink chooser.
- Consume one-shot navigation intent with the supported routing approach; do not corrupt Next.js history state or drop unrelated query parameters.
- Determine completed setup from durable domain state where needed. An intentionally saved water-only plan is complete; an empty array alone cannot distinguish it from unfinished onboarding. Add a minimal persisted setup marker if existing state cannot represent that distinction.
- Preserve legitimate first-time plan setup, genuine overdue notices, and explicit review of pending warnings. Do not suppress all dialogs or discard unsaved records to hide the bug.
- Restored pending entries requiring consent remain visible and reviewable without masquerading as a new user action.

Acceptance: join, finish setup, log a drink, refresh, revisit the original setup URL, navigate back/forward, and reconnect. Completed setup stays completed and no unsolicited drink form appears. Explicit logging and pending-warning review still work. Repeat with water-only setup and blocked browser storage.

## 3. No automatic beer selection

Start with `features/plans/plan-editor.tsx`: `newPlanItem(presetId = 'beer')` explicitly defaults to beer and falls back to the first preset. Also inspect `new-night-wizard.tsx`, guest setup, active-night plan setup, drink chooser state, restored night drafts, schemas, and demo/tour callers.

- New setup and new drink selection start unselected. Use a concise placeholder such as `Choose a drink`.
- Keep Beer available as an explicit choice. Preserve existing saved plans, including intentionally chosen beer and usual drinks.
- Do not replace Beer with another default, silently select the first category, or insert a default cocktail when Custom is chosen.
- Distinguish `unselected`, `planning drinks`, and an explicit `water only` choice in UI draft state. Preserve a valid water-only submission.
- Model incomplete form drafts separately from validated domain input when necessary. Do not force empty strings through `DrinkCategory` casts or weaken database constraints to allow blank saved drinks.
- Only create a valid preset item after an explicit selection. Explicit preset selection can fill that preset's volume/ABV. Custom inputs must not silently inherit an unrelated preset.
- Block saving an incomplete alcohol plan with actionable validation. Never log an unspecified drink.
- Retain an explicitly configured usual-drink shortcut for existing plans; this request removes automatic Beer selection, not the ability to deliberately choose a usual drink.
- Update draft persistence/version handling and meaningful tour assertions so old saved drafts remain usable or recover with a clear explanation, without silently deleting real choices.

Acceptance: fresh host setup, guest setup, adding a plan row, switching from water-only, discard/reset, and choosing a custom drink never create Beer implicitly. A deliberately selected Beer plan still saves and quick-logs normally.

## 4. Group notifications and permission settings

Existing pieces: `adapters/notifications.browser.ts`, `packages/contracts/src/notifications/notifications.ts`, `packages/core/src/warnings/warnings.ts`, `packages/data/src/alerts/alerts.ts`, `night_alerts`, and `providers/realtime-provider.tsx`.

The inspected adapter calls `new Notification(...)`; active-night code currently requests permission for an end reminder. README documents no Web Push server. Extend this foundation into a real recipient-aware feature.

Required baseline:

- Persistent, authenticated in-app notifications for eligible recipients, surfaced accessibly in the app, with unread/read or equivalent acknowledgement state.
- A clear `Enable notifications` control in account/settings and a discoverable entry from the active night. Request browser permission only after a user gesture, never on page load or after each refresh.
- Handle unsupported, default/not-requested, denied, granted, and revoked states. Permission and application preferences are distinct. Denial must not break logging or in-app notifications; provide concise instructions for changing browser settings without repeatedly prompting.
- Separate notification categories: group attention, direct check-ins, and personal reminders. Persist account preferences; permission/subscription capability is device-specific.
- Generate automatic group attention from canonical server events and existing group-visible warning rules. Keep private personal pace warnings private; do not broadcast every alert to the whole group.
- Choose explicit recipient rules: current eligible account members receive group-visible attention events about another participant; the affected account receives its private pace/reminder events. Managed guests have no account/device, so their manager is the recipient for relevant personal events. Do not duplicate that manager's equivalent group and personal delivery unnecessarily.
- Derive sender and membership from authenticated server state. Clients must not be able to forge another sender, insert arbitrary recipients, or read another person's private notifications/preferences/subscriptions.
- Deduplicate by durable event/recipient identity. Realtime reconnects, browser refresh, duplicate log submissions, overlapping workers, and multiple tabs must not generate new copies of an old event.
- Respect existing warning cooldowns, expiry, and stale offline-event suppression. Do not replay old pace alerts as urgent new alerts when a queue reconnects.
- Delivery failures must not roll back a successfully saved drink. Persist the event transactionally and deliver asynchronously with bounded retries where appropriate.
- Browser notification errors must be caught so unsupported constructors or revoked permission cannot crash a night view.
- Keep lock-screen payloads minimal: a general check-in message with authenticated deep-link access to detail, rather than exposing detailed drink histories.

Web Push feasibility and implementation:

- Check current official browser/WebKit documentation and the actual Vercel/Supabase runtime before selecting the delivery mechanism.
- Implement standards-based Web Push if feasible with this stack: service worker, registration, subscription management, authenticated subscription endpoints, server-only signing credentials, reliable event dispatch, and notification click handling.
- Use server-side scheduling for reminders intended to work when the page is closed. A page timer or `new Notification()` alone is not evidence of background delivery.
- Handle subscription replacement, expiration, invalid endpoints, logout, account switching on a shared device, and multiple devices. Never let the next signed-in user receive the previous account's private pushes. Worker payload/click behavior must not expose stale account data.
- Choose the smallest reliable delivery architecture compatible with the existing app. Do not add a paid external provider or native app. Avoid caching authenticated API responses in a new service worker.
- Document exact server-only/public environment variables, setup, worker scheduling, and browser support/installation requirements verified from official sources.
- If live credentials or hosting setup are unavailable, still implement and locally test the integration and provide exact activation steps. State what remains unverified. If platform constraints genuinely prevent push, ship the complete persistent in-app baseline and supported foreground notifications, with a precise explanation; do not label foreground-only delivery as push or guarantee delivery.

## 5. Reliable "Log anyway" on phones

Trace `submitDrink`, `handleSyncOutcome`, `ConfirmationDialog`, `components/ui/dialog.tsx`, drink-logging Server Actions, `features/offline/outbox.ts`, `adapters/pending-log-store.browser.ts`, and the latest `log_drink` RPC.

The inspected implementation reconstructs an outbox record in `submitDrink(draft, true)`. `OutboxCoordinator` also has `confirmAndRetry`. Investigate acknowledgement persistence, dialog dismissal, async races, and stale plan data; do not assume a CSS-only fix or a particular phone bug without evidence.

- Reproduce client-predicted warnings, server-only warnings, and both `plan_exceeded` and `after_end` together.
- Confirm exactly one intended record using the same idempotency key and original consumed timestamp through warning review, retries, and server response loss.
- Acknowledge only warnings the user has reviewed. If the server discovers a new warning, show it and require explicit acknowledgement rather than silently bypassing it.
- Prevent rapid double taps and overlapping submissions with a synchronous in-flight guard or equivalent; disabled React state alone may not prevent two calls before rerender.
- Preserve the selected member, historical plan reference, and drink values correctly. Do not reinterpret an old pending drink using a newly edited plan.
- Ensure cancellation/backdrop/escape cannot race a submitted request into a contradictory UI. Pending, success, retryable failure, and permanent failure each need a clear state; release busy state with `finally` on every relevant path.
- Handle network loss before and after server commit, blocked/full/corrupt storage, expired auth, reconnect during confirmation, leaving/removal, and a night ending during submission. Do not falsely report a server-committed log as lost because the subsequent refresh failed.
- Audit touch targets, pointer/backdrop handling, keyboard focus, scrolling, and stacked dialogs on small screens. Do not add duplicate touch and click handlers that submit twice.
- Preserve undo and reconciliation behavior.

Acceptance: a single confirmation saves one drink; double tapping still saves one; lost response and retry still save one; combined warnings can be confirmed; offline confirmation survives reload; server rejection leaves a recoverable or clearly terminal record. Demonstrate these with targeted tests and browser checks.

## 6. Clickable Check in

`ParticipantCard` currently renders `Check in` as a noninteractive `<span>` when alerts exist. Replace it with an accessible button for eligible recipients; also provide a discoverable manual check-in action for another active account participant without requiring a current warning.

- Clicking A's check-in button on B creates a persisted direct check-in request from A to B in that night. B sees a concise message such as `Alex checked in on you` and can open the relevant night.
- The sender sees pending/sent/error feedback. Say `Sent` when accepted by the backend, not `Delivered` or `Seen` without evidence.
- A minimal recipient acknowledgement such as `Seen`/`Acknowledge` is enough if useful; do not build a chat product, infer that someone is safe, or auto-clear a factual pace event merely because it was acknowledged.
- Enforce current shared membership, active-night eligibility, recipient identity, server-side cooldown/rate limit, and idempotent retries. Default to at most one accepted request per sender/recipient/night per 60 seconds, enforced atomically; document the setting.
- No self-notifications. Departed users and ended nights do not offer new check-in requests.
- For managed guests, route the request to the host/manager and label it honestly, such as `Ask host to check in`. If the viewer is that manager, offer a local reminder or explanation, not a fake delivery to an accountless guest.
- Browser push follows recipient consent and capability; in-app delivery works without browser permission. Reuse the notification infrastructure from item 4.
- Do not queue unlimited stale check-in requests while offline. Prefer a clear retryable error when a fresh request cannot be accepted.

Acceptance: two signed-in sessions can send and view a check-in; denied browser permission still permits in-app receipt; double tap/cooldown creates no duplicates; outsiders cannot read or send; guest routing is explicit.

## 7. Plan-edit edge cases

Inspect `features/plans/plan-editor.tsx`, `active-night-client.tsx`, `packages/data/src/plans/plans.ts`, core plan/schema/time helpers, `replace_member_plan`, and log version checks.

Preserve the existing prospective/versioned model: an edit changes future plans, while saved logs retain label/category/volume/ABV/ethanol snapshots and valid historical plan references.

Handle and test:

- No plan versus deliberately water-only; switching both ways; removing all rows; adding multiple categories and custom drinks.
- Blank/whitespace labels, long names, nonfinite numbers, empty numeric inputs, invalid/negative quantities or volumes, ABV limits, and row limits. Enforce shared client validation and authoritative server constraints.
- Exactly one valid usual drink for a nonempty saved plan, unless current product rules explicitly allow none; deleting the usual row selects a predictable remaining choice. An incomplete new draft must not silently become a valid preset.
- Editing quantity, label, category, volume, or ABV after drinks have been saved. Historical totals and snapshots never change. Lowering a plan below consumption is allowed if existing policy allows it, with clear status; never delete history to make it fit.
- Undo after a plan edit; queued drinks using archived versions; new drinks after an edit; exact version-boundary timestamps; custom drinks independent of a deleted plan row.
- Two tabs/devices editing the same plan. Detect stale writes using a revision/token or equivalent atomic check; avoid silently overwriting a newer plan. Show a reload/review path.
- Incoming Realtime updates while the editor is dirty must not erase local edits or silently apply them to a different member.
- Host editing their own plan or a managed guest; host attempting to edit another account participant; participant attempting to edit someone else. Recheck authorization server-side.
- Night ending or membership changing while the editor is open, failed save/retry, repeated save, and closing without saving. Failed saves preserve the draft and show a useful error.
- Decide how plan changes affect current status and future notifications, without rewriting past warnings or producing a notification storm.

Keep migration scope narrow and preserve existing logs, audits, archived versions, and the current post-end synchronization grace.

## 8. Individual history includes participation

Inspect `packages/data/src/nights/nights.ts::getFinishedNights`, `history-screen.tsx`, history/summary routes, and database read helpers/RLS.

Observed behavior: `getFinishedNights` selects ended nights under current-membership RLS. It is not explicitly host-only. The UI says leaving removes summary access. Diagnose whether the report affects joined members who remain, people who leave, or both.

Target behavior and default access policy:

- Finished-night history includes every night in which the authenticated account actually participated, regardless of hosting and even if they left before the night ended. Do not invent participation for accountless guests by matching display names.
- Include zero-alcohol/water-only participation. Do not require a drink log to establish membership.
- Show title, appropriate date/timezone, hosted/joined role, and a compact personal activity summary. Preserve stable pagination and no duplicates after leave/rejoin.
- Current eligible members can continue using the existing authorized group summary.
- Former participants get a deliberately restricted personal historical view: night metadata plus their own activity/plan history. Do not restore live group read access or expose other participants' later/private data merely to populate history.
- Only finished nights go in finished-night history. A departed participant's still-active night does not become a finished night.
- Use a dedicated authorized history/summary query or RPC if necessary. Keep live membership authorization strict; do not broaden `is_current_night_member` globally.
- Every history card must open a summary the viewer is actually authorized to read, including the former-member case. Hide group operations from the restricted view.
- Update empty-state text and docs that currently promise access loss after leaving.

Acceptance: host, joined-current participant, departed participant, leave/rejoin participant, water-only participant, and outsider each see exactly the intended histories and summary fields. An outsider cannot enumerate nights; a former participant cannot use the history change to read live/private group data.

## 9. Timezones

Inspect `new-night-wizard.tsx` (`defaultEndTime`, `defaultEndDate`, `resolveEndsAt`), `night-draft.ts`, `packages/core/src/time/time.ts`, all date formatters, invite preview, summary/history, and reminder scheduling. Night rows already contain `timezone`; date/time formatting does not consistently pass it.

Use this policy consistently:

- Persist real instants as UTC/offset-aware timestamps. Keep the night's IANA timezone as metadata. Compare elapsed durations and warning windows by instants, not formatted local strings.
- At night creation, default the night timezone to the creator's detected timezone and make it visible/editable. Interpret the selected date and clock time in that chosen zone, even if it differs from the device zone.
- Display shared night wall-clock times and history dates in the night timezone, with a concise zone label. If showing `Your time` as a convenience, label it separately. Everyone should agree on the scheduled instant and countdown.
- Resolve server-rendered versus client-rendered formatting deterministically. A server in UTC and a phone in Africa/Nairobi must not produce different initial text or hydration warnings for the same labeled night time.
- Validate IANA zone names and malformed timestamps. Define a documented fallback for missing/invalid legacy zone metadata without rewriting the stored instant. Do not hard-code UTC+3 as the global solution.
- Calculate setup defaults from one captured instant so separate date/time calculations cannot disagree at midnight.
- Handle crossing midnight, month/year boundaries, daylight-saving gaps and repeated times, and non-hour offsets. Reject impossible wall times clearly; require or apply a documented disambiguation for repeated times rather than silently choosing unpredictably.
- Persist a setup draft's timezone with its chosen date/time. Reopening after travel or a device timezone change must not silently move the planned end.
- Keep `consumedAt` separate from server receipt time for offline entries. Preserve existing historical end-extension classification and post-end grace semantics.
- Reconcile time-dependent UI after sleep/focus. Server decisions remain authoritative if a device clock is skewed. Reminders use the scheduled instant, not the browser's current timezone.

Acceptance: test Africa/Nairobi, UTC, a DST-observing zone such as America/New_York across both DST transitions, and a non-hour offset such as Asia/Kathmandu. Include midnight rollover, creator/viewer zone mismatch, draft restore after a zone change, and server/client timezone mismatch.

## 10. Personal reminders

Build on item 4; avoid a second independent notification system.

- Support the existing planned-end reminder, personal pace reminders based on existing private warnings, and an optional periodic water/check-in reminder.
- Make each opt-in and cancellable. For periodic reminders, offer a small explicit interval choice such as 30/60/90 minutes, with 60 minutes preselected only inside the opt-in control; default periodic reminders off. Do not imply water reverses impairment.
- Tie reminders to an account and relevant active membership/night. Ending/leaving disables future reminders; extending reschedules the end reminder. Preference changes invalidate obsolete schedules.
- Persist durable event identities/scheduling state for refresh and multi-tab/device deduplication. Re-evaluate eligibility just before delivery so a scheduled job cannot notify someone who has since left or disabled that category.
- Suppress catch-up storms after offline periods. Show at most the relevant current reminder, not every missed interval.
- A manually ended night should cancel periodic reminders, not generate a misleading future scheduled-end notification.
- If background delivery is unavailable, clearly describe the foreground limitation and still make in-app reminders reliable on reopening. Do not claim a closed-browser test passed based on a mocked timer test.

Acceptance: enable, disable, change interval, refresh, duplicate tab, leave, end, and extend all yield the correct schedule and no duplicate/stale reminders. A scheduling/delivery failure does not block logging.

## 11. Edit current user's display name; defer avatars

Start at `apps/web/src/app/(protected)/account/page.tsx`, profile schemas/actions, `profiles`, `night_members`, and snapshot construction. The existing database grants authenticated users an own-profile display-name update, but night memberships store their own display-name copies. Updating only `profiles` may leave active group cards stale.

- Add an accessible display-name form prefilled from the current profile, with save/cancel or a simple save flow, loading, success, and field-level error feedback.
- Trim input; enforce the existing 1-60 character constraint consistently. Accept international names and normal punctuation; reject whitespace-only input. Render names as text, not HTML. Do not require unique names.
- Only the authenticated user may update their name. Names are never identity or authorization keys. Do not change email/password, account ownership, adult confirmation, or managed-guest identity in this flow.
- Default name semantics: update the profile and the user's current memberships in active nights so other members see the new name after canonical refresh. New memberships use the updated profile. Preserve names in finished-night records and past log/audit/notification snapshots unless existing architecture explicitly treats a field as live profile data.
- Synchronize affected membership copies and invalidate/refetch the correct active-night snapshots. Handle concurrent saves and errors; don't announce success if only part of the intended update succeeded.
- Existing initials avatars should reflect the updated active display name. Keep pending data identified by stable IDs; a renamed user must not lose access to their queue.
- Add a short follow-up note for future editable avatars and reduced-motion-aware animation. Do not implement uploads, storage buckets, customization menus, assets, animation libraries, or speculative avatar infrastructure now.

Acceptance: rename in account settings, refresh, open an active night in two sessions, start/join a new night, and revisit a finished night. Each reflects the documented name policy. Direct attempts to rename another account fail at the server/database boundary.

## Database and cross-cutting implementation requirements

- Add forward migrations rather than rewriting migrations already applied to production. Follow the installed Supabase skill's migration workflow and inspect CLI help for available commands.
- For new notifications/preferences/subscriptions/check-in or schedule data, define foreign keys, indexes supporting actual queries, uniqueness/deduplication constraints, expiry/retention where appropriate, RLS, grants, and secure mutation functions.
- Recipient ownership and current-night membership are distinct checks. Background dispatch must use explicitly scoped server privileges and must not expose privileged credentials or push subscription secrets to other participants.
- Keep request-scoped authenticated clients, shared schema validation, and authoritative RPC decisions. Preserve existing idempotency, immutable historical drink values, and audit behavior.
- Generate database types from the validated local schema, update API/domain types and repository mapping, and keep frontend/backend changes compatible with the documented release sequence.
- Reuse Realtime invalidation plus canonical snapshots. Do not recreate database authorization or warning state machines independently in React. New notification subscriptions need cleanup and account/night scoping.
- Update demo/tour behavior using fictional local state only. Demo check-ins or notification permission controls must not send real requests or unexpectedly ask for system permission.
- Error messages should distinguish saved, pending locally, sent, and failed accurately. Network failures must not produce false success or delete recoverable data.

## Verification and delivery

Run targeted checks during each phase, then the appropriate existing suites once integration is complete:

```text
npm run typecheck
npm run lint
npm run test:unit
npm run test:db
npm run test:browser
npm run build
```

Check formatting for modified files using the existing formatter. Do not reformat unrelated files. Database/browser suites require the documented local environment; inspect `scripts/test-database.mjs` and `playwright.config.ts` before running them. Never run destructive resets or browser test writes against a hosted project.

Add meaningful coverage at the correct layer:

- Unit tests: aggregation/reconciliation, blank draft validation, time conversion and DST, reminder eligibility/deduplication, and outbox warning/confirmation transitions.
- Database tests: direct authorization attacks, membership/history separation, own-name changes, concurrent plan edits, idempotent check-ins, cooldowns, recipient isolation, and repeated notification generation/dispatch.
- Browser integration: complete first-time/water-only setup and reload; explicit drink selection; both warnings and double-tap confirmation; group breakdown updates across accounts; check-in receipt; participant history; name propagation; notification settings and unsupported/denied behavior.
- Browser engine coverage: the inspected `mobile` Playwright project uses iPhone 13 dimensions with Chromium, not WebKit. Add or run WebKit coverage for the mobile dialog/confirmation regressions and Chromium for Android-like behavior. Do not describe Chromium mobile emulation as testing Safari.
- Manual/device checklist: real iOS Safari/Home Screen and Android Chrome notification permission, service worker/push behavior, deep links, and app backgrounding where actual devices are available. If unavailable, mark these unverified and provide exact steps; do not fabricate device results.
- Include fault cases: response loss after commit, storage denied, auth expiry, refresh during confirmation, out-of-order Realtime updates, leave/end while a request is in flight, and overlapping notification workers.

Use local fixtures and test accounts. Keep tests proportional to behavior and risk; don't add tests that only mirror JSX or implementation details. Do not weaken existing assertions to hide regressions. If a baseline fails, determine whether your change caused it and report unrelated failures precisely.

Update relevant architecture, privacy/notification behavior, database/RLS, manual QA, and deployment documentation to match the delivered behavior. Document new environment variables, background job activation, migration order, and rollback/disable strategy for notification delivery. Keep push disabled until its required configuration exists, with a usable in-app fallback.

Suggested execution order: reproduce logging/refresh bugs; establish explicit plan draft state and timezone helpers; fix logging and plan editing; implement group breakdown, history, and profile update; build notification persistence and recipient rules; add check-ins, push delivery, and reminders; integrate and validate. Adjust this order when dependencies justify it.

Do not stop just because one optional external integration needs credentials. Complete all other changes and all locally possible integration work. Do not mark an item complete merely because its UI exists: its persistence, authorization, failure paths, and acceptance checks matter too.

Final response should be concise but reviewable:

1. Status for each of the eleven requests: implemented, partially implemented with exact remaining setup, or deferred avatars.
2. Confirmed root causes of the refresh and "Log anyway" bugs, distinguished from unverified hypotheses.
3. Important files/migrations and any deliberate product decisions, especially former-member history, notification recipients, timezone display, and name history.
4. Tests actually run and their results, with blocked or unverified checks clearly named.
5. Exact remaining release/configuration steps; do not claim production deployment or real-device push verification unless actually performed with authorization.

Deliver the working changes, not another implementation prompt.
