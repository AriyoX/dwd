# The Link Up — Phase 2 handover

Event: Saturday, 17 October 2026. Public entry point: https://dwdug.vercel.app/events/the-link-up. Organizer entry point: https://dwdug.vercel.app/events/the-link-up/admin.

## Implementation

The existing landing page, wordmark, tropical artwork, forest green/ivory/gold styling and guest Quick Log link are preserved. Upload Photos opens a focused panel; View Gallery opens the shared album on the same page. There is no events hub or connection between photo sessions and drink records.

Guests select up to ten JPEG, PNG, WebP or HEIC/HEIF files. Preparation runs sequentially to limit phone memory use, preserves orientation, draws to a canvas, strips metadata and produces JPEGs with a 2048px maximum edge. Compression targets approximately 1 MiB and enforces a 2 MiB ceiling. HEIC uses the browser decoder first, then loads `heic-to/csp` only if necessary. An unsupported/corrupt image receives an explanation. Raw inputs above 50 MiB or 60 megapixels are rejected to protect phone memory.

The panel previews prepared photos and shows preparation, percentage upload progress, verification, publication and individual errors. Three workers perform uploads; Web Locks coordinate these slots across tabs where supported. Prepared blobs and reservation identifiers are saved in a separate IndexedDB database. Refreshing the browser restores retryable drafts. Successful files are removed from local blob storage, remain published if another file fails, and are reconciled from the server after a lost completion response. Clearing a batch cancels its pending reservations. If browser storage is unavailable, the panel explicitly asks the guest to keep it open.

Each guest uses an event-specific cryptographic UUID in a signed, HttpOnly, SameSite=Strict cookie, secure on production HTTPS. It lasts 90 days and is scoped to the photo API. It does not create a Supabase account or share Quick Log storage.

### Upload lifecycle and security

1. The server creates/resumes the browser session and checks rate limits.
2. New batches require a server-validated Turnstile token, matching action `link-up-upload` and the requesting hostname. Production configuration failures stop authorization. Identical previously authorized batches can be recovered without replaying a single-use token.
3. A Supabase transaction locks the event row, checks upload status and session/storage capacity, and reserves the entire batch atomically. The batch/client identifiers and SHA-256 fingerprints make authorization recovery safe.
4. Each worker requests an object-specific, Content-Type-bound PUT URL immediately before sending its processed blob directly to R2. URLs last five minutes. Retries renew URLs, bounded to twelve issuances per reservation, within its one-hour lifetime.
5. Completion takes a three-minute verification lease. The backend checks R2 HEAD metadata, reads a bounded body, checks its size and fingerprint, and uses Sharp to decode and independently re-encode it. Unsupported, corrupt, animated or excessive-dimension staged images are rejected.
6. Sanitized JPEG and thumbnail objects are written under separate `published/the-link-up/…` keys. Guest PUT URLs only address `temporary/the-link-up/…` keys. A transaction publishes metadata, replaces the reservation with actual image-plus-thumbnail usage and increments the browser's lifetime publication count exactly once.
7. The staged object is removed. A durable outbox removes it again after its last PUT URL expires, preventing a replay from leaving a permanent temporary object.

The server may read staged objects through Vercel for validation; the initial image upload body bypasses Vercel. PUT URLs are not treated as a file-size guarantee. Only verified output is published. Logical quotas include pending maximum-size image/thumbnail reservations; physical staging can temporarily differ from logical usage until verification and cleanup.

### Gallery and management

The public API returns only published, visible photos and no anonymous session identifiers or private R2 keys. It uses newest-first keyset pagination, 24 items per page, lazy thumbnails, a full-screen viewer, previous/next navigation within loaded pages, individual JPEG downloads, refresh and reports. Image URLs expire after two minutes; visible images renew through an endpoint that rechecks moderation and gallery visibility. Downloads are explicitly optimized event photos, not original-resolution files.

