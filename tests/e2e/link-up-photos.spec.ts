import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { unzipSync, zipSync } from 'fflate';
import type {
  AdminSummary,
  GalleryPhoto,
  ReservationRow,
  SessionStatus,
} from '../../apps/web/src/features/events/photo-contracts';

test.use({ serviceWorkers: 'block' });
const api = '/api/events/the-link-up/';
const adminPath = '/events/admin/the-link-up';
const adminApi = '/api/events/admin/the-link-up/';
const image = readFileSync('apps/web/public/events/the-link-up/cocktail.webp');
function localBackend() {
  const url = process.env['E2E_SUPABASE_URL'] ?? '';
  if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname))
    throw new Error('These tests require an isolated local backend.');
  return createClient(url, process.env['E2E_SUPABASE_SECRET_KEY'] ?? '', {
    auth: { persistSession: false },
  });
}
let userId: string;
let email: string;
const password = 'local-link-up-test-password';
test.beforeAll(async () => {
  email = 'album-review-' + randomUUID() + '@example.test';
  const admin = localBackend();
  const result = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: 'Album reviewer', age_confirmed: true, tour_seen: true },
  });
  if (result.error) throw result.error;
  userId = result.data.user.id;
  const grant = await admin.from('page_admin_access').insert([
    { page_path: '/events/admin', user_id: userId, email },
    { page_path: adminPath, user_id: userId, email },
  ]);
  if (grant.error) throw grant.error;
});
test.afterAll(async () => {
  if (!userId) return;
  if (!/^[0-9a-f-]{36}$/.test(userId)) throw new Error('Invalid local fixture identifier.');
  const container = process.env['E2E_AUTH_DB_CONTAINER'] ?? 'supabase_db_dwd-e2e';
  if (!/^supabase_db_dwd-(?:e2e|browser-ci)$/.test(container))
    throw new Error('Local test database required.');
  execFileSync('docker', [
    'exec',
    container,
    'psql',
    '-X',
    '-q',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-c',
    "delete from public.audit_events where actor_user_id='" +
      userId +
      "'; delete from public.profiles where id='" +
      userId +
      "';",
  ]);
  const removed = await localBackend().auth.admin.deleteUser(userId);
  if (removed.error) throw removed.error;
});
async function signIn(page: Page) {
  await page.goto(adminPath);
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Photo dashboard' })).toBeVisible();
}
async function mockAlbum(page: Page) {
  const photos: GalleryPhoto[] = Array.from({ length: 4 }, (_, index) => ({
    id: randomUUID(),
    width: 400,
    height: 560,
    publishedAt: '2026-10-17T18:00:00Z',
    thumbnailUrl: '/__album/thumb-' + String(index) + '.webp',
    imageUrl: '/__album/photo-' + String(index) + '.webp',
    expiresAt: Date.now() + 120_000,
    status: index === 3 ? 'hidden' : 'published',
  }));
  const session: SessionStatus = {
    uploadsEnabled: true,
    galleryEnabled: true,
    remaining: 25,
    batchLimit: 10,
    protection: 'local-bypass',
    recentUploads: [],
  };
  const summary: AdminSummary = {
    event: {
      uploads_enabled: true,
      gallery_enabled: true,
      used_bytes: 102400,
      reserved_bytes: 11141120,
      storage_budget_bytes: 5368709120,
      upload_error_count: 0,
      session_photo_limit: 25,
      batch_limit: 10,
    },
    counts: { published: 3, hidden: 1, guests: 3, pending: 5, reports: 1 },
    reports: [
      {
        id: randomUUID(),
        photo_id: photos[3]?.id ?? '',
        reason: 'privacy',
        status: 'open',
        created_at: '2026-10-17T19:00:00Z',
      },
    ],
    errors: [],
  };
  const state = {
    photos,
    summary,
    session,
    rejectSummary: false,
    forbidden: false,
    completeFails: false,
    publishDespiteFailure: false,
    cancelled: 0,
    deletes: 0,
  };
  await page.route('**/__album/**', (route) =>
    route.fulfill({
      contentType: 'image/webp',
      body: image,
    }),
  );
  await page.route(/\/api\/events\/(?:the-link-up|admin\/the-link-up)\//, async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const path = pathname.startsWith(adminApi)
      ? 'admin/' + pathname.slice(adminApi.length)
      : pathname.slice(api.length);
    const method = route.request().method();
    if (path === 'admin/export') return route.fallback();
    if (state.forbidden && path.startsWith('admin/'))
      return route.fulfill({
        status: 403,
        json: { code: 'forbidden', error: 'This account no longer has access.' },
      });
    if (path === 'admin/summary') {
      if (state.rejectSummary)
        return route.fulfill({ status: 503, body: '<html>Unavailable</html>' });
      summary.counts['published'] = photos.filter((photo) => photo.status === 'published').length;
      summary.counts['hidden'] = photos.filter((photo) => photo.status === 'hidden').length;
      summary.counts['reports'] = summary.reports.length;
      return route.fulfill({ json: summary });
    }
    if (path === 'gallery' || path === 'admin/gallery') {
      const admin = path.startsWith('admin/');
      const filter = new URL(route.request().url()).searchParams.get('status');
      return route.fulfill({
        json: {
          galleryEnabled: summary.event.gallery_enabled,
          nextCursor: null,
          photos:
            !admin && !summary.event.gallery_enabled
              ? []
              : photos.filter((photo) =>
                  admin ? !filter || photo.status === filter : photo.status === 'published',
                ),
        },
      });
    }
    if (path === 'admin/settings') {
      const update = route.request().postDataJSON() as Partial<AdminSummary['event']>;
      Object.assign(summary.event, update);
      return route.fulfill({ json: { updated: true } });
    }
    const photoAction = path.match(/^(admin\/)?photos\/([^/]+)\/(view|hide|show|delete|report)$/);
    if (photoAction) {
      const photo = photos.find((item) => item.id === photoAction[2]);
      if (!photo) return route.fulfill({ status: 404, json: { error: 'Photo unavailable' } });
      const action = photoAction[3];
      if (action === 'view') return route.fulfill({ json: photo });
      if (action === 'hide' || action === 'show')
        photo.status = action === 'hide' ? 'hidden' : 'published';
      if (action === 'delete') {
        photos.splice(photos.indexOf(photo), 1);
        state.deletes++;
      }
      if (action !== 'report')
        summary.reports = summary.reports.filter((report) => report.photo_id !== photo.id);
      return route.fulfill({ json: { updated: true } });
    }
    if (path.startsWith('admin/reports/')) {
      summary.reports = [];
      return route.fulfill({ json: { reviewed: true } });
    }
    if (path === 'admin/cleanup') {
      summary.event.reserved_bytes = 0;
      summary.counts['pending'] = 0;
      return route.fulfill({ json: { expired: 5, removed: 3, deleted: 0 } });
    }
    if (path === 'session') return route.fulfill({ json: session });
    if (path === 'batches/cancel') {
      const input = route.request().postDataJSON() as { ids: string[] };
      state.cancelled += input.ids.length;
      session.recentUploads = session.recentUploads.map((item) => ({
        ...item,
        status: 'rejected',
      }));
      session.remaining += input.ids.length;
      return route.fulfill({ json: { cancelled: input.ids.length } });
    }
    if (path === 'batches') {
      const input = route.request().postDataJSON() as { files: { clientId: string }[] };
      session.recentUploads = input.files.map((item) => ({
        clientId: item.clientId,
        id: randomUUID(),
        status: 'pending',
      }));
      session.remaining -= input.files.length;
      return route.fulfill({ json: { tickets: session.recentUploads } });
    }
    if (path.startsWith('uploads/')) {
      if (path.endsWith('/url')) return route.fulfill({ json: { url: '/__album/upload' } });
      if (state.publishDespiteFailure || !state.completeFails)
        session.recentUploads = session.recentUploads.map((item) => ({
          ...item,
          status: 'completed',
        }));
      if (state.completeFails)
        return route.fulfill({
          status: 503,
          json: { code: 'verification_interrupted', error: 'Photo check interrupted. Try again.' },
        });
      return route.fulfill({ json: { status: 'completed' } });
    }
    throw new Error('Unexpected album route: ' + method + ' ' + path);
  });
  return state;
}
async function screenshot(page: Page, name: string, project: string) {
  mkdirSync('.tmp/ui-review', { recursive: true });
  await page.screenshot({
    path: '.tmp/ui-review/link-up-' + name + '-' + project + '.png',
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}

test('guests can find photos and share without technical wording', async ({ page }, info) => {
  await mockAlbum(page);
  await page.goto('/events/the-link-up');
  await page.getByRole('button', { name: 'View photos', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open photo 1', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open photo 1', exact: true }).click();
  await page.getByRole('button', { name: 'Report photo', exact: true }).click();
  await page.getByRole('button', { name: 'Send report', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Report sent to the organizers.');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('#shared-gallery').getByRole('button', { name: 'Add photos' }).click();
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }),
  ).toBeFocused();
  await expect(page.getByRole('dialog')).toContainText('Photos are public.');
  await expect(page.getByRole('dialog')).not.toContainText(/per browser|2048|metadata|batch/);
  await expect(page.getByRole('button', { name: 'Choose photos', exact: true })).toBeEnabled();
  await screenshot(page, 'upload', info.project.name);
});

test('dashboard explains storage and provides hide, restore and confirmed deletion', async ({
  page,
}, info) => {
  const state = await mockAlbum(page);
  await signIn(page);
  await expect(page.getByRole('button', { name: 'Delete photo 1', exact: true })).toBeVisible();
  await page.getByText('Used, reserved and budget explained', { exact: true }).click();
  await expect(page.getByText('Reserved (held for uploads)', { exact: true })).toBeVisible();
  await screenshot(page, 'dashboard', info.project.name);
  await page.getByRole('button', { name: 'Hide photo 1', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Show photo 1', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show photo 1', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Hide photo 1', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Hidden', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Open photo/ })).toHaveCount(1);
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Delete photo 1', exact: true }).click();
  expect(state.deletes).toBe(0);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete photo 1', exact: true }).click();
  await expect(page.getByText('No hidden photos.', { exact: true })).toBeVisible();
  expect(state.deletes).toBe(1);
  await page.getByRole('button', { name: 'Run cleanup', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Released 5 expired uploads' }),
  ).toBeVisible();
});

test('events portal opens the permitted dashboard and redirects old links', async ({
  page,
}, info) => {
  await mockAlbum(page);
  await page.goto('/events/admin');
  await expect(page).toHaveURL(/\/login\?next=%2Fevents%2Fadmin/);
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Events admin', exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator('[aria-label="Your events"] img')
        .evaluateAll(
          (images) =>
            images.length > 0 &&
            images.every(
              (image) =>
                image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
            ),
        ),
    )
    .toBe(true);
  await screenshot(page, 'portal', info.project.name);
  await page
    .getByRole('navigation', { name: 'Your events' })
    .getByRole('link', { name: 'The Link Up' })
    .click();
  await expect(page).toHaveURL(adminPath);
  await expect(page.getByRole('heading', { name: 'Photo dashboard' })).toBeVisible();
  await page.getByRole('link', { name: 'All events', exact: true }).click();
  await expect(page).toHaveURL('/events/admin');
  await page.goto('/events/the-link-up/admin');
  await expect(page).toHaveURL(adminPath);
  await page.goto('/events/the-link-up/admin/confirm');
  await expect(page).toHaveURL(/\/login\?next=%2Fevents%2Fadmin%2Fthe-link-up/);
});

