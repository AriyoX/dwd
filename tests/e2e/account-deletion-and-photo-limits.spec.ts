import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { test, expect, type Page } from '@playwright/test';
import { MAX_MEMORY_PHOTO_BYTES, type Database } from '@dwd/core';
import {
  createDeletionHandler,
  type DeletionJob,
} from '../../supabase/functions/delete-accounts/handler';

function backend() {
  const url = process.env['E2E_SUPABASE_URL'] ?? '';
  if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname))
    throw new Error('Local test backend required.');
  return {
    client: createClient<Database>(url, process.env['E2E_SUPABASE_PUBLISHABLE_KEY'] ?? ''),
    admin: createClient<Database>(url, process.env['E2E_SUPABASE_SECRET_KEY'] ?? '', {
      auth: { persistSession: false },
    }),
  };
}

async function account() {
  const { client, admin } = backend();
  const email = `delete-test-${randomUUID()}@example.test`;
  const password = 'local-deletion-password-123';
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: 'Deletion Test', age_confirmed: true, tour_seen: true },
  });
  if (created.error) throw new Error('Fixture signup failed.');
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  return { client, admin, email, password, id: created.data.user.id };
}

async function login(page: Page, user: Awaited<ReturnType<typeof account>>) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole('heading', { name: 'Your evening, Deletion.' })).toBeVisible();
}

test('account deletion signs out, schedules 30 days, and a new login cancels it', async ({
  page,
}) => {
  test.skip(!process.env['E2E_SUPABASE_SECRET_KEY'], 'Local backend required.');
  const user = await account();
  await login(page, user);
  await page.goto('/account');
  await page.getByRole('main').getByText('Delete your account', { exact: true }).click();
  await page.getByRole('checkbox', { name: /I understand I will be signed out/ }).check();
  await page.getByRole('button', { name: 'Delete account in 30 days' }).click();
  await expect(page).toHaveURL(/\/login\?deletion=scheduled$/);
  const scheduled = await user.admin
    .from('account_deletions')
    .select('requested_at, delete_after')
    .eq('user_id', user.id)
    .single();
  expect(scheduled.error).toBeNull();
  if (!scheduled.data) throw new Error('No deletion schedule.');
  expect(Date.parse(scheduled.data.delete_after) - Date.parse(scheduled.data.requested_at)).toBe(
    30 * 86_400_000,
  );
  await login(page, user);
  const cancelled = await user.admin
    .from('account_deletions')
    .select('user_id')
    .eq('user_id', user.id);
  expect(cancelled.data).toEqual([]);
});

