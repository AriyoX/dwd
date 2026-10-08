# Content review and blocking

DWD is an adult planning/tracking app with private shared-night content. The legal terms prohibit threats, exploitation, harassment, unlawful content and unsafe drinking challenges. Users can report night content, participants and photos; reports enter the existing authenticated support queue. Contact is also available without signing in at `/support`. Blocking removes the blocked participant from a host's active nights, or leaves shared active nights when the blocker is a participant. Future joins/reactivation across a blocked pair are refused on the server. Unblocking is under Settings → Blocked people on mobile and Account → Blocked people on web, and does not rejoin a night automatically.

Shared text has a narrow server filter for explicit threats/exploitation. This is not comprehensive automated moderation. Review the report queue regularly and act promptly; an unattended queue is a release blocker. Assign a named operator and a response cadence before opening registration broadly. Ariyo Ahumuza / ahumuzaariyo@gmail.com is the current contact, supplied by the owner and intended to be replaced later.

## Blocking verification and store requirements

Verified on 2026-10-08:

- All 26 checks in `supabase/tests/store_moderation_and_location.sql` passed against an isolated database with the repository migrations. These cover blocking as a host or participant, blocking privacy, refused joins/reactivation, unblocking, and photo visibility.
- `tests/e2e/blocking.spec.ts` exercises the actual web controls on desktop Chromium, mobile Chromium, and mobile WebKit against a disposable local Supabase backend. It checks cancellation, confirmed blocking, persistence after reload, a private blocked list, refused access/rejoining, and unblocking without automatic rejoining.
- A read-only migration/schema inspection of the linked DWD backend confirmed that the blocking RPCs and `night_members_blocked_join` trigger are deployed. No production accounts were blocked as part of verification.

Blocking is already implemented; the dedicated mobile page exposes the existing server-backed list and unblock action. Browser automation covers web, while database tests cover the rules shared by both clients. This verification does not substitute for testing an installed iOS/Android release.

[Apple App Review Guideline 1.2](https://developer.apple.com/app-store/review/guidelines/#user-generated-content) requires apps with user-generated content or social networking to filter objectionable material, provide reporting with timely responses, block abusive users, and publish contact information. [Google Play's user-generated content policy](https://support.google.com/googleplay/android-developer/answer/9876937) requires ongoing moderation and in-app reporting/blocking appropriate to the interactions; one-to-one interactions specifically require user blocking. Its definition of UGC includes content visible to a subset of users.

DWD's shared names, night titles, and photos are user-generated content, so private nights do not remove the need for moderation. Keep functional blocking for DWD's user-to-user interactions. Neither policy specifies a dedicated blocked-list page; the effective ability to block matters. Blocking alone does not establish compliance with the other moderation requirements or guarantee approval.

## Photos

New and existing photos require human approval before anyone except the uploader can view them. Ordinary authenticated users have no approval privilege. Blocking also hides the other person's photos. Existing signed URLs remain usable until their short 60-second expiry; deleting metadata does not revoke an already-issued URL instantly.

In the dedicated DWD Supabase dashboard, inspect pending metadata as an operator:

```sql
select id, night_id, uploaded_by_user_id, object_path, created_at
from public.night_photos
where deleted_at is null and moderation_status = 'pending'
order by created_at;
```

Use the private Storage dashboard to view the corresponding object. Do not make the bucket public or circulate its URLs. Approve only after reviewing the actual image and the applicable terms. Replace the example UUID below with the reviewed photo ID:

```sql
update public.night_photos
set moderation_status = 'approved'
where id = '00000000-0000-4000-8000-000000000000'
  and deleted_at is null and moderation_status = 'pending';
```

Use `rejected` instead of `approved` for an inappropriate image. Record the reason and action in the corresponding private support report/operator record. For approved content reported later, change it to `rejected` immediately while reviewing. For unlawful content, preserve only what law requires and remove the actual object through Storage; deleting only SQL metadata does not erase the file. Rejecting a photo keeps it accessible to its uploader, who can remove it to free a quota slot. Operator dashboard review is currently required; an operator console, moderation audit records and automatic queue alerts are future work.

## Reports

Use the queue and status/reply procedure in [support operations](support-operations.md). Photo/participant references are validated against the reporter's own night. Replies must not expose another account's private details. Report delivery is an in-app queue operation, not an automatic email. Use the public contact for urgent privacy/support requests. DWD does not monitor emergencies; users must contact local emergency services.
