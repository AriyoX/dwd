# The Link Up readiness review — 16 October 2026

For the event on 17 October, the backend design is appropriate for approximately
100 guests. Upload bodies go directly to R2; the application processes bounded
images and thumbnails. Database transactions reserve capacity and publish each
photo exactly once. This assessment includes a local concurrent database/API
test, not a production load test of Vercel, R2, Turnstile or venue Wi-Fi.

## Live changes and checks

- Raised the event budget to **9 GB in dashboard units**: 9 GiB, or
  9,663,676,416 bytes. Applied and verified migration
  `20261016065405_link_up_event_capacity.sql` on the linked DWD project.
- Limits remain 25 lifetime photos per browser, ten per batch, three concurrent
  uploads per browser, 2 MiB per photo and 128 KiB per thumbnail. At those maximum
  sizes, 100 browsers × 25 photos consume about 5.19 GiB of published storage.
  Temporary uploads also consume physical R2 space until cleanup.
- Live gallery, JPEG thumbnails and full-size viewing URLs returned HTTP 200.
  Direct anonymous access to the private photo table was denied.
- R2 accepted the production PUT preflight with the correct origin and headers.
- Authenticated application cleanup removed five due temporary objects. The
  cleanup queue is now empty, reserved storage is zero, and the event has no
  recorded verification failures. Existing photos were preserved.

## Code changes

- Replaced the client dependency on `AbortSignal.timeout` with an abort controller
  and a cleared timer. Browsers missing that newer API could previously fail before
  making any gallery or upload-session request. [MDN documents the compatibility
  limitation](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static).
- Fixed cleanup acknowledgement to match both the object key and scheduled time.
  A worker cannot discard cleanup that another request rescheduled while deletion
  was in flight.
- Reuse the R2 client, instead of creating one for every signed URL and storage
  operation. Configuration changes replace the cached client.
- Keep the album visible on arrival. Browse 24 photos per page, with previous,
  next and latest controls; only the current page's images remain mounted.
- Preserve the current page when returning from another app. The full-screen
  viewer crosses page boundaries, retries failed page loads, supports horizontal
  swipes and keyboard navigation, and renews viewing URLs when returning online.
  Closing during a page request cannot reopen the viewer with a late response.
- Add a native horizontal photo strip alongside the grid. Keep the event's
  existing artwork, with a shorter header and larger mobile photo tiles. The
  photo-first browsing approach takes inspiration from [QRPix](https://qrpix.it/en).
- Rename the Quick Log action to “Count my shots”, add a shortcut in the event
  header, and add “Go to DWD” beside “View event” in the organizer dashboard.

The pre-existing uncommitted iPhone fixes were retained. Signature-based format
detection handles mislabeled HEIC files; delaying picker reset avoids invalidating
selected files; direct bitmap conversion avoids an unnecessary full-resolution
canvas. See [the iPhone upload review](iphone-photo-uploads.md).

## Verification

- 58 focused unit tests passed: sessions, Turnstile, image normalization, signing,
  decoding, CSP, client errors, dashboard queries and cleanup.
- 68 isolated database assertions passed: concurrent quota enforcement,
  idempotency, cancellation, expiry, moderation and page-scoped organizer access.
- 54 browser checks passed across desktop Chromium, mobile Chromium and mobile
  WebKit. These include real HEIC decoding and a real local upload receiver,
  draft recovery, lost responses, gallery pagination and protected local APIs.
  Nine focused checks were rerun after the timeout compatibility fix, including
  browsing with `AbortSignal.timeout` removed. All passed; the recovery cases
  required restarting the local Docker backend after it had stopped.
- `scripts/test-link-up-load.mjs` exercised 100 concurrent local guests reserving
  2,500 photos and recovering 300 identical batches. No double accounting;
  the 26th photo was rejected. The reservation/recovery portion took 3.67 seconds,
  with 1.05-second p95 RPC latency. Test reservations were removed and storage
  counters restored. These timings describe this local machine only.
- Production build, targeted ESLint and TypeScript checks passed. A local
  production preview using the existing public album had no browser runtime
  errors or horizontal overflow at desktop and phone sizes.

The storage change is live. This review did not deploy the web application.
Apple's physical Photos picker,
phone memory pressure and venue connectivity still need a real-device upload
check after deployment; WebKit automation cannot validate those conditions.

## Follow-up: connection recovery and image quality

The initial readiness changes were committed as `ef62e4e` before this follow-up.

- Show an offline notice in the album, uploader and viewer. Connection errors
  and timeouts advise checking the connection and refreshing the page.
- Stop waiting for a visible image after 25 seconds and show recovery guidance.
  Failed thumbnails offer a refresh action that preserves the current album
  page. Reconnecting also refreshes the current page automatically.
- Preserve expiring-link renewal, bound automatic retries for an expired URL,
  and discard renewal responses from an older image or unmounted viewer.
- Prepare new JPEGs at quality 94 first and use the full 2 MiB allowance before
  reducing quality or dimensions. Server normalization also starts at quality 94.
  The 2048-pixel edge limit, metadata removal and storage reservations stay in place.
- Generate previews up to 640 pixels at quality 84, reducing quality and then
  dimensions when needed to remain within 128 KiB. Existing photos are unchanged.
- Use one flat green (`#081607`) across the event background and public photo
  panels, removing the foliage and grain overlays.

The existing public thumbnail loaded successfully from localhost with an HTTP
200 and successful browser decoding. No persistent localhost/Cloudflare failure
was reproduced; intermittent failures now have explicit recovery UI.

Verification: 60 focused unit checks and 36 browser checks passed across desktop
Chromium, mobile Chromium and mobile WebKit. Browser checks cover offline and
reconnect notices, failed and stalled images, expired URLs, pagination, HEIC,
restored drafts and an actual detailed-image upload with pixel-error measurement.
The production build (including TypeScript), targeted ESLint and formatting
checks passed. A local production preview loaded the existing public album on
desktop and phone layouts with no runtime errors or horizontal overflow.
Application changes are committed locally; no deployment was made.
