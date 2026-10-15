#!/usr/bin/env node
/**
 * test-timezones.js — run the suite from six places on Earth.
 *
 * A green suite in one timezone is not evidence about dates: a `date` column's
 * `2026-07-25` parses as midnight UTC and reads as the 24th anywhere west of it.
 * TZ is set before each process starts, because setting it INSIDE a jest-expo
 * test does nothing (verified: Los Angeles and Tokyo gave the same day).
 *
 * Usage:  npm run test:tz            (whole suite, every zone)
 *         npm run test:tz -- <path>  (one file, every zone)
 *
 * ZONES is the one list: CI (god_tier_ci.yml) reads it from here and runs each
 * part of the suite in every zone; ciWorkflows.guard holds the workflow to it.
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

/** The record one zone's CI run writes (`jest --json --outputFile`), named for its zone. */
const recordOf = (tz) => `jest-${tz.replace(/\//g, '-')}.json`;

/**
 * The tests of code that runs only on CI's machines and the owner's: the E2E
 * harness and the repo's scripts (paths under mobile/). CI's runners are UTC, so
 * these run in UTC alone, and the other zones leave them out (JEST_OUTSIDE_UTC=1,
 * read by jest.config.js). Every other test is the app's, whose code runs on
 * members' phones in any zone. Run in all six, the flow runner's rehearsal alone
 * took 35 minutes of one part (god_tier_ci run 38819483084).
 */
const ONLY_IN_UTC = ['e2e/', 'scripts/'];
/** Whether a run in this zone runs this test file (a path under mobile/, with /). */
const runsIn = (tz, file) => tz === 'UTC' || !ONLY_IN_UTC.some((p) => file.startsWith(p));
/** The zone whose record this is, or null for a record no zone writes. */
const zoneOfRecord = (record) => ZONES.find((tz) => recordOf(tz) === record) ?? null;

function main() {
  const passthrough = process.argv.slice(2);
  const failures = [];

  // Jest's own entry on THIS node: `npx jest` needs a shell on Windows (and its quoting).
  const jestBin = require.resolve('jest/bin/jest');

  for (const tz of ZONES) {
    process.stdout.write(`\n──────── TZ=${tz} ────────\n`);
    const res = spawnSync(
      process.execPath,
      [jestBin, '--silent', ...passthrough],
      { stdio: 'inherit', env: { ...process.env, TZ: tz, JEST_OUTSIDE_UTC: tz === 'UTC' ? '' : '1' } },
    );
    if (res.status !== 0) failures.push(tz);
  }

  if (failures.length > 0) {
    console.error(`\n✗ Suite failed in: ${failures.join(', ')}`);
    console.error('  A date that is only correct in some timezones is not correct.');
    process.exit(1);
  }
  console.log(`\n✓ Suite passed in all ${ZONES.length} timezones.`);
}

if (require.main === module) main();

module.exports = { ZONES, recordOf, ONLY_IN_UTC, runsIn, zoneOfRecord };
