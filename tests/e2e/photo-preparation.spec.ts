import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import sharp from 'sharp';
import type { SessionStatus } from '../../apps/web/src/features/events/photo-contracts';

test.use({ serviceWorkers: 'block' });
const heic = readFileSync('tests/fixtures/photos/rainbow.heic');
const api = '/api/events/the-link-up/';
const uploads: { type: string | undefined; bytes: Buffer }[] = [];
let uploadOrigin: string;
// Use a real receiver: WebKit's automation protocol can omit the intercepted
// postData for a Blob even when the browser sends the complete request body.
const receiver = createServer(async (request, response) => {
  response.setHeader('Access-Control-Allow-Origin', 'http://localhost:3100');
  response.setHeader('Access-Control-Allow-Methods', 'PUT, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Connection', 'close');
  if (request.method === 'OPTIONS') {
    response.writeHead(204).end();
    return;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk as Uint8Array));
  uploads.push({ type: request.headers['content-type'], bytes: Buffer.concat(chunks) });
  response.writeHead(200).end();
});
test.beforeAll(async () => {
  await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve));
  const address = receiver.address();
  if (!address || typeof address === 'string') throw new Error('Missing local photo receiver');
  uploadOrigin = 'http://127.0.0.1:' + String(address.port);
});
test.beforeEach(async ({ context, browserName }) => {
  uploads.length = 0;
  // The receiver is loopback-only; newer Chromium requires explicit permission
  // when navigating through an intercepted document response.
  if (browserName === 'chromium') await context.grantPermissions(['local-network-access']);
});
test.afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    receiver.close((error) => (error ? reject(error) : resolve())),
  );
});

