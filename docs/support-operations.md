# Feedback and deletion requests

Authenticated users submit reports at `/feedback` and deletion requests at `/account`. Requests receive a UUID reference and appear in that user's account with a status and optional operator reply. No email is sent, no public issue is created, and no diagnostics are attached. SMTP is unrelated to this queue.

The app operator reviews `public.support_requests` using the **dedicated DWD Supabase project** (`kdplbebaotvgcvjggacz`) with dashboard/operator privileges. Ordinary accounts can read only their own requests and submit through a constrained RPC; they cannot change ownership, status, or responses. Requests are idempotent and limited to ten new requests per account in a rolling 24-hour period; an account can have one open deletion request.

In the Supabase SQL editor, inspect the queue:

```sql
select id, user_id, kind, message, status, response, created_at
from public.support_requests
where status <> 'completed'
order by created_at;
```

After selecting a particular request, update its `status` to `in_review`, and put a factual user-facing reply in `response`. Supported statuses are `pending`, `in_review`, and `completed`. Do not put credentials or other users' private information in a reply. The user sees updates on refreshing `/account`; the app does not notify them by email. Monitor this queue as an operational task; no automated responder or response-time promise is implemented.

## Deletion review

Submitting a deletion request changes no account, shared-night, or pending-log data. This is intentional: nights and immutable audit/log records reference account identifiers and contain contributions from multiple people. A generic Auth user deletion could fail on references or damage shared records.

For each request, verify the requesting account, identify its profile, memberships, hosted nights, managed guests, authored entries, audit references, and support requests. Review what may be removed or anonymised and how to preserve other participants' records. Communicate the proposed handling and any information required through the request. Implement any necessary anonymisation/schema change as a separately reviewed operation; this release does not claim automatic deletion.

Before any approved Auth deletion, revoke sessions and account access and account for already issued access tokens. Do not assume deleting an Auth row alone invalidates its JWTs. Record exactly what was removed, anonymised, or retained in the response; mark `completed` only after the agreed operation is actually complete. No legal approval, retention schedule, contact address, or deletion deadline is implied by this flow.

Users manage browser-held data separately: discard unfinished setup, review/remove queued entries on each night or summary, and reset demo data from `/account` or `/demo`. Demo reset only affects the dedicated `dwd-demo:v1` key; it never clears all browser storage or the real outbox.
