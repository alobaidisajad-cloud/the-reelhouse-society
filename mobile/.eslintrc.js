module.exports = {
  extends: 'expo',
  plugins: ['unused-imports', 'tsdoc', '@typescript-eslint'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.eslint.json',
  },
  rules: {
    // ── Existing rules (preserved) ──
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    'unused-imports/no-unused-imports': 'error',
    'unused-imports/no-unused-vars': [
      'error',
      { vars: 'all', varsIgnorePattern: '^_', args: 'after-used', argsIgnorePattern: '^_' }
    ],
    'tsdoc/syntax': 'warn',

    // ── Type Safety (new) ──
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/await-thenable': 'error',

    // ── Complexity Guard (new) ──
    complexity: ['warn', 15],

    // ── Safety (new) ──
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },

  overrides: [
    // Test files: relax type safety (mocking requires any)
    {
      files: ['**/__tests__/**', '**/*.test.{ts,tsx}', 'jest.setup.ts', 'test-utils/**'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-floating-promises': 'off',
        complexity: 'off',
        'no-console': 'off',
      },
    },
    // Store slices: slightly higher complexity allowed
    {
      files: ['src/stores/**/*.ts'],
      rules: {
        complexity: ['warn', 20],
      },
    },
  ],
};