Reports support inappropriate content, privacy/removal requests and other concerns. The dashboard shows photo counts, uploading-browser counts, pending uploads, reports, recent technical errors, used/reserved storage and event switches. Both organizers can hide, restore or permanently delete a photo, review reports, pause uploads, close the gallery and run cleanup. Permanent deletion requires confirmation. Storage is freed only after R2 deletion succeeds. A failed deletion remains hidden and retries through the durable outbox.

Hiding or closing the gallery stops new public responses/viewing URLs immediately. Previously issued URLs can work for up to two minutes. Deleting the underlying object invalidates those URLs as soon as R2 confirms removal. Upload pauses stop new batches and PUT renewals; already staged files may complete verification.

## Files

- `apps/web/src/lib/link-up/`: server-only sessions, configuration, typed Supabase access, rate limiting, Turnstile, R2 signing/streaming, Sharp normalization, organizer authorization and lifecycle services.
- `apps/web/src/app/api/events/the-link-up/[...path]/route.ts`: public photo/session/report routes, protected organizer routes and authenticated cleanup.
- `apps/web/src/features/events/photo-*`, `prepare-event-photo.ts`: upload, recovery, gallery, viewer and organizer UI; `photo-sharing.module.css` contains matching styles.
- `apps/web/src/lib/auth/page-access.ts`, `lib/supabase/service.ts`: reusable server-side page authorization and privileged client. See `docs/page-admin-access.md` for permission management.
- Existing event page/memories/CSS: activate the two existing actions and set safe-area viewport behavior.
- `apps/web/src/app/events/the-link-up/admin/`: protected dashboard and a legacy callback redirect to ordinary DWD login.
- `apps/web/next.config.ts`: event-only R2/Turnstile/HEIC CSP. Other application pages retain their existing policy.
- `apps/web/package.json`, `package-lock.json`: pinned S3 SDK, presigner, Sharp and on-demand HEIC decoder.
- `apps/web/vercel.json`: daily cleanup at 03:00 UTC; `.vercelignore`: excludes local caches, environment files, native build artifacts and the user-created temporary CORS file.
- `.env.example`, `scripts/check-deployment.mjs`: required configuration and deployment validation.
- `scripts/setup-link-up-local.mjs`, `scripts/configure-link-up-r2.mjs`, `docs/link-up-r2-cors.json`: local secret generation and bucket setup helpers.
- `tests/link-up-photos.test.ts`, `supabase/tests/event_photos.sql`, `supabase/tests/event_photo_concurrency.sql`, `supabase/tests/page_admin_access.sql`: focused verification.

The user-created `apps/web/cors-policy.txt` was read and left unchanged. It is excluded from deployment.

## Migrations and quotas

These migrations were applied to the linked DWD project `kdplbebaotvgcvjggacz` on 15 October 2026:

1. `supabase/migrations/20261015185306_link_up_photo_sharing.sql`
2. `supabase/migrations/20261015192125_link_up_cancel_uploads.sql`
3. `supabase/migrations/20261015200233_page_scoped_admin_access.sql`

They add the event, guest sessions, photos, reservations, reports, organizers, rate-limit counters, deletion outbox and atomic RPCs. RLS is enabled on all new tables. Browser roles have no table or privileged RPC grants. Public wrappers use SECURITY INVOKER; one private, narrowly restricted helper reads current `auth.users` eligibility without granting service_role broad access to that table.

On another checkout, link the dedicated DWD project and apply the checked-in migrations:

```powershell
supabase link --project-ref kdplbebaotvgcvjggacz
supabase db push --dry-run
supabase db push
```

Initial limits: 25 lifetime publications per browser session; ten per batch; 2 MiB per final image; 128 KiB per thumbnail; 5 GiB logical event capacity (5,368,709,120 bytes). Each pending photo reserves 2,228,224 bytes. Limits reside on `public.photo_events`; changes must respect existing usage and constraints. Deleted photos do not restore a session's lifetime publication quota.