test('Storage enforces concurrent photo limits and the worker deletes actual photos and Auth', async () => {
  test.skip(!process.env['E2E_SUPABASE_SECRET_KEY'], 'Local backend required.');
  const user = await account();
  const started = await user.client.rpc('start_night_out', {
    p_creation_key: randomUUID(),
    p_title: 'Deletion photo fixture',
    p_timezone: 'Africa/Nairobi',
    p_ends_at: new Date(Date.now() + 7_200_000).toISOString(),
    p_host_plan: [],
    p_guests: [],
  });
  if (started.error || !started.data) throw new Error('Fixture night failed.');
  const nightId = (started.data as { nightId: string }).nightId;
  expect((await user.client.rpc('end_night', { p_night_id: nightId })).error).toBeNull();
  const oversized = await user.client.storage
    .from('night-memories')
    .upload(`${nightId}/${user.id}/${randomUUID()}.jpg`, Buffer.alloc(MAX_MEMORY_PHOTO_BYTES + 1), {
      contentType: 'image/jpeg',
    });
  expect(oversized.error).not.toBeNull();
  const bytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  const exactLimitId = randomUUID();
  const exactLimitPath = `${nightId}/${user.id}/${exactLimitId}.png`;
  const exactLimitBytes = Buffer.alloc(MAX_MEMORY_PHOTO_BYTES);
  bytes.copy(exactLimitBytes);
  expect(
    (
      await user.client.storage
        .from('night-memories')
        .upload(exactLimitPath, exactLimitBytes, { contentType: 'image/png' })
    ).error,
  ).toBeNull();
  expect(
    (
      await user.client.rpc('register_night_photo', {
        p_photo_id: exactLimitId,
        p_night_id: nightId,
        p_object_path: exactLimitPath,
        p_mime_type: 'image/png',
        p_byte_size: exactLimitBytes.length,
        p_width: 1,
        p_height: 1,
      })
    ).error,
  ).toBeNull();
  expect(
    (await user.client.storage.from('night-memories').remove([exactLimitPath])).error,
  ).toBeNull();
  expect(
    (await user.client.rpc('delete_night_photo', { p_photo_id: exactLimitId })).error,
  ).toBeNull();
  const paths = Array.from({ length: 4 }, () => `${nightId}/${user.id}/${randomUUID()}.png`);
  const uploads = await Promise.all(
    paths.map((path) =>
      user.client.storage.from('night-memories').upload(path, bytes, { contentType: 'image/png' }),
    ),
  );
  expect(uploads.filter((result) => result.error === null)).toHaveLength(2);
  const savedPath = uploads.find((result) => result.data)?.data?.path;
  if (!savedPath) throw new Error('No fixture photo uploaded.');
  const signed = await user.client.storage.from('night-memories').createSignedUrl(savedPath, 300);
  if (!signed.data) throw new Error('Fixture signing failed.');
  expect((await fetch(signed.data.signedUrl)).ok).toBe(true);
  expect((await user.client.rpc('schedule_account_deletion')).error).toBeNull();
  const container = process.env['E2E_AUTH_DB_CONTAINER'] ?? 'supabase_db_dwd-e2e';
  if (!/^supabase_db_dwd-(?:e2e|browser-ci)$/.test(container))
    throw new Error('Local test database required.');
  execFileSync('docker', [
    'exec',
    container,
    'psql',
    '-U',
    'supabase_admin',
    '-d',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `begin; update public.account_deletions set requested_at = now() - interval '31 days', delete_after = now() - interval '1 day' where user_id = '${user.id}'; update auth.users set last_sign_in_at = now() - interval '32 days' where id = '${user.id}'; commit;`,
  ]);
  const secret = 'local-only-account-deletion-test-secret';
  const handler = createDeletionHandler({
    secret,
    async claim() {
      const result = await user.admin.rpc('claim_account_deletions');
      if (result.error) throw result.error;
      return result.data as unknown as DeletionJob[];
    },
    async removePhotos(objects) {
      const result = await user.admin.storage.from('night-memories').remove(objects);
      if (result.error) throw result.error;
    },
    async complete(job) {
      const result = await user.admin.rpc('complete_account_deletion', {
        p_user_id: job.userId,
        p_request_id: job.requestId,
        p_claim_id: job.claimId,
      });
      if (result.error) throw result.error;
      return result.data;
    },
  });
  const response = await handler(
    new Request('http://localhost/delete-accounts', {
      method: 'POST',
      headers: { 'x-dwd-deletion-secret': secret },
    }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ deleted: 1, failed: 0 });
  expect((await fetch(signed.data.signedUrl)).ok).toBe(false);
  expect((await user.admin.auth.admin.getUserById(user.id)).data.user).toBeNull();
  expect(
    (await user.admin.from('night_photos').select('id').eq('uploaded_by_user_id', user.id)).data,
  ).toEqual([]);
  expect(
    (await user.client.auth.signInWithPassword({ email: user.email, password: user.password }))
      .error,
  ).not.toBeNull();
});

