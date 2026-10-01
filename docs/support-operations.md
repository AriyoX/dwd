# Feedback and account deletion

Authenticated users submit reports at `/feedback`. Reports receive a UUID reference and appear in that user's account with a status and optional operator reply. Account deletion at `/account` uses a separate automatic 30-day countdown; see [account deletion and photo limits](account-deletion-and-photo-limits.md). No email is sent, no public issue is created, and no diagnostics are attached. SMTP is unrelated to this queue.

The app operator reviews `public.support_requests` using the **dedicated DWD Supabase project** (`kdplbebaotvgcvjggacz`) with dashboard/operator privileges. Ordinary accounts can read only their own requests and submit through a constrained RPC; they cannot change ownership, status, or responses. Requests are idempotent and limited to ten new requests per account in a rolling 24-hour period; an account can have one open deletion request.

In the Supabase SQL editor, inspect the queue:

```sql
select id, user_id, kind, message, status, response, created_at
from public.support_requests
where status <> 'completed'
order by created_at;
```

After selecting a particular request, update its `status` to `in_review`, and put a factual user-facing reply in `response`. Supported statuses are `pending`, `in_review`, and `completed`. Do not put credentials or other users' private information in a reply. The user sees updates on refreshing `/account`; the app does not notify them by email. Monitor this queue as an operational task; no automated responder or response-time promise is implemented.

## Legacy deletion requests

Existing support requests with kind `deletion` remain historical messages. They do not create an automatic countdown. Reply with the new account deletion flow and resolve the support request separately. New deletion schedules need no operator review.

The automatic worker handles shared-night records, host ownership and photo removal. Direct deletion of an unprepared host remains blocked. Monitor failures through the worker and scheduler described in the release guide.

Users manage browser-held data separately: discard unfinished setup, review/remove queued entries on each night or summary, and reset demo data from `/account` or `/demo`. Demo reset only affects the dedicated `dwd-demo:v1` key; it never clears all browser storage or the real outbox.