Upload authorization is limited to twelve requests per ten minutes per session; renewals to 120, completions to 180, and reports to five. These counters are persistent and atomic. No strict IP quota is used. Clearing cookies creates a new browser identity, so these limits are abuse controls rather than proof of unique attendees.

## Environment and R2 configuration

Required variables in the web app environment and Vercel Production:

| Variable                                                           | Exposure/purpose                                                                   |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Existing public DWD project configuration                                          |
| `NEXT_PUBLIC_SITE_URL`                                             | `https://dwdug.vercel.app` in production                                           |
| `SUPABASE_SECRET_KEY`                                              | Server-only Supabase secret or legacy service-role key                             |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`        | Server-only storage configuration                                                  |
| `R2_BUCKET_NAME`                                                   | Must be `the-link-up-memories`                                                     |
| `R2_ENDPOINT`                                                      | `https://<account-id>.r2.cloudflarestorage.com`, without bucket/path               |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`                                   | Public widget key; hostname must be allowed in Turnstile                           |
| `TURNSTILE_SECRET_KEY`                                             | Server-only Siteverify secret                                                      |
| `LINK_UP_SESSION_SECRET`                                           | Independent random value of at least 32 characters; keep stable across deploys     |
| `CRON_SECRET`                                                      | Separate random value of at least 32 characters; Vercel sends it as a Bearer token |

R2 credentials remain server-side; only short-lived, object-scoped URLs reach the browser. Signing uses the exact configured R2 origin, with the bucket in the URL path, to match CSP. Keep r2.dev and public custom-domain bucket access disabled.

The R2 variables were already present in Vercel Production. The missing Supabase server key, session secret, cron secret and both Turnstile keys were added securely during implementation. Local values are in ignored `apps/web/.env.local`; no secret values are checked in or printed in this report. Preview deployments require their own environment/hostname/CORS configuration before they can upload.

Use the JSON array in `docs/link-up-r2-cors.json` in R2 → bucket → Settings → CORS. It allows production and `http://localhost:3000`, methods PUT/GET/HEAD, the Content-Type header and exposed ETag. Add exact additional origins when needed; do not use public bucket access as a CORS workaround. Actual preflight requests for production and localhost returned HTTP 204 and the expected allowed origin/methods. A real browser PUT and download also passed.

The existing object-access token cannot read/change bucket configuration (AccessDenied). The helper's `--apply` option therefore was **not** successfully used. Existing CORS was verified through actual requests instead. If using a bucket-management credential:

```powershell
node --env-file=apps/web/.env.local scripts/configure-link-up-r2.mjs --apply
```

The helper can also install a one-day lifecycle safeguard restricted to `temporary/the-link-up/`, retaining other lifecycle rules. This optional lifecycle safeguard was not verified/applied with the current token. Application cleanup already operates independently of it.

Expired reservations are released before new reservation checks and during cleanup. Opportunistic cleanup runs after session/upload activity; the daily Vercel cron drains abandoned objects even without guests. Large deletion backlogs drain over repeated calls. Organizers can run cleanup manually. Failures keep outbox entries and retry safely.

For a new local environment, `node scripts/setup-link-up-local.mjs` generates independent session/cron secrets without printing them. `LINK_UP_ALLOW_LOCAL_TURNSTILE_BYPASS=true` is an explicit development-only test aid restricted to localhost/loopback; production ignores it. A temporary local bypass was used for the full infrastructure test and removed afterward. It is not configured in Vercel.

## Organizer sign-in and permissions

Open `/events/the-link-up/admin` and use ordinary DWD password or Google sign-in. Already signed-in users go directly to the access check. The login's `next` destination returns to the dashboard. The separate event email-link flow was removed after an end-user reported its hosted callback returning to the home page.

`shebatindy@gmail.com` and `ahumuzaariyo@gmail.com` receive equivalent, page-specific grants in `public.page_admin_access`. Both accounts already existed with verified emails. The follow-up migration seeds them once for `/events/the-link-up/admin`. Every protected page/API request verifies the authenticated user, current verified email and enabled exact-page grant. Changing the email, disabling the row or deleting the row revokes access. Sign-in never recreates a revoked grant. Neither account receives global administrative privileges.

