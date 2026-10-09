// @ts-check
import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { moduleBoundaries } from './scripts/module-boundaries.mjs';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'src/generated/**', 'Docs/**', 'reports/**', '.stryker-tmp/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  prettier,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.vitest },
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.mjs', 'vitest.config.mts', 'vitest.config.e2e.mts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'inline-type-imports', disallowTypeAnnotations: false },
      ],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@aws-sdk/*', 'aws-sdk'],
              message: 'No AWS (ADR-011): use StorageAdapter/EmailAdapter.',
            },
          ],
        },
      ],
    },
  },
  {
    // Loose coupling (docs/revamp/06-modular-build.md §3): modules meet only through their index.ts;
    // common/ and infra/ never depend on a module (the pure M01 permission matrix is the one listed exception).
    files: ['src/**/*.ts'],
    plugins: { resilisense: { rules: { 'module-boundaries': moduleBoundaries } } },
    rules: {
      'resilisense/module-boundaries': [
        'error',
        {
          root: 'src/modules',
          layers: [
            {
              from: 'src/common',
              forbid: ['src/modules'],
              except: ['src/modules/identity/engine/permissions'],
            },
            { from: 'src/infra', forbid: ['src/modules'] },
            { from: 'src/config', forbid: ['src/modules'] },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      // supertest bodies are `any`; assertions validate them.
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
    },
  },
  {
    // Plain JS tooling (identical copy of scripts/spec-coverage*.mjs in Resilisense-FE): no types to check.
    files: ['scripts/*.mjs', 'stryker.config.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
);
