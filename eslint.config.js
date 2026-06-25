/**
 * ESLint flat config — first pass.
 *
 * Intentionally narrow: catches outright bugs (no-unused-vars / no-undef /
 * no-fallthrough / no-empty-catch / no-prototype-builtins) without arguing
 * about formatting or imposing a style migration on 42K lines of existing
 * code. Once these are clean we can layer on stricter rules incrementally.
 *
 * Run:
 *   npm run lint        — report issues
 *   npm run lint:fix    — apply auto-fixes (safe subset)
 */
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.es2024,
      },
    },
    rules: {
      // Warnings (don't fail CI; surface for review)
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-prototype-builtins': 'warn',

      // Real bugs — keep as errors
      'no-undef': 'error',
      'no-fallthrough': 'error',
      'no-self-assign': 'error',
      'no-irregular-whitespace': 'error',
      'no-case-declarations': 'warn',
      'no-useless-escape': 'warn',
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-async-promise-executor': 'warn',
      'no-misleading-character-class': 'warn',
      'no-control-regex': 'warn',
      'no-useless-catch': 'warn',
      'no-cond-assign': ['error', 'except-parens'],
      'no-inner-declarations': 'warn',

      // Test-friendly relaxations
      'no-redeclare': 'off',  // many files re-require the same module conditionally
    },
  },
  {
    // Tests get a permissive setup — vitest globals already in env, plus
    // we don't want to nag about unused vars in expect chains. Tests use
    // ES-module `import` for the vitest API itself even though src/ is CJS.
    files: ['test/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.vitest,
      },
    },
    rules: {
      'no-unused-vars': 'off',
    },
  },
  {
    // Tools that ship browser-context code (Playwright page.evaluate)
    // need `document` / `window` globals — they don't run in Node.
    files: ['src/tools/browser*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },
  {
    // Skip generated / non-owned trees.
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      'web/static/**', // future bundled UI
      '*.bak',
      'nc-restore/**',
    ],
  },
];
