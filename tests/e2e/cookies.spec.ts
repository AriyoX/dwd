import { expect, test } from '@playwright/test';

const optionalNames = ['dwd_preview_demo_v1', 'dwd_preview_layout_v1'];

test('optional cookies are absent until accepted and essential-only choice survives reload', async ({
  page,
  context,
}) => {
  await page.goto('/');
  const prompt = page.getByRole('region', { name: 'Cookie preferences' });
  await expect(prompt).toBeVisible();
  const preview = page.getByRole('region', { name: 'Interactive drink log preview' });
  await preview.getByRole('button', { name: 'Add a drink to the preview' }).click();
  expect((await context.cookies()).filter((cookie) => optionalNames.includes(cookie.name))).toEqual(
    [],
  );
  await prompt.getByRole('button', { name: 'Essential only', exact: true }).click();
  await expect(prompt).toHaveCount(0);
  await page.reload();
  await expect(prompt).toHaveCount(0);
  await expect(preview.locator('dd')).toHaveText(['02', '01']);
  expect(
    (await context.cookies()).find((cookie) => cookie.name === 'dwd_cookie_choice_v1')?.value,
  ).toBe('essential');
  expect((await context.cookies()).filter((cookie) => optionalNames.includes(cookie.name))).toEqual(
    [],
  );
});

test('opt-in remembers the demo and layout, and withdrawal removes only optional cookies', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Allow optional cookies', exact: true }).click();
  const preview = page.getByRole('region', { name: 'Interactive drink log preview' });
  await preview.getByRole('button', { name: 'Add a drink to the preview' }).click();
  const layout = (await context.cookies()).find(
    (cookie) => cookie.name === 'dwd_preview_layout_v1',
  )?.value;
  expect(['tilted', 'straight']).toContain(layout);
  await page.reload();
  await expect(preview.locator('dd')).toHaveText(['03', '01']);
  await expect(page.locator('[data-preview-layout]')).toHaveAttribute(
    'data-preview-layout',
    layout ?? '',
  );

  // Real logs must survive withdrawing consent to the illustrative homepage demo.
  await page.locator('main').getByRole('link', { name: 'Log now' }).click();
  await page.getByRole('checkbox', { name: /18 or older/ }).click();
  await expect(page.getByRole('button', { name: 'Log one drink' })).toBeEnabled();
  await page.getByRole('button', { name: 'Log one drink' }).click();
  await page.getByRole('link', { name: 'Back', exact: true }).click();
  const settings = page.getByRole('button', { name: 'Cookie settings', exact: true });
  await settings.click();
  const prompt = page.getByRole('region', { name: 'Cookie preferences' });
  await expect(prompt).toBeFocused();
  await prompt.getByRole('button', { name: 'Essential only', exact: true }).click();
  await expect(settings).toBeFocused();
  await expect(page.locator('[data-preview-layout]')).toHaveAttribute(
    'data-preview-layout',
    'tilted',
  );
  expect((await context.cookies()).filter((cookie) => optionalNames.includes(cookie.name))).toEqual(
    [],
  );
  await preview.getByRole('button', { name: 'Add a chaser to the preview' }).click();
  expect((await context.cookies()).filter((cookie) => optionalNames.includes(cookie.name))).toEqual(
    [],
  );
  await page.reload();
  await expect(preview.locator('dd')).toHaveText(['02', '01']);
  await page.locator('main').getByRole('link', { name: 'Log now' }).click();
  await expect(page.getByText('1 drink · 0 chasers', { exact: true })).toBeVisible();
});

test('unrecognized consent removes stale optional cookies and asks again', async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: 'dwd_cookie_choice_v1', value: 'outdated', url: 'http://localhost:3100' },
    { name: 'dwd_preview_layout_v1', value: 'straight', url: 'http://localhost:3100' },
    { name: 'dwd_preview_demo_v1', value: 'invalid-json', url: 'http://localhost:3100' },
  ]);
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Cookie preferences' })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Interactive drink log preview' }).locator('dd'),
  ).toHaveText(['02', '01']);
  expect((await context.cookies()).filter((cookie) => optionalNames.includes(cookie.name))).toEqual(
    [],
  );
});

test('homepage store buttons clearly indicate that the apps are not yet available', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Available soon on the App Store' }),
  ).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Available soon on Google Play' })).toBeDisabled();
  await page.getByRole('link', { name: 'Cookie details', exact: true }).click();
  await expect(page).toHaveURL(/\/privacy#browser-storage$/);
  await expect(page.getByRole('heading', { name: 'Website cookies', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Essential only', exact: true }).click();
  await page.getByRole('button', { name: 'Cookie settings', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Cookie preferences' })).toBeFocused();
});
