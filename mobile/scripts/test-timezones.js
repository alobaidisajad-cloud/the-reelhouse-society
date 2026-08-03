#!/usr/bin/env node
/**
 * test-timezones.js — run the suite from six places on Earth.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * A green suite in one timezone is not evidence about dates. Batch 13's bug —
 * `watched_date` is a `date` column, so "2026-07-25" parses as midnight UTC and
 * rendered as JUL 24 for every member west of UTC — was invisible to CI, invisible
 * in review, and invisible to anyone testing from Baghdad, Tokyo or London. It sat
 * in the product because nobody ever ran the tests from the Americas.
 *
 * ── WHY IT SETS TZ HERE AND NOT INSIDE A TEST ────────────────────────────────
 * Verified, not assumed: mutating `process.env.TZ` INSIDE a jest-expo test does
 * nothing — Los Angeles and Tokyo both returned "Jul 25, 2026". The obvious harness
 * passes while proving nothing. TZ has to be set before the process starts, which is
 * what this does.
 *
 * Usage:  npm run test:tz            (whole suite, every zone)
 *         npm run test:tz -- <path>  (one file, every zone)
 */
const { spawnSync } = require('child_process');

// Deliberately spans both extremes: Midway is UTC-11, Kiritimati UTC+14 — 25 hours
// apart, so any date logic that is wrong anywhere is wrong in one of these.
const ZONES = [
  'Pacific/Midway',        // UTC-11
  'America/Los_Angeles',   // UTC-8/-7, DST
  'America/New_York',      // UTC-5/-4, DST
  'UTC',
  'Asia/Tokyo',            // UTC+9, no DST
  'Pacific/Kiritimati',    // UTC+14
];

const passthrough = process.argv.slice(2);
const failures = [];

// Resolve Jest's own entry point and run it with THIS node binary.
//
// Not `npx jest`: on Windows that means spawning npx.cmd, which Node refuses with
// EINVAL unless `shell: true` — and turning the shell on brings quoting rules that
// differ between cmd and sh, so a path with a space would break on one platform and
// not the other. Calling the JS entry directly has neither problem.
const jestBin = require.resolve('jest/bin/jest');

for (const tz of ZONES) {
  process.stdout.write(`\n──────── TZ=${tz} ────────\n`);
  const res = spawnSync(
    process.execPath,
    [jestBin, '--silent', ...passthrough],
    { stdio: 'inherit', env: { ...process.env, TZ: tz } },
  );
  if (res.status !== 0) failures.push(tz);
}

if (failures.length > 0) {
  console.error(`\n✗ Suite failed in: ${failures.join(', ')}`);
  console.error('  A date that is only correct in some timezones is not correct.');
  process.exit(1);
}
console.log(`\n✓ Suite passed in all ${ZONES.length} timezones.`);
