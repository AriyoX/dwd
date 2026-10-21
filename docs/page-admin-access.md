# Page-specific admin access

Open https://dwdug.vercel.app/events/admin to see the event dashboards available to your DWD account. Select **The Link Up** to open `/events/admin/the-link-up`. The Link Up uses ordinary DWD sign-in; you can also open https://dwdug.vercel.app/events/admin/the-link-up directly and sign in with the existing DWD password or Google sign-in for the approved account. The login preserves the dashboard destination. There is no separate event email-link flow.

Initial grants are for `shebatindy@gmail.com` and `ahumuzaariyo@gmail.com`, with equivalent permissions on `/events/admin/the-link-up`. Both accounts already existed with verified emails when checked. Migration `20261015200233_page_scoped_admin_access.sql` seeds those existing verified accounts once. It never recreates a removed grant on sign-in.

The original access system was applied and deployed on 15 October 2026; event grant paths were migrated on 21 October 2026. Both approved identities passed the production dashboard/API check. Normal password sign-in, denial of another account, exact-page isolation and live revocation were also verified using a disposable account, which was removed afterward. Each organizer should still confirm their own password or Google sign-in on their device before the event.

## Events admin portal and ZIP export

Migration `20261021165111_events_admin_portal.sql` moves existing event grants from `/events/<slug>/admin` to `/events/admin/<slug>` in place. User IDs, verified emails, roles, enabled states and creation times are preserved. It does not seed or restore any grants and does not modify photo rows, event settings or storage objects. A conflicting destination key aborts the migration instead of overwriting access.

The portal requires an explicit enabled `/events/admin` grant. Every event dashboard and protected API also requires its own enabled exact event grant. Portal membership grants no event access by itself, and an event grant cannot bypass missing or revoked portal membership. The portal lists only implemented dashboards the current account can access. Register a newly implemented dashboard in `apps/web/src/lib/events/admin-events.ts` so it appears in the portal.

The old `/events/the-link-up/admin` URL redirects to the new dashboard; the old confirmation URL preserves the new login destination. Existing API URLs continue to check the same migrated grant for rollout compatibility. New dashboard requests use `/api/events/admin/the-link-up/*`.

**Export photos (.zip)** downloads every published and hidden event photo, including photos beyond the first gallery page, even when the public gallery is closed. Visible photos go in `photos/`; hidden photos go in `hidden/`. Deleted photos, pending uploads and thumbnails are excluded. The export streams private storage reads, supports ZIP64 for large albums, and never deletes or changes photos. An unavailable file interrupts the download instead of silently producing an incomplete album; retry after the file is available. Photos uploaded after the export starts appear in the next export.

Both preparation and download recheck organizer access. Export errors appear in the dashboard during preparation; an interrupted transfer appears as a failed browser download. An already-started transfer can finish after access is revoked, as with existing short-lived download links.

## Change or remove access in Supabase

