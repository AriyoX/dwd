# Google Search Console ownership

The app supports Google's HTML tag verification through the root layout's
Next.js metadata. Set `GOOGLE_SITE_VERIFICATION` to the exact `content` value
Google provides to override the built-in public token for `ahumuzaariyo@gmail.com`.
When unset or empty, the app emits that owner's token, so normal deployments
retain verification without additional environment configuration.

1. Sign in to <https://search.google.com/search-console> as
   `ahumuzaariyo@gmail.com`.
2. Add the **URL prefix** property `https://dwdug.vercel.app/`. Do not choose
   a Domain property: that requires DNS verification rather than an HTML tag.
3. Choose **HTML tag** and copy the value inside `content="..."`.
4. The supplied owner's token is already included in the app. Deploy the updated
   app. To use a different token, set `GOOGLE_SITE_VERIFICATION` in the Vercel
   project's **Production** environment before deploying. For local checks, set it in
   `apps/web/.env.local` and restart the development server.
5. Open the production site while signed out. The root redirects to `/login`,
   which inherits the verification metadata. Check the page source for
   `<meta name="google-site-verification" content="YOUR_TOKEN"/>` inside
   the HTML head.
6. Click **Verify** in Search Console. Keep the configured token and tag
   in future deployments because Google periodically checks them again.

The token must come from the intended owner's Google account; an email address
is not a verification token. Each additional hostname needs its own Search
Console property. This setup does not change the app's existing `noindex`
policy: ownership verification and search indexing are separate settings.

Reference: [Google's ownership verification instructions](https://support.google.com/webmasters/answer/9008080?hl=en#meta_tag_verification).
