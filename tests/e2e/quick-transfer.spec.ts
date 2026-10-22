import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import type { Database, NightSnapshot, PlanItemInput } from '@dwd/core';

async function account(name: string) {
  const url = process.env['E2E_SUPABASE_URL'] ?? '';
  if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname))
    throw new Error('Local backend required.');
  const client = createClient<Database>(url, process.env['E2E_SUPABASE_PUBLISHABLE_KEY'] ?? '');
  const email = `quick-${randomUUID()}@example.test`,
    password = 'quick-local-password-123';
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { data: { display_name: name, age_confirmed: true, tour_seen: true } },
  });
  if (error || !data.user) throw error ?? new Error('Missing account');
  return { client, email, password, id: data.user.id };
}
async function signIn(page: Page, user: Awaited<ReturnType<typeof account>>) {
  await page.getByLabel('Email address').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}
async function night(
  host: Awaited<ReturnType<typeof account>>,
  title: string,
  plan: PlanItemInput[] = [],
) {
  const { data, error } = await host.client.rpc('start_night_out_recoverable', {
    p_creation_key: randomUUID(),
    p_title: title,
    p_ends_at: new Date(Date.now() + 3_600_000).toISOString(),
    p_timezone: 'UTC',
    p_host_plan: plan,
    p_guests: [],
  });
  if (error) throw error;
  return (data as unknown as { snapshot: NightSnapshot }).snapshot;
}
async function invite(host: Awaited<ReturnType<typeof account>>, nightId: string) {
  const token = randomBytes(32).toString('base64url');
  const { error } = await host.client.rpc('create_night_invite', {
    p_night_id: nightId,
    p_token_hash: createHash('sha256').update(token).digest('hex'),
    p_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
  });
  if (error) throw error;
  return token;
}
async function snapshot(user: Awaited<ReturnType<typeof account>>, nightId: string) {
  const { data, error } = await user.client.rpc('get_night_snapshot', { p_night_id: nightId });
  if (error) throw error;
  return data as unknown as NightSnapshot;
}

async function reopen(page: Page, destination: string) {
  const next = await page.context().newPage();
  await page.close();
  await next.goto(destination);
  return next;
}

