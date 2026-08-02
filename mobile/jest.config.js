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
  // Re-based 2026-08-02. The previous floors sat 4-11 POINTS under measured
  // coverage (global statements 16 against an actual 26.8), so coverage could have
  // fallen by a third without CI noticing. They were also measured over src/ alone,
  // because app/ was missing from collectCoverageFrom entirely.
  //
  // These are 1 point under what is measured today, which is the convention this
  // file already stated but had drifted from. Raise them as coverage rises; the
  // ratchet in scripts/coverage-ratchet.js is what catches the small slides in
  // between.
  //
  // ⚠️ app/ is at ~10% — every screen in the product. That number is low because it
  // is TRUE, not because the floor is lenient. It is the honest starting point for
  // real screen tests, not a target to feel comfortable about.
  coverageThreshold: {
    global: {
      branches: 18,
      functions: 18,
      lines: 23,
      statements: 22,
    },
    './src/hooks/': {
      branches: 18,
      functions: 17,
      lines: 17,
      statements: 16,
    },
    './src/stores/': {
      branches: 29,
      functions: 34,
      lines: 41,
      statements: 39,
    },
    './src/lib/': {
      branches: 34,
      functions: 37,
      lines: 41,
      statements: 40,
    },
    './app/': {
      branches: 7,
      functions: 7,
      lines: 9,
      statements: 9,
    },
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    // app/ is every screen in the product — 36 files, ~15k lines — and it was
    // absent from this list, so no floor, ratchet or gate had ever looked at a
    // single one. The old "26.8% coverage" was 26.8% of src/ alone. Including it
    // makes the number smaller and true, which is the only kind worth gating on.
    'app/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/index.ts',
    '!src/types/**',
    '!**/__tests__/**',
    '!src/providers/AccessibilityProvider.ts',
    // Expo Router treats these as framework wiring, not product code.
    '!app/**/_layout.tsx',
    '!app/+*.tsx',
  ],
  // Jest's defaults are ['clover','json','lcov','text'] — none of which emit
  // coverage/coverage-summary.json, the file scripts/coverage-ratchet.js reads.
  // Without 'json-summary' the ratchet step in CI could never work: on a fresh
  // checkout coverage/ is gitignored, so the file is simply absent and the
  // script exits 1 on its own "No coverage report found" guard. Listed
  // additively (defaults + json-summary) so nothing that already works is lost.
  coverageReporters: ['clover', 'json', 'lcov', 'text', 'json-summary'],
};
