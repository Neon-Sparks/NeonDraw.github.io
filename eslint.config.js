// ESLint config for Neon Draw (classic browser scripts sharing the global ND namespace).
// Run:  npx eslint js
const globals = require('globals');

module.exports = [
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.browser, ND: 'writable' },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-redeclare': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      'no-fallthrough': 'warn',
      'no-self-assign': 'error',
      'no-constant-condition': ['warn', { checkLoops: false }],
      eqeqeq: ['warn', 'smart'],
    },
  },
];
