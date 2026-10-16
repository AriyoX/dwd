# iPhone photo uploads

Review covers `9cb7da0` and the photo preparation code it uses.

## Cause and fix

The errors originate in browser decoding, before reserving an upload or sending a
photo to storage. A real HEIC file renamed to `.jpg` reproduced the ordinary
“could not be opened” error in Chromium and WebKit: conversion was chosen only
from the name or declared MIME type. The shared decoder now reads the file's
signature and supplies its actual MIME type to the browser.

The file input explicitly advertised HEIC, bypassing Apple's opportunity to
convert library photos to JPEG. Both photo pickers now request JPEG first,
followed by PNG and WebP. Original HEIC files still have a lazy decoder fallback.
[WebKit documents the picker conversion behavior](https://bugs.webkit.org/show_bug.cgi?id=292041).

The HEIC fallback previously created a full-resolution canvas and an intermediate
JPEG before decoding again. This can exceed phone canvas limits with large
camera photos. It now returns a bitmap that is drawn directly onto the small
output canvas. Both event and night photos support 48 MP sources within a 60 MP /
50 MB input bound. Output limits are 4 MB for event photos and 5 MB for night
photos.

The event picker is retained until preparation finishes. Each file is read once
into a fresh Blob; image elements, object URLs, bitmaps and output canvases are
released after use. Night summaries also permit the CSP-safe HEIC worker.

## Verification

- Full unit suites: 614 web/shared tests (including the additional CSP check) and
  166 mobile tests. The new decoder tests exercise native decoding, incorrect or
  missing MIME types, HEIF brands, read failures, invalid files, resource release
  and 48 MP preparation on a restricted canvas.
- The 33 existing Link Up browser checks passed across desktop Chromium, phone
  Chromium and phone WebKit, including the real local backend access checks.
- All nine new production-build browser checks passed across the same three
  browsers, using a real HEVC-encoded fixture and a real local HTTP upload
  receiver. They cover mixed formats, multiple HEIC files, malformed files,
  restoring a batch, JPEG output, EXIF removal and portrait orientation.
  Reservation and completion APIs use controlled responses; image decoding and
  upload bodies are real.
- All 68 isolated database assertions, workspace type checks and repository lint
  passed. Changed files pass formatting. The repository-wide formatter reports
  26 existing violations in unchanged files.
- The production Turbopack build passed with `RUST_MIN_STACK=33554432` on Windows;
  the default Windows compiler stack overflowed. This is a local build environment
  setting, with no change to the deployed runtime.

The browser tests do not drive Apple's actual Photos picker or a physical
iPhone. Confirm a mixed selection from Photos on a physical phone after deploying
this revision. This work does not deploy the site or modify hosted photo data.
