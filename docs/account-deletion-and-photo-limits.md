# Account deletion and photo limits

The account screen schedules automatic deletion 30 days later and signs the user out. A fresh password, Google, or email-link login cancels a pending deletion. Session refresh does not restart the countdown. Repeated scheduling preserves the original deadline; an explicit cancellation is also available to an existing signed-in session.

The hourly `delete-accounts` worker claims due accounts, revokes refresh sessions, removes actual files through the Storage API, and then deletes Auth users and their profiles. Cleanup must succeed before the account can be deleted. Failed claims become eligible for retry after 15 minutes; stale worker tokens cannot complete a newer claim. Once cleanup starts, login and cancellation are blocked to prevent partial deletion followed by account recovery.

Shared nights and entries remain. A departing host's active nights are closed and their host reference is cleared. Account memberships are anonymized as `Deleted user`, managed guests as `Deleted guest`, and actor references are cleared. Private account messages, preferences, subscriptions and notifications cascade with the profile. The user's uploaded photos are removed, including unregistered uploads and photos whose gallery metadata was previously deleted. Browser drafts/outbox records remain device-managed. Previous support deletion requests remain historical messages and do not schedule deletion automatically.

Each person can keep two photos per night, with a maximum saved size of 5 MiB (shown as 5 MB). Browsers resize photos to a maximum edge of 1920 pixels, then try lower JPEG quality and smaller dimensions if needed. Images that still exceed 5 MiB after these attempts are rejected before upload. Decoded images over 40 megapixels are rejected. The Storage bucket enforces size; upload policies and database triggers serialize quota checks, including concurrent tabs and direct API calls. RPC registration verifies the actual object size and MIME type. Removing a photo frees a slot. Existing photos are preserved, including photos that exceed the new limits.

## Release

1. Apply `20260930180005_account_deletion_and_photo_limits.sql` and `20260930191354_five_mb_memory_photos.sql`, in that order, to the dedicated DWD backend using the migration release process in [deployment.md](deployment.md). Run them with the migration owner's privileges.
2. Deploy `supabase/functions/delete-accounts` with JWT verification disabled (the handler checks its own secret).
3. Generate a random secret of at least 32 characters. Set it as the Edge Function secret `DWD_ACCOUNT_DELETION_SECRET` and as the Vault secret `dwd_deletion_secret`. Set Vault `dwd_deletion_url` to the dedicated backend's `/functions/v1/delete-accounts` URL. Never put this secret in browser environment variables.
4. Run [enable-account-deletion-scheduler.sql](../supabase/operations/enable-account-deletion-scheduler.sql) as the database operator. It validates configuration and installs `dwd-delete-accounts` hourly. Deletion starts on the next worker run after the deadline.
5. Release the web application after the schema and worker are ready. Vercel builds do not apply migrations or enable jobs.

Monitor `public.account_deletions` for overdue pending or processing rows, the Edge Function logs, and `cron.job_run_details`. Missing worker configuration prevents dispatch. Failed Storage removal preserves the Auth account for retry; investigate persistent failures before altering processing state.

## Verification

`npm run test:db` applies all migrations to an isolated Postgres database and covers the countdown, login cancellation, permissions, deletion claims, Storage ordering, host/guest anonymization and photo quotas. `deno test supabase/functions/delete-accounts/handler_test.ts` covers worker authorization, cleanup ordering and retry behavior. `image-upload.test.ts` covers quality and dimension reductions, the exact size boundary, encoder failures and rejection after unsuccessful compression. The local Playwright suite `account-deletion-and-photo-limits.spec.ts` verifies scheduling/sign-out/login cancellation, actual concurrent Storage uploads, the 5 MB boundary, real object removal and Auth deletion. It also uploads a large photo through the browser and checks that failed compression creates no stored object. It rejects hosted backends and uses fictional fixture accounts only.
