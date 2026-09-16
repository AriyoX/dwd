# Authentication update, September 16

Google sign-in is enabled on the dedicated `drink-with-desire` project (`kdplbebaotvgcvjggacz`). Migration `20260915201833_google_signup.sql` is applied and the existing seven profiles were preserved. Google identities have no profile until they explicitly confirm adulthood and choose a display name. The public onboarding function uses the caller's validated identity, delegates to a private transaction, and is unavailable to anonymous users.

The hosted redirect allow list now includes `/auth/callback?**` for localhost, the production domains, and the existing Vercel preview pattern. These were added with a targeted Auth configuration update. The existing Site URL and Google credentials were preserved. Google Cloud's authorized redirect URI remains `https://kdplbebaotvgcvjggacz.supabase.co/auth/v1/callback`; `/auth/callback` is the app's separate destination after Supabase completes OAuth. See [Google sign-in with Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google).

## Email confirmation

**Email still uses Supabase's default sender.** The application defaults to the improved link flow: a persistent confirmation screen, automatic continuation when the original tab regains focus, a manual confirmation check, resend cooldown, and invitation-preserving recovery. The one-hour HttpOnly pending-email cookie contains no password or token.

Code confirmation is implemented but disabled by default. Supabase rejected the custom email template because this free project has no custom SMTP sender. To activate codes:

1. Configure a verified custom SMTP sender in Supabase Auth.
2. Install `supabase/templates/confirmation.html` as the confirmation template. It includes both `{{ .Token }}` and a direct app link that works across browsers.
3. Set the server-only application variable `DWD_EMAIL_CONFIRMATION_CODE_ENABLED=true`, restart/redeploy, and test actual delivery and confirmation.

Do not enable that flag before the template is installed: the default email contains only a link. No SMTP credentials or Google secret belong in the browser. See [email template variables](https://supabase.com/docs/guides/auth/auth-email-templates) and [free-tier template restrictions](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier).

## Release status and verification

Validation passed: production build, TypeScript, lint, 151 unit tests, 142 isolated database assertions, and 33 desktop/mobile browser checks across Chromium and WebKit. The browser checks cover both link-only and code-enabled confirmation, pending-email persistence, invalid codes, confirmation in another tab, Google handoff/cancellation, adult onboarding, and the existing signup/invitation workflows. A read-only hosted OAuth request returned Google's authorization page with the correct Supabase callback.

The application changes are in the local workspace; this update did not deploy the web app to Vercel. Supabase security advisories still report the previously documented restricted tables and authenticated RPCs, plus disabled leaked-password checks. The new public onboarding wrapper is security-invoker and introduces no additional exposed security-definer function. See [database access advisories](https://supabase.com/docs/guides/database/database-linter).

The auth browser suite uses only a dedicated local Supabase stack. Set `E2E_SUPABASE_SECRET_KEY` in ignored `.tmp/e2e.env` to create test identities; `E2E_AUTH_DB_CONTAINER` defaults to `supabase_db_dwd-e2e` for fixture cleanup. Code tests use `E2E_CONFIRMATION_CODES=true`; test the shipped link flow with `E2E_CONFIRMATION_CODES=false`. Google handoff/cancellation are controlled in tests; completing real Google consent and public email delivery still require a real account and sender.
