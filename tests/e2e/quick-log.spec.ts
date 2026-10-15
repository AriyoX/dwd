import { expect, test } from '@playwright/test';

test('session options dismiss accessibly and guest Back returns to logging', async ({ page }) => {
  await page.route('**/auth/v1/**', (route) => route.abort());
  await page.goto('/quick-log');
  await page.getByText('Recent activity', { exact: true }).click();
  await expect(page.getByText('No entries yet.', { exact: true })).toBeVisible();
  const options = page.getByLabel('Session options', { exact: true });
  await options.click();
  await page.keyboard.press('Escape');
  await expect(options).toBeFocused();
  await expect(page.getByRole('button', { name: 'Log a shot' })).not.toBeVisible();
  await options.click();
  await page.getByRole('heading', { name: 'Quick Log', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Log a shot' })).not.toBeVisible();
  // Eligibility disappears after acceptance; click and verify the logging state.
  await page.getByRole('checkbox', { name: /18 or older/ }).click();
  await expect(page.getByRole('button', { name: 'Log one drink' })).toBeEnabled();
  await options.click();
  await page.getByRole('button', { name: 'Log a shot' }).click();
  await expect(page.getByRole('button', { name: 'Log a shot' })).not.toBeVisible();
  await expect(page.getByText('1 drink · 0 chasers', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Just log it.' })).toBeVisible();
  await expect(page.getByText('1 drink · 0 chasers', { exact: true })).toBeVisible();
});

test('public logging restores rapid taps, corrections and history with the backend unavailable', async ({
  page,
}) => {
  await page.route('**/auth/v1/**', (route) => route.abort());
  await page.route('**/rest/v1/**', (route) => route.abort());
  await page.goto('/quick-log');
  await expect(page.getByRole('heading', { name: 'Quick Log', exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: /18 or older/ }).click();
  const drink = page.getByRole('button', { name: 'Log one drink' });
  const chaser = page.getByRole('button', { name: 'Log one non-alcoholic chaser' });
  await drink.click({ clickCount: 3, delay: 30 });
  await chaser.click({ clickCount: 2, delay: 30 });
  await expect(page.getByText('3 drinks · 2 chasers', { exact: true })).toBeVisible();
  await page.screenshot({ path: `.tmp/quick-log-${test.info().project.name}.png`, fullPage: true });
  await expect(page.getByText('Saved on this device', { exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: 'Undo last action' }).click();
  await expect(page.getByText('3 drinks · 1 chaser', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('3 drinks · 1 chaser', { exact: true })).toBeVisible();
  await page.getByText('Recent activity', { exact: true }).click();
  await page.getByRole('button', { name: 'Change to Chaser' }).first().click();
  await expect(page.getByText('2 drinks · 2 chasers', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Remove', exact: true }).first().click();
  await expect(page.getByText('2 drinks · 1 chaser', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Finish session', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Log one drink' })).toBeDisabled();
  await page.getByRole('button', { name: 'Start another session', exact: true }).click();
  await drink.click();
  await expect(page.getByText('1 drink · 0 chasers', { exact: true })).toBeVisible();
  await page.getByLabel('Session options', { exact: true }).click();
  await page.getByRole('link', { name: 'Past quick sessions', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '2 drinks · 1 chaser', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: '1 drink · 0 chasers', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Open session', exact: true }).last().click();
  await page.getByRole('button', { name: 'Start another session', exact: true }).click();
  await page.getByRole('button', { name: 'Log one non-alcoholic chaser' }).click();
  await page.reload();
  await expect(page.getByText('0 drinks · 1 chaser', { exact: true })).toBeVisible();
});

test('a second browser tab cannot overwrite the current logger', async ({ page, context }) => {
  await page.goto('/quick-log');
  await page.getByRole('checkbox', { name: /18 or older/ }).click();
  await page.getByRole('button', { name: 'Log one drink' }).click();
  const other = await context.newPage();
  await other.goto('/quick-log');
  await expect(other.getByText(/Quick Log is open in another tab/)).toBeVisible();
  await expect(other.getByRole('button', { name: 'Log one non-alcoholic chaser' })).toBeDisabled();
  await page.getByRole('button', { name: 'Log one non-alcoholic chaser' }).click();
  await page.close();
  await expect(other.getByRole('button', { name: 'Log one non-alcoholic chaser' })).toBeEnabled();
  await other.getByRole('button', { name: 'Undo last action' }).click();
  await expect(other.getByText('1 drink · 0 chasers', { exact: true })).toBeVisible();
  await other.getByRole('button', { name: 'Log one non-alcoholic chaser' }).click();
  await expect(other.getByText('1 drink · 1 chaser', { exact: true })).toBeVisible();
});

test('failed browser writes preserve memory, report the failure and can be retried', async ({
  page,
}) => {
  await page.goto('/quick-log');
  await page.getByRole('checkbox', { name: /18 or older/ }).click();
  await page.evaluate(() => {
    // Keep the native method's receiver when restoring it after quota failure.
    const original = Storage.prototype.setItem.bind(localStorage);
    Object.defineProperty(window, 'quickOriginalSet', { value: original, configurable: true });
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('dwd.quick-log.')) throw new DOMException('Quota', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  await page.getByRole('button', { name: 'Log one non-alcoholic chaser' }).click();
  await expect(page.getByText('0 drinks · 1 chaser', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Couldn’t save on this device' }),
  ).toBeVisible();
  await expect(page.getByText('Saved on this device', { exact: true })).not.toBeVisible();
  await page.evaluate(() => {
    Storage.prototype.setItem = (
      window as unknown as { quickOriginalSet: typeof Storage.prototype.setItem }
    ).quickOriginalSet;
  });
  await page.getByRole('button', { name: 'Retry saving' }).click();
  await expect(page.getByRole('button', { name: 'Retry saving' })).not.toBeVisible();
  await page.reload();
  await expect(page.getByText('0 drinks · 1 chaser', { exact: true })).toBeVisible();
});
