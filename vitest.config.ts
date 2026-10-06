import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';

const webRequire = createRequire(new URL('./apps/web/package.json', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)),
      next: dirname(webRequire.resolve('next/package.json')),
    },
  },
  test: {
    environment: 'node',
    include: ['packages/**/*.test.ts', 'apps/web/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
    },
  },
});
