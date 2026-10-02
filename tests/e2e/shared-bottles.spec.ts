import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { test, expect, type Page } from '@playwright/test';
import type { Database, NightSnapshot } from '@dwd/core';

async function account(name: string) {
  const url = String(process.env['E2E_SUPABASE_URL'] ?? '');
  if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname))
    throw new Error('Local backend required.');
  const client = createClient<Database>(
    url,
    String(process.env['E2E_SUPABASE_PUBLISHABLE_KEY'] ?? ''),
  );
  const email = `bottles-${randomUUID()}@example.test`;
  const password = 'local-bottle-password-123';
  const { error } = await client.auth.signUp({
    email,
    password,
    options: { data: { display_name: name, age_confirmed: true, tour_seen: true } },
  });
  if (error) throw error;
  return { client, email, password };
}

async function login(page: Page, user: Awaited<ReturnType<typeof account>>) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole('link', { name: /Start a night/ })).toBeVisible();
}

test('sharing while tracking a new guest adds both plans and asks about each main drink', async ({
  page,
}, info) => {
  test.skip(!process.env['E2E_SUPABASE_PUBLISHABLE_KEY'], 'Local test backend required.');
  const host = await account('Ari');
  const created = await host.client.rpc('start_night_out', {
    p_creation_key: randomUUID(),
    p_title: 'Guest bottle plans',
    p_ends_at: new Date(Date.now() + 3 * 3600000).toISOString(),
    p_timezone: 'UTC',
    p_host_plan: [
      {
        label: 'Beer',
        category: 'beer',
        volumeMl: 330,
        abvPercent: 5,
        plannedQuantity: 2,
        isQuickLog: true,
      },
    ],
    p_guests: [],
  });
  if (created.error) throw created.error;
  const nightId = (created.data as { nightId: string }).nightId;
  await login(page, host);
  await page.goto(`/night/${nightId}`);
  await page.getByRole('button', { name: 'Add person', exact: true }).click();
  const guestForm = page.getByRole('dialog', { name: 'Add person', exact: true });
  await guestForm.getByLabel('Display name').fill('Jo');
  await guestForm.getByRole('button', { name: 'Plan drinks', exact: true }).click();
  await guestForm.getByRole('button', { name: 'Wine', exact: true }).click();
  await guestForm.getByRole('button', { name: 'Add person', exact: true }).click();
  await expect(guestForm).toHaveCount(0);
  await expect(page.locator('.participant-chip-selected')).toContainText('Jo');
  await page.locator('.bottle-launcher').click();
  const form = page.getByRole('dialog', { name: 'Share a bottle', exact: true });
  await form.getByLabel('Bottle name').fill('Shared gin');
  await form.getByLabel('Planned shots per person').fill('2');
  await expect(form.getByRole('button', { name: 'Everyone', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const hostMain = form.getByRole('checkbox', { name: 'Make this my main drink', exact: true });
  const guestMain = form.getByRole('checkbox', { name: 'Make this Jo’s main drink', exact: true });
  await expect(hostMain).not.toBeChecked();
  await expect(guestMain).not.toBeChecked();
  await expect(form.getByText('Keeps Beer as the main drink.', { exact: true })).toBeVisible();
  await hostMain.check();
  await form.screenshot({
    path: `.tmp/ui-review/bottle-guest-main-${info.project.name}.png`,
    animations: 'disabled',
  });
  await form.getByRole('button', { name: 'Share & start tracking', exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(page.locator('.main-drink')).toContainText('Wine');
  await page.locator('.participant-chip').filter({ hasText: 'Ari' }).click();
  await expect(page.locator('.main-drink')).toContainText('Shared gin');
  await page.reload();
  await expect(page.locator('.main-drink')).toContainText('Shared gin');
  const latest = await host.client.rpc('get_night_snapshot', { p_night_id: nightId });
  if (latest.error) throw latest.error;
  const snapshot = latest.data as unknown as NightSnapshot;
  for (const member of snapshot.members) {
    expect(member.planItems).toHaveLength(2);
    expect(member.planItems.find((item) => item.sharedBottleId)?.plannedQuantity).toBe(2);
  }
  expect(
    snapshot.members
      .find((member) => member.displayName === 'Ari')
      ?.planItems.find((item) => item.isQuickLog)?.label,
  ).toBe('Shared gin');
  expect(
    snapshot.members
      .find((member) => member.displayName === 'Jo')
      ?.planItems.find((item) => item.isQuickLog)?.label,
  ).toBe('Wine');
});

test('bottle quantity to one-tap tracking, joining, undo and adding another bottle', async ({
  page,
  browser,
}, info) => {
  test.skip(!process.env['E2E_SUPABASE_PUBLISHABLE_KEY'], 'Local test backend required.');
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const host = await account('Ari');
  const friend = await account('Sam');
  await login(page, host);
  await page.getByRole('link', { name: /Start a night/ }).click();
  await page.getByLabel('Night name').fill('Bottle night');
  await page.getByRole('button', { name: 'With friends', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('checkbox', { name: /Start with a shared bottle/ }).check();
  await page.getByLabel('Bottle name').fill('Friday gin');
  await page.getByLabel('Your shots from this bottle').fill('2');
  await page.screenshot({
    path: `.tmp/ui-review/bottle-setup-${info.project.name}.png`,
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText('2 shots · Friday gin')).toBeVisible();
  await page.getByRole('button', { name: 'Start night', exact: true }).click();
  const invitePrompt = page.getByRole('dialog', { name: 'Invite someone', exact: true });
  await expect(invitePrompt).toBeVisible();
  await expect(invitePrompt.locator('.invite-url')).toContainText('/join/');
  await expect(invitePrompt.getByRole('button', { name: 'Copy link', exact: true })).toBeEnabled();
  await invitePrompt.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.locator('.main-drink')).toContainText('Friday gin');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('progressbar', { name: 'Your Friday gin plan' })).toHaveAttribute(
    'aria-valuetext',
    '0 of 2 shots logged',
  );
  await expect(page.getByText('Friday gin is your main drink')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Log shot', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Log shot', exact: true })).toBeInViewport();
  await page.screenshot({
    path: `.tmp/ui-review/bottle-tracking-${info.project.name}.png`,
    fullPage: false,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Dismiss main drink tip' }).click();
  const nightId = new URL(page.url()).pathname.split('/').at(-1);
  if (!nightId) throw new Error('Night was not created.');
  const token = randomUUID().replaceAll('-', '').repeat(2);
  const invite = await host.client.rpc('create_night_invite', {
    p_night_id: nightId,
    p_token_hash: token,
    p_expires_at: new Date(Date.now() + 3600000).toISOString(),
    p_max_uses: 5,
  });
  if (invite.error) throw invite.error;
  const join = await friend.client.rpc('redeem_night_invite', { p_token_hash: token });
  if (join.error) throw join.error;
  const friendContext = await browser.newContext({
    viewport: page.viewportSize() ?? { width: 390, height: 844 },
    baseURL: 'http://localhost:3100',
  });
  try {
    const friendPage = await friendContext.newPage();
    friendPage.on('pageerror', (error) => errors.push(error.message));
    await login(friendPage, friend);
    await friendPage.goto(`/night/${nightId}`);
    const prompt = friendPage.getByRole('dialog', { name: 'Sharing this bottle?' });
    await expect(prompt).toBeVisible();
    await expect(prompt.getByLabel('Your shots from this bottle')).toHaveValue('2');
    await prompt.getByLabel('Your shots from this bottle').fill('3');
    await prompt.screenshot({
      path: `.tmp/ui-review/bottle-join-${info.project.name}.png`,
      animations: 'disabled',
    });
    await prompt.getByRole('button', { name: 'Join & start tracking' }).click();
    await expect(friendPage.getByRole('dialog')).toHaveCount(0);
    await expect(friendPage.locator('.main-drink')).toContainText('Friday gin');
    await friendPage.getByRole('button', { name: 'Log shot', exact: true }).click();
    await expect(friendPage.getByTestId('drink-count')).toHaveText('1');
    await expect(
      friendPage.getByRole('progressbar', { name: 'Your Friday gin plan' }),
    ).toHaveAttribute('aria-valuetext', '1 of 3 shots logged');
    await friendPage.locator('.bottle-launcher').click();
    const friendShelf = friendPage.getByRole('dialog', { name: 'Shared bottles', exact: true });
    await expect(friendShelf.getByText('720 ml left', { exact: true })).toBeVisible();
    await friendShelf.getByRole('button', { name: 'Log shot', exact: true }).click();
    await expect(friendPage.getByTestId('drink-count')).toHaveText('2');
    await expect(friendShelf).toBeVisible();
    await expect(friendShelf.getByRole('progressbar')).toHaveAttribute(
      'aria-valuetext',
      '2 of 3 shots logged',
    );
    await friendShelf.getByRole('button', { name: 'Undo last drink', exact: true }).click();
    await expect(friendPage.getByTestId('drink-count')).toHaveText('1');
    await expect(friendShelf.getByText('720 ml left', { exact: true })).toBeVisible();
    await friendShelf.getByRole('button', { name: 'Adjust', exact: true }).click();
    const adjustment = friendPage.getByRole('dialog', { name: 'Adjust your drinks' });
    await adjustment.getByLabel('Your shots from this bottle').fill('4');
    await adjustment.getByRole('button', { name: 'Save changes' }).click();
    await expect(friendPage.getByRole('dialog')).toHaveCount(0);
    await expect(
      friendPage.getByRole('progressbar', { name: 'Your Friday gin plan' }),
    ).toHaveAttribute('aria-valuetext', '1 of 4 shots logged');
    await friendPage.locator('.bottle-launcher').click();
    await page.locator('.bottle-launcher').click();
    const hostShelf = page.getByRole('dialog', { name: 'Shared bottles', exact: true });
    await expect(hostShelf.getByText('720 ml left', { exact: true })).toBeVisible();
    await hostShelf.screenshot({
      path: `.tmp/ui-review/bottle-shelf-${info.project.name}.png`,
      animations: 'disabled',
    });
    await friendContext.setOffline(true);
    await expect(
      friendShelf.getByText('Go online to share, join or log from a bottle.'),
    ).toBeVisible();
    await expect(friendShelf.getByRole('button', { name: 'Log shot', exact: true })).toBeDisabled();
    await friendContext.setOffline(false);
    await friendShelf.getByRole('button', { name: 'Add bottle', exact: true }).click();
    const form = friendPage.getByRole('dialog', { name: 'Share a bottle', exact: true });
    await form.getByLabel('Bottle name').fill('Sam’s rosé');
    await form.getByLabel('What’s in the bottle?').selectOption('wine');
    await form.getByLabel('Your drinks from this bottle').fill('1');
    await expect(form.getByRole('checkbox', { name: 'Make this my main drink' })).not.toBeChecked();
    await form.getByRole('checkbox', { name: 'Make this my main drink' }).check();
    await form.getByRole('button', { name: 'Share & start tracking', exact: true }).click();
    await expect(friendPage.getByRole('dialog')).toHaveCount(0);
    await expect(friendPage.locator('.main-drink')).toContainText('Sam’s rosé');
    await expect(friendPage.getByRole('button', { name: 'Log drink', exact: true })).toBeVisible();
    await expect(hostShelf.getByRole('heading', { name: 'Sam’s rosé' })).toBeVisible();
    await hostShelf.getByRole('button', { name: 'Close dialog' }).click();
    const midNightPrompt = page.getByRole('dialog', { name: 'Sharing this bottle?' });
    await expect(midNightPrompt.getByLabel('Your drinks from this bottle')).toHaveValue('1');
    await midNightPrompt.getByRole('button', { name: 'Not for me' }).click();
    await expect(page.locator('.main-drink')).toContainText('Friday gin');
    await page.reload();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('Friday gin is your main drink')).toHaveCount(0);
    await page.locator('.bottle-launcher').click();
    await hostShelf.getByRole('button', { name: 'Join bottle', exact: true }).click();
    const joinForm = page.getByRole('dialog', { name: 'Join this bottle', exact: true });
    await joinForm.getByLabel('Your drinks from this bottle').fill('2');
    await expect(
      joinForm.getByRole('checkbox', { name: 'Make this the main drink' }),
    ).not.toBeChecked();
    await joinForm.getByRole('checkbox', { name: 'Make this the main drink' }).check();
    await joinForm.getByRole('button', { name: 'Join & start tracking' }).click();
    await expect(page.locator('.main-drink')).toContainText('Sam’s rosé');
    await page.locator('.main-drink').getByRole('button', { name: 'Adjust' }).click();
    const plan = page.getByRole('dialog', { name: "Ari's plan" });
    await plan
      .locator('.plan-item')
      .filter({ has: page.locator('input[value="Friday gin"]') })
      .getByRole('radio', { name: 'Main drink' })
      .check();
    await plan.getByRole('button', { name: 'Save plan', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.main-drink')).toContainText('Friday gin');
    await page.reload();
    await expect(page.locator('.main-drink')).toContainText('Friday gin');
    await page.locator('.main-drink').getByRole('button', { name: 'Adjust' }).click();
    await plan.getByRole('button', { name: 'Remove Friday gin', exact: true }).click();
    await plan.getByRole('button', { name: 'Save plan', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('.main-drink')).toContainText('Sam’s rosé');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const latest = await host.client.rpc('get_night_snapshot', { p_night_id: nightId });
    if (latest.error) throw latest.error;
    const snapshot = latest.data as unknown as NightSnapshot;
    expect(snapshot.sharedBottles).toHaveLength(2);
    const sam = snapshot.members.find((member) => member.displayName === 'Sam');
    expect(sam?.planItems).toHaveLength(2);
    expect(sam?.drinkLogs).toHaveLength(1);
    expect(sam?.planItems.find((item) => item.isQuickLog)?.label).toBe('Sam’s rosé');
    expect(errors).toEqual([]);
  } finally {
    await friendContext.close();
  }
});
