import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import type { Database } from '@dwd/core';

async function user(profile = true) {
  const client = createClient<Database>(
    process.env['E2E_SUPABASE_URL'] ?? '',
    process.env['E2E_SUPABASE_PUBLISHABLE_KEY'] ?? '',
  );
  const email = `primary-${randomUUID()}@example.test`,
    password = 'primary-local-password-123';
  const request = {
    email,
    password,
    options: {
      data: profile
        ? { display_name: 'Primary test', age_confirmed: true, tour_seen: true }
        : { tour_seen: true },
    },
  };
  const admin = createClient<Database>(
    process.env['E2E_SUPABASE_URL'] ?? '',
    process.env['E2E_SUPABASE_SECRET_KEY'] ?? '',
  );
  const { data, error } = profile
    ? await client.auth.signUp(request)
    : await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: 'Awaiting profile', age_confirmed: true, tour_seen: true },
      });
  if (error || !data.user) throw error ?? new Error('Missing account');
  if (!profile) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.user.id))
      throw new Error('Invalid fixture identifier');
    // Match the existing auth suite: the admin endpoint inserts an email identity first.
    // The database suites independently verify the actual Google/Apple deferred-profile trigger.
    execFileSync('docker', [
      'exec',
      process.env['E2E_AUTH_DB_CONTAINER'] ?? 'supabase_db_dwd-e2e',
      'psql',
      '-Xq',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-c',
      `delete from public.profiles where id='${data.user.id}'::uuid;`,
    ]);
    const signedIn = await client.auth.signInWithPassword({ email, password });
    if (signedIn.error) throw signedIn.error;
  }
  return { client, email, password, id: data.user.id };
}
async function logGuest(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Just log it.' })).toBeVisible();
  await page.getByRole('checkbox', { name: /18 or older/ }).click();
  await page.getByRole('button', { name: 'Log one drink' }).click({ clickCount: 3, delay: 35 });
  await page.getByRole('button', { name: 'Log one non-alcoholic chaser' }).click();
  await expect(page.getByText('3 drinks · 1 chaser', { exact: true })).toBeVisible();
  return page.evaluate(() => {
    const raw = localStorage.getItem('dwd.quick-log.v1:guest');
    if (!raw) throw new Error('Guest session was not saved');
    return JSON.parse(raw) as { activeSessionId: string };
  });
}
async function signIn(page: Page, account: Awaited<ReturnType<typeof user>>) {
  await page.getByLabel('Email address').fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

test('the normal guest homepage is ready for logging, and discovery is dismissible with no repeated promotions', async ({
  page,
}, info) => {
  await page.route('**/auth/v1/**', (route) => route.abort());
  await logGuest(page);
  await expect(page.getByRole('dialog')).not.toBeVisible();
  const header = page.locator('.topbar');
  await expect(header.getByRole('button', { name: 'Get the App', exact: true })).toBeVisible();
  await header.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Photo memories');
  await expect(page.getByRole('dialog')).toContainText('Join invitations');
  await page.getByRole('button', { name: 'Keep logging as a guest' }).click();
  await page.getByRole('button', { name: 'Log one drink' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByText('4 drinks · 1 chaser', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Terms', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Privacy', exact: true })).toBeVisible();
  await page.screenshot({
    path: `.tmp/quick-primary-home-${info.project.name}.png`,
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('guest sign-in saves exactly once, resumes the same session and restores it on another device without a Night', async ({
  page,
  browser,
}) => {
  test.skip(!process.env['E2E_SUPABASE_PUBLISHABLE_KEY'], 'Local Supabase required.');
  const account = await user();
  const guest = await logGuest(page);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('dialog').getByRole('link', { name: 'Sign in', exact: true }).click();
  await signIn(page, account);
  await expect(page).toHaveURL(/\/quick-log/);
  await expect(page.getByText('3 drinks · 1 chaser', { exact: true })).toBeVisible();
  await expect
    .poll(async () => {
      const { data, error } = await account.client.rpc('get_quick_log_sessions', {});
      if (error) throw error;
      return (data as unknown as { id: string; entries: unknown[] }[]).find(
        (s) => s.id === guest.activeSessionId,
      )?.entries.length;
    })
    .toBe(4);
  const nights = await account.client.rpc('get_active_nights', {});
  expect(nights.error).toBeNull();
  expect(nights.data).toEqual([]);
  await page.reload();
  await expect(page.getByText('3 drinks · 1 chaser', { exact: true })).toBeVisible();
  const context = await browser.newContext();
  try {
    const second = await context.newPage();
    await second.goto('http://localhost:3100/login');
    await signIn(second, account);
    await expect(second).toHaveURL(/\/home/);
    await second.getByRole('link', { name: /Resume Quick Log/ }).click();
    await expect(second.getByText('3 drinks · 1 chaser', { exact: true })).toBeVisible();
    await second.getByRole('link', { name: 'Back', exact: true }).click();
    await second.getByRole('link', { name: 'Night history', exact: true }).click();
    await second.getByRole('link', { name: 'Quick Log history', exact: true }).click();
    await expect(second.getByText('Quick Log session', { exact: true })).toBeVisible();
    await expect(
      second.getByText('Drink sizes and alcohol strength not recorded.', { exact: true }),
    ).toBeVisible();
    const result = await account.client.rpc('get_quick_log_sessions', {});
    expect(result.data as unknown as unknown[]).toHaveLength(1);
  } finally {
    await context.close();
  }
});

test('Start Tonight opens Quick Log directly or the existing planned setup, while a live session has a separate resume entry', async ({
  page,
}) => {
  test.skip(!process.env['E2E_SUPABASE_PUBLISHABLE_KEY'], 'Local Supabase required.');
  const account = await user();
  await page.goto('/login');
  await signIn(page, account);
  await expect(page.getByRole('link', { name: /Resume Quick Log/ })).not.toBeVisible();
  await page.getByRole('button', { name: 'Start Tonight', exact: true }).click();
  await page.getByRole('link', { name: /Plan a Night.*Detailed tracking/ }).click();
  await expect(page).toHaveURL(/\/night\/new/);
  await page.goto('/home');
  await page.getByRole('button', { name: 'Start Tonight', exact: true }).click();
  await page.getByRole('link', { name: /Quick Log.*Keep count/ }).click();
  await expect(page.getByRole('button', { name: 'Log one drink' })).toBeEnabled();
  await page.getByRole('button', { name: 'Log one drink' }).click();
  await page.getByRole('link', { name: 'Back', exact: true }).click();
  await page.getByRole('link', { name: /Resume Quick Log/ }).click();
  await expect(page.getByText('1 drink · 0 chasers', { exact: true })).toBeVisible();
});

test('guest logs survive new-account profile completion and failed synchronization, then retry without duplicates', async ({
  page,
}) => {
  test.skip(!process.env['E2E_SUPABASE_PUBLISHABLE_KEY'], 'Local Supabase required.');
  const account = await user(false);
  await logGuest(page);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('dialog').getByRole('link', { name: 'Sign in', exact: true }).click();
  await page.route('**/rest/v1/rpc/sync_quick_log', (route) => route.abort());
  await signIn(page, account);
  await expect(page).toHaveURL(/complete-signup/);
  await page.getByLabel('Display name').fill('New account');
  await page.getByRole('checkbox', { name: /18 or older/ }).check();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL(/\/quick-log/);
  await expect(page.getByText('3 drinks · 1 chaser', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry account saving' })).toBeVisible();
  await page.unroute('**/rest/v1/rpc/sync_quick_log');
  await page.getByRole('button', { name: 'Retry account saving' }).click();
  await expect
    .poll(async () => {
      const result = await account.client.rpc('get_quick_log_sessions', {});
      return (result.data as unknown as { entries: unknown[] }[])[0]?.entries.length;
    })
    .toBe(4);
  await page.reload();
  await expect(page.getByText('3 drinks · 1 chaser', { exact: true })).toBeVisible();
});
test('a guest creates an account from discovery and keeps all logs without Night setup', async ({
  page,
}) => {
  test.skip(!process.env['E2E_SUPABASE_PUBLISHABLE_KEY'], 'Local Supabase required.');
  await logGuest(page);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('dialog').getByRole('link', { name: 'Create account', exact: true }).click();
  const email = `primary-signup-${randomUUID()}@example.test`,
    password = 'primary-signup-password-123';
  await page.getByLabel('Display name').fill('Guest signup');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('New password', { exact: true }).fill(password);
  await page.getByRole('checkbox', { name: /18 or older/ }).check();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/quick-log/);
  await expect(page.getByText('3 drinks · 1 chaser', { exact: true })).toBeVisible();
  const client = createClient<Database>(
    process.env['E2E_SUPABASE_URL'] ?? '',
    process.env['E2E_SUPABASE_PUBLISHABLE_KEY'] ?? '',
  );
  const auth = await client.auth.signInWithPassword({ email, password });
  if (auth.error) throw auth.error;
  await expect
    .poll(async () => {
      const result = await client.rpc('get_quick_log_sessions', {});
      return (result.data as unknown as { entries: unknown[] }[])[0]?.entries.length;
    })
    .toBe(4);
  const nights = await client.rpc('get_active_nights', {});
  expect(nights.data).toEqual([]);
});
test('account discovery keeps unsaved guest taps on the page until device saving succeeds', async ({
  page,
}) => {
  await logGuest(page);
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Delegated calls preserve the original Storage receiver.
    const original = Storage.prototype.setItem;
    Object.defineProperty(window, 'restoreQuickSave', {
      value: () => {
        Storage.prototype.setItem = original;
      },
    });
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('dwd.quick-log.')) throw new DOMException('Quota', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  await page.getByRole('button', { name: 'Log one drink' }).click();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('link', { name: 'Sign in', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText(
    'Save your logs on this device before signing in',
  );
  await expect(page).not.toHaveURL(/\/login/);
  await page.evaluate(() =>
    (window as unknown as { restoreQuickSave: () => void }).restoreQuickSave(),
  );
  await dialog.getByRole('button', { name: 'Retry saving', exact: true }).click();
  await dialog.getByRole('link', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goBack();
  await expect(page.getByText('4 drinks · 1 chaser', { exact: true })).toBeVisible();
});