async function album(page: Page) {
  const session: SessionStatus = {
    uploadsEnabled: true,
    galleryEnabled: true,
    remaining: 25,
    batchLimit: 10,
    protection: 'local-bypass',
    recentUploads: [],
  };
  await page.route('**/events/the-link-up', async (route) => {
    const response = await route.fetch();
    const headers = response.headers();
    expect(headers['content-security-policy']).toContain("worker-src 'self' blob:");
    // Only add the isolated receiver to connect-src. Keep the real image and
    // worker restrictions so decoder tests still exercise the page's CSP.
    headers['content-security-policy'] =
      headers['content-security-policy']?.replace(
        "connect-src 'self'",
        "connect-src 'self' " + uploadOrigin,
      ) ?? '';
    await route.fulfill({ response, headers });
  });
  await page.route('**/api/events/the-link-up/**', async (route) => {
    const path = new URL(route.request().url()).pathname.slice(api.length);
    if (path === 'session') return route.fulfill({ json: session });
    if (path === 'gallery')
      return route.fulfill({ json: { galleryEnabled: true, photos: [], nextCursor: null } });
    if (path === 'batches') {
      const batch = route.request().postDataJSON() as {
        files: { clientId: string; type: string; size: number; fingerprint: string }[];
      };
      for (const file of batch.files) {
        expect(file.type).toBe('image/jpeg');
        expect(file.size).toBeGreaterThan(0);
        expect(file.size).toBeLessThanOrEqual(2 * 1024 * 1024);
        expect(file.fingerprint).toMatch(/^[0-9a-f]{64}$/);
      }
      session.recentUploads = batch.files.map((file) => ({
        id: randomUUID(),
        clientId: file.clientId,
        status: 'pending',
      }));
      return route.fulfill({ json: { tickets: session.recentUploads } });
    }
    const upload = path.match(/^uploads\/([^/]+)\/(url|complete)$/);
    if (upload?.[2] === 'url')
      return route.fulfill({ json: { url: uploadOrigin + '/' + String(upload[1]) } });
    if (upload?.[2] === 'complete') {
      const ticket = session.recentUploads.find((item) => item.id === upload[1]);
      if (ticket) ticket.status = 'completed';
      return route.fulfill({ json: { status: 'completed' } });
    }
    throw new Error('Unexpected photo API: ' + path);
  });
  await page.goto('/events/the-link-up');
  await page.getByRole('button', { name: 'Add photos', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Choose photos', exact: true })).toBeEnabled();
  return uploads;
}

async function jpeg() {
  return sharp({ create: { width: 80, height: 40, channels: 3, background: '#789abc' } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
}

test('a mixed HEIC, JPEG, PNG and WebP selection prepares, restores and shares', async ({
  page,
}) => {
  const uploads = await album(page);
  const png = await sharp({
    create: { width: 64, height: 32, channels: 3, background: '#bbaa77' },
  })
    .png()
    .toBuffer();
  const webp = await sharp({
    create: { width: 32, height: 64, channels: 3, background: '#77aabb' },
  })
    .webp()
    .toBuffer();
  await expect(page.locator('input[type=file]')).toHaveAttribute(
    'accept',
    'image/jpeg,image/png,image/webp',
  );
  await page.locator('input[type=file]').setInputFiles([
    { name: 'camera.HEIC', mimeType: 'image/heic', buffer: heic },
    { name: 'portrait.jpg', mimeType: 'image/jpeg', buffer: await jpeg() },
    { name: 'screenshot.png', mimeType: 'image/png', buffer: png },
    { name: 'memory.webp', mimeType: 'image/webp', buffer: webp },
  ]);
  await expect(page.getByText('Ready', { exact: true })).toHaveCount(4, { timeout: 45_000 });
  await expect(page.getByRole('dialog').locator('li img')).toHaveCount(4);
  await expect(page.locator('input[type=file]')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Share 4 photos', exact: true })).toBeEnabled();
  await page.reload();
  await page.getByRole('button', { name: 'Add photos', exact: true }).first().click();
  await expect(page.getByText('Ready', { exact: true })).toHaveCount(4, { timeout: 45_000 });
  await page.getByRole('button', { name: 'Share 4 photos', exact: true }).click();
  await expect(page.getByText('4 photos shared.', { exact: true })).toBeVisible();
  expect(uploads).toHaveLength(4);
  for (const upload of uploads) expect(upload.type).toBe('image/jpeg');
  const metadata = await Promise.all(uploads.map(({ bytes }) => sharp(bytes).metadata()));
  for (const photo of metadata) {
    expect(photo.format).toBe('jpeg');
    expect(photo.exif).toBeUndefined();
    expect(photo.width).toBeLessThanOrEqual(2048);
    expect(photo.height).toBeLessThanOrEqual(2048);
  }
  expect(metadata.some((photo) => photo.width === 40 && photo.height === 80)).toBe(true);
});

test('multiple real HEIC files with missing or incorrect picker types still prepare', async ({
  page,
}) => {
  await album(page);
  await page.locator('input[type=file]').setInputFiles([
    { name: 'renamed.jpg', mimeType: 'image/jpeg', buffer: heic },
    { name: 'untyped.jpg', mimeType: '', buffer: heic },
    { name: 'original.heif', mimeType: 'image/heif', buffer: heic },
  ]);
  await expect(page.getByText('Ready', { exact: true })).toHaveCount(3, { timeout: 45_000 });
  await expect(page.getByRole('button', { name: 'Share 3 photos', exact: true })).toBeEnabled();
  await expect(page.getByText(/could not be opened|could not be converted/)).toHaveCount(0);
});

test('detailed photos retain detail within the full 2 MB allowance', async ({ page }) => {
  const received = await album(page);
  const width = 1600;
  const height = 1200;
  const pixels = Buffer.alloc(width * height * 3);
  let seed = 123456;
  for (let offset = 0; offset < pixels.length; offset += 3) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const value = seed >>> 24;
    pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = value;
  }
  const original = await sharp(pixels, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'detailed.png', mimeType: 'image/png', buffer: original });
  await expect(page.getByText('Ready', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Share 1 photo', exact: true }).click();
  await expect(page.getByText('1 photo shared.', { exact: true })).toBeVisible();
  expect(received).toHaveLength(1);
  const upload = received[0];
  if (!upload) throw new Error('Missing prepared photo');
  const bytes = upload.bytes;
  expect(bytes.length).toBeGreaterThan(1024 * 1024);
  expect(bytes.length).toBeLessThanOrEqual(2 * 1024 * 1024);
  const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
  expect([info.width, info.height]).toEqual([width, height]);
  let squaredError = 0;
  for (let offset = 0; offset < pixels.length; offset++)
    squaredError += (pixels.readUInt8(offset) - data.readUInt8(offset)) ** 2;
  expect(squaredError / pixels.length).toBeLessThan(30);
});

test('a bad HEIC and a bad JPEG leave the valid photos shareable', async ({ page }) => {
  const uploads = await album(page);
  await page.locator('input[type=file]').setInputFiles([
    { name: 'broken.heic', mimeType: 'image/heic', buffer: heic.subarray(0, 100) },
    { name: 'camera.heic', mimeType: 'image/heic', buffer: heic },
    { name: 'broken.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not a photo') },
    { name: 'portrait.jpg', mimeType: 'image/jpeg', buffer: await jpeg() },
  ]);
  await expect(page.getByText('Ready', { exact: true })).toHaveCount(2, { timeout: 45_000 });
  await expect(page.getByText('Needs attention', { exact: true })).toHaveCount(2);
  await page.getByRole('button', { name: 'Share 2 photos', exact: true }).click();
  await expect(page.getByText('2 photos shared.', { exact: true })).toBeVisible();
  expect(uploads).toHaveLength(2);
  for (const upload of uploads) {
    expect(upload.type).toBe('image/jpeg');
    expect(upload.bytes.length).toBeGreaterThan(0);
  }
});
