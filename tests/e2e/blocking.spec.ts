import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { test, expect, type Page } from '@playwright/test';
import type { Database, NightSnapshot } from '@dwd/core';

async function account(displayName: string) {
  const backend = process.env['E2E_SUPABASE_URL'] ?? '';
  if (!['localhost', '127.0.0.1'].includes(new URL(backend).hostname))
    throw new Error('Local test backend required.');
  const client = createClient<Database>(backend, process.env['E2E_SUPABASE_PUBLISHABLE_KEY'] ?? '');
  const email = `blocking-${randomUUID()}@example.test`;
  const password = 'local-block-review-123';
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName, age_confirmed: true, tour_seen: true } },
  });
  if (error || !data.user) throw error ?? new Error('Test account missing');
  return { client, email, password, id: data.user.id };
}

async function login(page: Page, user: Awaited<ReturnType<typeof account>>) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
}

test('blocking in a shared night persists, prevents rejoining, and can be undone in account settings', async ({
  page,
}) => {
  test.skip(!process.env['E2E_SUPABASE_PUBLISHABLE_KEY'], 'Local backend required.');
  const host = await account('Block Review Host');
  const friend = await account('Block Review Friend');
  const created = await host.client.rpc('start_night_out', {
    p_creation_key: randomUUID(),
    p_title: 'Block review',
    p_timezone: 'Africa/Nairobi',
    p_ends_at: new Date(Date.now() + 7_200_000).toISOString(),
    p_host_plan: [],
    p_guests: [],
  });
  expect(created.error).toBeNull();
  const nightId = (created.data as { nightId: string }).nightId;
  const hash = randomUUID().replaceAll('-', '').repeat(2);
  try {
    expect(
      (
        await host.client.rpc('create_night_invite', {
          p_night_id: nightId,
          p_token_hash: hash,
          p_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        })
      ).error,
    ).toBeNull();
    expect(
      (await friend.client.rpc('redeem_night_invite', { p_token_hash: hash })).error,
    ).toBeNull();
    await login(page, host);
    await page.goto(`/night/${nightId}`);
    const controls = page
      .getByRole('main')
      .locator('details:visible')
      .filter({ has: page.locator('summary', { hasText: /^Report content or block someone$/ }) });
    await controls.locator(':scope > summary').click();
    const person = controls
      .locator('details')
      .filter({ has: page.locator('summary', { hasText: /^Block Review Friend$/ }) });
    await person.locator(':scope > summary').click();
    // Cancellation must not create a block or change either membership.
    page.once('dialog', (dialog) => dialog.dismiss());
    await person.getByRole('button', { name: 'Block person', exact: true }).click();
    expect((await host.client.rpc('get_blocked_users')).data).toEqual([]);
    expect(
      (await friend.client.rpc('get_night_snapshot', { p_night_id: nightId })).error,
    ).toBeNull();
    page.once('dialog', (dialog) => dialog.accept());
    await person.getByRole('button', { name: 'Block person', exact: true }).click();
    await expect(page).toHaveURL(/\/home$/);
    expect((await host.client.rpc('get_blocked_users')).data).toEqual([
      { userId: friend.id, displayName: 'Block Review Friend' },
    ]);
    expect((await friend.client.rpc('get_blocked_users')).data).toEqual([]);
    expect(
      (await friend.client.rpc('get_night_snapshot', { p_night_id: nightId })).error,
    ).not.toBeNull();
    const rejoin = await friend.client.rpc('redeem_night_invite', { p_token_hash: hash });
    expect(rejoin.error).not.toBeNull();
    await page.goto('/account');
    // Wait for account hydration before opening an uncontrolled native disclosure.
    await expect(page.getByRole('textbox', { name: 'Your name' })).toBeEnabled();
    const list = page
      .getByRole('main')
      .locator('details:visible')
      .filter({ has: page.locator('summary', { hasText: /^Blocked people$/ }) });
    await list.locator(':scope > summary').click();
    await expect(list.getByRole('button', { name: 'Unblock Block Review Friend' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('textbox', { name: 'Your name' })).toBeEnabled();
    await list.locator(':scope > summary').click();
    await list.getByRole('button', { name: 'Unblock Block Review Friend' }).click();
    await expect(list.getByText('No blocked people.', { exact: true })).toBeVisible();
    expect((await host.client.rpc('get_blocked_users')).data).toEqual([]);
    const beforeRejoin = await host.client.rpc('get_night_snapshot', { p_night_id: nightId });
    expect(beforeRejoin.error).toBeNull();
    const snapshot = beforeRejoin.data as unknown as NightSnapshot;
    expect(snapshot.members.find((member) => member.userId === friend.id)?.leftAt).toEqual(
      expect.any(String),
    );
    expect(
      (await friend.client.rpc('get_night_snapshot', { p_night_id: nightId })).error,
    ).not.toBeNull();
    expect(
      (await friend.client.rpc('redeem_night_invite', { p_token_hash: hash })).error,
    ).toBeNull();
    expect(
      (await friend.client.rpc('get_night_snapshot', { p_night_id: nightId })).error,
    ).toBeNull();
  } finally {
    await host.client.rpc('end_night', { p_night_id: nightId });
    await host.client.auth.signOut();
    await friend.client.auth.signOut();
  }
});
