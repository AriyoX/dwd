import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { test, expect, type Page } from '@playwright/test';
import type { Database, NightSnapshot } from '@dwd/core';

async function account(name: string) {
  const url = process.env['E2E_SUPABASE_URL'] ?? '';
  if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname))
    throw new Error('Local test backend required.');
  const client = createClient<Database>(url, process.env['E2E_SUPABASE_PUBLISHABLE_KEY'] ?? '');
  const email = `review-${randomUUID()}@example.test`;
  const password = 'local-review-password-123';
  const { error } = await client.auth.signUp({
    email,
    password,
    options: { data: { display_name: name, age_confirmed: true, tour_seen: true } },
  });
  if (error) throw error;
  return { client, email, password };
}

async function login(page: Page, user: Awaited<ReturnType<typeof account>>) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
}

async function snapshot(client: SupabaseClient<Database>, nightId: string) {
  const { data, error } = await client.rpc('get_night_snapshot', { p_night_id: nightId });
  if (error) throw error;
  return data as unknown as NightSnapshot;
}

test('device notification setup retries, persists, turns off and new alcohol plans start blank', async ({
  page,
  context,
}, info) => {
  test.skip(!process.env['E2E_SUPABASE_PUBLISHABLE_KEY'], 'Local backend required.');
  const user = await account('Settings Review');
  const endpoint = `https://fcm.googleapis.com/fcm/send/local-review-${randomUUID()}`;
  await context.addInitScript(
    ({ endpoint }) => {
      Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
      Object.defineProperty(window, 'Notification', {
        configurable: true,
        value: Object.assign(
          function MockNotification() {
            return {};
          },
          {
            permission: 'granted',
            requestPermission: () => Promise.resolve('granted'),
          },
        ),
      });
      Object.defineProperty(window, 'PushManager', { configurable: true, value: Object });
      const subscription = {
        endpoint,
        expirationTime: null,
        options: {},
        toJSON: () => ({ endpoint, keys: { p256dh: 'p'.repeat(32), auth: 'a'.repeat(16) } }),
        unsubscribe: () => {
          sessionStorage.removeItem('review-subscribed');
          return Promise.resolve(true);
        },
      };
      const registration = {
        pushManager: {
          getSubscription: () =>
            Promise.resolve(sessionStorage.getItem('review-subscribed') ? subscription : null),
          subscribe: () => {
            if (!sessionStorage.getItem('review-attempted')) {
              sessionStorage.setItem('review-attempted', '1');
              return Promise.reject(new Error('Simulated push-provider failure'));
            }
            sessionStorage.setItem('review-subscribed', '1');
            return Promise.resolve(subscription);
          },
        },
      };
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: {
          register: () => Promise.resolve(registration),
          ready: Promise.resolve(registration),
          getRegistration: () => Promise.resolve(registration),
        },
      });
    },
    { endpoint },
  );
  await login(page, user);
  await page.goto('/account');
  const enable = page.getByRole('button', { name: 'Enable reminders', exact: true });
  await expect(enable).toBeEnabled();
  await enable.click();
  await expect(
    page.getByRole('region', { name: 'Reminder setup' }).getByRole('alert'),
  ).toContainText('Browser setup could not finish');
  await enable.click();
  await expect(
    page.getByRole('region', { name: 'Reminder setup' }).getByRole('status'),
  ).toContainText('On');
  await page.reload();
  const disable = page.getByRole('button', { name: 'Turn off on this device', exact: true });
  await expect(disable).toBeEnabled();
  await expect
    .poll(
      async () =>
        (await user.client.from('push_subscriptions').select('id').eq('endpoint', endpoint)).data
          ?.length,
    )
    .toBe(1);
  await disable.click();
  await expect(enable).toBeEnabled();
  await expect
    .poll(
      async () =>
        (await user.client.from('push_subscriptions').select('id').eq('endpoint', endpoint)).data
          ?.length,
    )
    .toBe(0);
  await page.reload();
  await expect(enable).toBeEnabled();
  await page.getByLabel('Remind me to take a break', { exact: true }).check();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await page.getByLabel('Remind me to log', { exact: true }).check();
  await page.getByLabel('How often?', { exact: true }).selectOption('30');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await expect(page.locator('body')).toHaveJSProperty(
    'scrollWidth',
    info.project.use.viewport?.width ?? 390,
  );
  await page
    .locator('#notifications:visible')
    .screenshot({ path: `.tmp/ui-review/${info.project.name}-settings-light.png` });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();
  await expect(enable).toBeEnabled();
  await page
    .locator('#notifications:visible')
    .screenshot({ path: `.tmp/ui-review/${info.project.name}-settings-dark.png` });
  await page.reload();
  await expect(page.getByLabel('Remind me to take a break', { exact: true })).toBeChecked();
  await expect(page.getByLabel('How often?', { exact: true })).toHaveValue('30');
  await page.goto('/night/new');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Choose a plan', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Plan drinks', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await page.getByRole('button', { name: 'Plan drinks', exact: true }).click();
  await expect(page.getByRole('option', { name: 'Choose a drink', exact: true })).toHaveAttribute(
    'value',
    '',
  );
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Plan drinks', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start night', exact: true })).toHaveCount(0);
  await user.client.auth.signOut();
});

