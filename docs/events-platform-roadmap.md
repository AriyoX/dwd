# DWD events expansion

Build around the existing public events page, Link Up gallery and organizer moderation tools. The initial product should help a small organizer publish an event and bring attendees back for shared memories.

## First release: discovery, RSVPs and memories

- Replace the hardcoded event card with event records: organizer, slug, title, cover, venue, city, timezone, start/end, capacity, visibility and publication status. Keep The Link Up's existing URL working.
- Add event details, free RSVP/cancellation, a waitlist and My events. Enforce capacity on the server in a transaction and make retries idempotent.
- Let organizers publish, cancel, update venue/time, view registrations and moderate photos. Reuse existing event roles and photo/report workflows, but scope every permission and photo to its event.
- Keep private drinking logs separate. An attendee can explicitly create or link their own private Night to an event; an RSVP never shares drink counts with organizers or other attendees.
- Launch with a few trusted organizers and include music, food, beach days and other social occasions. Measure published events, RSVP conversion, attendance, repeat organizers and useful post-event participation rather than drinks logged.

## Mobile integration

Add an Events tab with Upcoming, Saved and My events. The detail screen holds venue/directions, schedule, RSVP status and the shared album. Tonight can show the user's next event and an optional Start a night action.

Use the same backend and event identifiers on web and mobile. Put shared event types, validation and permissions in `@dwd/core`/`@dwd/contracts`, and event queries and mutations in `@dwd/data`. Use Expo Router screens for `/events/[slug]` and preserve that destination through sign-in. Reuse the existing notification and offline infrastructure instead of creating separate event accounts or queues.

Share ordinary HTTPS event URLs. Configure iOS Universal Links and Android App Links so an installed app opens the event; retain the web detail page as the fallback. Expo documents the linking options here: <https://docs.expo.dev/linking/overview/>. Confirm associations in installed builds on both platforms.

Cache public event details, the user's RSVP and album thumbnails. Queue RSVP changes with idempotency keys and show Pending until the server confirms. A cached RSVP is not proof of admission. Push reminders need explicit opt-in, event-level controls and timezone-aware scheduling. Use generic lock-screen copy and open the event when tapped.

## Second release: admission and organizer operations

Add rotating or revocable ticket tokens, QR check-in and staff permissions after RSVP demand is proven. Scan into a server-backed, idempotent check-in operation; support repeat-scan feedback, revoked tickets and an explicit offline reconciliation policy. Never use a sequential registration ID as a ticket secret.

At that point, evaluate paid physical-event tickets with a payment provider suited to the first launch market. Confirm currency support, settlement, fees, refunds and organizer payouts before committing to a provider. Payment confirmation must come from verified server webhooks. Validate current store payment requirements before building the purchase flow.

Offer organizer tools as the first paid product: branded event pages, registration exports with access controls, staff check-in and album moderation. Add ticket fees or clearly labeled sponsored discovery only after attendance and organizer retention justify them. Keep any attendee analytics aggregated and actual drink histories private.

## Data boundaries

Likely additions are `events`, `event_organizers`, `event_registrations`, `event_saves`, `event_updates` and later `event_tickets`/`event_checkins`. Inspect and extend the existing event/gallery schema before creating overlapping tables. Add an optional event reference to private Nights rather than making a public event itself a shared drinking Night.

Separate public published-event reads, a user's own registrations and organizer/staff operations with row-level policies and explicit authorization. Never publish attendee lists by default. Realtime can refresh a user's registration status or album after authorization; it does not replace server capacity checks. Supabase's reference is <https://supabase.com/docs/guides/realtime/postgres-changes>.

Ship in this order: event publishing and free RSVP, native discovery and deep links, reminders and albums, organizer operations and check-in, then paid tickets. Treat these as proposed work; this change does not implement the event platform.
