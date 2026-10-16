import { expect, test, type Page } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { GalleryPhoto } from '../../apps/web/src/features/events/photo-contracts';

test.use({ serviceWorkers: 'block' });

async function album(page: Page) {
  const photos: GalleryPhoto[] = Array.from({ length: 50 }, (_, i) => ({
    id: randomUUID(),
    width: 480,
    height: 640,
    status: 'published',
    publishedAt: '2026-10-17T18:00:00Z',
    expiresAt: Date.now() + 120_000,
    thumbnailUrl: `/__gallery/${i}.webp`,
    imageUrl: `/__gallery/${i}.webp`,
  }));
  const state = { failNext: false, delayNext: false, closed: false, requests: [] as number[] };
  const images = [
    readFileSync('apps/web/public/events/the-link-up/cocktail.webp'),
    readFileSync('apps/web/public/events/the-link-up/foliage.webp'),
  ];
  await page.route('**/__gallery/**', (route) =>
    route.fulfill({
      contentType: 'image/webp',
      body: images[Number(new URL(route.request().url()).pathname.match(/\d+/)?.[0] ?? 0) % 2],
    }),
  );
  await page.route('**/api/events/the-link-up/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/gallery')) {
      const offset = Number(url.searchParams.get('cursor') ?? 0);
      state.requests.push(offset);
      if (state.failNext) {
        state.failNext = false;
        return route.fulfill({ status: 503, json: { error: 'Connection interrupted.' } });
      }
      if (state.delayNext) {
        state.delayNext = false;
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
      return route.fulfill({
        json: {
          photos: state.closed ? [] : photos.slice(offset, offset + 24),
          nextCursor: state.closed || offset + 24 >= photos.length ? null : String(offset + 24),
          galleryEnabled: !state.closed,
        },
      });
    }
    if (url.pathname.endsWith('/view')) {
      const photo = photos.find((p) => url.pathname.includes(p.id));
      return route.fulfill({ json: photo });
    }
    throw new Error('Unexpected gallery request: ' + url.pathname);
  });
  await page.goto('/events/the-link-up');
  await expect(page.getByRole('button', { name: 'Open photo 1', exact: true })).toBeVisible();
  return state;
}

test('album is visible on arrival, paginated, and keeps the page after returning to the tab', async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    Object.defineProperty(AbortSignal, 'timeout', { value: undefined, configurable: true });
  });
  const state = await album(page);
  const tiles = page.getByRole('button', { name: /^Open photo / });
  await expect(tiles).toHaveCount(24);
  await page
    .getByRole('navigation', { name: 'Photo pages' })
    .getByRole('button', { name: 'Next', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Open photo 25', exact: true })).toBeVisible();
  await expect(tiles).toHaveCount(24);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(() => state.requests.at(-1)).toBe(24);
  await expect(page.getByRole('button', { name: 'Open photo 25', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to latest', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open photo 1', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Count my shots' })).toHaveAttribute(
    'href',
    '/quick-log?scope=guest',
  );
  mkdirSync('.tmp/link-up-review', { recursive: true });
  await page.screenshot({
    path: `.tmp/link-up-review/gallery-${info.project.name}.png`,
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('viewer crosses page boundaries and retries the failed page without losing its place', async ({
  page,
}) => {
  const state = await album(page);
  await page.getByRole('button', { name: 'Open photo 24', exact: true }).click();
  const viewer = page.getByRole('dialog');
  state.failNext = true;
  await viewer.getByRole('button', { name: 'Next photo' }).click();
  await expect(viewer.getByRole('alert')).toContainText('Connection interrupted');
  await expect(viewer).toContainText('Photo 24');
  await viewer.getByRole('button', { name: 'Try again' }).click();
  await expect(viewer).toContainText('Photo 25');
  await viewer.getByRole('button', { name: 'Previous photo' }).click();
  await expect(viewer).toContainText('Photo 24');
  await viewer.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Open photo / })).toHaveCount(24);
});

test('closing the viewer while the next page loads does not reopen it', async ({ page }) => {
  const state = await album(page);
  await page.getByRole('button', { name: 'Open photo 24', exact: true }).click();
  const viewer = page.getByRole('dialog');
  state.delayNext = true;
  await viewer.getByRole('button', { name: 'Next photo' }).click();
  await expect(viewer).toContainText('Loading…');
  await viewer.getByRole('button', { name: 'Close', exact: true }).click();
  await page.waitForResponse((response) => response.url().includes('cursor=24'));
  await expect(viewer).not.toBeVisible();
});

test('swipe view uses native horizontal scrolling and closing the gallery removes its photos', async ({
  page,
}, info) => {
  const state = await album(page);
  await page.getByRole('button', { name: 'Swipe', exact: true }).click();
  const strip = page.locator('[class*="photoStrip"]');
  expect(await strip.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
  await strip.evaluate((node) => node.scrollTo({ left: node.clientWidth, behavior: 'instant' }));
  await expect.poll(() => strip.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
  await page.screenshot({
    path: `.tmp/link-up-review/swipe-${info.project.name}.png`,
    fullPage: true,
  });
  state.closed = true;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(
    page.getByText('The gallery is closed for now. Please check back later.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /^Open photo / })).toHaveCount(0);
});
