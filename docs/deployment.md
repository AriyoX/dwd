# Supabase and Vercel deployment

The Next.js app runs on Vercel. Supabase provides PostgreSQL, authentication, and Realtime. Ordinary app traffic requires only the project URL and publishable key.

## Account status

As of September 6, 2026, the user chose to connect a different Supabase organization. The connected Supabase account still exposes only the Baby Steps organization and its existing projects. Do not reuse them. Record the selected organization, new Drink with Desire project name, region, reference, and Vercel project in this file when provisioned.

The [Vercel project](https://vercel.com/ariyoxs-projects/dwd) is created, configured, and linked to this workspace:

- Project: `dwd`
- Project ID: `prj_03cSSEnuqQDuwbMT3CfAGyGIUfte`
- Team: `ariyoxs-projects`
- Root: `apps/web`, Next.js, Node.js 22.x
- Production deployment: pending the dedicated Supabase project and environment variables.

## 1. Dedicated Supabase project

1. Connect the chosen organization, confirm the project cost, and create `Drink with Desire` in that organization.
2. Confirm its project reference and that the database is empty. The existing migration creates the complete schema; do not run it against another app.
3. Discover installed CLI commands with `supabase --help`, `supabase link --help`, and `supabase db push --help` before using them. From the repository root:

   ```sh
   supabase link --project-ref YOUR_DWD_PROJECT_REF
   supabase migration list --linked
   supabase db push --dry-run
   supabase db push
   supabase migration list --linked
   ```

4. Run the Supabase security and performance advisors. Verify RLS, grants, and the `supabase_realtime` publication. The checked-in migration already supplies them; no extra permissive policies are needed.
5. Copy the project URL and **publishable key** to the Vercel environments. The deployment check accepts modern publishable keys. No service-role or secret key belongs in the frontend.

## 2. Vercel project settings

| Setting                              | Value                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------- |
| Name                                 | `dwd`                                                             |
| Root Directory                       | `apps/web`                                                                |
| Framework                            | Next.js                                                                   |
| Node.js                              | 22.x                                                                      |
| Include files outside Root Directory | Enabled                                                                   |
| Install Command                      | `npm ci --prefix ../..`                                                   |
| Build Command                        | `node ../../scripts/check-deployment.mjs && npm run build --prefix ../..` |
| Output Directory                     | `.next`                                                                   |

Commands are relative to `apps/web` and are checked into `apps/web/vercel.json`. The shared packages remain available through npm workspaces. See [Vercel monorepo configuration](https://vercel.com/docs/monorepos).

| Environment variable                   | Preview                                                                 | Production                     |
| -------------------------------------- | ----------------------------------------------------------------------- | ------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`             | Dedicated staging project, or the explicitly chosen Drink with Desire backend | Dedicated Drink with Desire backend  |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Corresponding publishable key                                           | Corresponding publishable key  |
| `NEXT_PUBLIC_SITE_URL`                 | Optional; `VERCEL_URL` takes priority                                   | Stable HTTPS production origin |

Until a canonical origin is configured, server-generated links can use Vercel's deployment URL. `.vercelignore` excludes local environment files, caches, and build output from uploads.

There is currently no Git repository in this workspace. A CLI deployment does not require Git. After linking the repository root to the configured Vercel project, run `vercel` for a preview and `vercel --prod` for production. A future Git connection can enable automatic deployments.

## 3. Authentication and email

Set Supabase **Authentication → URL Configuration → Site URL** to the stable production origin. Allow the local and deployment callback URLs, including the `next` query string:

- `http://localhost:3000/auth/confirm?**`
- `https://YOUR_PRODUCTION_DOMAIN/auth/confirm?**`
- `https://*-ariyoxs-projects.vercel.app/auth/confirm?**` for this Vercel team's previews, if previews use this backend.

Use exact deployment hosts where practical; avoid a wildcard for every Vercel account. [Supabase redirect URL documentation](https://supabase.com/docs/guides/auth/redirect-urls).

Enable email confirmation for production and configure an SMTP provider with a verified sender. Supabase's local email testing settings do not configure hosted SMTP.

Copy `supabase/templates/confirmation.html` and `supabase/templates/recovery.html` into the corresponding hosted email templates. These templates expect the app's `RedirectTo` URL to already include `/auth/confirm?next=...`; they append the token hash and type. This preserves invitations through signup and password recovery and supports opening the email on another device. The local CLI config references these same templates.

New free projects using Supabase's default email provider cannot customize email templates. Custom SMTP enables customization; paid plans also support it. Default templates still support the app's PKCE callback, but depend on opening the link in the browser that requested it. [Supabase email-template change](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier), [email template documentation](https://supabase.com/docs/guides/local-development/customizing-email-templates).

## 4. Release checks

From the repository root, run:

```sh
npm run typecheck
npm run lint
npm run test:unit
npm run test:db
npm run format:check
npm run build
npm run deploy:check
```

`test:db` requires Docker. `deploy:check` loads `apps/web/.env.production.local` if present; Vercel supplies the variables directly during its build. Keep that file out of source control.

After deploying, complete [manual-qa-checklist.md](manual-qa-checklist.md): signup and confirmation, sign-in, password recovery, create a night, invite a second account, check separate guest quick-log selections, log alcohol and water, undo, reconnect, confirm ending, and inspect the summary. Check both a narrow mobile viewport and a desktop viewport, keyboard focus, and dialog scrolling.

The app's invite throttle is per process. Add a Vercel Firewall rule or a durable limiter before opening a broad public launch; it is not a globally coordinated serverless rate limit.

## Validation limits

Validation on September 6, 2026: production build passed, 93 unit tests passed, lint passed, formatting passed, and 10 local HTTP route checks returned the expected page or redirect. The deployment configuration checker passed a valid configuration and rejected a local backend, placeholder key, and known Baby Steps project.

No remote schema was modified during the UI update. Full Auth/Realtime integration and screenshot review remain pending the new Supabase connection and an available browser. Docker was unavailable in this environment, so the database lifecycle suite could not be rerun here.
