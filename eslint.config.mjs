import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: [
      '**/.next/**',
      '**/.next-e2e/**',
      '**/dist/**',
      '**/coverage/**',
      'supabase/.temp/**',
      '.tmp/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...nextVitals,
  ...nextTypeScript,
  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
  {
    // Supabase CLI emits empty Enum/CompositeTypes maps as `never` unions.
    files: ['packages/core/src/types/database.ts'],
    rules: {
      '@typescript-eslint/no-redundant-type-constituents': 'off',
    },
  },
);
