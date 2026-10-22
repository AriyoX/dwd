# Authentication update, September 16

Google sign-in is enabled on the dedicated `drink-with-desire` project (`kdplbebaotvgcvjggacz`). Migration `20260915201833_google_signup.sql` is applied and the existing seven profiles were preserved. Google identities have no profile until they explicitly confirm adulthood and choose a display name. The public onboarding function uses the caller's validated identity, delegates to a private transaction, and is unavailable to anonymous users.

The hosted redirect allow list now includes `/auth/callback?**` for localhost, the production domains, and the existing Vercel preview pattern. These were added with a targeted Auth configuration update. The existing Site URL and Google credentials were preserved. Google Cloud's authorized redirect URI remains `https://kdplbebaotvgcvjggacz.supabase.co/auth/v1/callback`; `/auth/callback` is the app's separate destination after Supabase completes OAuth. See [Google sign-in with Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google).

## Email confirmation

Signup now uses email codes on web and native. Entering the code confirms the email and establishes a session on that device. The application no longer asks whether a confirmation link was clicked or gates code entry behind an environment flag. The one-hour HttpOnly pending-email cookie contains no password or token. Password-reset emails still use their existing recovery links; older signup links remain supported.

The hosted email template must be updated before deploying this flow. The September setup used Supabase's default sender, and custom-template installation was rejected without custom SMTP. If that setup remains in use:

1. Configure a verified custom SMTP sender in Supabase Auth.
2. Install `supabase/templates/confirmation.html` as the confirmation template. It includes `{{ .Token }}` and no verification link.
3. Enable Confirm email in the email provider settings. Deploy/rebuild both clients and test actual delivery, code verification and resending. `DWD_EMAIL_CONFIRMATION_CODE_ENABLED` is obsolete and can be removed.

Do not deploy the code-only screens while the hosted template still sends only links. No SMTP credentials or Google secret belong in the browser. See [email template variables](https://supabase.com/docs/guides/auth/auth-email-templates) and [free-tier template restrictions](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier).

## Email callback repair, October 7, 2026

`/auth/confirm` now renders the browser handoff directly. Default Supabase verification links can return `access_token` and `refresh_token` in a URL fragment, which a server route cannot read. The browser removes that fragment, posts the session to `/auth/confirm/verify`, and continues to the original destination after Supabase validates the confirmed user and writes the session cookies. Keeping the handoff at the email's exact destination also avoids WebKit dropping the fragment during an additional redirect. No SMTP or hosted Auth configuration change is required for this repair.

Code and token-hash links continue through the server verifier. Email and Google code exchanges now forward `sb_flow_id`, so each callback selects its own PKCE verifier if multiple auth attempts are pending. PKCE links still need the browser that started the flow; token-hash and implicit-session links can establish a session in another browser. Localhost is supported when the link returns to the same local app origin.

Regression coverage follows a real local Supabase `/verify` link in Chromium and WebKit, then loads a protected page to verify the server session. It also checks invalid fragment sessions, reset-link recovery, invitation preservation, and code verifier selection. Public email delivery and the user's original link were not exercised.

## Release status and verification

Validation passed: production build, TypeScript, lint, 151 unit tests, 142 isolated database assertions, and 33 desktop/mobile browser checks across Chromium and WebKit. The browser checks cover both link-only and code-enabled confirmation, pending-email persistence, invalid codes, confirmation in another tab, Google handoff/cancellation, adult onboarding, and the existing signup/invitation workflows. A read-only hosted OAuth request returned Google's authorization page with the correct Supabase callback.

The application changes are in the local workspace; this update did not deploy the web app to Vercel. Supabase security advisories still report the previously documented restricted tables and authenticated RPCs, plus disabled leaked-password checks. The new public onboarding wrapper is security-invoker and introduces no additional exposed security-definer function. See [database access advisories](https://supabase.com/docs/guides/database/database-linter).

The auth browser suite uses only a dedicated local Supabase stack. Set `E2E_SUPABASE_SECRET_KEY` in ignored `.tmp/e2e.env` to create test identities; `E2E_AUTH_DB_CONTAINER` defaults to `supabase_db_dwd-e2e` for fixture cleanup. Code tests use `E2E_CONFIRMATION_CODES=true`; test the shipped link flow with `E2E_CONFIRMATION_CODES=false`. Google handoff/cancellation are controlled in tests; completing real Google consent and public email delivery still require a real account and sender.
