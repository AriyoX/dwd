import { expect, test } from '@playwright/test';

test('appearance follows system changes, persists overrides and can return to System', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/login');
  await expect(page.getByLabel('Change appearance', { exact: true }).locator('svg')).toHaveClass(
    /lucide-moon/,
  );
  await page.getByLabel('Change appearance', { exact: true }).click();
  const system = page.getByRole('button', { name: 'System appearance', exact: true });
  const light = page.getByRole('button', { name: 'Light appearance', exact: true });
  const dark = page.getByRole('button', { name: 'Dark appearance', exact: true });
  await expect(system).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByLabel('Change appearance', { exact: true }).locator('svg')).toHaveClass(
    /lucide-sun/,
  );
  await light.click();
  await expect(light.locator('svg')).toHaveClass(/lucide-sun/);
  await expect(light).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await page.getByLabel('Change appearance', { exact: true }).click();
  await expect(light).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await dark.click();
  await expect(dark.locator('svg')).toHaveClass(/lucide-moon/);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await system.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#160B12');
});
