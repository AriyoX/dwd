import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

test('public sharing image loads and missing pages offer a way back', async ({ page, request }) => {
  const image = await request.get('/share-image');
  expect(image.ok()).toBe(true);
  expect(image.headers()['content-type']).toContain('image/png');
  const png = await image.body();
  expect(png.readUInt32BE(16)).toBe(1200);
  expect(png.readUInt32BE(20)).toBe(630);
  const response = await page.goto('/this-page-does-not-exist', { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page not found.' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to DWD' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your night.Your own pace.');
});

test('landing preview is interactive, reversible and separate from saved logs', async ({
  page,
}) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const preview = page.getByRole('region', { name: 'Interactive drink log preview' });
  await expect(preview.locator('dd')).toHaveText(['02', '01']);
  await preview.getByRole('button', { name: 'Add a drink to the preview' }).click();
  await preview.getByRole('button', { name: 'Add a chaser to the preview' }).click();
  await expect(preview.locator('dd')).toHaveText(['03', '02']);
  const undo = preview.getByRole('button', { name: 'Undo last preview entry' });
  await undo.click();
  await expect(preview.locator('dd')).toHaveText(['03', '01']);
  for (let i = 0; i < 4; i++) await undo.click();
  await expect(undo).toBeDisabled();
  await expect(preview.locator('dd')).toHaveText(['00', '00']);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(preview.locator('dd')).toHaveText(['02', '01']);
  await expect(page.locator('main').getByRole('link', { name: 'Log now' })).toHaveAttribute(
    'href',
    '/quick-log?scope=guest',
  );
});

test('public page has accessible questions, support links and sharing metadata', async ({
  page,
}) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const question = page.locator('summary').filter({ hasText: 'Where are my logs saved?' });
  await question.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Guest logs stay in this browser', { exact: false })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Guest logs stay in this browser', { exact: false })).toBeHidden();
  const footer = page.getByRole('navigation', { name: 'Footer navigation' });
  for (const path of ['/support', '/privacy', '/terms', '/safety', '/delete-account']) {
    await expect(footer.locator(`a[href="${path}"]`)).toBeVisible();
  }
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    /^http:\/\/localhost:3100\/?$/,
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    'http://localhost:3100/share-image',
  );
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    'content',
    'summary_large_image',
  );
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
});

test('landing stays within narrow and tablet screens in dark mode', async ({ page }, info) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('dwd-theme', 'dark');
    localStorage.setItem('dwd.quick-log.suggestion.v1:guest', 'seen');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect(page.getByRole('button', { name: 'Add a drink to the preview' })).toBeVisible();
    mkdirSync('.tmp/ui-review', { recursive: true });
    await page.screenshot({
      path: `.tmp/ui-review/landing-dark-${width}-${info.project.name}.png`,
      fullPage: true,
    });
  }
});

test('landing page has a dismissible, one-time Quick Log suggestion and working navigation', async ({
  page,
}, info) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your night.Your own pace.');
  const suggestion = page.getByRole('complementary', { name: 'Quick Log suggestion' });
  await expect(suggestion).toBeVisible();
  await suggestion.getByRole('button', { name: 'Dismiss Quick Log suggestion' }).click();
  await expect(suggestion).toHaveCount(0);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(suggestion).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  mkdirSync('.tmp/ui-review', { recursive: true });
  await page.screenshot({
    path: `.tmp/ui-review/landing-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole('link', { name: 'Get started' }).click();
  await expect(page).toHaveURL(/\/signup$/);
});

test('events index opens the existing event and returns to the index', async ({ page }, info) => {
  await page.goto('/events', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Past events', exact: true })).toBeVisible();
  await expect(page.getByText('No upcoming events', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  mkdirSync('.tmp/ui-review', { recursive: true });
  await page.screenshot({ path: `.tmp/ui-review/events-${info.project.name}.png`, fullPage: true });
  await page.getByRole('link', { name: /Photo memories.*The Link Up/ }).click();
  await expect(page).toHaveURL(/\/events\/the-link-up$/);
  await page.getByRole('link', { name: 'All events', exact: true }).click();
  await expect(page).toHaveURL(/\/events$/);
});

test('Quick Log suggestion expires automatically and pauses for keyboard focus', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const suggestion = page.getByRole('complementary', { name: 'Quick Log suggestion' });
  await expect(suggestion).toBeVisible();
  await suggestion.getByRole('link', { name: /Log now/ }).focus();
  await page.clock.fastForward(16000);
  await expect(suggestion).toBeVisible();
  await page.getByRole('link', { name: 'Get started' }).focus();
  await page.clock.fastForward(16000);
  await expect(suggestion).toHaveCount(0);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(suggestion).toHaveCount(0);
});

test('sign-in offers Apple, Google and email with a compact guest link', async ({ page }, info) => {
  mkdirSync('.tmp/ui-review', { recursive: true });
  for (const theme of ['light', 'dark']) {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate((value) => localStorage.setItem('dwd-theme', value), theme);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: 'Continue with Apple' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
    await expect(page.getByLabel('Email address')).toBeEditable();
    await expect(page.getByRole('link', { name: 'Continue without an account' })).toHaveAttribute(
      'href',
      '/quick-log?scope=guest',
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: `.tmp/ui-review/login-${theme}-${info.project.name}.png`,
      fullPage: true,
    });
  }
});
