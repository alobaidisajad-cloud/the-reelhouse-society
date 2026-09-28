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

// Jest's own entry on THIS node: `npx jest` needs a shell on Windows (and its quoting).
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
