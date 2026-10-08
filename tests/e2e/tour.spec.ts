import { test, expect, type Page, type Request } from '@playwright/test';
import { readFileSync } from 'node:fs';

function blockedPeopleReadActions(): Set<string> {
  // Account mounts read the block list through a Server Action (HTTP POST).
  // Resolve that specific read from this build; never exempt arbitrary actions.
  const folder = process.env['E2E_PRODUCTION'] === '1' ? '' : 'dev/';
  const manifest: unknown = JSON.parse(
    readFileSync(`apps/web/.next-e2e/${folder}server/server-reference-manifest.json`, 'utf8'),
  );
  if (!manifest || typeof manifest !== 'object' || !('node' in manifest)) return new Set();
  const entries = manifest.node;
  if (!entries || typeof entries !== 'object') return new Set();
  return new Set(
    Object.entries(entries)
      .filter(
        ([, entry]: [string, unknown]) =>
          entry !== null &&
          typeof entry === 'object' &&
          'exportedName' in entry &&
          entry.exportedName === 'getBlockedUsersAction' &&
          'filename' in entry &&
          entry.filename === 'apps/web/src/features/support/moderation-actions.ts',
      )
      .map(([id]) => id),
  );
}

function isDefaultCountryPreference(request: Request): boolean {
  if (!request.headers()['next-action']) return false;
  try {
    const payload: unknown = JSON.parse(request.postData() ?? '');
    if (!Array.isArray(payload) || payload.length !== 1) return false;
    const value: unknown = payload[0];
    return (
      value !== null &&
      typeof value === 'object' &&
      Object.keys(value).length === 3 &&
      'countryCode' in value &&
      typeof value.countryCode === 'string' &&
      'calendarRegion' in value &&
      typeof value.calendarRegion === 'string' &&
      'source' in value &&
      value.source === 'default'
    );
  } catch {
    return false;
  }
}

async function signup(page: Page, email: string) {
  await page.goto('/signup');
  await page.getByLabel('Display name', { exact: true }).fill('Tour Test');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('New password', { exact: true }).fill('local-test-password-123');
  await page.getByRole('checkbox', { name: /I am 18 or older/ }).check();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
}

