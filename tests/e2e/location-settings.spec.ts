import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }, info) => {
  const url = process.env['E2E_SUPABASE_URL'] ?? '';
  test.skip(!process.env['E2E_SUPABASE_SECRET_KEY'], 'Local backend required.');
  if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname))
    throw new Error('Local tests only.');
  const admin = createClient(url, process.env['E2E_SUPABASE_SECRET_KEY'] ?? '', {
    auth: { persistSession: false },
  });
  const email = `location-${randomUUID()}@example.test`;
  const password = 'local-location-test-password';
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: 'Location Test', age_confirmed: true, tour_seen: true },
  });
  if (created.error) throw created.error;
  info.annotations.push({ type: 'fixture', description: created.data.user.id });
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
});

test.afterEach(async ({ page }, info) => {
  await page.close();
  const id = info.annotations.find((entry) => entry.type === 'fixture')?.description;
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) return;
  execFileSync(
    'docker',
    [
      'exec',
      process.env['E2E_AUTH_DB_CONTAINER'] ?? 'supabase_db_dwd-e2e',
      'psql',
      '-X',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-c',
      `delete from public.audit_events where actor_user_id='${id}'; delete from public.profiles where id='${id}';`,
    ],
    { stdio: 'pipe' },
  );
  const admin = createClient(
    process.env['E2E_SUPABASE_URL'] ?? '',
    process.env['E2E_SUPABASE_SECRET_KEY'] ?? '',
    { auth: { persistSession: false } },
  );
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) throw error;
});

const prompt = (page: Page) => page.getByRole('complementary', { name: 'Location', exact: true });

test('location prompt is compact, stays on Home, and remembers dismissal', async ({
  page,
}, info) => {
  await expect(prompt(page)).toBeVisible();
  expect((await prompt(page).boundingBox())?.height).toBeLessThan(180);
  expect((await page.getByRole('main').boundingBox())?.y).toBeLessThan(200);
  await page.goto('/account');
  await expect(prompt(page)).toHaveCount(0);
  await expect(page.getByRole('switch', { name: 'Use location' })).toBeVisible();
  await page.screenshot({ path: `.tmp/location-account-${info.project.name}.png`, fullPage: true });
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await prompt(page).getByRole('button', { name: 'Not now' }).click();
  await expect(prompt(page)).toHaveCount(0);
  await page.reload();
  await expect(prompt(page)).toHaveCount(0);
  await expect(page.getByRole('main')).toBeInViewport();
});

test('location can be turned off and stays off after reload despite browser permission', async ({
  page,
  context,
}) => {
  await context.setGeolocation({ latitude: -1.2921, longitude: 36.8219 });
  await context.grantPermissions(['geolocation']);
  await page.goto('/account');
  const location = page.getByRole('region', { name: 'Location settings' });
  const toggle = location.getByRole('switch', { name: 'Use location' });
  await expect(location.getByRole('status')).toHaveText('On · Kenya');
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect(location.getByRole('status')).toHaveText('Off · Uganda (default)');
  await page.reload();
  await expect(toggle).not.toBeChecked();
  await expect(location.getByRole('status')).toHaveText('Off · Uganda (default)');
  await toggle.check();
  await expect(location.getByRole('status')).toHaveText('On · Kenya');
});
