import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist', 'node_modules', 'prisma/migrations']),
  {
    files: ['**/*.ts'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
    ],
    languageOptions: {
      globals: globals.node,
      ecmaVersion: 2022,
    },
    rules: {
      // Allow _ prefix for intentionally unused variables (Express next, _req)
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      // Allow explicit any in limited cases (test fakes use 'as unknown as X')
      '@typescript-eslint/no-explicit-any': 'warn',
      // Require explicit return types on functions is too noisy for this codebase
      '@typescript-eslint/explicit-function-return-type': 'off',
      // Allow empty catch blocks only with a comment
      'no-empty': ['error', { allowEmptyCatch: false }],
    },
  },
  {
    // Relax rules for test files
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
]);