1. Open the [DWD Supabase Table Editor](https://supabase.com/dashboard/project/kdplbebaotvgcvjggacz/editor).
2. Select **public → page_admin_access**. Use `/events/admin` to manage portal membership, or `/events/admin/the-link-up` to manage that event.
3. Each row identifies its `user_id`, bound verified `email`, page, `role = admin` and `enabled` switch.
4. Set `enabled` to **false** to suspend that account, or delete the row to revoke its grant. Save the change. Re-enable an existing row to restore access.

The next protected server request checks the table again. A cached token or an editable user metadata tag cannot restore access. Revoking the portal row blocks all event dashboards, private APIs and ZIP export for that user. Revoking an event row removes only that event; other users are unaffected. An already open dashboard can remain visible until refreshed, but its protected operations are denied. Previously issued photo URLs retain their normal two-minute expiry.

Only trusted Supabase dashboard/SQL users and server credentials can manage this table. DWD users cannot read it or create their own grants. Do not use `user_metadata.admin`, a global Auth role or the old `photo_event_organizers` table to manage access; the old table is historical metadata only.

## Add or restore an explicit grant

The account must first exist and have a verified current email. For a new account, complete ordinary DWD signup and verification before granting access. Run this in the DWD SQL Editor to explicitly grant both portal membership and the selected event:

```sql
insert into public.page_admin_access(page_path, user_id, email, role, enabled)
select paths.page_path, id, lower(btrim(email)), 'admin', true
from auth.users
cross join (values ('/events/admin'), ('/events/admin/the-link-up')) as paths(page_path)
where lower(btrim(email)) = 'shebatindy@gmail.com'
  and email_confirmed_at is not null
  and deleted_at is null
  and (banned_until is null or banned_until <= now())
  and not coalesce(is_anonymous, false)
on conflict (page_path, user_id)
do update set email = excluded.email, role = 'admin', enabled = true;
```

Repeat with `ahumuzaariyo@gmail.com` only if explicitly restoring that user's grant. An affected-row count of zero means no eligible account matched. Never assume the grant was created without checking the row and testing the dashboard. Changing an account's verified email invalidates its existing bound grant; a trusted administrator must explicitly update it.

## Protect another page

Use a separate exact `page_path`, such as `/events/admin/another-event`. Add a row only for the users who should manage that page, using the same SQL pattern with the new path. Access is exact-match, with no wildcard or implicit inheritance.

The new page and **every** corresponding protected API/server action must use the same server-only guard:

```ts
import { requirePageAdmin } from '@/lib/auth/page-access';

await requirePageAdmin('/events/admin/another-event');
```

Adding a row alone does not secure a new route: its implementation must call this guard before reading private data or performing operations. Link Up already applies it to the dashboard and every `/api/events/admin/the-link-up/*` operation. Unauthorized API requests receive 401/403; unavailable authorization fails closed with 503. The guard validates the authenticated user with Supabase Auth and reads current verified identity and grant eligibility on every request. No user receives global DWD or Supabase admin privileges.

## Verify

- Both approved users sign into their own DWD account and load the Link Up dashboard.
- Another verified account receives HTTP 403 and the access-restricted screen at the portal and event dashboard, plus 403 from protected APIs.
- Disable only `/events/admin` while leaving the event row enabled: portal entry, direct event entry, legacy APIs and both ZIP stages are denied.
- A portal-only member sees no event cards without separate event grants.
- Sign out from either admin screen; the next protected request requires sign-in.
- Disable a test user's row; its next protected request receives 403, even in the same signed-in browser. Repeated sign-ins do not re-enable it.
- A user granted another admin-page path cannot manage Link Up unless separately granted its exact path.

Apply the migration before deploying the revised web app. Legacy checks normalize the old event admin path to the new exact grant, allowing a safe rollout with the same live revocation behavior.

## Initial 21 October 2026 release verification

The hosted migration preserved both existing organizers' identities, role, enabled state and original creation time. Each new exact path and its legacy equivalent authorizes the same account; another event remains denied. All 40 existing photo rows have the same full-row digest before and after the migration. A read-only export of the 31 published photos and one hidden photo produced a 19,234,458-byte ZIP that passed an independent CRC check. No photos or storage objects were deleted.

Relevant checks passed: 66 unit cases, 36 access-control SQL assertions, 32 photo workflow SQL assertions, existing dashboard/API browser checks, and the portal, revocation and ZIP download flows in desktop Chromium and mobile WebKit. The hosted security advisor introduced no new notices. The production build includes the canonical portal/dashboard/API routes and the legacy redirects.

Published to `https://dwdug.vercel.app` on 21 October 2026: [Vercel deployment](https://vercel.com/ariyoxs-projects/dwd/7ebC1mEdGFRe3s1cb5pvCZQVnTXY). Live checks confirmed both new admin pages preserve their login destinations, the old admin and confirmation URLs redirect correctly, new and legacy private APIs reject unauthenticated access, and the public gallery still serves its paginated album. The final hosted photo-row digest remained identical to the original snapshot.

## Portal UI and explicit membership follow-up

Migration `20261021171909_events_admin_portal_access.sql` creates portal memberships once from the enabled existing Link Up organizers and preserves any pre-existing portal row, including disabled rows. The database access helper requires portal membership for every event path, including legacy aliases, so older API deployments cannot bypass portal revocation. No photo rows, settings or storage objects are changed.

The portal shows event artwork, the event date, current visible/hidden photo counts and upload/gallery status. Shared navigation provides matching All events, View event, Go to DWD and Sign out controls. The current account email appears on authorized screens. Signed-out users retain their login destination; signed-in users without permission receive an HTTP 403 screen with account-switch and sign-out actions. Authorization failures never render the event list or photo controls.

Follow-up validation passed 68 targeted unit cases, 48 access-control SQL assertions, 32 photo workflow SQL assertions, and 14 desktop Chromium/mobile WebKit browser cases. These cover independent portal/event permissions, true HTTP 403 responses, legacy API and ZIP denial after portal revocation, and sign-out from both screens. Hosted checks confirmed both existing organizers have portal and event grants, no new security-advisor notices, and the identical 40-row photo digest.
