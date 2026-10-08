import { defineConfig, devices } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

if (existsSync('.tmp/e2e.env')) {
  const values = parseEnv(readFileSync('.tmp/e2e.env', 'utf8').replace(/^\uFEFF/, ''));
  for (const [key, value] of Object.entries(values)) process.env[key] ??= value;
}
if (process.env['E2E_SUPABASE_PUBLISHABLE_KEY'] && !process.env['E2E_SUPABASE_URL'])
  throw new Error('Set E2E_SUPABASE_URL explicitly when supplying local test credentials.');
const backend = process.env['E2E_SUPABASE_URL'] ?? 'http://127.0.0.1:55321';
if (!['127.0.0.1', 'localhost'].includes(new URL(backend).hostname))
  throw new Error('Browser tests must use a local Supabase backend.');
if (
  process.env['CI'] &&
  (!process.env['E2E_SUPABASE_URL'] ||
    !process.env['E2E_SUPABASE_PUBLISHABLE_KEY'] ||
    !process.env['E2E_SUPABASE_SECRET_KEY'])
)
  throw new Error(
    'CI requires local Supabase test credentials; browser tests must not silently skip.',
  );

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: '.tmp/browser-results',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  workers: 1,
  reporter: process.env['CI']
    ? [['github'], ['html', { outputFolder: '.tmp/playwright-report', open: 'never' }]]
    : 'list',
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
    { name: 'mobile', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
    { name: 'webkit-mobile', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
  ],
  webServer: {
    command:
      process.env['E2E_PRODUCTION'] === '1'
        ? 'npx next start apps/web --port 3100'
        : 'npm run dev --workspace @dwd/web -- --port 3100',
    url: 'http://localhost:3100/login',
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      DWD_E2E: '1',
      DWD_EMAIL_CONFIRMATION_CODE_ENABLED: process.env['E2E_CONFIRMATION_CODES'] ?? 'true',
      NEXT_PUBLIC_SUPABASE_URL: backend,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        process.env['E2E_SUPABASE_PUBLISHABLE_KEY'] ?? 'local-browser-test-key',
      NEXT_PUBLIC_SITE_URL: 'http://localhost:3100',
      NEXT_PUBLIC_DWD_ADS_URL: process.env['E2E_ADS_URL'] ?? '',
      NEXT_PUBLIC_DWD_AD_IMAGE_ORIGINS: process.env['E2E_AD_IMAGE_ORIGINS'] ?? '',
      // Test key only. Browser tests mock the push provider; no push is dispatched.
      NEXT_PUBLIC_DWD_VAPID_PUBLIC_KEY:
        process.env['E2E_PUSH_PUBLIC_KEY'] ??
        'BOefCFwssKksM8yDRngubxMSqO9TcXT08q922sewBwiv0ZTVb6AgUAI2sXV1yE0pf-xloGGgMUqItn4UtYMBlvM',
    },
  },
});
