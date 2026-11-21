import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'pages-dist/', '.wrangler/', 'test/e2e/screenshots/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['src/web/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['src/worker/**/*.ts', 'src/core/**/*.ts'],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
  {
    files: ['scripts/**/*.mjs', 'test/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['public/sw.js'],
    languageOptions: { globals: globals.serviceworker },
  },
);
