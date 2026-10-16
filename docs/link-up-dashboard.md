# The Link Up photo dashboard

Reviewed commits: `77c3ae9` (deployment notes) and `e06b337` (page-specific organizer access), including the photo-sharing code those commits depend on.

The dashboard uses ordinary DWD sign-in and checks the current grant for this event on every protected request. Permission management is documented in [page admin access](page-admin-access.md).

## Reading the numbers

| Item                        | Meaning                                                                                                                                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visible photos              | Published photos that guests can see while the gallery is open. Closing the gallery keeps them saved.                                                                                                                  |
| Hidden photos               | Photos only organizers can view. They still use storage and can be shown again.                                                                                                                                        |
| Contributors                | Browsers that have successfully shared a photo. This estimates contributors; it does not count attendees or identify people.                                                                                           |
| Uploads in progress         | Reserved photo slots waiting for upload or checking. These photos are not yet in the public album.                                                                                                                     |
| Saved photos / used         | Stored photos and their preview images, including hidden photos. Files waiting for deletion remain counted until removed.                                                                                              |
| Held for uploads / reserved | Temporary space promised to unfinished uploads. Each slot holds 2.125 MB. Five slots therefore hold about 10.6 MB, even when saved photos use only 0.1 MB. Successful uploads replace the hold with their actual size. |
| Budget                      | The event's storage allowance, initially 5 GB. Saved files plus upload holds must fit. This is not a monetary budget or a bill.                                                                                        |
| Available                   | Budget minus saved files and current upload holds.                                                                                                                                                                     |
| Processing failures         | Failed photo checks over the event's lifetime. A later retry can succeed; this does not count missing photos. Recent activity also lists expired and cleared selections.                                               |

Unfinished upload slots expire after about one hour. An active photo check can finish first. Reading the dashboard releases expired holds before reporting the totals. Sizes track the album's allowance; temporary storage files may remain until cleanup.

## Photo and access controls

- **Hide / Show:** remove a photo from public view or restore it. Hiding keeps the files.
- **Delete:** permanently remove a photo after confirmation. It leaves the album immediately; file removal runs separately and retries if storage cannot connect. Used storage decreases after removal succeeds.
- **Visible / Hidden filters:** search the appropriate photo state across paginated results, rather than filtering only the first loaded page.
- **Pause uploads:** stop new selections and new upload links. Photos already sent can finish checking.
- **Close gallery:** stop browsing and new download links. Uploads are controlled separately. Existing signed photo links can work for up to two minutes.
- **Reports:** view the photo, hide or delete it, or mark only that report reviewed without changing the photo. Reports do not automatically hide photos.
- **Run cleanup:** release expired holds, remove temporary files when safe, and retry deletion. It keeps saved photos unless an organizer explicitly deleted them. Large backlogs drain over repeated runs.
- **Refresh dashboard:** update counts, settings and photos. The last refresh time appears on larger screens.

The guest page uses “Add photos,” “View photos” and “Share.” It shows the selection limit where needed, keeps the public-sharing notice, and leaves internal storage and browser limits in dashboard help.

Prepared photos are saved as byte data so browsers that cannot persist Blob objects can restore them after a reload. Closing the upload panel also keeps its selection in memory if device storage is unavailable.

## Verification

- Full unit suites: 597 web/shared tests and 166 mobile tests.
- Database: 68 assertions for photo lifecycle, storage races, cancellation, and page access.
- All 33 browser checks passed across desktop Chromium, phone-sized Chromium and phone-sized WebKit. Gallery, settings and upload fault scenarios use controlled responses; a separate case uses the real local backend to verify expired holds, durable deletion and live permission revocation.
- Production build, workspace type checks, focused lint and formatting checks passed.
- Production R2 credentials are disabled in browser tests. No production photos, organizer grants or passwords were changed.
- The connected Supabase tool could not run the hosted security advisor with its current permissions. Local database assertions verify RLS, restricted function execution, exact-page access, and revocation.

This revision is a local code change. Production deployment is separate. Phone viewport checks do not replace a check on a physical phone.
