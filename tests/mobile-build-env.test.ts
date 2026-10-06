import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

function check(url = '', key = '') {
  return spawnSync(process.execPath, ['scripts/check-mobile-build-env.mjs'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      EXPO_PUBLIC_SUPABASE_URL: url,
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
    },
  });
}
describe('standalone account configuration', () => {
  it('fails the build when cloud variables are absent', () => {
    const result = check();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('testing uses preview');
  });
  it('accepts a hosted backend and public key', () => {
    expect(check('https://example.supabase.co', 'sb_publishable_test').status).toBe(0);
  });
  it('rejects placeholders, insecure URLs, and private keys without logging their values', () => {
    for (const [url, key] of [
      ['https://YOUR_DWD_PROJECT_REF.supabase.co', 'sb_publishable_REPLACE_ME'],
      ['http://localhost:54321', 'sb_publishable_test'],
      ['https://example.supabase.co', 'sb_secret_private'],
      [
        'https://example.supabase.co',
        `eyJ.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature`,
      ],
    ]) {
      const result = check(url, key);
      expect(result.status).toBe(1);
      expect(result.stderr).not.toContain(key);
    }
  });
});