test('exactly one logged drink can adjust upward after refresh and reconnect', async ({
  page,
  context,
}, info) => {
  test.skip(!process.env['E2E_SUPABASE_PUBLISHABLE_KEY'], 'Local backend required.');
  const user = await account('One Drink Regression');
  const created = await user.client.rpc('start_night_out', {
    p_creation_key: randomUUID(),
    p_title: `One drink ${info.project.name}`,
    p_timezone: 'Africa/Nairobi',
    p_ends_at: new Date(Date.now() + 7_200_000).toISOString(),
    p_host_plan: [
      {
        label: 'Beer',
        category: 'beer',
        volumeMl: 330,
        abvPercent: 5,
        plannedQuantity: 4,
        isQuickLog: true,
      },
    ],
    p_guests: [],
  });
  expect(created.error).toBeNull();
  const nightId = (created.data as { nightId: string }).nightId;
  try {
    await login(page, user);
    await page.goto(`/night/${nightId}`);
    await page.getByRole('button', { name: 'Log Beer', exact: true }).click();
    await expect(page.getByTestId('drink-count')).toHaveText('1');
    const before = await snapshot(user.client, nightId);
    const historicalLog = before.members.find((member) => member.role === 'host')?.drinkLogs[0];
    expect(historicalLog).toBeDefined();

    await page.reload();
    await context.setOffline(true);
    await context.setOffline(false);
    await page.reload();
    await page.getByRole('button', { name: 'Adjust', exact: true }).click();
    const plan = page.getByRole('dialog', { name: /One Drink Regression's plan/ });
    await plan.getByLabel('Quantity').fill('6');
    await plan.getByRole('button', { name: 'Save plan', exact: true }).click();
    await expect(plan).toHaveCount(0);
    await expect(page.getByTestId('drink-count')).toHaveText('1');

    await expect
      .poll(async () => {
        const current = await snapshot(user.client, nightId);
        const member = current.members.find((item) => item.role === 'host');
        return {
          logs: member?.drinkLogs.map((log) => log.id),
          quantity: member?.planItems.find((item) => item.archivedAt === null)?.plannedQuantity,
        };
      })
      .toEqual({ logs: [historicalLog?.id], quantity: 6 });
  } finally {
    await context.setOffline(false).catch(() => {});
    await user.client.rpc('end_night', { p_night_id: nightId });
    await user.client.auth.signOut();
  }
});

test('catch-up keeps every missed entry through warnings, refresh and offline recovery', async ({
  page,
  context,
}, info) => {
  test.skip(!process.env['E2E_SUPABASE_PUBLISHABLE_KEY'], 'Local backend required.');
  const user = await account('Catch-up Tracker');
  const created = await user.client.rpc('start_night_out', {
    p_creation_key: randomUUID(),
    p_title: `Catch-up ${info.project.name}`,
    p_timezone: 'Africa/Nairobi',
    p_ends_at: new Date(Date.now() + 7_200_000).toISOString(),
    p_host_plan: [
      {
        label: 'Beer',
        category: 'beer',
        volumeMl: 330,
        abvPercent: 5,
        plannedQuantity: 1,
        isQuickLog: true,
      },
    ],
    p_guests: [],
  });
  expect(created.error).toBeNull();
  const nightId = (created.data as { nightId: string }).nightId;
  try {
    await login(page, user);
    await page.goto(`/night/${nightId}`);
    await page.getByRole('button', { name: 'Manage', exact: true }).click();
    await page.getByRole('button', { name: 'Catch up', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Catch-up Tracker');
    await expect(dialog).toContainText('Drinks will be logged as Beer.');
    for (let i = 0; i < 3; i++)
      await dialog.getByRole('button', { name: 'Add one Drinks', exact: true }).click();
    for (let i = 0; i < 2; i++)
      await dialog.getByRole('button', { name: 'Add one Chasers', exact: true }).click();
    await context.setOffline(true);
    await expect(page.getByText('Offline', { exact: true }).first()).toBeVisible();
    await dialog.getByRole('button', { name: 'Add missed entries', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('.pending-entry')).toHaveCount(5);
    await context.setOffline(false);
    await expect(page.getByRole('button', { name: 'Review', exact: true })).toHaveCount(2);
    await page.reload();
    await page.getByRole('button', { name: 'Manage', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Review', exact: true })).toHaveCount(2);
    for (let remaining = 2; remaining > 0; remaining--) {
      await page.getByRole('button', { name: 'Review', exact: true }).first().click();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Log anyway', exact: true })
        .click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Review', exact: true })).toHaveCount(
        remaining - 1,
      );
    }
    await expect
      .poll(async () => {
        const current = await snapshot(user.client, nightId);
        const member = current.members.find((item) => item.role === 'host');
        return [member?.drinkLogs.length, member?.waterLogs.length];
      })
      .toEqual([3, 2]);
  } finally {
    await context.setOffline(false);
    await user.client.rpc('end_night', { p_night_id: nightId });
    await user.client.auth.signOut();
  }
});

test('completed-night memories upload privately and remain uploader-deletable', async ({
  page,
  context,
}, info) => {
  test.skip(!process.env['E2E_SUPABASE_PUBLISHABLE_KEY'], 'Local backend required.');
  const host = await account('Photo Host');
  const outsider = await account('Photo Outsider');
  const created = await host.client.rpc('start_night_out', {
    p_creation_key: randomUUID(),
    p_title: `Memory night ${info.project.name}`,
    p_timezone: 'Africa/Nairobi',
    p_ends_at: new Date(Date.now() + 7_200_000).toISOString(),
    p_host_plan: [],
    p_guests: [],
  });
  expect(created.error).toBeNull();
  const nightId = (created.data as { nightId: string }).nightId;
  const observer = await context.newPage();
  try {
    await login(page, host);
    await page.goto(`/night/${nightId}`);
    await page.getByRole('button', { name: 'Manage', exact: true }).click();
    await page.getByRole('button', { name: 'End night and view summary' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'End night', exact: true }).click();
    await expect(page).toHaveURL(`/night/${nightId}/summary`);
    await expect(page.getByRole('heading', { name: 'Photos & memories' })).toBeVisible();
    await observer.goto(`/night/${nightId}/summary`);
    await expect(observer.getByText('No photos yet', { exact: true })).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles({
      name: 'memory.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      ),
    });
    await expect(page.getByRole('img', { name: 'Uploaded by Photo Host' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Uploaded by Photo Host' })).toHaveJSProperty(
      'naturalWidth',
      1,
    );
    await expect(observer.getByRole('img', { name: 'Uploaded by Photo Host' })).toBeVisible();
    const { data: rows, error: rowsError } = await host.client
      .from('night_photos')
      .select('object_path')
      .eq('night_id', nightId)
      .is('deleted_at', null)
      .single();
    expect(rowsError).toBeNull();
    const unauthorized = await outsider.client.storage
      .from('night-memories')
      .createSignedUrl(rows?.object_path ?? '', 60);
    expect(unauthorized.error).not.toBeNull();

    const signed = await host.client.storage
      .from('night-memories')
      .createSignedUrl(rows?.object_path ?? '', 60);
    expect(signed.error).toBeNull();
    if (!signed.data) throw new Error('Photo signing failed.');
    expect((await fetch(signed.data.signedUrl)).ok).toBe(true);
    await page.getByRole('button', { name: 'View photo by Photo Host' }).click();
    await expect(page.getByRole('dialog').getByRole('img')).toBeVisible();
    await page.getByRole('button', { name: 'Close dialog' }).click();

    await page.getByRole('button', { name: 'Delete your photo' }).click();
    await expect(page.getByRole('img', { name: 'Uploaded by Photo Host' })).toHaveCount(0);
    // A previously issued URL must no longer retrieve a deleted object. Merely
    // hiding metadata or denying a new signature leaves the file behind.
    expect((await fetch(signed.data.signedUrl)).ok).toBe(false);
    await observer.bringToFront();
    await expect(observer.getByText('No photos yet', { exact: true })).toBeVisible({
      timeout: 35_000,
    });
    await expect
      .poll(async () => {
        const result = await host.client
          .from('night_photos')
          .select('id', { count: 'exact', head: true })
          .eq('night_id', nightId)
          .is('deleted_at', null);
        return result.count;
      })
      .toBe(0);
  } finally {
    await observer.close();
    await host.client.auth.signOut();
    await outsider.client.auth.signOut();
  }
});

test('a host adds and selects a managed guest mid-night with realtime visibility', async ({
  page,
  context,
}, info) => {
  test.skip(!process.env['E2E_SUPABASE_PUBLISHABLE_KEY'], 'Local backend required.');
  const host = await account('Tracker Host');
  const created = await host.client.rpc('start_night_out', {
    p_creation_key: randomUUID(),
    p_title: `Late guest ${info.project.name}`,
    p_timezone: 'Africa/Nairobi',
    p_ends_at: new Date(Date.now() + 7_200_000).toISOString(),
    p_host_plan: [],
    p_guests: [],
  });
  expect(created.error).toBeNull();
  const nightId = (created.data as { nightId: string }).nightId;
  const observer = await context.newPage();
  try {
    await login(page, host);
    await page.goto(`/night/${nightId}`);
    await observer.goto(`/night/${nightId}`);
    await expect(
      observer.getByRole('heading', { name: 'Tracker Host', exact: true }),
    ).toBeVisible();
    await expect(observer.getByText('Connected', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Add person', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Add person' });
    await dialog.getByLabel('Display name').fill('Late Guest');
    await dialog.getByRole('button', { name: 'Chaser only', exact: true }).click();
    await dialog.getByRole('button', { name: 'Add person', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Late Guest', exact: true })).toBeVisible();
    await expect(page.getByText('You log for them', { exact: true }).first()).toBeVisible();
    await expect(
      observer.getByRole('button', { name: /Late Guest.*You log for them/ }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Chaser', exact: true }).click();
    await expect(page.locator('[data-tour="plan"]')).toContainText('1 chaser');
    await page.getByRole('button', { name: /Tracker Host.*Account/ }).click();
    await expect(page.getByRole('heading', { name: 'Tracker Host', exact: true })).toBeVisible();

    const current = await snapshot(host.client, nightId);
    const late = current.members.find((member) => member.displayName === 'Late Guest');
    expect(late?.memberType).toBe('guest');
    expect(Date.parse(late?.joinedAt ?? '')).toBeGreaterThan(Date.parse(current.night.startsAt));
    expect(late?.drinkLogs).toHaveLength(0);
    expect(late?.waterLogs).toHaveLength(1);
  } finally {
    await observer.close();
    await host.client.rpc('end_night', { p_night_id: nightId });
    await host.client.auth.signOut();
  }
});

test('two accounts: setup refresh, drink confirmations, live check-ins, guest routing, names and departed history', async ({
  page,
  context,
  browser,
}, info) => {
  test.skip(!process.env['E2E_SUPABASE_PUBLISHABLE_KEY'], 'Local backend required.');
  test.setTimeout(180_000);
  const host = await account('Review Host');
  const member = await account('Review Member');
  const title = `Verified night ${info.project.name} ${Date.now()}`;
  const created = await host.client.rpc('start_night_out', {
    p_creation_key: randomUUID(),
    p_title: title,
    p_timezone: 'Africa/Nairobi',
    p_ends_at: new Date(Date.now() + 7_200_000).toISOString(),
    p_host_plan: [
      {
        label: 'Wine',
        category: 'wine',
        volumeMl: 150,
        abvPercent: 12,
        plannedQuantity: 1,
        isQuickLog: true,
      },
    ],
    p_guests: [{ displayName: 'Casey Guest', planItems: [] }],
  });
  expect(created.error).toBeNull();
  const nightId = (created.data as { nightId: string }).nightId;
  const hash = randomUUID().replaceAll('-', '').repeat(2);
  expect(
    (
      await host.client.rpc('create_night_invite', {
        p_night_id: nightId,
        p_token_hash: hash,
        p_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      })
    ).error,
  ).toBeNull();
  expect((await member.client.rpc('redeem_night_invite', { p_token_hash: hash })).error).toBeNull();
  expect(
    (
      await host.client.rpc('update_notification_preferences', {
        p_group_attention_enabled: true,
        p_direct_checkins_enabled: true,
        p_personal_pace_enabled: true,
        p_planned_end_enabled: true,
        p_periodic_water_enabled: true,
        p_periodic_interval_minutes: 60,
      })
    ).error,
  ).toBeNull();

  const other = await browser.newContext({ ...info.project.use, baseURL: 'http://localhost:3100' });
  const recipient = await other.newPage();
  page.setDefaultTimeout(15_000);
  recipient.setDefaultTimeout(15_000);
  const errors: string[] = [];
  for (const testPage of [page, recipient]) {
    await testPage.exposeFunction('recordReviewUnhandled', (message: string) =>
      errors.push(message),
    );
    await testPage.addInitScript(() => {
      const report = (message: string) => {
        const record = Reflect.get(window, 'recordReviewUnhandled') as (
          message: string,
        ) => Promise<void>;
        void record(message);
      };
      window.addEventListener('unhandledrejection', (event) => report(String(event.reason)));
      window.addEventListener('error', (event) => report(event.message));
    });
    testPage.on('pageerror', (error) => {
      // WebKit reports canceled fetch console diagnostics as pageerror when
      // reload/offline interrupts a Server Action, even with a handled promise.
      // Real window errors/rejections remain checked by the listeners above.
      if (info.project.name === 'webkit-mobile' && error.name.startsWith('Fetch API cannot load '))
        return;
      errors.push(error.message);
    });
  }
  try {
    await login(recipient, member);
    await recipient.goto(`/night/${nightId}?setup=1&keep=yes`);
    await recipient
      .getByRole('dialog')
      .getByRole('button', { name: 'Chaser only', exact: true })
      .click();
    await recipient.getByRole('button', { name: 'Save plan', exact: true }).click();
    await expect(recipient.getByRole('dialog')).toHaveCount(0);
    await recipient.goto(`/night/${nightId}?setup=1&keep=yes`);
    await expect(recipient).toHaveURL(new RegExp(`/night/${nightId}\\?keep=yes$`));
    await expect(recipient.getByRole('dialog')).toHaveCount(0);
    await recipient.reload();
    await expect(recipient.getByRole('dialog')).toHaveCount(0);

    await login(page, host);
    await page.goto(`/night/${nightId}`);
    await page.getByRole('button', { name: 'Log Wine', exact: true }).click();
    await expect(page.getByTestId('drink-count')).toHaveText('1');
    await page.getByRole('button', { name: 'Log Wine', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Confirm this log' })).toBeVisible();
    await page
      .getByRole('button', { name: 'Log anyway', exact: true })
      .evaluate((button: HTMLButtonElement) => {
        button.click();
        button.click();
      });
    await expect(page.getByTestId('drink-count')).toHaveText('2');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Log Wine', exact: true }).click();
    await page.getByRole('button', { name: 'Log anyway', exact: true }).click();
    await expect(page.getByText('1 waiting to save', { exact: true })).toBeVisible();
    await context.setOffline(false);
    await expect
      .poll(
        async () =>
          (await snapshot(host.client, nightId)).members.find((item) => item.role === 'host')
            ?.drinkLogs.length,
      )
      .toBe(3);
    await page.reload();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('drink-count')).toHaveText('3');

    await page.getByRole('button', { name: 'Group', exact: true }).click();
    await expect(page.getByText('3 wines', { exact: false })).toBeVisible();
    const memberCard = page
      .locator('.card')
      .filter({ has: page.getByText('Review Member', { exact: true }) });
    await memberCard.getByRole('button', { name: 'Check in', exact: true }).click();
    await recipient.bringToFront();
    await expect(
      recipient
        .getByRole('region', { name: 'Notifications', exact: true })
        .getByText('Review Host checked in on you', { exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    await recipient.screenshot({
      path: `.tmp/ui-review/${info.project.name}-check-in.png`,
      fullPage: true,
    });
    await recipient.getByRole('button', { name: 'Show notifications', exact: true }).click();
    await recipient
      .getByRole('article')
      .filter({ has: recipient.getByText('Review Host checked in on you', { exact: true }) })
      .getByRole('button', { name: 'Mark read', exact: true })
      .click();
    await recipient.getByRole('button', { name: 'Group', exact: true }).click();
    const guestCard = recipient
      .locator('.card')
      .filter({ has: recipient.getByText('Casey Guest', { exact: true }) });
    await guestCard.getByRole('button', { name: 'Ask host to check in', exact: true }).click();
    await page.bringToFront();
    await expect(
      page
        .getByRole('region', { name: 'Notifications', exact: true })
        .getByText('Check-in request for Casey Guest', { exact: true }),
    ).toBeVisible({ timeout: 20_000 });

    await recipient.bringToFront();
    await recipient.goto('/account');
    await recipient.getByLabel('Display name', { exact: true }).fill('Renamed Member');
    await recipient.getByRole('button', { name: 'Save name', exact: true }).click();
    await expect(recipient.getByText('Saved', { exact: true })).toBeVisible();
    await page.bringToFront();
    await expect(page.getByText('Renamed Member', { exact: true })).toBeVisible({
      timeout: 25_000,
    });
    await recipient.goto(`/night/${nightId}`);
    await recipient.getByRole('button', { name: 'Manage', exact: true }).click();
    await recipient.getByRole('button', { name: 'Leave night', exact: true }).click();
    await recipient
      .getByRole('dialog')
      .getByRole('button', { name: 'Leave night', exact: true })
      .click();
    await expect(recipient).toHaveURL(/\/home$/);
    expect((await host.client.rpc('end_night', { p_night_id: nightId })).error).toBeNull();
    await recipient.goto('/history');
    await recipient.getByRole('link').filter({ hasText: title }).click();
    await expect(recipient.getByRole('heading', { name: 'Your activity' })).toBeVisible();
    await expect(recipient.getByText('Renamed Member', { exact: true })).toBeVisible();
    await expect(recipient.getByText('Casey Guest', { exact: true })).toHaveCount(0);
    await expect(recipient.getByText('Review Host', { exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await context.setOffline(false).catch(() => {});
    await other.close().catch(() => {});
    await host.client.rpc('end_night', { p_night_id: nightId });
    await host.client.auth.signOut();
    await member.client.auth.signOut();
  }
});