See [page-specific admin access](page-admin-access.md) for exact Supabase Table Editor instructions, explicit provisioning SQL, revocation, and adding different administrators to future pages. The old `photo_event_organizers` table is historical metadata and no longer controls permissions. The old callback page redirects to ordinary login; old event sign-in APIs have been removed. Existing DWD signup, Google callbacks, password recovery and email verification remain unchanged.

Production authorization tests use temporary sessions held in memory and revoke only those test sessions. They send no emails and do not change either organizer's password. Each organizer should verify their own password/Google sign-in on their device before the event.

## Verification results

- Focused Vitest run: 61 tests passed across photo security/images/signing, page-specific authorization, existing authentication callbacks/actions, guest Quick Log access, CSP and banner ads.
- Supabase/Postgres: 68 assertions passed, including two truly concurrent connections racing for the final storage reservation, quotas, lease exclusion, idempotent publication, hide/delete accounting, cancellation, expiry, rate limits, both organizer identities, exact-page permissions, disabled/deleted grants and current-email revocation.
- Changed TypeScript/TSX/scripts: typecheck and focused ESLint passed. Full production build passed.
- Hosted Supabase security advisor: no warnings on the new photo objects. Existing application warnings were left outside this change; the existing SECURITY DEFINER API guidance is at https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable.
- Real R2 + hosted Supabase through the local web app: mobile-sized Chromium guest selected an actual raster image, prepared it, PUT directly to R2, passed server validation, published automatically and safely repeated completion. A separate browser viewed/downloaded the optimized JPEG and filed a report. Downloaded pixels decoded and had no EXIF.
- Both real verified organizer identities authenticated, loaded protected APIs, reviewed the report and hid/restored/deleted the sample. New guest responses/view links rejected the hidden/deleted photo. The old signed image URL returned 404 after object deletion.
- A disposable, authenticated unauthorized DWD account received 403 for organizer reads and mutations; an unsigned guest received 401. Browser Data API access to private photo metadata was denied. Disposable account and published test photos were cleaned up.
- A real libheif HEIC fixture converted to a prepared JPEG in Chromium under the actual CSP. It was not uploaded. This confirms the fallback decoder, not all iPhone camera variants.
- Browser runtime errors in the successful full flow: none. Screenshots and downloaded test JPEG are under ignored `.tmp/link-up-verification/`.
- Page-access follow-up: the hosted migration was applied and both approved rows returned `authorized = true`. The revised production build was tested locally against hosted Supabase. Both real verified identities loaded its dashboard/API. A disposable account signed in through the real DWD password form and returned to the dashboard with access denied. Explicitly granting the page enabled access; disabling/deleting the grant immediately denied reads and mutations in the same signed-in browser. A grant for a different page conferred no Link Up access. The disposable account and grants were removed; original organizer rows and guest photos were left untouched.

The automated full infrastructure test used an explicit localhost development Turnstile bypass; production fail-closed behavior, token expiry, hostname/action checks and Siteverify requests are covered by automated tests. The subsequent real production challenge/upload and independent download are verified below. No physical iPhone or Android hardware was available to the automated checks. Live 1,000-photo load/soak testing and prolonged venue-network interruption tests were not performed.

## Deployment

The initial photo-sharing release was deployed on 15 October 2026 at https://dwd-koy5m032o-ariyoxs-projects.vercel.app. The page-access update, commit `e06b337`, was subsequently deployed at https://dwd-6320kbezi-ariyoxs-projects.vercel.app and aliased to https://dwdug.vercel.app. The stable public event URL remains https://dwdug.vercel.app/events/the-link-up.