test('events portal hides a revoked event grant and blocks direct access', async ({ page }) => {
  await mockAlbum(page);
  await signIn(page);
  const db = localBackend();
  try {
    const changed = await db
      .from('page_admin_access')
      .update({ enabled: false })
      .eq('page_path', adminPath)
      .eq('user_id', userId);
    if (changed.error) throw changed.error;
    await page.goto('/events/admin');
    await expect(page.getByText('No event dashboards assigned.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'The Link Up', exact: true })).toHaveCount(0);
    await page.goto(adminPath);
    await expect(
      page.getByText('This account doesn’t have access to The Link Up dashboard.'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Export photos (.zip)', exact: true }),
    ).toHaveCount(0);
  } finally {
    const restored = await db
      .from('page_admin_access')
      .update({ enabled: true })
      .eq('page_path', adminPath)
      .eq('user_id', userId);
    expect(restored.error).toBeNull();
  }
});

test('revoked portal membership blocks the portal, event page and every private API', async ({
  page,
}) => {
  await mockAlbum(page);
  await signIn(page);
  const db = localBackend();
  try {
    const result = await db
      .from('page_admin_access')
      .update({ enabled: false })
      .eq('page_path', '/events/admin')
      .eq('user_id', userId);
    if (result.error) throw result.error;
    const portal = await page.goto('/events/admin');
    expect(portal?.status()).toBe(403);
    await expect(page.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Your events' })).toHaveCount(0);
    const event = await page.goto(adminPath);
    expect(event?.status()).toBe(403);
    await expect(page.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
    for (const path of [
      adminApi + 'summary',
      adminApi + 'gallery',
      adminApi + 'export',
      adminApi + 'export?download=1',
      api + 'admin/summary',
    ]) {
      expect((await page.request.get(path)).status()).toBe(403);
    }
  } finally {
    const result = await db
      .from('page_admin_access')
      .update({ enabled: true })
      .eq('page_path', '/events/admin')
      .eq('user_id', userId);
    expect(result.error).toBeNull();
  }
});

test('organizers can sign out from both the portal and event dashboard', async ({ page }) => {
  await mockAlbum(page);
  for (const path of ['/events/admin', adminPath]) {
    await signIn(page);
    await page.goto(path);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL('/login');
    expect((await page.request.get(adminApi + 'export')).status()).toBe(401);
    await page.goto(path);
    await expect(page).toHaveURL(/\/login\?next=/);
  }
});

test('dashboard exports a ZIP and reports denied export access', async ({ page }) => {
  const state = await mockAlbum(page);
  const archive = zipSync({
    'photos/photo.jpg': new Uint8Array(image),
    'hidden/photo.jpg': new Uint8Array(image),
  });
  // Chromium's native downloads bypass Playwright route fulfillment. Use a real
  // local HTTP transfer while keeping API preparation and its errors mocked.
  const zipServer = createServer((_request, response) => {
    response.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="the-link-up-photos.zip"',
      'Content-Length': String(archive.length),
    });
    response.end(archive);
  });
  await new Promise<void>((resolve) => zipServer.listen(0, '127.0.0.1', resolve));
  const address = zipServer.address();
  if (!address || typeof address === 'string') throw new Error('ZIP fixture server failed.');
  const archiveUrl = `http://127.0.0.1:${address.port}/album.zip`;
  try {
    await page.context().route('**/api/events/admin/the-link-up/export*', async (route) => {
      if (state.forbidden)
        return route.fulfill({
          status: 403,
          json: { code: 'forbidden', error: 'Export access revoked.' },
        });
      return route.fulfill({ json: { url: archiveUrl } });
    });
    await signIn(page);
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export photos (.zip)', exact: true }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe('the-link-up-photos.zip');
    const path = await download.path();
    if (!path) throw new Error('The ZIP download was not saved.');
    expect(Object.keys(unzipSync(readFileSync(path)))).toEqual([
      'photos/photo.jpg',
      'hidden/photo.jpg',
    ]);
    await expect(
      page.getByRole('status').filter({ hasText: 'ZIP download started.' }),
    ).toBeVisible();
    state.forbidden = true;
    await page.getByRole('button', { name: 'Export photos (.zip)', exact: true }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Export access revoked.' }),
    ).toBeVisible();
  } finally {
    await new Promise<void>((resolve) => zipServer.close(() => resolve()));
  }
});

test('reported photos open even outside the active gallery filter', async ({ page }) => {
  await mockAlbum(page);
  await signIn(page);
  await page.getByRole('button', { name: 'Visible', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Open photo/ })).toHaveCount(3);
  await page.locator('#reports').getByRole('button', { name: 'View', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Show photo', exact: true }),
  ).toBeVisible();
});

test('a late gallery response cannot overwrite the selected photo filter', async ({ page }) => {
  const state = await mockAlbum(page);
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let intercepted = false;
  await page.route('**/api/events/admin/the-link-up/gallery?*', async (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (!params.has('status') && !intercepted) {
      intercepted = true;
      await held;
      await route.fulfill({
        json: { photos: state.photos, galleryEnabled: true, nextCursor: null },
      });
    } else await route.fallback();
  });
  await signIn(page);
  await expect.poll(() => intercepted).toBe(true);
  await page.getByRole('button', { name: 'Hidden', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Open photo/ })).toHaveCount(1);
  const stale = page.waitForResponse((response) =>
    response.url().endsWith('/the-link-up/gallery?'),
  );
  release();
  await (await stale).finished();
  await expect(page.getByRole('button', { name: 'Hidden', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: /^Open photo/ })).toHaveCount(1);
});

test('accepted photo changes stay successful if refreshing status fails', async ({ page }) => {
  const state = await mockAlbum(page);
  await signIn(page);
  state.rejectSummary = true;
  await page.getByRole('button', { name: 'Hide photo 1', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Show photo 1', exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Saved, but the latest status',
  );
});

test('revoked dashboard access clears previously loaded private information', async ({ page }) => {
  const state = await mockAlbum(page);
  await signIn(page);
  await expect(page.getByRole('button', { name: 'Delete photo 1', exact: true })).toBeVisible();
  state.forbidden = true;
  await page.getByRole('button', { name: 'Refresh dashboard', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('no longer has access');
  await expect(page.getByRole('button', { name: /^Delete photo/ })).toHaveCount(0);
  await expect(page.getByText('Saved photos', { exact: true })).toHaveCount(0);
});

test('a failed upload can be replaced when its reservation uses the remaining allowance', async ({
  page,
}) => {
  const state = await mockAlbum(page);
  state.session.remaining = 1;
  state.completeFails = true;
  await page.goto('/events/the-link-up');
  await page.getByRole('button', { name: 'Add photos', exact: true }).first().click();
  await page
    .getByRole('button', { name: 'Choose photos', exact: true })
    .waitFor({ state: 'visible' });
  await expect(page.getByRole('button', { name: 'Choose photos', exact: true })).toBeEnabled();
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'memory.webp', mimeType: 'image/webp', buffer: image });
  await page.getByRole('button', { name: 'Share 1 photo', exact: true }).click();
  await expect(
    page.getByText('Photo check interrupted. Try again.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('dialog')).not.toContainText('can’t be saved');
  await expect(
    page.getByRole('button', { name: 'Choose different photos', exact: true }),
  ).toBeEnabled();
  page.once('dialog', (dialog) => dialog.accept());
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'replacement.webp', mimeType: 'image/webp', buffer: image });
  await expect(page.getByText('replacement.webp', { exact: true })).toBeVisible();
  await expect(page.getByText('Ready', { exact: true })).toBeVisible();
  expect(state.cancelled).toBe(1);
});

test('a lost completion response recovers publication without sharing the photo twice', async ({
  page,
}) => {
  const state = await mockAlbum(page);
  state.completeFails = true;
  state.publishDespiteFailure = true;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/events/the-link-up');
  await page.getByRole('button', { name: 'Add photos', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Choose photos', exact: true })).toBeEnabled();
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'memory.webp', mimeType: 'image/webp', buffer: image });
  await page.getByRole('button', { name: 'Share 1 photo', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('1 photo shared.');
  await page.getByRole('dialog').getByRole('button', { name: 'View photos', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Shared photos', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('photos already sent can finish checking after new uploads are paused', async ({ page }) => {
  const state = await mockAlbum(page);
  state.completeFails = true;
  await page.goto('/events/the-link-up');
  await page.getByRole('button', { name: 'Add photos', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Choose photos', exact: true })).toBeEnabled();
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'memory.webp', mimeType: 'image/webp', buffer: image });
  await page.getByRole('button', { name: 'Share 1 photo', exact: true }).click();
  await expect(
    page.getByText('Photo check interrupted. Try again.', { exact: true }),
  ).toBeVisible();
  state.session.uploadsEnabled = false;
  state.completeFails = false;
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Add photos', exact: true }).first().click();
  await expect(
    page.getByRole('button', { name: 'Choose different photos', exact: true }),
  ).toBeDisabled();
  await page.reload();
  await page.getByRole('button', { name: 'Add photos', exact: true }).first().click();
  await page.getByRole('button', { name: 'Finish 1 photo', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('1 photo shared.');
});

test('closing the upload panel keeps the selection when device storage is blocked', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      value: {
        open() {
          throw new DOMException('Storage blocked', 'SecurityError');
        },
      },
    });
  });
  await mockAlbum(page);
  await page.goto('/events/the-link-up');
  await page.getByRole('button', { name: 'Add photos', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Choose photos', exact: true })).toBeEnabled();
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'keep-this-memory.webp', mimeType: 'image/webp', buffer: image });
  await expect(page.getByRole('button', { name: 'Share 1 photo', exact: true })).toBeEnabled();
  await expect(page.getByRole('dialog')).toContainText('can’t be saved on this device');
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Add photos', exact: true }).first().click();
  await expect(page.getByText('keep-this-memory.webp', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Share 1 photo', exact: true })).toBeEnabled();
});

test('real protected APIs release expired holds, queue deletion and enforce live revocation', async ({
  page,
}) => {
  const admin = localBackend();
  const sessionId = randomUUID();
  let reservation: ReservationRow | undefined;
  await signIn(page);
  try {
    const batch = await admin.rpc('link_up_reserve', {
      p_session: sessionId,
      p_batch: randomUUID(),
      p_files: [
        { clientId: randomUUID(), fingerprint: 'a'.repeat(64), type: 'image/jpeg', size: 1000 },
      ],
    });
    if (batch.error) throw batch.error;
    reservation = (batch.data as ReservationRow[])[0];
    if (!reservation) throw new Error('Missing local reservation.');
    const uploadId = reservation.id;
    const lease = randomUUID();
    expect(
      (await admin.rpc('link_up_claim', { p_session: sessionId, p_id: uploadId, p_lease: lease }))
        .error,
    ).toBeNull();
    expect(
      (
        await admin.rpc('link_up_finish', {
          p_id: uploadId,
          p_lease: lease,
          p_size: 900,
          p_thumb_size: 100,
          p_width: 100,
          p_height: 100,
        })
      ).error,
    ).toBeNull();
    const removed = await page.request.post(adminApi + 'photos/' + uploadId + '/delete', {
      headers: { Origin: 'http://localhost:3100' },
    });
    expect(removed.status()).toBe(200);
    expect(
      (await admin.from('event_photos').select('status').eq('id', uploadId).single()).data?.[
        'status'
      ],
    ).toBe('deleting');
    expect((await page.request.get(api + 'photos/' + uploadId + '/view')).status()).toBe(404);
    const extra = await admin.rpc('link_up_reserve', {
      p_session: sessionId,
      p_batch: randomUUID(),
      p_files: [
        { clientId: randomUUID(), fingerprint: 'b'.repeat(64), type: 'image/jpeg', size: 1000 },
      ],
    });
    if (extra.error) throw extra.error;
    expect(
      (
        await admin
          .from('photo_upload_reservations')
          .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
          .eq('session_id', sessionId)
          .eq('status', 'pending')
      ).error,
    ).toBeNull();
    const response = await page.request.get(adminApi + 'summary');
    expect(response.status()).toBe(200);
    const fresh = (await response.json()) as AdminSummary;
    expect(fresh.event.reserved_bytes).toBe(0);
    expect(fresh.counts['pending']).toBe(0);
    expect(fresh.counts['deleting']).toBe(1);
    expect(
      (
        await admin
          .from('page_admin_access')
          .update({ enabled: false })
          .eq('user_id', userId)
          .eq('page_path', adminPath)
      ).error,
    ).toBeNull();
    expect((await page.request.get(adminApi + 'summary')).status()).toBe(403);
    expect(
      (
        await page.request.patch(adminApi + 'settings', {
          headers: { Origin: 'http://localhost:3100' },
          data: { uploads_enabled: false },
        })
      ).status(),
    ).toBe(403);
  } finally {
    await admin
      .from('page_admin_access')
      .update({ enabled: true })
      .eq('user_id', userId)
      .eq('page_path', adminPath);
    const reservations = await admin
      .from('photo_upload_reservations')
      .select('temporary_key,final_key,thumbnail_key')
      .eq('session_id', sessionId);
    const keys =
      (
        reservations.data as
          Pick<ReservationRow, 'temporary_key' | 'final_key' | 'thumbnail_key'>[] | null
      )?.flatMap((item) => [item.temporary_key, item.final_key, item.thumbnail_key]) ?? [];
    if (keys.length) await admin.from('photo_object_cleanup').delete().in('object_key', keys);
    await admin.rpc('link_up_finalize_deletions', {});
    await admin.from('event_photos').delete().eq('session_id', sessionId);
    await admin.from('photo_upload_reservations').delete().eq('session_id', sessionId);
    await admin.from('photo_guest_sessions').delete().eq('id', sessionId);
  }
});
