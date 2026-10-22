# Public entry and events

Signed-out visitors to `/` see the DWD landing page. Signed-in visitors still return to `/home`; invitation links retain priority. `/quick-log` remains public. Its Back action opens `/` for guests and `/home` for accounts. Native Quick Log returns guests to `/welcome` and accounts to Tonight, completing the introduction when a guest returns to Welcome. Actual guest logs are retained.

The permanent Quick Log home cards are replaced by a one-time suggestion on web Home, the landing page, native Tonight and native Welcome. Choosing it, dismissing it or waiting 15 seconds removes it. Device storage remembers that it was shown per account (and separately for guests). Web keyboard focus and pointer hover pause dismissal; native screen readers retain the suggestion until dismissed. Start Tonight still opens Quick Log or Plan a Night, and Quick Log resumes the current session. The sign-in page also has a compact guest link. Existing guest logs are preserved.

`/events` links to The Link Up and its existing photo gallery. The event is dated 17 October 2026 and appears under Past events. Events links are available from the public header/footer, web Home, the account menu, auth pages and the event detail page. No database or event-admin permissions change.

## Landing page and public discovery

The landing page uses an interactive receipt preview, a short product walkthrough, the existing event gallery link, and native FAQ disclosures. The preview is illustrative and never changes guest or account logs. Quick Log is available as a permanent Log now link in the hero and footer. Both mobile store buttons say Available soon and are disabled until real listings exist. Native Welcome also retains a Log now action after its suggestion disappears.

The public footer exposes support, privacy, terms, safety and account deletion. Unknown links return a branded 404 with a route back to the public homepage.

Only `/`, `/events`, `/privacy`, `/terms`, `/support` and `/safety` opt into search indexing. They have canonical URLs, Open Graph and Twitter cards, plus a shared 1200 × 630 image at `/share-image`. The homepage also includes WebSite structured data. `/sitemap.xml` lists these public pages. The root layout keeps `noindex, nofollow` for other routes, including authentication, account pages and event albums; `/robots.txt` additionally excludes personal, admin and album routes. Robots directives do not replace access controls.

Indexing is enabled only for production builds with an HTTPS site origin, and is disabled on Vercel previews. Set `NEXT_PUBLIC_SITE_URL` to the final public origin in the production environment; this also controls canonical and sitemap URLs. Local development and preview deployments emit a disallow-all robots file and an empty sitemap.

Publish through the existing Vercel workflow in [deployment.md](deployment.md). Public account email delivery and Apple sign-in still depend on the separately documented SMTP and Apple provider configuration. The landing page changes do not configure those services.

## Apple web sign-in

Sign-in and signup offer Apple, Google and email. Both OAuth providers use the existing PKCE callback, preserve the return destination and require profile completion for new accounts. Cancellation returns a provider-specific message.

The connected backend's public settings report Apple enabled, but its Apple authorization endpoint currently returns HTTP 400: `Unsupported provider: missing OAuth secret`. The available local Apple client ID is the native bundle ID `com.dwd.app`; a web Services ID has not been supplied. Native Apple credentials alone do not complete web OAuth configuration.

To enable the live web flow, configure a registered Apple Services ID with the web domain and the Supabase `/auth/v1/callback` return URL, then add its generated OAuth client secret to the Apple provider in Supabase. Put the Services ID first in the provider's client IDs and retain the native bundle ID. Rotate the Apple OAuth secret before its six-month expiry. Keep signing keys and secrets out of source control. See [Supabase's Apple provider setup](https://supabase.com/docs/guides/auth/social-login/auth-apple).

Browser tests cover provider handoff, PKCE, return destinations, cancellation, unavailable providers, public navigation, suggestion dismissal and saved guest logs. Real Apple consent and physical iOS/Android layout, keyboard and touch checks remain necessary.
