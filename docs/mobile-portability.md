# Mobile portability

`apps/mobile` now contains an iOS-first Expo and React Native foundation. It keeps the web app and all shared packages in place. See [mobile-ios-baseline.md](mobile-ios-baseline.md) for the app structure, local setup, and Live Activities research.

## Reusable without restructuring

- The dedicated Supabase Auth users and cookie-independent database identity model
- Tables, constraints, indexes, RLS, Realtime publication, RPCs, and audit behavior
- `@dwd/core`: domain/API/database/Realtime types, Zod schemas, presets, alcohol calculations, plan rules, warning rules, time behavior, and permissions
- `@dwd/contracts`: repository, pending storage, notifications, sharing/visibility, and Realtime boundaries where useful
- `@dwd/data`: injected-client Supabase queries and RPC calls

RLS authorizes `auth.uid()` and database membership, not Next.js, cookies, HTML routes, or user metadata. The native baseline uses the same Supabase project and typed database model; joining and starting nights will use the existing RPCs as those screens are implemented.

## Must be rebuilt for native

- All routes, screens, dialogs, bottom sheets, HTML controls, CSS/Tailwind styling, and accessibility implementation
- Auth onboarding, password recovery, and auth deep-link return handling
- Browser `localStorage` outbox adapter
- Browser online/focus/visibility lifecycle
- Web Share and clipboard integration
- Notification API and vibration integration
- Service-worker Web Push registration and account-scoped subscription cleanup. On iOS/iPadOS, browser push requires a Home Screen web app on supported versions; a native app would use the platform notification service instead.
- Cookie-backed SSR clients and Next.js proxy/session refresh
- Vercel deployment configuration

The native app uses React Native components rather than attempting to make the web UI universal.

## Current mobile layout

```text
apps/mobile/
  app/                  Expo Router screens and iOS tab shell
  src/lib/supabase.ts   Typed client and SQLite-backed session persistence
  src/providers/        Auth-session lifecycle
  src/theme/            Native design tokens
```

The Expo client consumes the existing three shared packages and injects its normal typed `@supabase/supabase-js` client into `@dwd/data`. Session persistence uses Expo SQLite's localStorage adapter. Platform-specific adapters for the offline outbox, notifications, sharing, and Realtime lifecycle will be added alongside the corresponding features, not as empty placeholders.

## Compatibility sequence

1. Keep the mobile and web clients on the same generated database type revision.
2. Reuse shared schemas before sending commands.
3. Send all alcohol, water, plan, invite, guest, extension, and ending mutations through the same constrained RPCs.
4. Subscribe to the same RLS-protected Realtime tables, then invalidate/refetch the canonical snapshot.
5. Use the same actor-scoped idempotency UUID and outbox states.
6. Preserve the browser product’s rule that account users control only themselves and hosts control only their managed guests.

The baseline requires no movement of the existing web app or shared packages and no database fork.

The web handoff does not add an avatar editor. Future editable avatars should define ownership, safe asset handling, and reduced-motion behavior before a native or web implementation is started.
