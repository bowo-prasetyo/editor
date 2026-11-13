import js from '@eslint/js'
import vue from 'eslint-plugin-vue'
import globals from 'globals'

// Rules that catch bugs, not style: the JavaScript recommended set and Vue's
// "essential" set. Formatting is left alone.
export default [
  { ignores: ['dist/', 'node_modules/', 'test-results/', 'playwright-report/'] },
  js.configs.recommended,
  ...vue.configs['flat/essential'],
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      // `catch (e) {}` and unused `_`-prefixed arguments are deliberate here.
      'no-unused-vars': ['error', { args: 'after-used', argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['test/**', 'e2e/**', 'build/**', '*.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // The service worker template runs in a worker, with build-time placeholders.
    files: ['build/sw-template.js'],
    languageOptions: { globals: { ...globals.serviceworker, __VERSION__: 'readonly', __FILES__: 'readonly' } },
  },
]
