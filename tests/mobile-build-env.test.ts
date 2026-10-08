import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function check(url = '', key = '', environment: Record<string, string> = {}) {
  return spawnSync(process.execPath, ['scripts/check-mobile-build-env.mjs'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      EXPO_PUBLIC_SUPABASE_URL: url,
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
      EAS_BUILD_PLATFORM: '',
      GOOGLE_SERVICES_JSON: '',
      EXPO_PUBLIC_EAS_PROJECT_ID: '',
      ...environment,
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
  it('requires Firebase configuration for an Android build without exposing its contents', () => {
    const result = check('https://example.supabase.co', 'sb_publishable_test', {
      EAS_BUILD_PLATFORM: 'android',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('GOOGLE_SERVICES_JSON');
    expect(result.stderr).toContain('FCM v1');
  });
  it('requires a valid EAS project ID for installed builds', () => {
    const result = check('https://example.supabase.co', 'sb_publishable_test', {
      EAS_BUILD_PLATFORM: 'ios',
      EXPO_PUBLIC_EAS_PROJECT_ID: 'invalid',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('EAS project ID');
    expect(
      check('https://example.supabase.co', 'sb_publishable_test', { EAS_BUILD_PLATFORM: 'ios' })
        .status,
    ).toBe(0);
  });
  it('accepts a matching Android Firebase client and rejects a different package', () => {
    const directory = mkdtempSync(join(tmpdir(), 'dwd-firebase-'));
    const file = join(directory, 'google-services.json');
    if (
      dirname(resolve(directory)) !== resolve(tmpdir()) ||
      !basename(directory).startsWith('dwd-firebase-')
    )
      throw new Error('Unexpected fixture directory');
    try {
      for (const packageName of ['com.dwd.app', 'com.other.app']) {
        writeFileSync(
          file,
          JSON.stringify({
            project_info: { project_number: '123456' },
            client: [
              {
                client_info: { android_client_info: { package_name: packageName } },
                api_key: [{ current_key: 'sensitive-fixture' }],
              },
            ],
          }),
        );
        const result = check('https://example.supabase.co', 'sb_publishable_test', {
          EAS_BUILD_PLATFORM: 'android',
          GOOGLE_SERVICES_JSON: file,
        });
        expect(result.status).toBe(packageName === 'com.dwd.app' ? 0 : 1);
        expect(result.stderr + result.stdout).not.toContain('sensitive-fixture');
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