The revised production deployment passed the complete page-access browser check: unsigned visitors reach ordinary DWD login with the correct return path; both approved verified identities load the dashboard and protected API; an unrelated account signs in through the real password form and is denied; a temporary exact-page grant enables it; disabling/deleting that grant immediately denies reads and mutations without signing out. Another page's grant does not confer Link Up access, and the legacy RPC cannot recreate revoked grants. Browser clients cannot enumerate grants or call the privileged access RPC. The disposable account and grants were removed, and test sessions for both real organizers were revoked individually. No organizer passwords or existing sessions were changed.

On this deployment, an unauthenticated browser also retrieved the existing guest photo thumbnail and downloaded a valid, metadata-free JPEG using a newly signed private-R2 URL. Guest Quick Log remained accessible. The security advisor reported no warnings on the new photo/page-access objects; 58 existing unrelated application warnings remain outside this change.

During the initial release verification, the stable event page and empty public gallery returned HTTP 200. Both real approved identities authenticated against the then-deployed organizer callback and loaded the dashboard and protected summary API. An unsigned organizer request and an unsigned cleanup request returned 401. Authenticated cleanup returned 200. A new production batch without a Turnstile token was rejected with `turnstile_required`; the production session explicitly reported `turnstile` protection. Guest Quick Log returned 200 without authentication. The separate organizer callback has since been replaced by ordinary DWD sign-in, as described above.

The real production Turnstile widget loaded and displayed **Verify you are human**. The user completed the challenge and confirmed the upload was published and visible. A separate, unauthenticated production browser then opened the gallery and successfully downloaded that photo. The downloaded JPEG decoded at 543 × 727 pixels and contained no EXIF metadata. The user's uploaded photo was left in the gallery. This verifies the production guest upload → validation/publication → independent gallery/download flow without a protection bypass.

The Vercel project API also confirmed the active daily `/api/events/the-link-up/cleanup` cron at `0 3 * * *`, attached to this deployment. Physical-device checks remain as listed above.

For a subsequent release from the repository root:

```powershell
npm ci
supabase db push --dry-run
supabase db push
npx vitest run tests/link-up-photos.test.ts tests/quick-log-access.test.ts tests/auth-callback.test.ts tests/auth-actions.test.ts tests/content-security-policy.test.ts tests/banner-ads.test.ts
node scripts/test-database.mjs event_photos.sql event_photo_concurrency.sql page_admin_access.sql
npm run build
npx vercel deploy --prod --yes --archive=tgz
```

The database test command requires Docker and uses an isolated Supabase Postgres container; it does not write fixtures to the hosted project. Vercel's configured build runs `scripts/check-deployment.mjs` with deployment environment values and fails if required production photo configuration is missing. Local `.env.local` normally has an HTTP site URL, so the production configuration check should use production environment values rather than that local URL.

After deployment, check the event page, public gallery API, guest Quick Log, both organizer sign-ins and cleanup. Confirm the Vercel daily cron is listed. If an emergency rollback is needed, revert the web deployment or pause uploads/close the gallery; retain metadata and R2 objects. Do not drop the new tables to roll back a UI release.

## Pre-event check — 17 October

- Scan the actual printed QR code on an iPhone and an Android phone; confirm the stable event URL.
- Upload JPEG and HEIC photos over venue Wi-Fi; check orientation, visible progress and metadata-free gallery output.
- Interrupt one upload, refresh, retry it, and confirm successful photos remain published once.
- Open an independent guest browser; refresh the gallery, open the viewer and download a photo.
- Have each organizer sign in with their own DWD password or Google account. Hide a test photo, verify public rejection, then permanently delete it and confirm storage decreases. Check a separate unauthorized account is denied.
- Confirm uploads/gallery are enabled, storage has headroom, reporting reaches the dashboard, production Turnstile succeeds and the cleanup cron is configured.

Primary references: [R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/), [Turnstile server validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/), [Supabase passwordless email](https://supabase.com/docs/guides/auth/auth-email-passwordless), [Sharp input validation](https://sharp.pixelplumbing.com/api-constructor/). HEIC decoder source/license: [heic-to](https://github.com/hoppergee/heic-to), LGPL-3.0, version pinned in the lockfile.
