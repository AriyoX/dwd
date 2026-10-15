# Page-specific admin access

The Link Up uses ordinary DWD sign-in. Open https://dwdug.vercel.app/events/the-link-up/admin and sign in with the existing DWD password or Google sign-in for the approved account. The login preserves the dashboard destination. There is no separate event email-link flow.

Initial grants are for `shebatindy@gmail.com` and `ahumuzaariyo@gmail.com`, with equivalent permissions on `/events/the-link-up/admin`. Both accounts already existed with verified emails when checked. Migration `20261015200233_page_scoped_admin_access.sql` seeds those existing verified accounts once. It never recreates a removed grant on sign-in.

## Change or remove access in Supabase

1. Open the [DWD Supabase Table Editor](https://supabase.com/dashboard/project/kdplbebaotvgcvjggacz/editor).
2. Select **public → page_admin_access** and filter `page_path` to `/events/the-link-up/admin`.
3. Each row identifies its `user_id`, bound verified `email`, page, `role = admin` and `enabled` switch.
4. Set `enabled` to **false** to suspend that account, or delete the row to revoke its grant. Save the change. Re-enable an existing row to restore access.

The next protected server request checks the table again. A cached token or an editable user metadata tag cannot restore access. Revoking one row leaves other users and pages unaffected. An already open dashboard can remain visible until refreshed, but its protected operations are denied. Previously issued photo URLs retain their normal two-minute expiry.

Only trusted Supabase dashboard/SQL users and server credentials can manage this table. DWD users cannot read it or create their own grants. Do not use `user_metadata.admin`, a global Auth role or the old `photo_event_organizers` table to manage access; the old table is historical metadata only.

## Add or restore an explicit grant

The account must first exist and have a verified current email. For a new account, complete ordinary DWD signup and verification before granting access. Run this in the DWD SQL Editor with the intended email and exact admin-page path:

```sql
insert into public.page_admin_access(page_path, user_id, email, role, enabled)
select '/events/the-link-up/admin', id, lower(btrim(email)), 'admin', true
from auth.users
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

Use a separate exact `page_path`, such as `/events/another-event/admin`. Add a row only for the users who should manage that page, using the same SQL pattern with the new path. Access is exact-match, with no wildcard or implicit inheritance.

The new page and **every** corresponding protected API/server action must use the same server-only guard:

```ts
import { requirePageAdmin } from '@/lib/auth/page-access';

await requirePageAdmin('/events/another-event/admin');
```

Adding a row alone does not secure a new route: its implementation must call this guard before reading private data or performing operations. Link Up already applies it to the dashboard and every `/api/events/the-link-up/admin/*` operation. Unauthorized API requests receive 401/403; unavailable authorization fails closed with 503. The guard validates the authenticated user with Supabase Auth and reads current verified identity and grant eligibility on every request. No user receives global DWD or Supabase admin privileges.

## Verify

- Both approved users sign into their own DWD account and load the Link Up dashboard.
- Another verified account receives an access-denied page and 403 from protected APIs.
- Disable a test user's row; its next protected request receives 403, even in the same signed-in browser. Repeated sign-ins do not re-enable it.
- A user granted another admin-page path cannot manage Link Up unless separately granted its exact path.

Apply the new migration before deploying the revised web app. The previous deployment's legacy organizer RPC is made read-only and consults these same grants, allowing a safe rollout.
