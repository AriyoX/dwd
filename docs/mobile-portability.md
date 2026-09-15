# Future mobile portability

No mobile application exists in this repository. There is intentionally no Expo workspace, React Native dependency, native directory, Expo Router, AsyncStorage, SecureStore, NativeWind, mobile notification code, or native deep-link configuration.

## Reusable without restructuring

- The dedicated Supabase Auth users and cookie-independent database identity model
- Tables, constraints, indexes, RLS, Realtime publication, RPCs, and audit behavior
- `@dwd/core`: domain/API/database/Realtime types, Zod schemas, presets, alcohol calculations, plan rules, warning rules, time behavior, and permissions
- `@dwd/contracts`: repository, pending storage, notifications, sharing/visibility, and Realtime boundaries where useful
- `@dwd/data`: injected-client Supabase queries and RPC calls

RLS authorizes `auth.uid()` and database membership, not Next.js, cookies, HTML routes, or user metadata. The same Supabase user can therefore join the same night from web and a future native client.

## Must be rebuilt for native

- All routes, screens, dialogs, bottom sheets, HTML controls, CSS/Tailwind styling, and accessibility implementation
- Session persistence and deep-link return handling
- Browser `localStorage` outbox adapter
- Browser online/focus/visibility lifecycle
- Web Share and clipboard integration
- Notification API and vibration integration
- Service-worker Web Push registration and account-scoped subscription cleanup. On iOS/iPadOS, browser push requires a Home Screen web app on supported versions; a native app would use the platform notification service instead.
- Cookie-backed SSR clients and Next.js proxy/session refresh
- Vercel deployment configuration

The future app should use React Native components rather than attempting to make the web UI universal.

## Possible future layout

Only when mobile work is authorized, add:

```text
apps/mobile/
  app/ or src/
  adapters/
    pending-log-store.native.ts
    notifications.native.ts
    share-service.native.ts
  lib/supabase.ts
```

The Expo client would install the existing three shared packages and create a normal `@supabase/supabase-js` client with a native session storage adapter. `packages/data` already accepts that injected client. Native adapters would implement the contracts currently used by the browser; they should not be added as empty placeholders now.

## Compatibility sequence

1. Keep the mobile and web clients on the same generated database type revision.
2. Reuse shared schemas before sending commands.
3. Send all alcohol, water, plan, invite, guest, extension, and ending mutations through the same constrained RPCs.
4. Subscribe to the same RLS-protected Realtime tables, then invalidate/refetch the canonical snapshot.
5. Use the same actor-scoped idempotency UUID and outbox states.
6. Preserve the browser product’s rule that account users control only themselves and hosts control only their managed guests.

Adding `apps/mobile` later requires no movement of the existing web app or shared packages and no database fork.

The web handoff does not add an avatar editor. Future editable avatars should define ownership, safe asset handling, and reduced-motion behavior before a native or web implementation is started.