async function tabThroughControls(page: Page, project: string, reverse = false) {
  // WebKit follows Safari's keyboard preference: Option-Tab includes links and
  // buttons. Dialog/tour focus traps still receive the standard Tab key.
  await page.keyboard.press(
    `${reverse ? 'Shift+' : ''}${project === 'webkit-mobile' ? 'Alt+' : ''}Tab`,
  );
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
  await expect(page.getByRole('complementary', { name: 'Install dwd' })).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Close tour' })).toBeFocused();
  await tabThroughControls(page, info.project.name, true);
  await expect(page.locator('[data-tour="start"]')).toBeFocused();
  await tabThroughControls(page, info.project.name);
  await expect(card.getByRole('button', { name: 'Close tour' })).toBeFocused();
  await page.screenshot({ path: `.tmp/tour-${info.project.name}-home.png` });
  const localStepRequests: string[] = [];
  let observeLocalSteps = true;
  page.on('request', (request) => {
    const url = new URL(request.url());
    const headers = request.headers();
    if (
      observeLocalSteps &&
      headers['rsc'] === '1' &&
      !headers['next-router-prefetch'] &&
      ['join', 'choices', 'bottles', 'group', 'help'].includes(url.searchParams.get('tour') ?? '')
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
      // Country preferences can save again after the explicit reload; they do
      // not create or change the isolated tour's nights, entries or photos.
      !isDefaultCountryPreference(request) &&
      (new URL(request.url()).pathname.startsWith('/night/') || request.url().includes('/rest/v1/'))
    )
      writes.push(request.url());
  });
  await page.getByRole('button', { name: 'Log Beer', exact: false }).click();
  await expect(page.locator('[data-testid="drink-count"]')).toHaveText('2');
  await expect(page.getByLabel('Change appearance', { exact: true })).toBeHidden();
  await page.screenshot({ path: `.tmp/tour-${info.project.name}-logging.png` });
  await card.getByRole('button', { name: 'Next', exact: true }).click();
  card = await coach(page, 'choices');
  await page.getByRole('button', { name: 'Chaser', exact: true }).click();
  await expect(page.locator('[data-tour="plan"]')).toContainText('2 chasers');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('[data-tour="plan"]')).toContainText('1 chaser');
  const chooseDrink = page.getByRole('button', { name: 'Choose another drink' });
  // Safari does not focus buttons on a pointer click. Set the keyboard return
  // point explicitly before exercising the dialog's Escape/Enter interaction.
  if (info.project.name === 'webkit-mobile') await chooseDrink.press('Enter');
  else await chooseDrink.click();
  const chooser = page.getByRole('dialog', { name: 'Log for You' });
  await expect(chooser).toBeVisible();
  await expect(page.locator('[data-tour-coach]')).toBeHidden();
  if (info.project.name === 'desktop') {
    await expect(chooser).toHaveCSS('animation-name', 'dialog-in');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(chooser).toHaveCSS('animation-name', 'surface-fade-in');
    await expect(chooser).toHaveCSS('transform', 'none');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  }
  await expect(chooser.getByRole('button', { name: 'Close dialog' })).toBeFocused();
  await page.keyboard.press('Escape');
  card = await coach(page, 'choices');
  await expect(page.getByRole('button', { name: 'Choose another drink' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(chooser).toBeVisible();
  await expect(chooser).toHaveCSS('animation-name', 'none');
  await tabThroughControls(page, info.project.name, true);
  await expect(chooser.getByRole('button', { name: /Beer.*330/ })).toBeFocused();
  await tabThroughControls(page, info.project.name);
  await expect(chooser.getByRole('button', { name: 'Close dialog' })).toBeFocused();
  await chooser.getByRole('button', { name: /Beer.*330/ }).click();
  await chooser.getByRole('button', { name: 'Log Beer', exact: true }).click();
  card = await coach(page, 'choices');
  await expect(page.locator('[data-testid="drink-count"]')).toHaveText('3');
  expect(localStepRequests, 'Local steps before reload need no server render').toEqual([]);
  // An explicit reload may fetch the current route to restore the tour. Count
  // step changes separately from this deliberate document/route refresh.
  observeLocalSteps = false;
  await page.reload();
  card = await coach(page, 'choices');
  await expect(page.locator('[data-testid="drink-count"]')).toHaveText('1');
  observeLocalSteps = true;
  await card.getByRole('button', { name: 'Next', exact: true }).click();
  card = await coach(page, 'bottles');
  await page.locator('[data-tour="shared-bottles"]').click();
  const bottle = page.getByRole('dialog', { name: 'Shared bottles', exact: true });
  await bottle.getByRole('button', { name: 'Join bottle' }).click();
  await bottle.getByRole('button', { name: 'Log glass', exact: true }).click();
  await expect(bottle.getByText('625 ml left', { exact: true })).toBeVisible();
  await bottle.getByRole('button', { name: 'Undo last glass' }).click();
  await expect(bottle.getByText('750 ml left', { exact: true })).toBeVisible();
  await bottle.getByRole('button', { name: 'Close dialog' }).click();
  card = await coach(page, 'bottles');
  await card.getByRole('button', { name: 'Next', exact: true }).click();
  card = await coach(page, 'group');
  await expect(page).toHaveURL(/view=group&tour=group/);
  await expect(page.locator('[data-tour="group-card"]')).toContainText('Alex');
  await card.getByRole('button', { name: 'Next', exact: true }).click();
  card = await coach(page, 'help');
  await page.getByRole('button', { name: 'Get help', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCSS('animation-name', 'none');
  await expect(page.getByRole('alertdialog').locator('a[href^="tel:"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  card = await coach(page, 'help');
  await card.getByRole('button', { name: 'Next', exact: true }).click();
  card = await coach(page, 'history');
  await expect(page).toHaveURL(/\/history\?tour=history$/);
  if (info.project.name === 'desktop') {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('[data-tour="history-entry"]').hover();
    await expect(page.locator('[data-tour="history-entry"]')).toHaveCSS('transform', 'none');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  }
  await page.locator('[data-tour="history-entry"]').click();
  card = await coach(page, 'history');
  await expect(page).toHaveURL(/\/night\/tour\/summary\?tour=history$/);
  await expect(page.locator('[data-tour="history-summary"] .recap-counts')).toContainText('1drink');
  await card.getByRole('button', { name: 'Next', exact: true }).click();
  card = await coach(page, 'photos');
  await page.getByLabel('Try adding a photo').setInputFiles({
    name: 'practice.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(page.locator('.memory-collage img')).toBeVisible();
  await expect(page.locator('.memory-collage img')).toHaveJSProperty('naturalWidth', 1);
  await card.getByRole('button', { name: 'Next', exact: true }).click();
  card = await coach(page, 'reminders');
  await expect(page).toHaveURL(/\/account\?tour=reminders#notifications$/);
  await expect(card.getByRole('button', { name: 'Enable reminders' })).toBeVisible();
  await card.getByRole('button', { name: 'Enable reminders' }).click();
  await expect(page).toHaveURL(/\/account#notifications$/);
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
  const accountReads = blockedPeopleReadActions();
  const replayWrites: string[] = [];
  const listener = (request: Request) => {
    if (
      request.method() === 'POST' &&
      !isDefaultCountryPreference(request) &&
      !accountReads.has(request.headers()['next-action'] ?? '')
    )
      replayWrites.push(request.url());
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
  await expect(page.getByRole('complementary', { name: 'Install dwd' })).toBeVisible();
  await page
    .getByRole('complementary', { name: 'Install dwd', exact: true })
    .getByRole('button', { name: 'Not now', exact: true })
    .click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your evening, Tour.' })).toBeVisible();
  await expect(page.locator('[data-tour-coach], .install-hint')).toHaveCount(0);
  const accountMenu = page.getByLabel('Account menu');
  await accountMenu.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.account-popover')).toBeVisible();
  await expect(page.locator('.account-popover')).toHaveCSS('transition-duration', '0s');
  await tabThroughControls(page, info.project.name);
  await expect(
    page
      .getByRole('navigation', { name: 'Your account' })
      .getByRole('link', { name: 'Night history' }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(accountMenu).toBeFocused();
  await expect(page.locator('.account-popover')).toBeHidden();
  await page.keyboard.press('Enter');
  await tabThroughControls(page, info.project.name, true);
  await expect(page.locator('.account-popover')).toBeHidden();
  await page.getByLabel('Change appearance', { exact: true }).click();
  await page.getByRole('button', { name: 'Dark appearance' }).click();
  await page.getByLabel('Change appearance', { exact: true }).click();
  await page.getByLabel('Account menu').click();
  await page.getByRole('button', { name: 'Take a tour' }).click();
  card = await coach(page, 'start');
  await card.getByRole('button', { name: 'Next', exact: true }).click();
  await coach(page, 'join');
  await page.screenshot({ path: `.tmp/tour-${info.project.name}-dark.png` });
  await page.goto('/account');
  await expect(page.getByRole('button', { name: 'Take a tour' })).toBeEnabled();
  await expect(page.locator('[data-tour-coach]')).toHaveCount(0);
  // Account HTML can arrive before hydration has cleared a previous tour.
  // Verify durable cleanup before testing a fresh navigation to an old link.
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(sessionStorage).filter((key) => key.startsWith('dwd-tour-session:')),
      ),
    )
    .toEqual([]);
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
