import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@dwd/core';
import { test, expect } from '@playwright/test';

async function removeLocalUser(admin: ReturnType<typeof createClient<Database>>, userId: string) {
  if (!/^[0-9a-f-]{36}$/.test(userId)) throw new Error('Invalid fixture ID');
  execFileSync(
    'docker',
    [
      'exec',
      process.env['E2E_AUTH_DB_CONTAINER'] ?? 'supabase_db_dwd-e2e',
      'psql',
      '-X',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-c',
      `delete from public.audit_events where actor_user_id='${userId}'; delete from public.profiles where id='${userId}';`,
    ],
    { stdio: 'pipe' },
  );
  const removed = await admin.auth.admin.deleteUser(userId);
  if (removed.error) throw removed.error;
}

test('a Supabase confirmation link signs in directly, including in a fresh browser', async ({
  page,
}) => {
  test.skip(!process.env['E2E_SUPABASE_SECRET_KEY'], 'Local admin key required.');
  const url = process.env['E2E_SUPABASE_URL'] ?? '';
  if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname))
    throw new Error('Local auth tests only.');
  const admin = createClient<Database>(url, process.env['E2E_SUPABASE_SECRET_KEY'] ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const next = '/join/email-confirmation-invitation';
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'signup',
    email: `confirmation-${randomUUID()}@example.test`,
    password: 'local-confirmation-test-password',
    options: {
      data: { display_name: 'Email Test', age_confirmed: true, tour_seen: true },
      redirectTo: `http://localhost:3100/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) throw error;
  try {
    // Follow Supabase's actual /verify redirect, rather than constructing a
    // token_hash callback that bypasses the default email's session handoff.
    await page.goto(data.properties.action_link);
    await expect(page).toHaveURL(new RegExp(`${next}$`));
    expect(new URL(page.url()).hash).toBe('');
    // A protected route proves the new session reached the server cookies.
    await page.goto('/home');
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole('link', { name: /Start a night/ })).toBeVisible();
  } finally {
    await removeLocalUser(admin, data.user.id);
  }
});

test('missing and rejected fragment sessions offer recovery without exposing tokens', async ({
  page,
}) => {
  await page.goto('/auth/confirm?next=%2Fjoin%2Fsaved#access_token=invalid&refresh_token=invalid');
  await expect(page).toHaveURL(/confirmation-help\?error=confirmation&next=%2Fjoin%2Fsaved$/);
  expect(new URL(page.url()).hash).toBe('');
  await page.goto('/auth/confirm?next=%2Freset-password%3Fnext%3D%252Fjoin%252Fsaved');
  await expect(page).toHaveURL(/forgot-password\?error=expired&next=%2Fjoin%2Fsaved$/);
});
