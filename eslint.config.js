import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'tmp/**',
      'scripts/**',
      '*.config.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // `no-undef` is redundant for TypeScript (the compiler catches unknown
      // identifiers) and misfires on Node globals and type-only names.
      'no-undef': 'off',
      // The regex/string escapes are intentional in the tool-call parsing
      // code; the TS-aware parser already rejects real mistakes.
      'no-useless-escape': 'off',
      // ANSI escape / control-char regexes are intentional (terminal input,
      // spinner rendering) and the TS parser validates them.
      'no-control-regex': 'off',
      // `throw new Error(...)` is fine here; we do not require `cause`.
      'preserve-caught-error': 'off',

      // Catch dead / unreachable / useless code — the classes of bugs this
      // project keeps hitting (a `throw` before a branch, unused vars left
      // after a refactor, conditions that never change).
      'no-unreachable': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-useless-assignment': 'error',
      'prefer-const': 'error',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      'no-empty': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['test/**/*.ts'],
    rules: {
      // Tests commonly keep helpers around for readability.
      '@typescript-eslint/no-unused-vars': 'off',
      'no-useless-assignment': 'off',
    },
  },
  prettier,
)
