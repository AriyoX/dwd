# Google Play audit — 6 October 2026

The repository fixes are implemented and automated checks are recorded in [mobile release readiness](mobile-release-readiness.md). Store approval and physical-device acceptance have not occurred. This audit separates changes we can verify in source/backend from owner credentials, store declarations and signed-binary checks still required.

## Fixed

- Optional approximate foreground location replaces manual country selection on mobile and web; Uganda is the clearly labelled fallback. Coordinates stay on-device. Only country/UK calendar region is sent to the account. No background location, IP geolocation or country questionnaire.
- Local Help numbers share the same bundled registry as country detection. Calls open the dialler only after a tap; failure preserves the exact number. No Android call/SMS permission is requested.
- Recurring weekend, optional Sunday, holiday eve/day and New Year's Eve campaigns continue beyond 2026 in all nine markets. Africa is the expansion priority. Active-night suppression, quiet hours, unopened-only backups and caps remain enforced server-side.
- Privacy, Terms, public account deletion and support pages contain the supplied contact and cover both clients. Native policies are bundled for offline viewing. In-app deletion works for incomplete accounts and with unsaved entries, with an explicit discard warning. The public deletion resource needs no app installation.
- Account deletion removes personal activity and plans in addition to Auth/profile, notifications, preferences and actual uploaded photos. Other participants keep only their own records and a minimal anonymous membership timeline. A fresh login cancels the 30-day request before processing; refresh does not.
- Native Auth tokens now use encrypted SecureStore, including migration from legacy plaintext session storage. Activity caches/outboxes remain unencrypted device data and are disclosed.
- User-generated content has server-enforced blocking, reports, terms, a narrow text filter and approval-only photo sharing. Human review operations are in [moderation operations](moderation-operations.md).
- Android compile/target API is 36, matching the current [target API requirement](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en). Fine/background location, camera, microphone, broad photo/media permissions and overlay permission are blocked. Android photo selection uses the system picker.
- Next.js and React security patches are updated. Vulnerable URI decoding and UUID dependencies have compatible pinned fixes. Remaining upstream advisories are tracked below.

## Public listing resources

The public [privacy](https://dwdug.vercel.app/privacy), [terms](https://dwdug.vercel.app/terms), [account deletion](https://dwdug.vercel.app/delete-account) and [support](https://dwdug.vercel.app/support) pages were deployed and verified on October 6, 2026: all return HTTP 200 without authentication and contain the supplied email. The developer/contact currently reads **Ariyo Ahumuza — ahumuzaariyo@gmail.com**. It is owner-supplied temporary information; replace the shared legal constant and store listings together when the permanent details are available. Do not describe the contact as a verified company or invent an address.

## Data Safety draft

Complete the actual Play Console form against the final binary and provider configuration. This is a mapping, not a submitted declaration. See [Google user-data policy](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en) and [account-deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en).

| Data                                                                                 | Collected off-device       | Purpose / control                                                             |
| ------------------------------------------------------------------------------------ | -------------------------- | ----------------------------------------------------------------------------- |
| Name, email, account ID and authentication data                                      | Yes                        | Account and security; removal through account deletion                        |
| Country / UK calendar region derived from location                                   | Yes                        | Local reminders and Help context; permission optional and Uganda fallback     |
| Raw precise/approximate device coordinates                                           | No                         | On-device boundary lookup only; no background tracking                        |
| Night membership, plans, alcohol/water entries and reminders                         | Yes                        | Core app function; private within the relevant night                          |
| Photos                                                                               | Yes, optional              | Private memories, with human approval before sharing; user can remove uploads |
| Support/report text                                                                  | Yes, optional              | Support, moderation and privacy requests                                      |
| Device installation ID, push token, timezone, notification delivery/open attribution | Yes when configured        | Notification delivery, relevance and security; opt-out available              |
| Local drafts, pending entries and cached activity                                    | No unless submitted/synced | Offline use; device-managed storage                                           |

Treat drink/water tracking conservatively as health/fitness-related data in store declarations even though DWD provides no medical assessment. Disclose country as approximate location and notifications as app interactions where the form requires it. No ads, ad identifier, payment, contact-book collection or cross-app tracking SDK is added. Data is transmitted over HTTPS. Private night participants see relevant submitted content; providers process data to operate the service. Check Google's exact collection/sharing definitions rather than assuming all service-provider processing counts as sharing.

## Remaining release gates

1. Confirm permanent package identity (`com.dwd.app`) against Play Console; the unrelated root config uses another identity. Run EAS from `apps/mobile`. Configure Firebase/FCM, EAS production environment and signing as described in [release readiness](mobile-release-readiness.md). No signed AAB was built in this audit.
2. Build the production AAB, inspect the merged manifest and native libraries, verify 16 KB page-size support with the actual artifact, and install via an internal testing track. A Metro export is not a signed-binary check. Confirm no development launcher functionality is exposed in the production build.
3. On physical Android, exercise cold start, all sign-in methods, notification denial/Settings return, location denial/revocation/travel, deep links, offline sync, sharing/report/block and deletion. Cancel the dialler before placing an emergency call.
4. Configure working production SMTP; the previously deferred default Supabase sender is unsuitable for unrestricted public signup/recovery. Enable leaked-password protection if the project plan permits it. Verify recovery/confirmation from real external addresses and review hosted advisors.
5. Complete Data Safety, health-app declarations if Play classifies tracking as health-related, adult target audience and the content-rating questionnaire honestly. Supply screenshots, icon, description, support URLs and reviewer credentials for a disposable account. Avoid excess-drinking claims, challenges or claims that DWD determines sobriety/driving safety.
6. Assign an operator for reports/photo approval and deletion failures; test that the queue is actually monitored. See [Google UGC policy](https://support.google.com/googleplay/android-developer/answer/9876937?hl=en-GB).
7. Owner review: permanent legal identity/contact, actual provider log/backup retention, international processing disclosures and applicable controller registration (including Uganda PDPO) must be confirmed. Code changes do not establish regulatory registration.

## Dependency limitations

At this audit, `node-forge` has an [unpatched RSA verification advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv) in Expo CLI/certificate tooling, and `braces` has an [unpatched nested-pattern denial-of-service advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) in lint tooling. These are not introduced app features. Keep build inputs trusted, monitor upstream fixes and rerun audit before a signed release. Do not apply npm's suggested Expo downgrade to clear inherited advisory counts.
