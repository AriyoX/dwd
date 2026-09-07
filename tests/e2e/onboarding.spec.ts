import { test, expect } from '@playwright/test';

test('public demo, theme, participant boundaries, summary and reset', async ({ page }, info) => {
  const productionCalls: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('.supabase.co')) productionCalls.push(request.url());
  });
  await page.goto('/login');
  await page.getByRole('link', { name: 'Try a demo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The Amber Room.' })).toBeVisible();
  await page.evaluate(() => localStorage.setItem('dwd-unrelated-test-queue', 'preserve-me'));
  const host = page
    .locator('.card')
    .filter({ has: page.getByRole('heading', { name: 'Alex (you)' }) });
  await host.getByRole('button', { name: 'Water', exact: true }).click();
  await expect(host.locator('.summary-grid')).toContainText('2');
  const ownAccount = page
    .locator('.card')
    .filter({ has: page.getByRole('heading', { name: 'Mika', exact: true }) });
  await expect(ownAccount.getByRole('button')).toHaveCount(0);
  const guest = page
    .locator('.card')
    .filter({ has: page.getByRole('heading', { name: 'Robin', exact: true }) });
  await expect(guest.getByRole('button', { name: 'Log beer' })).toBeDisabled();
  await page.getByRole('button', { name: 'Use dark mode' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(host.locator('.summary-grid')).toContainText('2');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: `.tmp/dwd-${info.project.name}-dark.png`, fullPage: true });
  await page.getByRole('button', { name: 'Use light mode' }).click();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: `.tmp/dwd-${info.project.name}-light.png`, fullPage: true });
  await page.getByRole('button', { name: 'End sample night & view summary' }).click();
  await page.getByRole('button', { name: 'View sample summary', exact: true }).click();
  await expect(page.getByText('Sample summary', { exact: true })).toBeVisible();
  await expect(host.getByRole('button', { name: 'Water', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset demo', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reset demo', exact: true }).click();
  await expect(host.getByRole('button', { name: 'Water', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('dwd-unrelated-test-queue'))).toBe(
    'preserve-me',
  );
  expect(productionCalls).toEqual([]);
  await page.getByRole('link', { name: 'Exit demo' }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('expired links and email correction keep the invitation destination', async ({ page }) => {
  const next = `/join/${'a'.repeat(43)}`;
  await page.goto(`/auth/confirm?next=${encodeURIComponent(next)}`);
  await expect(page).toHaveURL(/confirmation-help/);
  await expect(page.getByText('This link could not be verified.', { exact: false })).toBeVisible();
  await page.getByRole('link', { name: 'Correct a mistyped email' }).click();
  expect(new URL(page.url()).searchParams.get('next')).toBe(next);
  await expect(
    page.getByText('Start signup again with the correct email', { exact: false }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Try a demo', exact: true }).click();
  await page.getByRole('link', { name: 'Create your own account' }).click();
  expect(new URL(page.url()).searchParams.get('next')).toBe(next);
});

test('real local signup, draft recovery, water-only night, support and history', async ({
  page,
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
  await expect(page).toHaveURL(/\/home$/);
  await page.getByRole('link', { name: /Start a night/ }).click();
  await page.getByLabel('Night name').fill('Water-only test night');
  await page.getByRole('button', { name: 'Just me', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Water only', exact: true }).click();
  await page.reload();
  await expect(
    page.getByText('Your unfinished setup was restored', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Water only', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText('Water-only test night', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start night', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Water-only test night' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Water', exact: true }).click();
  await expect(page.getByText('Your plan · 1 water entry', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Manage', exact: true }).click();
  await page.getByRole('button', { name: 'Invite someone', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Create invite link' }).click();
  await expect(dialog.locator('.invite-url')).toContainText('/join/');
  const originalLink = await dialog.locator('.invite-url').innerText();
  // Abort a server action response; controls must recover and retain the same operation.
  await page.route('**/night/*', (route) =>
    route.request().method() === 'POST' ? route.abort('failed') : route.continue(),
  );
  await dialog.getByRole('button', { name: 'Replace invite link' }).click();
  await expect(dialog.getByRole('button', { name: 'Retry invitation operation' })).toBeEnabled();
  await page.unroute('**/night/*');
  await dialog.getByRole('button', { name: 'Retry invitation operation' }).click();
  await expect(dialog.locator('.invite-url')).not.toHaveText(originalLink);
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('button', { name: 'End night and view summary' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'End night', exact: true }).click();
  await expect(page).toHaveURL(/\/summary$/);
  const summary = page.url();
  await page.goto('/history');
  await expect(page.getByRole('link', { name: /Water-only test night/ })).toHaveAttribute(
    'href',
    new URL(summary).pathname,
  );
  await page.goto('/feedback');
  await page
    .getByLabel('What happened?')
    .fill('Local browser test: checking that reports receive a reference.');
  await page.getByRole('button', { name: 'Send report' }).click();
  await expect(page.getByText('Report received', { exact: true })).toBeVisible();
  await page.goto('/account');
  await expect(page.getByText('Problem report', { exact: true })).toBeVisible();
  await page.getByLabel('I understand this is a request for review.', { exact: false }).check();
  await page.getByRole('button', { name: 'Request account deletion' }).click();
  await expect(
    page.getByText('You already have an open deletion request.', { exact: false }),
  ).toBeVisible();
});
