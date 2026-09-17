import { test, expect } from '@playwright/test';

test('main drink, simple alternate logging, notices and offline plan checks', async ({
  page,
  context,
}, info) => {
  test.skip(!process.env['E2E_SUPABASE_PUBLISHABLE_KEY'], 'Local test backend required.');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/signup');
  await page.getByLabel('Display name', { exact: true }).fill('Drink UX');
  await page
    .getByLabel('Email address')
    .fill(`drink-ux-${info.project.name}-${Date.now()}@example.test`);
  await page.getByLabel('New password', { exact: true }).fill('local-test-password-123');
  await page.getByLabel('I am 18 or older.').check();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByRole('button', { name: 'Skip tour', exact: true }).click();
  await page.getByRole('link', { name: /Start a night/ }).click();
  await page.getByLabel('Night name').fill('Drink UX test');
  await page.getByLabel('Night time zone').fill('UTC');
  const end = new Date(Date.now() + 4 * 60 * 60_000).toISOString();
  await page.getByLabel('Planned end date').fill(end.slice(0, 10));
  await page.getByLabel('Planned end time').fill(end.slice(11, 16));
  await page.getByRole('button', { name: 'Just me', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Plan drinks', exact: true }).click();
  await page.getByRole('button', { name: 'Beer', exact: true }).click();
  await page.getByLabel('Quantity', { exact: true }).fill('2');
  await expect(page.getByRole('radio', { name: 'Main drink' })).toBeChecked();
  await page.getByRole('button', { name: 'Wine', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Start night', exact: true }).click();
  await expect(page.locator('.main-drink')).toContainText('Beer');
  await expect(page.getByTestId('plan-pacing')).toContainText('Plan spacing');
  await page.screenshot({
    path: `.tmp/ui-review/drink-ux-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Choose another drink' }).click();
  const chooser = page.getByRole('dialog', { name: 'Log for Drink UX' });
  await expect(chooser.getByLabel('Drink name')).toHaveCount(0);
  await expect(chooser.locator('.drink-choice')).toHaveCount(2);
  await expect(chooser.getByRole('button', { name: /Shot|Cocktail|Custom drink/ })).toHaveCount(0);
  await chooser.getByRole('button', { name: /Wine.*150/ }).click();
  await page.screenshot({
    path: `.tmp/ui-review/drink-picker-${info.project.name}.png`,
    fullPage: true,
  });
  await expect(chooser.getByRole('button', { name: 'Edit size or strength' })).toHaveCount(0);
  await chooser.getByRole('button', { name: 'Log Wine', exact: true }).click();
  await expect(page.getByTestId('drink-count')).toHaveText('1');
  await expect(page.locator('.main-drink')).toContainText('Beer');
  await page.getByRole('button', { name: 'Choose another drink' }).click();
  await expect(chooser.getByRole('button', { name: /Wine.*150/ })).toBeVisible();
  await expect(chooser.locator('.drink-choice')).toHaveCount(2);
  await chooser.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Log Beer', exact: true }).click();
  await expect(page.getByTestId('drink-count')).toHaveText('2');
  await expect(page.locator('.warning-box[role="status"]')).not.toHaveCount(0);
  await page.clock.install();
  await page.clock.fastForward(11_000);
  await expect(page.locator('.toast')).toHaveCount(0);
  await expect(page.locator('.warning-box[role="status"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Group', exact: true }).click();
  await expect(page.locator('.warning-box[role="status"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Tonight', exact: true }).click();
  await expect(page.locator('.warning-box[role="status"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByTestId('drink-count')).toHaveText('1');
  await context.setOffline(true);
  try {
    await page.getByRole('button', { name: 'Log Beer', exact: true }).click();
    await expect(page.getByTestId('drink-count')).toHaveText('2');
    await page.getByRole('button', { name: 'Log Beer', exact: true }).click();
    await expect(page.getByTestId('drink-count')).toHaveText('3');
    await page.getByRole('button', { name: 'Log Beer', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Confirm this log' })).toBeVisible();
    await expect(page.getByTestId('drink-count')).toHaveText('3');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  } finally {
    await context.setOffline(false);
  }
  await page.getByRole('button', { name: 'Choose another drink' }).click();
  await chooser.getByRole('button', { name: 'Edit plan', exact: true }).click();
  const plan = page.getByRole('dialog', { name: "Drink UX's plan" });
  await plan.getByRole('button', { name: 'Remove Wine', exact: true }).click();
  await plan.getByRole('button', { name: 'Save plan', exact: true }).click();
  await expect(plan).toBeHidden();
  await page.getByRole('button', { name: 'Choose another drink' }).click();
  await expect(chooser.locator('.drink-choice')).toHaveCount(1);
  // Previously logged drinks must not reappear after removal from the plan.
  await expect(chooser.getByRole('button', { name: /Wine/ })).toHaveCount(0);
  await expect(chooser.getByRole('button', { name: /Beer.*330/ })).toBeVisible();
  expect(errors).toEqual([]);
});
