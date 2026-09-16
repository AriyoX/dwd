import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const password = 'local-auth-test-password';
function adminClient() {
  const url = process.env['E2E_SUPABASE_URL'] ?? '';
  if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname))
    throw new Error('Local auth tests only.');
  return createClient(url, process.env['E2E_SUPABASE_SECRET_KEY'] ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function prepareLocalProfile(userId: string) {
  if (!/^[0-9a-f-]{36}$/.test(userId)) throw new Error('Invalid fixture identifier');
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
      `delete from public.audit_events where actor_user_id='${userId}'; delete from public.profiles where id='${userId}';`,
    ],
    { stdio: 'pipe' },
  );
}

async function removeLocalUser(admin: ReturnType<typeof adminClient>, userId: string) {
  prepareLocalProfile(userId);
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw error;
}

test('Google is available on both forms and recovers if the provider is unavailable', async ({
  page,
}, info) => {
  await page.route('**/auth/v1/settings', (route) =>
    route.fulfill({ json: { external: { google: false } } }),
  );
  for (const path of ['/login', '/signup']) {
    await page.goto(path);
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('Please use email');
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
    await expect(page.getByLabel('Email address')).toBeEditable();
  }
  mkdirSync('.tmp/ui-review', { recursive: true });
  await page.screenshot({
    path: `.tmp/ui-review/auth-signup-${info.project.name}.png`,
    fullPage: true,
  });
});

test('Google starts OAuth with the original invitation and a PKCE challenge', async ({ page }) => {
  const next = '/join/preserved-google-invitation';
  await page.route('**/auth/v1/settings', (route) =>
    route.fulfill({ json: { external: { google: true } } }),
  );
  await page.route('**/auth/v1/authorize?**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1>Google consent handoff</h1>' }),
  );
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await expect(page.getByRole('heading', { name: 'Google consent handoff' })).toBeVisible();
  const url = new URL(page.url());
  expect(url.searchParams.get('provider')).toBe('google');
  expect(url.searchParams.get('code_challenge')).toBeTruthy();
  const callback = new URL(url.searchParams.get('redirect_to') ?? '');
  expect(callback.pathname).toBe('/auth/callback');
  expect(callback.searchParams.get('next')).toBe(next);
});

test('cancelled Google and expired reset links retain the invitation', async ({ page }) => {
  const next = '/join/preserved';
  await page.goto(`/auth/callback?error=access_denied&next=${encodeURIComponent(next)}`);
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Google sign-in wasn’t completed',
  );
  expect(new URL(page.url()).searchParams.get('next')).toBe(next);
  const recovery = `/reset-password?next=${encodeURIComponent(next)}`;
  await page.goto(`/auth/confirm?next=${encodeURIComponent(recovery)}`);
  await expect(page).toHaveURL(/forgot-password/);
  await expect(page.getByRole('main').getByRole('alert')).toContainText('reset link has expired');
  expect(new URL(page.url()).searchParams.get('next')).toBe(next);
});

