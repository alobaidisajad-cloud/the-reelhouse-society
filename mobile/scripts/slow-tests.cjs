#!/usr/bin/env node
/**
 * slow-tests.cjs — a test that takes over half its time limit, found while it still passes.
 *
 *   node mobile/scripts/slow-tests.cjs --times <file> [--alone]
 *
 * <file> holds each test's time and its limit, one JSON line each ({ file, test, ms, limit }), as the
 * jest environment writes them where RH_TEST_TIMES names (test-utils/timerCheckingEnvironment.js). A test
 * over half its limit (`over`) passes on a quiet machine and runs out of its time on a loaded one: the
 * push gates of 2026-11-25 failed on two such (PAST), each passing alone. --alone runs the file of each
 * one found again, by itself (jest, in band, that file alone), and holds to the rule only the tests over
 * half their limit then: one slow only beside others is the machine's; one slow alone is its own, and is
 * fixed at its cause (what it loads or draws), never by a longer limit. Exits 1 naming each, else 0.
 */
const { spawnSync } = require('child_process');
const { existsSync, mkdtempSync, readFileSync, rmSync } = require('fs');
const { tmpdir } = require('os');
const { join, relative } = require('path');

const MOBILE = join(__dirname, '..');

/** The share of its limit a test may take. */
const SHARE = 0.5;

/**
 * The two that failed push gates on 2026-11-25, as they stood before their fixes: each its time and
 * its limit (the prefetch check 2.9 s on a quiet machine; the docket test ran out of its five seconds
 * alone too). Each is over half; the rule must find each (slowTests.test.ts).
 */
const PAST = [
  { file: 'src/utils/__tests__/imagePrefetchSites.guard.test.ts', test: 'a cold start › restores the films store without fetching a picture or a list ahead', ms: 2900, limit: 5000,
    fix: 'the films store loaded with the file, not inside the test: 10 ms' },
  { file: 'app/(admin)/__tests__/theDocketsReadAgainKeepTheirLaterPages.test.tsx', test: 'THE DOCKET: a verdict reads the docket again as far as the moderator had read, not its first page alone', ms: 5000, limit: 5000,
    fix: 'each case drawn again only when it changed, and the test draws two pages, not dozens' },
];

/** The times read: each line's test with a number for both its time and its limit, its file from mobile/. */
const readTimes = (text) => text.split(/\r?\n/).filter(Boolean).flatMap((l) => {
  try {
    const t = JSON.parse(l);
    return typeof t.ms === 'number' && typeof t.limit === 'number' && t.limit > 0
      ? [{ ...t, file: relative(MOBILE, t.file).split('\\').join('/').replace(/^(\.\.\/)+/, '') }] : [];
  } catch { return []; }
});

/**
 * The tests over their share of the limit, slowest share first; a test met twice keeps its slowest time.
 * A test that returns at once (waits false: no done callback, no promise) cannot run out of its limit,
 * whatever it takes, and is not held to it.
 */
const over = (times, share = SHARE) => {
  const slowest = new Map();
  for (const t of times.filter((x) => x.waits !== false)) {
    const key = `${t.file}\n${t.test}`;
    if (!slowest.has(key) || slowest.get(key).ms < t.ms) slowest.set(key, t);
  }
  return [...slowest.values()].filter((t) => t.ms > t.limit * share).sort((a, b) => b.ms / b.limit - a.ms / a.limit);
};

/** One file run again by itself, its tests' times read back. */
const alone = (file) => {
  const dir = mkdtempSync(join(tmpdir(), 'slow-tests-'));
  const into = join(dir, 'times.jsonl');
  try {
    spawnSync(process.execPath, [join(MOBILE, 'node_modules', 'jest', 'bin', 'jest.js'), '--runTestsByPath', file, '--runInBand', '--silent'],
      { cwd: MOBILE, encoding: 'utf8', maxBuffer: 1e9, env: { ...process.env, RH_TEST_TIMES: into } });
    return existsSync(into) ? readTimes(readFileSync(into, 'utf8')) : [];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const line = (t) => `${t.file} › ${t.test}: ${(t.ms / 1000).toFixed(1)} s of its ${(t.limit / 1000).toFixed(0)} s`;

if (require.main === module) {
  const argv = process.argv.slice(2);
  const at = argv.indexOf('--times');
  const known = argv.every((a, i) => a === '--alone' || a === '--times' || i === at + 1);
  if (at < 0 || !argv[at + 1] || !known) { console.error('usage: slow-tests.cjs --times <file> [--alone]'); process.exit(2); }
  const times = readTimes(readFileSync(argv[at + 1], 'utf8'));
  if (!times.length) { console.error(`${argv[at + 1]} holds no test's time: the run never wrote them (RH_TEST_TIMES)`); process.exit(1); }
  let found = over(times);
  console.log(`${times.length} tests read; ${found.length} over half their limit in the run`);
  if (argv.includes('--alone') && found.length) {
    const files = [...new Set(found.map((t) => t.file))];
    const again = files.flatMap((f) => alone(f));
    const still = over(again);
    found = found.filter((t) => still.some((s) => s.file === t.file && s.test === t.test)).map((t) => still.find((s) => s.file === t.file && s.test === t.test));
    console.log(`run again alone (${files.length} files): ${found.length} still over half their limit`);
  }
  for (const t of found) console.log(`  ✗ ${line(t)}`);
  if (found.length) console.log('Fix each at its cause (what it loads, draws or waits on), never by a longer limit.');
  process.exit(found.length ? 1 : 0);
}

module.exports = { PAST, SHARE, line, over, readTimes };
