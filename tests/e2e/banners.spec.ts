import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { test, expect, type Page } from '@playwright/test';
import { parseBannerAds } from '@dwd/core';

test('bundled campaigns rotate, pause during interaction, and respect reduced motion', async ({
  page,
}) => {
  test.skip(
    !process.env['E2E_SUPABASE_PUBLISHABLE_KEY'] || Boolean(process.env['E2E_ADS_URL']),
    'Run against the bundled feed without an external test feed.',
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await login(page);
  const placement = page.getByRole('region', { name: 'Featured', exact: true });
  await expect(placement.getByRole('link')).toHaveCount(4);
  await placement.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  const dot = (index: number) =>
    placement.getByRole('button', { name: `Show banner ${index} of 4` });
  for (const next of [2, 3, 4, 1])
    await expect(dot(next)).toHaveAttribute('aria-pressed', 'true', { timeout: 8000 });
  await expect(
    placement.getByRole('button', { name: /(?:Pause|Resume) automatic banners/ }),
  ).toHaveCount(0);
  const track = placement.getByLabel('Featured banners', { exact: true });
  await track.focus();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(6000);
  await expect(dot(1)).toHaveAttribute('aria-pressed', 'true');
  await track.evaluate((element: HTMLElement) => element.blur());
  await expect(dot(2)).toHaveAttribute('aria-pressed', 'true', { timeout: 8000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(6000);
  await expect(dot(2)).toHaveAttribute('aria-pressed', 'true');
  for (const image of await placement.locator('img').all())
    await expect
      .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
      .toBeGreaterThan(0);
});

async function login(page: Page) {
  const backend = process.env['E2E_SUPABASE_URL'] ?? '';
  if (!['localhost', '127.0.0.1'].includes(new URL(backend).hostname))
    throw new Error('Local test backend required.');
  const client = createClient(backend, process.env['E2E_SUPABASE_PUBLISHABLE_KEY'] ?? '');
  const email = `banners-${randomUUID()}@example.test`;
  const password = 'local-banner-review-123';
  const { error } = await client.auth.signUp({
    email,
    password,
    options: { data: { display_name: 'Banner Review', age_confirmed: true, tour_seen: true } },
  });
  if (error) throw error;
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page
    .getByRole('complementary', { name: 'Install dwd' })
    .getByRole('button', { name: 'Not now', exact: true })
    .click();
  await client.auth.signOut();
}

test('home banners snap, paginate, stay within the page, and preserve house destinations', async ({
  page,
}, info) => {
  test.skip(!process.env['E2E_SUPABASE_PUBLISHABLE_KEY'], 'Local backend required.');
  const feedUrl = process.env['E2E_ADS_URL'];
  if (feedUrl) await page.route(feedUrl, (route) => route.fulfill({ status: 503, body: '' }));
  else await page.route('**/tonight-ads.json', (route) => route.fulfill({ status: 503, body: '' }));
  await login(page);
  const placement = page.getByRole('region', { name: 'Featured', exact: true });
  await expect(placement).toBeVisible();
  await placement.scrollIntoViewIfNeeded();
  const track = placement.getByLabel('Featured banners', { exact: true });
  await expect(placement.getByRole('link')).toHaveCount(3);
  await expect(placement.getByRole('button', { name: 'Previous banner' })).toBeDisabled();
  await placement.getByRole('button', { name: 'Next banner' }).click();
  await expect(placement.getByRole('button', { name: 'Show banner 2 of 3' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect.poll(() => track.evaluate((element) => element.scrollLeft)).toBeGreaterThan(100);
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  await placement.getByRole('button', { name: 'Show banner 3 of 3' }).click();
  await expect(placement.getByRole('button', { name: 'Next banner' })).toBeDisabled();
  await expect(placement.getByRole('link', { name: /Keep the moments/ })).toHaveAttribute(
    'href',
    '/history',
  );
  await placement.getByRole('button', { name: 'Show banner 1 of 3' }).click();
  await expect.poll(() => track.evaluate((element) => element.scrollLeft)).toBeLessThan(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await placement.screenshot({ path: `.tmp/ads-review/${info.project.name}-banners-dark.png` });
  await placement.getByRole('button', { name: 'Show banner 2 of 3' }).click();
  await placement.getByRole('link', { name: /Your night/ }).click();
  await expect(page).toHaveURL(/\/home#join-night$/);
  await expect(page.locator('#join-night')).toBeInViewport();
});

test('sponsor feed renders labels and destinations, survives bad artwork, and can disable ads', async ({
  page,
}) => {
  test.skip(
    !process.env['E2E_SUPABASE_PUBLISHABLE_KEY'] || !process.env['E2E_ADS_URL'],
    'Local backend and test feed required.',
  );
  const feedUrl = process.env['E2E_ADS_URL'] ?? '';
  await page.route('https://ads.example.test/banner.jpg', (route) =>
    route.fulfill({ status: 404, body: '' }),
  );
  await page.route(feedUrl, (route) =>
    route.fulfill({
      contentType: 'application/json',
      json: {
        ads: [
          {
            id: 'partner',
            advertiser: 'Review Partner',
            title: 'Your ride home',
            cta: 'Book a ride',
            url: 'https://partner.example.test/book',
            imageUrl: 'https://ads.example.test/banner.jpg',
          },
        ],
      },
    }),
  );
  await login(page);
  const placement = page.getByRole('region', { name: 'Featured', exact: true });
  await expect(placement.getByText('Sponsored · Review Partner')).toBeVisible();
  const banner = placement.getByRole('link', { name: /Sponsored by Review Partner/ });
  await expect(banner).toHaveAttribute('href', 'https://partner.example.test/book');
  await expect(banner).toHaveAttribute('target', '_blank');
  await expect(banner).toHaveAttribute('rel', /sponsored.*noopener/);
  await expect(placement.locator('img')).toHaveCount(0);
  await page.unroute(feedUrl);
  await page.route(feedUrl, (route) =>
    route.fulfill({ contentType: 'application/json', json: { ads: [] } }),
  );
  await page.reload();
  await expect(placement).toHaveCount(0);
});

test('published campaigns serve their artwork and open their configured destinations', async ({
  page,
}, info) => {
  test.skip(
    !process.env['E2E_SUPABASE_PUBLISHABLE_KEY'] || !process.env['E2E_ADS_URL'],
    'Local backend and test feed required.',
  );
  const response = await page.request.get('/tonight-ads.json');
  expect(response.ok()).toBe(true);
  const feed: unknown = await response.json();
  const ads = parseBannerAds(feed);
  expect(ads?.length).toBeGreaterThan(0);
  if (!ads) throw new Error('Published sponsor feed is invalid.');
  // Serve the actual repository artwork through the allowed test origin.
  const campaigns = ads.map((ad) => ({
    ...ad,
    imageUrl: ad.imageUrl ? `https://ads.example.test${new URL(ad.imageUrl).pathname}` : undefined,
  }));
  await page.route(process.env['E2E_ADS_URL'] ?? '', (route) =>
    route.fulfill({ contentType: 'application/json', json: { ads: campaigns } }),
  );
  await page.route('https://ads.example.test/ads/**', async (route) => {
    const artwork = await page.request.get(new URL(route.request().url()).pathname);
    expect(artwork.ok()).toBe(true);
    expect(artwork.headers()['content-type']).toMatch(/^image\//);
    await route.fulfill({ response: artwork });
  });
  await login(page);
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  const placement = page.getByRole('region', { name: 'Featured', exact: true });
  await expect(placement.getByRole('link')).toHaveCount(ads.length);
  for (const [index, ad] of ads.entries()) {
    if (ads.length > 1)
      await placement
        .getByRole('button', { name: `Show banner ${index + 1} of ${ads.length}` })
        .click();
    const banner = placement.getByRole('link').nth(index);
    await expect(banner).toHaveAttribute('href', ad.url ?? '');
    if (ad.imageUrl)
      await expect
        .poll(() => banner.locator('img').evaluate((image: HTMLImageElement) => image.naturalWidth))
        .toBeGreaterThan(0);
    await banner.screenshot({ path: `.tmp/ads-review/${info.project.name}-${ad.id}.png` });
    if (!ad.url) throw new Error('Published campaign destination is missing.');
    await page
      .context()
      .route(ad.url, (route) =>
        route.fulfill({ contentType: 'text/html', body: '<title>Campaign destination</title>' }),
      );
    const opened = page.waitForEvent('popup');
    await banner.click();
    const destination = await opened;
    await expect(destination).toHaveURL(ad.url);
    await destination.close();
  }
});
