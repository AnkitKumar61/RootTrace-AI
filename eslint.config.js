import js from '@eslint/js';
import globals from 'globals';
export default [
  { ignores: ['**/dist/**', '**/node_modules/**', '**/.venv/**'] },
  js.configs.recommended,
  { files: ['server/**/*.js', 'scripts/**/*.mjs'], languageOptions: { globals: globals.node }, rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } },
  { files: ['client/**/*.js', 'client/**/*.jsx'], languageOptions: { globals: globals.browser, parserOptions: { ecmaFeatures: { jsx: true } } }, rules: { 'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z]', argsIgnorePattern: '^_|^[A-Z]' }] } }
];
