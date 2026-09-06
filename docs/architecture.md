# Architecture

## Assumptions recorded before implementation

- “Mobile-first” means a narrow, one-handed mobile browser interface. This iteration contains no native or React Native code.
- A cocktail preset is an editable estimate of 200 ml at 15% ABV and is clearly marked as estimated.
- A client may preview plan/end warnings for responsiveness, but the `log_drink` RPC is the sole authority and may require additional confirmation.
- Delayed activity older than seven days is obviously stale and rejected; the stricter 24-hour post-end grace still controls ended nights.
- Removed guests and members who leave remain in snapshots for historical summaries, while a user who left loses all night read access.
- Invite rate limiting is best-effort in process for the MVP; token entropy, SHA-256 hashing, generic errors, expiry, revocation, and transactional use counting remain the primary controls.

## Boundaries

`apps/web` owns HTML, React, Next.js routing, SSR cookies, Server Actions, browser storage, browser visibility/connectivity, sharing, notifications, and Realtime subscription lifecycle. Page files fetch or redirect and hand work to feature components.

`packages/core` is pure TypeScript. It owns alcohol math, plan math, rolling-window warnings, time classification, permission decisions, limits, presets, Zod schemas, and domain/API/database types. It imports no React, Next.js, Supabase, browser global, cookie API, or Node-only module.

`packages/contracts` defines only boundaries that the web application currently implements: pending-log storage, drink-log repositories, Realtime subscriptions, notifications, sharing, and visibility.

`packages/data` is Supabase-specific but Next.js-independent. Every function accepts an injected typed `SupabaseClient`; it never creates cookies, redirects, imports React, or reads browser globals.

Dependencies flow in one direction:

```text
apps/web ───────► packages/data ───────► packages/contracts
    │                    │                        │
    └────────────────────┴────────────────────────► packages/core
```

No shared package imports from the web application.

## Canonical data flow

1. A server route or Server Action validates authentication with `getClaims()` and validates input with a shared Zod schema.
2. The action calls a `packages/data` function with its request-scoped Supabase client.
3. Critical changes run through a small constrained Postgres RPC.
4. The RPC derives `auth.uid()`, membership, target ownership, snapshots, ethanol, plan state, applicable end time, and alerts. Browser-calculated ownership or ethanol is ignored.
5. The UI replaces its state with `get_night_snapshot`, the canonical aggregate.

The transactional `start_night_out` RPC creates the active night, host membership, host plan, managed guests, guest plans, and audit rows. A host-scoped creation UUID makes retries idempotent. Only after that transaction succeeds does the server generate and persist a hashed invitation.

## Invitation flow

An invite contains 32 random bytes encoded with URL-safe base64. The raw token appears only in `/join/[token]` and the one-time returned share URL. Postgres stores only its SHA-256 hexadecimal hash.

Preview is a tightly constrained anonymous RPC returning the night title, host display name, and planned times. Redemption requires authentication, locks the invite and night, rejects ended/expired/revoked/full invites, inserts an account membership idempotently, and increments `use_count` only for the first membership. A prior member can reactivate without consuming a second use. The returned `needsPlan` flag opens the invitee’s own plan setup; no host plan is copied.

## Ownership model

An account membership represents its user. That user alone versions its plan and logs or corrects its activity. Hosting a night adds control over shared lifecycle and host-managed guests, not over other account participants.

A managed guest has no account user ID and must point to the night host through `managed_by_user_id`. The host acts as that guest’s sole manager. This is intentionally different from delegated account access: other account participants remain read-only observers of the guest card.

The UI hides unavailable controls, pure permission functions document expected behavior, table privileges deny loose mutation, RLS protects reads, and every RPC independently rechecks authorization.

## Realtime

Each active-night browser subscribes to `nights`, `night_members`, `drink_logs`, `water_logs`, and `night_alerts` by their actual `night_id` columns. Plan items subscribe by `night_member_id`; the implementation does not pretend that the table has `night_id`.

Events only invalidate. After a 250 ms debounce the client refetches `get_night_snapshot`; it does not reproduce database transitions in React. The provider unsubscribes when the night changes or unmounts, reconnects after connectivity changes, and refetches on focus/visibility/online events. A visible `Connected`, `Reconnecting`, or `Offline` state communicates the browser condition. Realtime is never the sole correctness path.

Soft-deleted rows become invisible under their select policies, so the correction RPC also touches the parent night. That visible Realtime event forces other members to refetch and observe the correction.

## Offline outbox

The browser adapter stores small pending activity records in `localStorage` behind `PendingLogStore`. Every record contains an actor ID, night/member display context, idempotency UUID, consumed time, plan-version reference or custom drink, local state, retry count, and warning acknowledgements. Actor and night filters prevent a subsequent account in the same browser from replaying or viewing another account’s pending queue.

The interface writes to the outbox before transmission, renders the pending copy, and calls the same secure RPC used online. Canonical and optimistic copies reconcile by `idempotencyKey`. Success or duplicate removes the pending row; temporary failure remains retryable; permanent rejection stops automatic retry; a newly discovered warning becomes `needs_confirmation`.

Retries occur on active-night load, online, focus, and visibility restoration. Pending undo removes the local row; a synchronization race repeats the idempotent operation to resolve the canonical ID and then soft-deletes it. Ended-night summaries keep the outbox available for the defined 24-hour grace and show explicit combined warning review.

## Planned end and notifications

The browser runs a live countdown and in-app overdue dialog. A granted Notification API permission and vibration are opportunistic enhancements while browser support permits. The app makes no claim that a normal notification will fire after the browser is fully closed.

Reaching `ends_at` does not mutate status. Only the host can prospectively extend or irreversibly end. Extension rows are immutable and `applicable_end_at` considers only rows effective on or before `consumed_at`, so later extensions cannot reclassify older activity.

## Security posture

- No service/secret key is required by the product path.
- Content Security Policy, frame denial, MIME sniffing prevention, a restrictive permissions policy, and HTTPS deployment assumptions are configured.
- Participant text is rendered as React text; `dangerouslySetInnerHTML` is absent.
- Raw invites, audit rows, access tokens, passwords, email addresses, and secrets are not exposed to night participants or application logs.
- All exposed tables have RLS. Browser roles receive read-only table grants, except a user’s constrained profile display-name update.
- SECURITY DEFINER functions use `search_path = ''`, schema-qualified objects, explicit `auth.uid()` checks, and narrowed execute grants.

## Package use by a future mobile client

An Expo app can consume `core`, `contracts`, and `data`, plus the same Supabase schema/RPC/RLS backend. It must build a native UI and native implementations for storage, visibility, sharing, notifications, deep links, and session persistence. See [mobile-portability.md](mobile-portability.md).
