import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import type { Database, NightSnapshot } from '@dwd/core';

test('legacy shots remain drinks when upgraded and can be followed by chasers', async ({
  page,
}) => {
  await page.goto('/quick-log');
  await page.getByRole('checkbox', { name: /18 or older/ }).click();
  await page.getByRole('button', { name: 'Log one drink' }).click();
  await page.evaluate(() => {
    const key = 'dwd.quick-log.v1:guest';
    const value = JSON.parse(localStorage.getItem(key) ?? '{}') as {
      version: number;
      sessions: { schemaVersion: number; entries: { kind: string }[] }[];
    };
    value.version = 2;
    for (const session of value.sessions) {
      session.schemaVersion = 2;
      for (const entry of session.entries) entry.kind = 'shot';
    }
    localStorage.setItem(key, JSON.stringify(value));
  });
  await page.reload();
  await expect(page.getByText('1 drink · 0 chasers', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Log one non-alcoholic chaser' }).click();
  await page.reload();
  await expect(page.getByText('1 drink · 1 chaser', { exact: true })).toBeVisible();
  await page.getByText('Recent activity', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Change to Chaser' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change to Drink' })).toBeVisible();
});

test('Home resumes a guest session after sign-in and a chaser-only import stays non-alcoholic', async ({
  page,
}, testInfo) => {
  test.skip(!process.env['E2E_SUPABASE_PUBLISHABLE_KEY'], 'Local backend required.');
  const url = process.env['E2E_SUPABASE_URL'] ?? '';
  if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname))
    throw new Error('Local backend required.');
  const client = createClient<Database>(url, process.env['E2E_SUPABASE_PUBLISHABLE_KEY'] ?? '');
  const email = `chaser-${randomUUID()}@example.test`,
    password = 'quick-local-password-123';
  const signedUp = await client.auth.signUp({
    email,
    password,
    options: { data: { display_name: 'Chaser test', age_confirmed: true, tour_seen: true } },
  });
  if (signedUp.error) throw signedUp.error;
  const result = await client.rpc('start_night_out_recoverable', {
    p_creation_key: randomUUID(),
    p_title: 'Chaser destination',
    p_ends_at: new Date(Date.now() + 3_600_000).toISOString(),
    p_timezone: 'UTC',
    p_host_plan: [],
    p_guests: [],
  });
  if (result.error) throw result.error;
  const destination = result.data as unknown as { snapshot: NightSnapshot };
  await page.goto('/quick-log');
  await page.getByRole('checkbox', { name: /18 or older/ }).click();
  await page.getByRole('button', { name: 'Log one non-alcoholic chaser' }).click();
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/home/);
  const resume = page.getByRole('link', { name: /Resume Quick Log/ });
  await expect(resume).toContainText('0 drinks · 1 chaser');
  await expect(resume).not.toContainText('Guest session');
  const installHint = page.getByRole('complementary', { name: 'Install dwd' });
  if (await installHint.isVisible())
    await installHint.getByRole('button', { name: 'Not now', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const cardWidth = await resume.evaluate((element) => element.getBoundingClientRect().width);
  expect(cardWidth).toBeGreaterThan(Math.min(page.viewportSize()?.width ?? 390, 600) - 64);
  if (testInfo.project.name === 'mobile')
    await page.screenshot({
      path: '.tmp/quick-log-home-mobile.png',
      fullPage: false,
      style: 'nextjs-portal { visibility: hidden; }',
    });
  await resume.click();
  await expect(page).toHaveURL(/\/quick-log/);
  await page.getByRole('button', { name: 'Add to a night', exact: true }).click();
  await page.getByRole('button', { name: 'Chaser destination', exact: true }).click();
  await page.getByRole('button', { name: 'Add my logs', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/night/${destination.snapshot.night.id}`));
  await expect(page.getByText('Quick Log · 0 drinks · 1 chaser', { exact: true })).toBeVisible();
  const partialTotal = page.getByText(
    'Earlier drinks have no size saved, so the alcohol total is partial.',
    { exact: true },
  );
  await expect(partialTotal).not.toBeVisible();
  const snapshot = await client.rpc('get_night_snapshot', {
    p_night_id: destination.snapshot.night.id,
  });
  if (snapshot.error) throw snapshot.error;
  const member = (snapshot.data as unknown as NightSnapshot).members[0];
  expect(member?.drinkLogs).toHaveLength(0);
  expect(member?.quickLogs?.map((e) => e.kind)).toEqual(['chaser']);
  await page.getByText('Earlier entries', { exact: true }).click();
  await page.getByRole('button', { name: 'Change to Drink', exact: true }).click();
  await expect(page.getByText('Quick Log · 1 drink · 0 chasers', { exact: true })).toBeVisible();
  await expect(partialTotal).toBeVisible();
  await page.getByRole('button', { name: 'Change to Chaser', exact: true }).click();
  await expect(page.getByText('Quick Log · 0 drinks · 1 chaser', { exact: true })).toBeVisible();
  await expect(partialTotal).not.toBeVisible();
});
