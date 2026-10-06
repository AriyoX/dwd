# Shared bottles

Sharing and joining take you straight to tracking. Choose how many **shots** (spirits) or **drinks** you want, then tap **Share & start tracking** or **Join & start tracking**. The bottle joins your plan. **Make this the main drink** is a visible choice on web and mobile; an existing main stays selected by default. The first planned drink becomes the main automatically. Earlier planned drinks and logged drinks stay saved.

Sharing while tracking a managed guest adds the bottle to both your plan and the guest’s plan, with the displayed quantity per person. Each plan has its own main-drink choice. **Everyone** controls who can join; other account members still choose whether to add it to their plans. Both plan updates save together. A stale or full plan rejects the entire action, and retrying a lost response does not reset later adjustments.

In a new group night, **Start with a shared bottle** asks for the bottle and your quantity during setup. The default is one; each person chooses their own amount. Bottle size, alcohol strength and drink size are grouped under **Bottle details**. Check those values against the bottle’s label. Starting the night opens **Invite someone**, just like the other group planning choices. Share or copy the link, then close the prompt to start tracking.

People joining the night, or seeing a bottle added later, get **Sharing this bottle?** with the quantity chosen by its creator. They can change it or choose **Not for me**. Dismissed invitations stay dismissed for that browser session, and the bottle remains available under **Shared bottles**.

**Log shot / Log drink** takes one tap from Tonight or the bottle card. The card stays open while logging, shows personal progress and has **Undo last drink**. **Adjust** on the card changes your quantity or drink size; **Adjust my full plan** also lets you pick a different main drink. The small main-drink tip can be dismissed.

Anyone with an account in the night can share another bottle. **Everyone** or **Choose people** controls who can join. Managers can plan and log for their managed guests. Plans do not reserve portions of the bottle. Bottle actions need an internet connection. Progress compares the amount logged from that bottle with the drink size in your current plan, so changing sizes can show part of a drink.

## Apply the database changes

These migrations are needed before running the updated app:

- `supabase/migrations/20260929103234_shared_bottles.sql`
- `supabase/migrations/20260929155211_streamline_bottle_tracking.sql`
- `supabase/migrations/20261002181638_shared_bottle_creator_plan.sql`

These have been checked locally; this work did not push them to your hosted database. If the first migration is already on your remote project, the CLI will only apply the pending migration(s).

From the project folder, check the linked project and review what will be applied:

```powershell
npx supabase@2.116.0 migration list --linked
npx supabase@2.116.0 db push --linked --skip-vault --dry-run
npx supabase@2.116.0 db push --linked --skip-vault
```

For a local Supabase project instead:

```powershell
npx supabase@2.116.0 migration up --local
npm run dev
```

`NEXT_PUBLIC_SUPABASE_URL` in `apps/web/.env.local` determines which database localhost uses. A `*.supabase.co` URL uses your hosted project; a localhost/127.0.0.1 URL uses your local stack. Restart the dev server after changing the URL and its matching key.

## Try the flow

1. Start a night **With friends**. Select **Start with a shared bottle**, name it, and choose two shots. Start the night. **Invite someone** should open with your invite link. Close it to reach tracking with that bottle as the main drink and **0 of 2 shots logged**.
2. Invite another account. In their browser, the bottle prompt should start at two shots. Change it to three and tap **Join & start tracking**. There is no extra plan review.
3. Tap **Log shot**. Check **1 of 3 shots logged**. Open **Shared bottles** and log again directly from the card. A 750 ml bottle with two 30 ml shots used should show 690 ml left.
4. Tap **Undo last drink** on the card. It should show one shot logged and 720 ml left on both devices.
5. As the second person, add a wine bottle and choose one drink. Turn on **Make this my main drink**. **Share & start tracking** should make it their main drink and keep the gin in their plan. The first person should get the quantity prompt when no other window is open.
6. Choose **Not for me**. Your main drink should stay the same. You can still join later from **Shared bottles**.
7. Use **Adjust** to change the size or number. Use **Adjust my full plan** to switch the main drink, save, and refresh. Your choice and earlier logs should remain.
8. Try **Choose people** with a third account, and check that uninvited people cannot join. Turn off the connection and confirm bottle actions are disabled.
9. Add a managed guest and switch to their view. Share a bottle for **Everyone**. Check that it appears in both your plan and theirs after refreshing. Try different main choices for each person; keeping the current main must still add the bottle to the plan.

## Focused checks

```powershell
npx vitest run packages/core/src/bottles/bottles.test.ts apps/web/src/features/plans/plan-editor.test.ts apps/web/src/features/nights/night-draft.test.ts apps/web/src/features/nights/logged-drinks.test.ts apps/web/src/adapters/pending-log-store.browser.test.ts
npm run test:db -- shared_bottles.sql bottle_tracking.sql bottle_creation_plans.sql
npx playwright test tests/e2e/shared-bottles.spec.ts --project=desktop --project=mobile
npm run typecheck
```

Database tests need Docker and run the three bottle suites in a disposable database. Browser tests use the local E2E setup (`.tmp/e2e.env`) with all migrations applied there. They create test accounts and nights, and refuse a remote backend. Screenshots are saved under `.tmp/ui-review/bottle-*.png`.
