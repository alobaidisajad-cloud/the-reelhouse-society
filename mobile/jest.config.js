module.exports = {
  preset: 'jest-expo',
  setupFiles: ['./jest.setup.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|react-native-mmkv|react-native-reanimated)',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}', '**/*.test.{ts,tsx}'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@testing-library/react-native$': '<rootDir>/test-utils/react-native-testing-library.js',
  },
  // Override globals to enable dynamic import support
  globals: {
    __DEV__: true,
  },
  // ── Coverage Enforcement ──────────────────────────────────────────
  // Prevents silent test coverage regression. Thresholds set just below
  // current baseline — the coverage-ratchet script auto-raises them.
  coverageThreshold: {
    global: {
      branches: 13,
      functions: 15,
      lines: 18,
      statements: 18,
    },
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
    '!src/types/**',
    '!src/**/__tests__/**',
    '!src/providers/AccessibilityProvider.ts',
  ],
};
