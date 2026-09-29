import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('configured backend content security policy', () => {
  it.each(['https://dwd-test.supabase.co', 'http://127.0.0.1:55321'])(
    'allows photos, API calls and realtime only on the configured backend: %s',
    async (origin) => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', origin);
      const { default: config } = await import('../apps/web/next.config');
      const rules = await config.headers?.();
      const policy = rules
        ?.flatMap((rule) => rule.headers)
        .find((header) => header.key === 'Content-Security-Policy')?.value;
      expect(policy).toBeDefined();
      const directives = policy?.split('; ').map((part) => part.split(' '));
      expect(directives?.find(([name]) => name === 'img-src')).toEqual([
        'img-src',
        "'self'",
        'data:',
        'blob:',
        origin,
      ]);
      expect(directives?.find(([name]) => name === 'connect-src')).toEqual([
        'connect-src',
        "'self'",
        origin,
        origin.replace(/^http/, 'ws'),
      ]);
      expect(policy).not.toContain('*.supabase.co');
      expect(policy).not.toContain("'unsafe-eval'");
      expect(policy).toContain("frame-ancestors 'none'");
    },
  );
});