test('large photos compress in the browser and photos that cannot fit are rejected before upload', async ({
  page,
}) => {
  test.skip(!process.env['E2E_SUPABASE_SECRET_KEY'], 'Local backend required.');
  const user = await account();
  const started = await user.client.rpc('start_night_out', {
    p_creation_key: randomUUID(),
    p_title: 'Compression fixture',
    p_timezone: 'Africa/Nairobi',
    p_ends_at: new Date(Date.now() + 7_200_000).toISOString(),
    p_host_plan: [],
    p_guests: [],
  });
  if (started.error || !started.data) throw new Error('Fixture night failed.');
  const nightId = (started.data as { nightId: string }).nightId;
  expect((await user.client.rpc('end_night', { p_night_id: nightId })).error).toBeNull();
  await login(page, user);
  await page.goto(`/night/${nightId}/summary`);
  await expect(page.getByRole('button', { name: 'Add photos', exact: true })).toBeEnabled();
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 1600;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable.');
    const pixels = context.createImageData(canvas.width, canvas.height);
    let seed = 12345;
    for (let index = 0; index < pixels.data.length; index += 4) {
      for (let channel = 0; channel < 3; channel++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        pixels.data[index + channel] = seed >>> 24;
      }
      pixels.data[index + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const source = Buffer.from(base64, 'base64');
  expect(source.length).toBeGreaterThan(MAX_MEMORY_PHOTO_BYTES);
  await page
    .getByLabel('Add photos from your night')
    .setInputFiles({ name: 'large-photo.png', mimeType: 'image/png', buffer: source });
  await expect(page.getByRole('img', { name: 'Uploaded by Deletion Test' })).toBeVisible();
  const saved = await user.client
    .from('night_photos')
    .select('byte_size')
    .eq('night_id', nightId)
    .is('deleted_at', null)
    .single();
  expect(saved.error).toBeNull();
  expect(saved.data?.byte_size).toBeLessThanOrEqual(MAX_MEMORY_PHOTO_BYTES);
  expect(saved.data?.byte_size).toBeLessThan(source.length);

  // Simulate an encoder whose output stays oversized through every attempt.
  await page.evaluate((limit) => {
    HTMLCanvasElement.prototype.toBlob = function (callback, type = 'image/png') {
      callback(new Blob([new Uint8Array(limit + 1)], { type }));
    };
  }, MAX_MEMORY_PHOTO_BYTES);
  await expect(page.getByRole('button', { name: 'Add photos', exact: true })).toBeEnabled();
  await page
    .getByLabel('Add photos from your night')
    .setInputFiles({ name: 'cannot-fit.png', mimeType: 'image/png', buffer: source });
  await expect(
    page.getByText('This photo could not be compressed to 5 MB. Choose a smaller photo.'),
  ).toBeVisible();
  const remaining = await user.client
    .from('night_photos')
    .select('id')
    .eq('night_id', nightId)
    .is('deleted_at', null);
  expect(remaining.data).toHaveLength(1);
  const objects = await user.admin.storage.from('night-memories').list(`${nightId}/${user.id}`);
  expect(objects.data).toHaveLength(1);
});

test('a photo save can retry after both upload slots are occupied', async ({ page }) => {
  test.skip(!process.env['E2E_SUPABASE_SECRET_KEY'], 'Local backend required.');
  const user = await account();
  const started = await user.client.rpc('start_night_out', {
    p_creation_key: randomUUID(),
    p_title: 'Photo retry fixture',
    p_timezone: 'Africa/Nairobi',
    p_ends_at: new Date(Date.now() + 7_200_000).toISOString(),
    p_host_plan: [],
    p_guests: [],
  });
  if (started.error || !started.data) throw new Error('Fixture night failed.');
  const nightId = (started.data as { nightId: string }).nightId;
  expect((await user.client.rpc('end_night', { p_night_id: nightId })).error).toBeNull();
  await login(page, user);
  await page.goto(`/night/${nightId}/summary`);
  await expect(page.getByRole('button', { name: 'Add photos', exact: true })).toBeEnabled();
  let saves = 0;
  await page.route(`**/night/${nightId}/summary`, async (route) => {
    const request = route.request();
    if (request.method() === 'POST' && request.postData()?.includes('"byteSize"')) {
      saves++;
      if (saves === 2) {
        await route.abort('failed');
        return;
      }
    }
    await route.continue();
  });
  const buffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  await page.getByLabel('Add photos from your night').setInputFiles([
    { name: 'one.png', mimeType: 'image/png', buffer },
    { name: 'two.png', mimeType: 'image/png', buffer },
  ]);
  const retry = page.getByRole('button', { name: 'Retry', exact: true });
  await expect(retry).toBeVisible();
  expect(
    (await user.admin.storage.from('night-memories').list(`${nightId}/${user.id}`)).data,
  ).toHaveLength(2);
  await retry.click();
  await expect(
    page.getByRole('img', { name: 'Uploaded by Deletion Test', exact: true }),
  ).toHaveCount(2);
  await expect(retry).toHaveCount(0);
});
