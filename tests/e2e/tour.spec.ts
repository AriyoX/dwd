import { test, expect, type Page, type Request } from '@playwright/test';

async function signup(page: Page, email: string) {
  await page.goto('/signup');
  await page.getByLabel('Display name', { exact: true }).fill('Tour Test');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('New password', { exact: true }).fill('local-test-password-123');
  await page.getByLabel('I am 18 or older.').check();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
}

async function coach(page: Page, id: string) {
  const card = page.locator(`[data-tour-coach][data-step="${id}"]`);
  await expect(card).toBeVisible();
  await expect(page.locator('.tour-spotlight')).toBeVisible();
  await expect
    .poll(async () => {
      const a = await card.boundingBox();
      const b = await page.locator('.tour-spotlight').boundingBox();
      const viewport = page.viewportSize();
      if (!a || !b || !viewport) return false;
      return (
        a.x >= 0 &&
        a.y >= 0 &&
        a.x + a.width <= viewport.width + 1 &&
        a.y + a.height <= viewport.height + 1 &&
        (a.x + a.width <= b.x ||
          b.x + b.width <= a.x ||
          a.y + a.height <= b.y ||
          b.y + b.height <= a.y)
      );
    })
    .toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  return card;
}

test('contextual tour uses actual screens, interactive controls and isolated sample data', async ({
  page,
  browser,
}, info) => {
  test.skip(!process.env['E2E_SUPABASE_PUBLISHABLE_KEY'], 'Local Supabase required.');
  const prefetchedScreens: string[] = [];
  page.on('request', (request) => {
    if (request.headers()['next-router-prefetch'])
      prefetchedScreens.push(new URL(request.url()).pathname);
  });
  const email = `tour-${info.project.name}-${Date.now()}@example.test`;
  await signup(page, email);
  let card = await coach(page, 'start');
  await expect(page).toHaveURL(/\/home\?tour=start$/);
  await expect(
    page.getByRole('complementary', { name: 'Add DWD to your home screen' }),
  ).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Close tour' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('[data-tour="start"]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(card.getByRole('button', { name: 'Close tour' })).toBeFocused();
  await page.screenshot({ path: `.tmp/tour-${info.project.name}-home.png` });
  const localStepRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    const headers = request.headers();
    if (
      headers['rsc'] === '1' &&
      !headers['next-router-prefetch'] &&
      ['join', 'choices', 'group', 'help'].includes(url.searchParams.get('tour') ?? '')
    )
      localStepRequests.push(request.url());
  });
  await card.getByRole('button', { name: 'Next', exact: true }).click();
  card = await coach(page, 'join');
  await expect(page.getByLabel('Invitation link or code')).toHaveValue('Practice invite');
  await card.getByRole('button', { name: 'Back', exact: true }).click();
  card = await coach(page, 'start');
  await card.getByRole('button', { name: 'Next', exact: true }).click();
  await coach(page, 'join');
  await page.getByRole('button', { name: 'Join night', exact: true }).click();
  card = await coach(page, 'log');
  await expect(page).toHaveURL(/\/night\/tour\?tour=log$/);
  await expect(page.locator('.personal-card [data-testid="drink-count"]')).toHaveText('1');
  const writes: string[] = [];
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      (new URL(request.url()).pathname.startsWith('/night/') || request.url().includes('/rest/v1/'))
    )
      writes.push(request.url());
  });
  await page.getByRole('button', { name: 'Log Beer', exact: false }).click();
  await expect(page.locator('[data-testid="drink-count"]')).toHaveText('2');
  await expect(page.getByRole('button', { name: 'Use dark mode' })).toBeHidden();
  await page.screenshot({ path: `.tmp/tour-${info.project.name}-logging.png` });
  await card.getByRole('button', { name: 'Next', exact: true }).click();
  card = await coach(page, 'choices');
  await page.getByRole('button', { name: 'Water', exact: true }).click();
  await expect(page.locator('[data-tour="plan"]')).toContainText('2 water entries');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('[data-tour="plan"]')).toContainText('1 water entry');
  await page.getByRole('button', { name: 'Choose another drink' }).click();
  const chooser = page.getByRole('dialog', { name: 'Log for You' });
  await expect(chooser).toBeVisible();
  await expect(page.locator('[data-tour-coach]')).toBeHidden();
  await chooser.getByRole('button', { name: /Beer.*330/ }).click();
  card = await coach(page, 'choices');
  await expect(page.locator('[data-testid="drink-count"]')).toHaveText('3');
  await page.reload();
  card = await coach(page, 'choices');
  await expect(page.locator('[data-testid="drink-count"]')).toHaveText('1');
  await card.getByRole('button', { name: 'Next', exact: true }).click();
  card = await coach(page, 'group');
  await expect(page).toHaveURL(/view=group&tour=group/);
  await expect(page.locator('[data-tour="group-card"]')).toContainText('Alex');
  await card.getByRole('button', { name: 'Next', exact: true }).click();
  card = await coach(page, 'help');
  await page.getByRole('button', { name: 'Get help', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await expect(page.getByRole('alertdialog').locator('a[href^="tel:"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  card = await coach(page, 'help');
  await card.getByRole('button', { name: 'Next', exact: true }).click();
  card = await coach(page, 'history');
  await expect(page).toHaveURL(/\/history\?tour=history$/);
  await page.locator('[data-tour="history-entry"]').click();
  card = await coach(page, 'history');
  await expect(page).toHaveURL(/\/night\/tour\/summary\?tour=history$/);
  await expect(page.locator('[data-tour="history-summary"]')).toContainText('1 drinks');
  await card.getByRole('button', { name: 'Finish tour' }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByText('No active nights yet.')).toBeVisible();
  expect(writes).toEqual([]);
  expect(localStepRequests, 'Same-screen steps must not wait for another server render').toEqual(
    [],
  );
  if (process.env['E2E_PRODUCTION'] === '1') {
    expect(prefetchedScreens).toContain('/night/tour');
    expect(prefetchedScreens).toContain('/history');
  }
  expect(
    await page.evaluate(() =>
      Object.keys(sessionStorage).filter((key) => key.startsWith('dwd-tour-session:')),
    ),
  ).toEqual([]);
  await page.goto('/history');
  await expect(page.getByRole('heading', { name: 'No finished nights yet' })).toBeVisible();
  await expect(page.getByText('Friday with friends')).toHaveCount(0);

  await page.goto('/account');
  const replayWrites: string[] = [];
  const listener = (request: Request) => {
    if (request.method() === 'POST') replayWrites.push(request.url());
  };
  page.on('request', listener);
  await page.getByRole('button', { name: 'Take a tour' }).click();
  await coach(page, 'start');
  await page.locator('[data-tour="start"]').click();
  await coach(page, 'log');
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/account$/);
  expect(replayWrites).toEqual([]);
  page.off('request', listener);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Take a tour' })).toBeVisible();
  await expect(page.locator('[data-tour-coach]')).toHaveCount(0);

  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto('http://localhost:3100/login');
  await otherPage.getByLabel('Email address').fill(email);
  await otherPage.getByLabel('Password', { exact: true }).fill('local-test-password-123');
  await otherPage.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(otherPage).toHaveURL(/\/home$/);
  await otherPage.getByLabel('Account menu').click();
  await otherPage.getByRole('link', { name: 'Your account', exact: true }).click();
  await expect(otherPage.getByRole('button', { name: 'Take a tour' })).toBeVisible();
  await expect(otherPage.locator('[data-tour-coach]')).toHaveCount(0);
  await other.close();
});

test('skip, normal navigation, stale routes, dark mode and installation tip', async ({
  page,
}, info) => {
  test.skip(!process.env['E2E_SUPABASE_PUBLISHABLE_KEY'], 'Local Supabase required.');
  await signup(page, `tour-edges-${info.project.name}-${Date.now()}@example.test`);
  let card = await coach(page, 'start');
  await card.getByRole('button', { name: 'Skip tour' }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(
    page.getByRole('complementary', { name: 'Add DWD to your home screen' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss install tip' }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your evening, Tour.' })).toBeVisible();
  await expect(page.locator('[data-tour-coach], .install-hint')).toHaveCount(0);
  await page.getByRole('button', { name: 'Use dark mode' }).click();
  await page.getByLabel('Account menu').click();
  await page.getByRole('button', { name: 'Take a tour' }).click();
  card = await coach(page, 'start');
  await card.getByRole('button', { name: 'Next', exact: true }).click();
  await coach(page, 'join');
  await page.screenshot({ path: `.tmp/tour-${info.project.name}-dark.png` });
  await page.goto('/account');
  await expect(page.getByRole('button', { name: 'Take a tour' })).toBeVisible();
  await expect(page.locator('[data-tour-coach]')).toHaveCount(0);
  await page.goto('/night/tour?tour=log');
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByText('Friday with friends')).toHaveCount(0);
  await page.goto('/history?tour=history');
  await expect(page).toHaveURL(/\/history$/);
  await expect(page.getByRole('heading', { name: 'No finished nights yet' })).toBeVisible();
  const manifest = await page.request.get('/manifest.webmanifest');
  expect(manifest.ok()).toBe(true);
  expect(await manifest.json()).toMatchObject({ display: 'standalone', start_url: '/home' });
  expect((await page.request.get('/icons/icon-192.png')).ok()).toBe(true);
});

test('first login starts a tour even after another account skipped on this device', async ({
  page,
}, info) => {
  test.skip(!process.env['E2E_SUPABASE_PUBLISHABLE_KEY'], 'Local Supabase required.');
  await signup(page, `tour-owner-${info.project.name}-${Date.now()}@example.test`);
  let card = await coach(page, 'start');
  await card.getByRole('button', { name: 'Skip tour' }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.getByLabel('Account menu').click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  const email = `tour-login-${info.project.name}-${Date.now()}@example.test`;
  const response = await page.request.post(`${process.env['E2E_SUPABASE_URL']}/auth/v1/signup`, {
    headers: { apikey: process.env['E2E_SUPABASE_PUBLISHABLE_KEY'] ?? '' },
    data: {
      email,
      password: 'local-test-password-123',
      data: { display_name: 'First Login', age_confirmed: true },
    },
  });
  expect(response.ok()).toBe(true);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('local-test-password-123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  card = await coach(page, 'start');
  await card.getByRole('button', { name: 'Skip tour' }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your evening, First.' })).toBeVisible();
  await expect(page.locator('[data-tour-coach]')).toHaveCount(0);
});
