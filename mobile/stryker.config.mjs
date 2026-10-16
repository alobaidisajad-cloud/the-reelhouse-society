/**
 * Stryker on one of the logic files the register lists (register/stryker.yaml, WORKLIST P0.70),
 * named by STRYKER_FILE: that file mutated, and its own tests alone run against each mutant, so a
 * mutant counts only when its own suite kills it (P0.71). scripts/stryker-files.cjs runs it file by
 * file and judges each report against the floor. Every run is fresh: Stryker's incremental mode
 * kept 18 of 18 old verdicts after a new test that kills two of them, because a mutant in the
 * file's top-level code is tied to no one test, and it would keep a "killed" a changed test no
 * longer earns just as quietly.
 */
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

const { files } = parse(readFileSync(new URL('./register/stryker.yaml', import.meta.url), 'utf8'));
const entry = files.find((f) => f.file === process.env.STRYKER_FILE);
if (!entry) throw new Error(`STRYKER_FILE names none of register/stryker.yaml's files (has ${process.env.STRYKER_FILE})`);
const slug = entry.file.replace(/[/.]/g, '_');

export default {
  testRunner: 'jest',
  jest: {
    projectType: 'custom',
    configFile: 'jest.stryker.config.js',
    config: { testMatch: entry.tests.map((t) => `<rootDir>/${t}`) },
    enableFindRelatedTests: false,
  },
  coverageAnalysis: 'perTest',
  mutate: [entry.file],
  // The sandbox takes only what the app's tests read: never the worktrees, the drawings or the audit.
  ignorePatterns: ['/*', '!/src', '!/app', '!/__tests__', '!/test-utils', '!/supabase', '!/types', '!/assets', '!/register',
    '!/jest.config.js', '!/jest.stryker.config.js', '!/jest.setup.ts', '!/jest.afterEnv.ts', '!/tsconfig.json',
    '!/package.json', '!/app.json', '!/eas.json', '!/expo-env.d.ts', '!/patches'],
  incremental: false,
  // A progress line every ten seconds, to the console scripts/stryker-files.cjs hands each run.
  reporters: ['json', 'clear-text', 'progress-append-only'],
  jsonReporter: { fileName: `reports/stryker/${slug}.json` },
  // Judged by file against the register's floor, by scripts/stryker-files.cjs.
  thresholds: { high: 95, low: 90, break: null },
  concurrency: 3,
  timeoutMS: 20000,
  dryRunTimeoutMinutes: 20,
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
};
