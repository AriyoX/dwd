import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./apps/mobile/src', import.meta.url)),
      react: fileURLToPath(new URL('./node_modules/react', import.meta.url)),
    },
  },
  test: { environment: 'node', include: ['apps/mobile/**/*.test.tsx'] },
});
