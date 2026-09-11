module.exports = {
  preset: 'jest-expo',
  setupFiles: ['./jest.setup.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|react-native-mmkv|react-native-reanimated)',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/'],
  /**
   * ── WHY THIS IS HERE ────────────────────────────────────────────────────
   * "A worker process has failed to exit gracefully" was chased for a long time
   * as a leaked handle. It is not one: `--detectOpenHandles` reports nothing, a
   * probe running inside every worker after all 242 suites found zero pending
   * timers and zero non-stdio handles, and the message is a red herring.
   *
   * The real thing, caught by capturing a full run rather than its tail:
   *
   *     FATAL ERROR: Zone Allocation failed - process out of memory
   *
   * A worker runs suite after suite and each one loads the whole React Native
   * module registry — 336 MB of heap for a median suite, 507 MB for the worst.
   * The heap is never fully reclaimed between them, so a long-lived worker
   * eventually cannot allocate and is killed. Usually that only prints the
   * warning; sometimes it takes the two suites that worker was holding with it
   * and they report as failures that have nothing to do with their own code.
   *
   * This restarts a worker once it is carrying more than a single heavy suite's
   * worth of heap, so nothing accumulates across the dozens of suites one worker
   * runs. 768MB was tried first and still let a worker die: the limit has to sit
   * near the median suite (336 MB), not above the worst one, because by the time
   * a worker is carrying half a gigabyte it is already too late.
   *
   * Measured over five full runs each: 768MB still died; 400MB and 300MB both
   * held — no out-of-memory, no worker taking suites down with it — and 300MB
   * cost 16% more wall clock for no further gain, so 400MB is the setting.
   */
  workerIdleMemoryLimit: '400MB',
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
  // ── RE-BASED 2026-09-11, AND THE FOUR MISSING DIRECTORIES ADDED ──────────
  //
  // These had drifted to 25 POINTS under measured — `./app/` sat at 9 while the
  // real figure was 34.4. A floor that far below actual is not a gate: every
  // Dispatch screen could have lost three quarters of its coverage and CI would
  // have passed. That is the same defect as the coverage ratchet's baseline
  // recording 24.9% against an actual 46.4%, found the same week.
  //
  // Worse, the four LARGEST bodies of code had no floor at all — including
  // `src/components/` (4,866 lines, the most in the app) which holds the
  // Dispatch's paper at 92.7%. They were covered only by `global`, and global
  // moves so slowly that one directory can collapse inside it unnoticed.
  //
  // ── WHY EXACTLY ONE POINT ───────────────────────────────────────────────
  // The convention this file already stated. It is now measured rather than
  // assumed: three full runs — two with default workers, one with CI's own
  // `--ci --maxWorkers=2` — drifted 0.00 points on every group and every
  // metric, despite five property-based suites (they seed deterministically).
  // One point is real margin, not a hope.
  //
  // ── ⚠️ `global` IS NOT "EVERYTHING" ─────────────────────────────────────
  // Jest SUBTRACTS every file matched by a path threshold from the global pool
  // and judges it under its own key instead. So the moment the directories
  // below were added, `global` stopped meaning the whole app and came to mean
  // THE LEFTOVERS — src/constants, src/lore, src/providers (2%), src/schemas,
  // src/theme. Its numbers fell from ~45% to ~26% without a line of code
  // changing. The first version of this block set global from the app-wide
  // figure and made CI permanently red.
  //
  // If you add a directory key, RE-DERIVE global: it is the coverage of files
  // no key matches, which is not a number any report prints directly.
  //
  // ── KEEPING THEM HONEST ─────────────────────────────────────────────────
  // Do not hand-edit these upward. `scripts/coverage-ratchet.js` now tracks the
  // same directories and raises its own baseline automatically, so it is the
  // thing that catches a slide between re-basings. These are the hard floor
  // underneath it; re-derive them with the same "1 under measured" rule.
  coverageThreshold: {
    global: { branches: 25, functions: 25, lines: 41, statements: 41 },
    // The Dispatch's own components, held where they actually are. This is the
    // best-covered area of the app and the floor should say so.
    './src/components/dispatch/': { branches: 84, functions: 91, lines: 93, statements: 91 },
    './src/components/': { branches: 42, functions: 42, lines: 46, statements: 45 },
    './src/utils/': { branches: 74, functions: 79, lines: 79, statements: 78 },
    './src/stores/': { branches: 45, functions: 54, lines: 57, statements: 54 },
    './src/services/': { branches: 31, functions: 49, lines: 47, statements: 44 },
    './src/features/': { branches: 29, functions: 40, lines: 33, statements: 32 },
    './src/hooks/': { branches: 21, functions: 24, lines: 24, statements: 24 },
    './src/lib/': { branches: 35, functions: 38, lines: 45, statements: 43 },
    './app/': { branches: 35, functions: 31, lines: 34, statements: 33 },
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
