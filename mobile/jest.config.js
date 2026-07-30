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
  // Per-DIRECTORY floors so a regression in one layer can't be masked by gains
  // in another. Directory keys (no glob chars) aggregate across every file
  // under that path — a glob pattern like './src/lib/**/*.ts' would instead
  // apply the threshold to each matched file individually, which fails on
  // any untouched 0%-coverage file in the directory. Floors sit ~1-2pts
  // under current measured coverage (Batch B, 2026-06-22) — enforced by the
  // CI Jest job (Batch A). Ratchet these up as more hooks/stores/lib logic
  // gets extracted and tested.
  coverageThreshold: {
    global: {
      branches: 12,
      functions: 14,
      lines: 17,
      statements: 16,
    },
    './src/hooks/': {
      branches: 13,
      functions: 10,
      lines: 7,
      statements: 7,
    },
    './src/stores/': {
      branches: 23,
      functions: 29,
      lines: 34,
      statements: 32,
    },
    './src/lib/': {
      branches: 31,
      functions: 29,
      lines: 39,
      statements: 37,
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
  // Jest's defaults are ['clover','json','lcov','text'] — none of which emit
  // coverage/coverage-summary.json, the file scripts/coverage-ratchet.js reads.
  // Without 'json-summary' the ratchet step in CI could never work: on a fresh
  // checkout coverage/ is gitignored, so the file is simply absent and the
  // script exits 1 on its own "No coverage report found" guard. Listed
  // additively (defaults + json-summary) so nothing that already works is lost.
  coverageReporters: ['clover', 'json', 'lcov', 'text', 'json-summary'],
};