test('pending signup survives refresh and confirms directly into the invitation', async ({
  page,
}, info) => {
  test.skip(
    !process.env['E2E_SUPABASE_SECRET_KEY'],
    'Local admin key required for email fixtures.',
  );
  const admin = adminClient();
  const email = `code-${info.project.name}-${Date.now()}@example.test`;
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'signup',
    email,
    password,
    options: { data: { display_name: 'Email Test', age_confirmed: true } },
  });
  if (error) throw error;
  try {
    const next = '/join/preserved-code-invitation';
    await page.goto(`/login?next=${encodeURIComponent(next)}`);
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Check your email.' })).toBeVisible();
    await page.reload();
    await expect(page.getByText(email, { exact: true })).toBeVisible();
    expect(page.url()).not.toContain(encodeURIComponent(email));
    if (process.env['E2E_CONFIRMATION_CODES'] === 'false') {
      await expect(page.getByLabel('Confirmation code')).toHaveCount(0);
      await page.getByRole('button', { name: 'I’ve confirmed my email' }).click();
      await expect(page.getByRole('main').getByRole('alert')).toContainText('Open the email link');
      await page.screenshot({
        path: `.tmp/ui-review/auth-confirmation-link-${info.project.name}.png`,
        fullPage: true,
      });
      const emailTab = await page.context().newPage();
      await emailTab.goto(
        `/auth/confirm?token_hash=${data.properties.hashed_token}&type=email&next=${encodeURIComponent(next)}`,
      );
      await expect(emailTab).toHaveURL(new RegExp(next));
      await emailTab.close();
      await page.bringToFront();
    } else {
      await page.getByLabel('Confirmation code').fill('000000');
      await page.getByRole('button', { name: 'Confirm and continue' }).click();
      await expect(page.getByRole('main').getByRole('alert')).toContainText(
        'expired or is incorrect',
      );
      await page.screenshot({
        path: `.tmp/ui-review/auth-confirmation-code-${info.project.name}.png`,
        fullPage: true,
      });
      await page.getByLabel('Confirmation code').fill(data.properties.email_otp);
      await page.getByRole('button', { name: 'Confirm and continue' }).click();
    }
    await expect(page).toHaveURL(new RegExp(next));
    expect(
      (await page.context().cookies()).some((cookie) => cookie.name === 'dwd-pending-confirmation'),
    ).toBe(false);
  } finally {
    await removeLocalUser(admin, data.user.id);
  }
});

test('confirming in another tab lets the original tab continue', async ({ page }, info) => {
  test.skip(
    !process.env['E2E_SUPABASE_SECRET_KEY'],
    'Local admin key required for email fixtures.',
  );
  const admin = adminClient();
  const email = `link-${info.project.name}-${Date.now()}@example.test`;
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'signup',
    email,
    password,
    options: { data: { display_name: 'Link Test', age_confirmed: true } },
  });
  if (error) throw error;
  try {
    const next = '/join/preserved-link-invitation';
    await page.goto(`/login?next=${encodeURIComponent(next)}`);
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Check your email.' })).toBeVisible();
    const emailTab = await page.context().newPage();
    await emailTab.goto(
      `/auth/confirm?token_hash=${data.properties.hashed_token}&type=email&next=${encodeURIComponent(next)}`,
    );
    await expect(emailTab).toHaveURL(new RegExp(next));
    await emailTab.close();
    await page.bringToFront();
    await expect(page).toHaveURL(new RegExp(next));
  } finally {
    await removeLocalUser(admin, data.user.id);
  }
});

test('a Google identity must finish its profile before joining', async ({ page }, info) => {
  test.skip(
    !process.env['E2E_SUPABASE_SECRET_KEY'],
    'Local admin key required for Google identity fixture.',
  );
  const admin = adminClient();
  const email = `google-${info.project.name}-${Date.now()}@example.test`;
  // The admin create-user endpoint inserts an email identity first. Remove its
  // profile to model a Google identity awaiting onboarding; the SQL suite tests
  // the actual Google insert trigger independently.
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'Google Test', display_name: 'Google Test', age_confirmed: true },
  });
  if (error) throw error;
  prepareLocalProfile(data.user.id);
  try {
    const next = '/join/preserved-onboarding';
    await page.goto(`/login?next=${encodeURIComponent(next)}`);
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/complete-signup/);
    await expect(page.getByLabel('Display name')).toHaveValue('Google Test');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page).toHaveURL(/complete-signup/);
    await page.getByLabel('I am 18 or older.').check();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(next));
    const profile = execFileSync(
      'docker',
      [
        'exec',
        process.env['E2E_AUTH_DB_CONTAINER'] ?? 'supabase_db_dwd-e2e',
        'psql',
        '-XAt',
        '-U',
        'postgres',
        '-d',
        'postgres',
        '-c',
        `select display_name from public.profiles where id='${data.user.id}'`,
      ],
      { encoding: 'utf8' },
    );
    expect(profile.trim()).toBe('Google Test');
  } finally {
    await removeLocalUser(admin, data.user.id);
  }
});
