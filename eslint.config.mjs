import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist', '**/node_modules', 'demo', 'server/data'] },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true }],
      // allow async handlers like onClick={async () => ...}; returned promises are deliberately ignored there
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
      // `_`-prefixed params are intentionally unused (e.g. Express's 4-argument error handler)
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['client/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['server/**/*.ts', '*.mjs', 'client/vite.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    // the demo script runs Node code plus page.evaluate() callbacks that execute in the browser
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    // Tests read arbitrary JSON responses, and node:test's describe/test return promises the runner awaits.
    files: ['server/test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
    },
  },
  prettier,
);