for (const imported of [false, true]) {
  test(`every over-plan drink asks again ${imported ? 'after linking Quick Log' : 'in a planned night'}`, async ({
    page,
    context,
  }, info) => {
    test.skip(!process.env['E2E_SUPABASE_PUBLISHABLE_KEY'], 'Local backend required.');
    const user = await account('Plan confirmations');
    const target = await night(user, 'Confirm each drink', [
      {
        label: 'Beer',
        category: 'beer',
        volumeMl: 330,
        abvPercent: 5,
        plannedQuantity: 1,
        isQuickLog: true,
      },
      {
        label: 'Wine',
        category: 'wine',
        volumeMl: 150,
        abvPercent: 12,
        plannedQuantity: 1,
        isQuickLog: false,
      },
    ]);
    await page.goto('/login');
    await signIn(page, user);
    await expect(page.getByRole('button', { name: 'Start Tonight', exact: true })).toBeVisible();
    if (imported) {
      await page.goto('/quick-log?scope=account');
      await page
        .getByRole('button', { name: 'Log one drink', exact: true })
        .click({ clickCount: 2, delay: 35 });
      await page.getByRole('button', { name: 'Add to a night', exact: true }).click();
      await page.getByRole('button', { name: 'Confirm each drink', exact: true }).click();
      await page.getByRole('button', { name: 'Add my logs', exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/night/${target.night.id}`));
    } else {
      await page.goto(`/night/${target.night.id}`);
      for (const total of [1, 2]) {
        await page.getByRole('button', { name: 'Log Beer', exact: true }).click();
        await expect(page.getByTestId('drink-count')).toHaveText(String(total));
      }
    }
    const main = page.getByRole('group', { name: 'Main drink', exact: true });
    await expect(main.getByText('Beer', { exact: true })).toBeVisible();
    await expect(main).toContainText('330 ml');
    await expect(main).toContainText('5%');
    const confirmation = page.getByRole('dialog', { name: 'Confirm this log' });
    const total = (drinks: number, chasers = 0) =>
      page.getByText(`${drinks} drinks · ${chasers} ${chasers === 1 ? 'chaser' : 'chasers'}`, {
        exact: true,
      });
    await page.getByRole('button', { name: 'Log Beer', exact: true }).click();
    await expect(confirmation).toContainText('beyond the plan');
    await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(total(2)).toBeVisible();
    await page.getByRole('button', { name: 'Log Beer', exact: true }).click();
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole('button', { name: 'Log anyway', exact: true }).click();
    await expect(total(3)).toBeVisible();
    if (imported) {
      await page.getByRole('link', { name: 'Back to Quick Log', exact: true }).click();
      await expect(page).toHaveURL(/\/quick-log\?/);
      await expect(page.getByRole('heading', { name: 'Quick Log', exact: true })).toBeVisible();
      await expect(main.getByText('Beer', { exact: true })).toBeVisible();
    }
    await page.getByRole('button', { name: 'Log Beer', exact: true }).click();
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole('button', { name: 'Log anyway', exact: true }).click();
    await expect(total(4)).toBeVisible();
    await page.getByRole('button', { name: 'Choose another drink', exact: true }).click();
    const chooser = page.getByRole('dialog', { name: 'Log for Plan confirmations' });
    await chooser.getByRole('button', { name: /Wine.*150/ }).click();
    await chooser.getByRole('button', { name: 'Log Wine', exact: true }).click();
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(total(4)).toBeVisible();
    await main.click();
    await page.screenshot({
      path: `.tmp/ui-review/main-drink-${imported ? 'linked' : 'planned'}-${info.project.name}.png`,
      fullPage: true,
    });
    await context.setOffline(true);
    try {
      for (const drinks of [5, 6]) {
        await page.getByRole('button', { name: 'Log Beer', exact: true }).click();
        await expect(confirmation).toBeVisible();
        await confirmation.getByRole('button', { name: 'Log anyway', exact: true }).click();
        await expect(total(drinks)).toBeVisible();
      }
      await page.getByRole('button', { name: 'Chaser', exact: true }).click();
      await expect(confirmation).not.toBeVisible();
      await expect(total(6, 1)).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
    await expect
      .poll(
        async () =>
          (await snapshot(user, target.night.id)).members[0]?.drinkLogs.filter(
            (entry) => !entry.deletedAt,
          ).length,
      )
      .toBe(imported ? 4 : 6);
    await page.reload();
    await expect(main.getByText('Beer', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Log Beer', exact: true }).click();
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(total(6, 1)).toBeVisible();
  });
}

test('linked Quick Log uses the night plan, queues offline, and leaves clean back history', async ({
  page,
  context,
}) => {
  test.skip(!process.env['E2E_SUPABASE_PUBLISHABLE_KEY'], 'Local backend required.');
  const user = await account('Linked logger');
  const target = await night(user, 'Linked night', [
    {
      label: 'Beer',
      category: 'beer',
      volumeMl: 330,
      abvPercent: 5,
      plannedQuantity: 4,
      isQuickLog: true,
    },
    {
      label: 'Wine',
      category: 'wine',
      volumeMl: 150,
      abvPercent: 12,
      plannedQuantity: 2,
      isQuickLog: false,
    },
  ]);
  await page.goto('/login');
  await signIn(page, user);
  await expect(page).toHaveURL(/\/home/);
  // The URL can change before the sign-in redirect finishes rendering Home.
  await expect(page.getByRole('button', { name: 'Start Tonight', exact: true })).toBeVisible();
  await page.goto('/quick-log?scope=account');
  await page.getByRole('button', { name: 'Log one drink', exact: true }).click();
  await page.getByRole('button', { name: 'Add to a night', exact: true }).click();
  await page.getByRole('button', { name: 'Linked night', exact: true }).click();
  await page.getByRole('button', { name: 'Add my logs', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/night/${target.night.id}`));
  await expect(page.getByRole('button', { name: 'Log Beer', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back to Quick Log', exact: true }).click();
  await expect(page).toHaveURL(/\/quick-log\?/);
  await page.getByRole('button', { name: 'Log Beer', exact: true }).click();
  await page.getByRole('button', { name: 'Chaser', exact: true }).click();
  await expect
    .poll(async () => {
      const member = (await snapshot(user, target.night.id)).members[0];
      return [member?.quickLogs?.length, member?.drinkLogs.length, member?.waterLogs.length];
    })
    .toEqual([1, 1, 1]);
  // A committed database write can precede the UI's final snapshot refresh.
  await expect(page.getByText('2 drinks · 1 chaser', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Log Beer', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Choose another drink', exact: true }).click();
  const choices = page.getByRole('dialog', { name: 'Log for Linked logger' });
  await choices.getByRole('button', { name: /Wine.*150/ }).click();
  await choices.getByRole('button', { name: 'Log Wine', exact: true }).click();
  await expect(page.getByText('3 drinks · 1 chaser', { exact: true })).toBeVisible();
  await page
    .locator('[data-tour="drink-options"]')
    .getByRole('button', { name: 'Undo', exact: true })
    .click();
  await expect(page.getByText('2 drinks · 1 chaser', { exact: true })).toBeVisible();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Log Beer', exact: true }).click();
  await expect(page.getByText('3 drinks · 1 chaser', { exact: true })).toBeVisible();
  await context.setOffline(false);
  await expect
    .poll(
      async () =>
        (await snapshot(user, target.night.id)).members[0]?.drinkLogs.filter(
          (entry) => !entry.deletedAt,
        ).length,
    )
    .toBe(2);
  await page.getByRole('button', { name: 'Finish session', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'End the night too?' })).toBeVisible();
  await page.getByRole('button', { name: 'Finish Quick Log only', exact: true }).click();
  expect((await snapshot(user, target.night.id)).night.status).toBe('active');
  await expect(page.getByRole('button', { name: 'Log Beer', exact: true })).toBeDisabled();
  await page.getByRole('link', { name: 'Quick Log history', exact: true }).click();
  await expect(page.getByText('Added to a night', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: '1 drink · 0 chasers', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('View current totals in the night.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('link', { name: 'Open night', exact: true })).toHaveAttribute(
    'href',
    `/night/${target.night.id}`,
  );
  await page.screenshot({
    path: `.tmp/quick-history-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.getByRole('link', { name: 'Open night', exact: true }).click();
  await expect(page.getByTestId('drink-count')).toHaveText('3');
});

test('signed-in Quick Log stays available and saves its handoff before night setup', async ({
  page,
}, testInfo) => {
  test.skip(!process.env['E2E_SUPABASE_PUBLISHABLE_KEY'], 'Local backend required.');
  const user = await account('Quick review');
  await page.goto('/login');
  await signIn(page, user);
  await expect(page).toHaveURL(/\/home/);
  await page.getByRole('button', { name: 'Start Tonight', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('link', { name: /^Quick Log/ })
    .click();
  const drink = page.getByRole('button', { name: 'Log one drink' });
  await expect(drink).toBeEnabled();
  await expect(page.getByRole('checkbox', { name: /18 or older/ })).not.toBeVisible();
  await drink.click();
  await page.getByRole('button', { name: 'Log one non-alcoholic chaser' }).click();
  await expect(page.getByText('1 drink · 1 chaser', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await expect(page.locator('.theme-toggle')).toHaveCSS('position', 'relative');
  if (testInfo.project.name === 'mobile')
    await page.screenshot({
      path: '.tmp/quick-log-review-mobile.png',
      fullPage: true,
      style: 'nextjs-portal { visibility: hidden; }',
    });
  await page.getByRole('button', { name: 'Add to a night', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Create a night', exact: true })).toBeEnabled();
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Restored unchanged; delegated calls preserve their Storage receiver.
    const original = Storage.prototype.setItem;
    Object.defineProperty(window, 'restoreQuickStorage', {
      value: () => {
        Storage.prototype.setItem = original;
      },
    });
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('dwd.quick-log.')) throw new DOMException('Quota', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  await page.getByRole('button', { name: 'Create a night', exact: true }).click();
  await expect(page).toHaveURL(/\/quick-log\/add/);
  await expect(
    page.getByRole('alert').filter({ hasText: 'Retry saving before continuing' }),
  ).toBeVisible();
  await page.evaluate(() =>
    (window as unknown as { restoreQuickStorage: () => void }).restoreQuickStorage(),
  );
  await page.getByRole('button', { name: 'Retry saving' }).click();
  await page.getByRole('button', { name: 'Create a night', exact: true }).click();
  await expect(page).toHaveURL(/\/night\/new/);
});

test('create-and-transfer survives lost responses with one night and one imported batch', async ({
  page,
}) => {
  test.skip(!process.env['E2E_SUPABASE_PUBLISHABLE_KEY'], 'Local backend required.');
  test.setTimeout(120_000);
  const user = await account('Create Quick user');
  await page.goto('/quick-log');
  await page.getByRole('checkbox', { name: /18 or older/ }).click();
  await page.getByRole('button', { name: 'Log one drink' }).click();
  await page.getByRole('button', { name: 'Add to a night', exact: true }).click();
  await page.getByRole('link', { name: 'Sign in to add logs' }).click();
  await signIn(page, user);
  await page.getByRole('button', { name: 'Create a night', exact: true }).click();
  await page.getByLabel('Night name').fill('Quick creation recovery');
  await page.getByRole('button', { name: 'Just me', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Chaser only', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  let creationLost = false;
  await page.route('**/night/new', async (route) => {
    if (
      !creationLost &&
      route.request().method() === 'POST' &&
      route.request().headers()['next-action']
    ) {
      creationLost = true;
      await route.fetch();
      await route.abort('failed');
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Start night', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: /Couldn’t start/ })).toBeVisible();
  await page.getByRole('button', { name: 'Start night', exact: true }).click();
  await expect(page).toHaveURL(/quick-log\/add.*nightId=/);
  const url = new URL(page.url());
  const nightId = url.searchParams.get('nightId');
  if (!nightId) throw new Error('Missing recovered destination');
  let importLost = false;
  await page.route('**/rest/v1/rpc/import_quick_log', async (route) => {
    if (!importLost) {
      importLost = true;
      await route.fetch();
      await route.abort('failed');
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Add my logs' }).click();
  await expect(page.getByRole('alert').filter({ hasText: /Couldn’t confirm/ })).toBeVisible();
  // Return to the logger while the import receipt is unresolved. Account refresh
  // may already know the Night destination; result recovery must remain reachable.
  await page.goto('/quick-log?scope=account');
  await page.getByRole('button', { name: 'Check adding logs to a night' }).click();
  await page.getByRole('button', { name: 'Check saved logs' }).click();
  await expect(page).toHaveURL(new RegExp(`/night/${nightId}`));
  const { data, error } = await user.client.rpc('get_active_nights');
  if (error) throw error;
  expect(
    (data as unknown as { title: string }[]).filter((n) => n.title === 'Quick creation recovery'),
  ).toHaveLength(1);
  expect(
    (await snapshot(user, nightId)).members.find((m) => m.userId === user.id)?.quickLogs,
  ).toHaveLength(1);
});

test('guest sign-in cancellation, invited membership, Not now and later explicit import preserve the source', async ({
  page,
}) => {
  test.skip(!process.env['E2E_SUPABASE_PUBLISHABLE_KEY'], 'Local backend required.');
  const host = await account('Quick host'),
    user = await account('Quick invitee');
  const target = await night(host, 'Invite Quick destination'),
    token = await invite(host, target.night.id);
  await page.goto('/login');
  await page.getByRole('link', { name: 'Quick Log', exact: true }).click();
  await page.getByRole('checkbox', { name: /18 or older/ }).click();
  await page.getByRole('button', { name: 'Log one drink' }).click({ clickCount: 3, delay: 30 });
  await page
    .getByRole('button', { name: 'Log one non-alcoholic chaser' })
    .click({ clickCount: 2, delay: 30 });
  await page.getByRole('button', { name: 'Add to a night', exact: true }).click();
  await page.getByRole('link', { name: 'Sign in to add logs' }).click();
  await page.goBack();
  await page.goto('/quick-log?scope=guest');
  await expect(page.getByText('3 drinks · 2 chasers', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add to a night', exact: true }).click();
  await page.getByRole('link', { name: 'Sign in to add logs' }).click();
  await signIn(page, user);
  await expect(page).toHaveURL(/quick-log\/add/);
  await page.getByRole('button', { name: 'Join with an invite link' }).click();
  await page.getByLabel('Invitation link or code').fill(`http://localhost:3100/join/${token}`);
  await page.getByRole('button', { name: 'Join night', exact: true }).click();
  await page.getByRole('button', { name: 'Join this night' }).click();
  await expect(
    page.getByRole('heading', {
      name: 'Add your 3 drinks · 2 chasers to Invite Quick destination?',
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Not now', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/night/${target.night.id}`));
  await expect(
    page.getByRole('heading', { name: 'Invite Quick destination', exact: true }),
  ).toBeVisible();
  expect(
    (await snapshot(user, target.night.id)).members.find((m) => m.userId === user.id)?.quickLogs,
  ).toHaveLength(0);
  page = await reopen(page, '/quick-log?scope=guest');
  await page.getByRole('button', { name: 'Add to a night', exact: true }).click();
  await page.getByRole('button', { name: 'Invite Quick destination', exact: true }).click();
  await page.getByRole('button', { name: 'Add my logs' }).click();
  await expect(page).toHaveURL(new RegExp(`/night/${target.night.id}`));
  const added = (await snapshot(user, target.night.id)).members.find((m) => m.userId === user.id);
  expect(added?.quickLogs).toHaveLength(5);
  expect(added?.drinkLogs).toHaveLength(0);
  expect(
    added?.quickLogs?.every(
      (e) =>
        Object.is(e.volumeMl, null) && Object.is(e.abvPercent, null) && e.actorUserId === user.id,
    ),
  ).toBe(true);
  await expect(
    page.getByText('Earlier drinks have no size saved, so the alcohol total is partial.', {
      exact: true,
    }),
  ).toBeVisible();
  await page.goto('/quick-log?scope=guest');
  // Imported sessions resume with the linked night controls. Start a separate
  // session before exercising another explicit import into the same membership.
  await expect(page.getByRole('link', { name: 'Invite Quick destination Linked' })).toBeVisible();
  await page.getByRole('button', { name: 'Finish session', exact: true }).click();
  await page.getByRole('button', { name: 'Finish Quick Log only', exact: true }).click();
  await page.getByRole('button', { name: 'Start another session', exact: true }).click();
  await page.getByRole('button', { name: 'Log one non-alcoholic chaser' }).click();
  await page.goto(`/join/${token}`);
  await page.getByRole('button', { name: 'Join this night' }).click();
  await expect(
    page.getByRole('heading', {
      name: 'Add your 0 drinks · 1 chaser to Invite Quick destination?',
    }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Add logs', exact: true }).click();
  await page.getByRole('button', { name: 'Add my logs' }).click();
  await expect(page).toHaveURL(new RegExp(`/night/${target.night.id}`));
  expect(
    (await snapshot(user, target.night.id)).members.filter((m) => m.userId === user.id),
  ).toHaveLength(1);
  expect(
    (await snapshot(user, target.night.id)).members.find((m) => m.userId === user.id)?.quickLogs,
  ).toHaveLength(6);
});

test('opening a normal invitation with device logs offers import after sign-in and invalid links keep logs', async ({
  page,
}) => {
  test.skip(!process.env['E2E_SUPABASE_PUBLISHABLE_KEY'], 'Local backend required.');
  const host = await account('Other quick host'),
    user = await account('Link quick invitee');
  const target = await night(host, 'Normal invite destination'),
    token = await invite(host, target.night.id);
  await page.goto('/quick-log');
  await page.getByRole('checkbox', { name: /18 or older/ }).click();
  await page.getByRole('button', { name: 'Log one drink' }).click();
  await page.goto(`/join/${token}`);
  await page.getByRole('link', { name: 'Sign in to join', exact: true }).click();
  await signIn(page, user);
  await expect(page).toHaveURL(new RegExp(`/join/${token}`));
  await page.getByRole('button', { name: 'Join this night' }).click();
  await expect(
    page.getByRole('heading', {
      name: 'Add your 1 drink · 0 chasers to Normal invite destination?',
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Not now', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/night/${target.night.id}`));
  const { error } = await host.client.rpc('revoke_night_invite', { p_night_id: target.night.id });
  if (error) throw error;
  const reopened = await page.context().newPage();
  await page.close();
  await reopened.goto(`/join/${token}`);
  await expect(reopened.getByRole('heading', { name: 'This link cannot be used.' })).toBeVisible();
  await reopened.getByRole('link', { name: 'Back to Quick Log' }).click();
  await expect(reopened.getByText('1 drink · 0 chasers', { exact: true })).toBeVisible();
  const expired = randomBytes(32).toString('base64url');
  await reopened.goto(`/join/${expired}`);
  await expect(reopened.getByRole('heading', { name: 'This link cannot be used.' })).toBeVisible();
  await reopened.goto('/quick-log?scope=guest');
  await expect(reopened.getByText('1 drink · 0 chasers', { exact: true })).toBeVisible();
});
