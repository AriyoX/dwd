import { test, expect } from '@playwright/test';

test('sign-in pages have no demo and old demo links preserve the destination', async ({ page }) => {
  const next = `/join/${'a'.repeat(43)}`;
  await page.goto('/login');
  await expect(page.getByText('Try a demo', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto(`/demo?next=${encodeURIComponent(next)}`);
  await expect(page).toHaveURL(/\/login\?/);
  expect(new URL(page.url()).searchParams.get('next')).toBe(next);
  await page.getByRole('link', { name: 'Create an account', exact: true }).click();
  expect(new URL(page.url()).searchParams.get('next')).toBe(next);
  await expect(page.getByText('Try a demo', { exact: true })).toHaveCount(0);
});

test('expired links and email correction keep the invitation destination', async ({ page }) => {
  const next = `/join/${'a'.repeat(43)}`;
  await page.goto(`/auth/confirm?next=${encodeURIComponent(next)}`);
  await expect(page).toHaveURL(/confirmation-help/);
  await expect(page.getByText('This link could not be verified.', { exact: false })).toBeVisible();
  await page.getByRole('link', { name: 'Use a different email' }).click();
  expect(new URL(page.url()).searchParams.get('next')).toBe(next);
  await expect(
    page.getByText('Create your account with the correct email', { exact: false }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  expect(new URL(page.url()).searchParams.get('next')).toBe(next);
});

test('real local signup, draft recovery, water-only night, support and history', async ({
  page,
  context,
}, info) => {
  test.skip(
    !process.env['E2E_SUPABASE_PUBLISHABLE_KEY'],
    'Local Supabase credentials required for account flows.',
  );
  const email = `dwd-${info.project.name}-${Date.now()}@example.test`;
  await page.goto('/signup');
  await page.getByLabel('Display name', { exact: true }).fill('Alex Test');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('New password', { exact: true }).fill('local-test-password-123');
  await page.getByLabel('I am 18 or older.').check();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/home(?:\?tour=start)?$/);
  await page.getByRole('dialog').getByRole('button', { name: 'Skip tour', exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.getByRole('link', { name: /Start a night/ }).click();
  await page.getByLabel('Night name').fill('Chaser-only test night');
  await page.getByRole('button', { name: 'Just me', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Chaser only', exact: true }).click();
  await page.reload();
  await expect(
    page.getByText('Your unfinished setup was restored', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Chaser only', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText('Chaser-only test night', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start night', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Chaser-only test night' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Chaser', exact: true }).click();
  await expect(page.getByText('Your plan · 1 chaser', { exact: true })).toBeVisible();
  // The count is optimistic. Wait for the idempotent save to settle before
  // navigating so WebKit does not abort the outstanding Server Action.
  await expect(page.getByRole('button', { name: 'Chaser', exact: true })).toBeEnabled();
  const realNightUrl = page.url();
  await page.goto('/account');
  await page.getByRole('button', { name: 'Take a tour' }).click();
  await expect(page.locator('[data-tour-coach][data-step="start"]')).toBeVisible();
  await page.locator('[data-tour="start"]').click();
  await expect(page.locator('[data-tour-coach][data-step="log"]')).toBeVisible();
  await page.getByRole('button', { name: 'Log Beer', exact: false }).click();
  await page.locator('[data-tour-coach]').getByRole('button', { name: 'Skip tour' }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.goto(realNightUrl);
  await expect(page.locator('[data-tour="plan"]')).toContainText('1 chaser');
  await expect(page.locator('[data-testid="drink-count"]')).toHaveText('0');
  await page.getByRole('button', { name: 'Manage', exact: true }).click();
  await page.getByRole('button', { name: 'Invite someone', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Create invite link' }).click();
  await expect(dialog.locator('.invite-url')).toContainText('/join/');
  const originalLink = await dialog.locator('.invite-url').innerText();
  await dialog.locator('.invite-link-options > summary').click();
  // A real offline transition is reliable across engines and verifies that
  // the idempotent operation survives an ambiguous network failure.
  await context.setOffline(true);
  try {
    await dialog.getByRole('button', { name: 'Replace invite link' }).click();
    await expect(dialog.getByRole('button', { name: 'Try again' })).toBeEnabled();
  } finally {
    await context.setOffline(false);
  }
  await dialog.getByRole('button', { name: 'Try again' }).click();
  await expect(dialog.locator('.invite-url')).not.toHaveText(originalLink);
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('button', { name: 'End night and view summary' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'End night', exact: true }).click();
  await expect(page).toHaveURL(/\/summary$/);
  await expect(page.getByRole('heading', { name: 'How the night went' })).toBeVisible();
  const summary = page.url();
  await page.getByRole('link', { name: 'Night history', exact: true }).click();
  await expect(page).toHaveURL(/\/history$/);
  await expect(page.getByRole('link', { name: /Chaser-only test night/ })).toHaveAttribute(
    'href',
    new URL(summary).pathname,
  );
  await page.goto('/feedback');
  await page
    .getByLabel('What happened?')
    .fill('Local browser test: checking that reports receive a reference.');
  await expect(page.getByLabel('What happened?')).toHaveValue(
    'Local browser test: checking that reports receive a reference.',
  );
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Thanks for letting us know', { exact: true })).toBeVisible();
  await page.goto('/account');
  await expect(
    page.getByRole('article').getByText('Something went wrong', { exact: true }),
  ).toBeVisible();
  await page.locator('.account-deletion > summary').click();
  await page.getByRole('checkbox', { name: /I understand I will be signed out/ }).check();
  await page.getByRole('button', { name: 'Delete account in 30 days' }).click();
  await expect(page).toHaveURL(/\/login\?deletion=scheduled$/);
  await expect(
    page.getByText('Account deletion is scheduled in 30 days.', { exact: false }),
  ).toBeVisible();
});
