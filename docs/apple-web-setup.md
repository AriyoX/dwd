# Enable Apple sign-in on the DWD website

The native App ID is `com.dwd.app`. Web OAuth also needs a separate registered **Services ID**, such as `com.dwd.web`. The Services ID is a public identifier. The OAuth secret is a signed JWT generated from your Apple signing key, not the `.p8` file itself.

## 1. Register the Services ID

1. Open [Apple Developer → Certificates, Identifiers & Profiles → Identifiers](https://developer.apple.com/account/resources/identifiers/list).
2. Click **+ → Services IDs → Continue**. Use a description such as **DWD Website** and an available identifier such as **com.dwd.web**. Register it.
3. Open the new Services ID, enable **Sign in with Apple**, and select **Configure**.
4. Select the existing DWD primary App ID (`com.dwd.app`). If unavailable, enable Sign in with Apple on that App ID first.
5. Add these website domains (without `https://` or paths):
   - `dwdug.vercel.app`
   - `kdplbebaotvgcvjggacz.supabase.co`
6. Add this exact Return URL: `https://kdplbebaotvgcvjggacz.supabase.co/auth/v1/callback`.
7. Select **Done → Continue → Save**.

This is Supabase's callback, not the website's `/auth/callback` route. Add any custom production domain if DWD later uses one. Apple does not accept localhost as its Return URL.

## 2. Generate the OAuth secret

Use the **Sign in with Apple private key**, its **Key ID**, your **Team ID**, and the Services ID you just registered. The existing local `apple-secrets.env` contains the native Apple signing configuration; reuse the key only if it is enabled for Sign in with Apple and associated with the DWD primary App ID. Keep the existing native client ID unchanged.

If you need a new key, open [Apple Developer → Keys](https://developer.apple.com/account/resources/authkeys/list), create a key with **Sign in with Apple**, configure its primary App ID as DWD, and download the `.p8` file. Apple permits downloading that file only once.

Open [Supabase's Apple guide](https://supabase.com/docs/guides/auth/social-login/auth-apple#configuration-web) and use its client-secret generator with the Team ID, Key ID, Services ID and signing key. The generator runs in your browser. Copy the generated JWT into Supabase's OAuth secret field. Keep the private key and generated secret out of chat, public environment variables and source control. Regenerate the secret before its six-month expiry.

## 3. Configure Supabase

1. Open [DWD → Authentication → Sign In / Providers → Apple](https://supabase.com/dashboard/project/kdplbebaotvgcvjggacz/auth/providers).
2. Enable Apple. Set Client IDs to the registered Services ID **first**, followed by `com.dwd.app`. For example: `com.dwd.web,com.dwd.app`.
3. Paste the generated JWT into **Secret Key (for OAuth)** and save.
4. In [URL Configuration](https://supabase.com/dashboard/project/kdplbebaotvgcvjggacz/auth/url-configuration), use `https://dwdug.vercel.app` as the production Site URL. Ensure `https://dwdug.vercel.app/auth/callback?**` is allowed, along with the existing native callback URLs.
5. Test Continue with Apple on the website, then native sign-in. Both flows must remain functional. Check cancellation, return to the requested page, and new-account profile completion.

The client secret is required by web OAuth. The native ID-token flow must retain `com.dwd.app` as an allowed client ID.

Sources: [Apple web configuration](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web), [Supabase Apple provider](https://supabase.com/docs/guides/auth/social-login/auth-apple).

## Email signup codes

Before deploying the updated signup screens, open [DWD Authentication email templates](https://supabase.com/dashboard/project/kdplbebaotvgcvjggacz/auth/templates), select **Confirm signup**, and replace its body with [confirmation.html](../supabase/templates/confirmation.html). It uses `{{ .Token }}` and sends no confirmation link. Keep **Confirm email** enabled. If Supabase rejects custom templates with the default sender, configure a verified custom SMTP sender first. Test delivery to a real mailbox, code entry, an incorrect code, and resending. This repository update does not change the hosted template or SMTP settings.
