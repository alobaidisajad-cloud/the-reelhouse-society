#!/usr/bin/env node
/**
 * heartbeat.mjs — a scheduled workflow says it ran, to a monitor outside GitHub (WORKLIST P0.38).
 *
 *   node mobile/scripts/heartbeat.mjs <monitor>
 *
 * GitHub stops a repository's schedules after 60 days without activity, its own included, and a
 * schedule that stopped sends no failure: the nightly checks would simply never run again. So each
 * scheduled workflow checks in with a Sentry cron monitor (Sentry is already a vendor), which emails
 * the owner when a check-in is late by the margin in register/alert-rules.json.
 *
 * The address is the GitHub secret HEARTBEAT_CHECKIN_URL, never written in a file: Sentry's cron
 * check-in address with the monitor's slug written as {monitor}. Without it the step says so as a
 * warning and passes, so the checks keep running until the owner sets it (the end list).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RULES = JSON.parse(readFileSync(join(HERE, '..', 'register', 'alert-rules.json'), 'utf8'));

/** The check-in address for a monitor, from the secret's template; null without one. */
export function checkinUrl(template, monitor) {
  if (!template) return null;
  if (!template.includes('{monitor}')) throw new Error('HEARTBEAT_CHECKIN_URL must carry {monitor} where the monitor\'s slug goes');
  const url = new URL(template.replace('{monitor}', encodeURIComponent(monitor)));
  url.searchParams.set('status', 'ok');
  return url.toString();
}

async function main() {
  const monitor = process.argv[2];
  if (!RULES.heartbeats.some((h) => h.monitor === monitor)) {
    console.error(`No heartbeat named ${monitor} in register/alert-rules.json`);
    process.exit(2);
  }
  const url = checkinUrl(process.env.HEARTBEAT_CHECKIN_URL, monitor);
  if (!url) {
    console.log(`::warning title=No heartbeat address::HEARTBEAT_CHECKIN_URL is not set: ${monitor} ran, and no monitor outside GitHub knows.`);
    return;
  }
  const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
  // the address is a secret: its status, never itself
  console.log(`heartbeat ${monitor}: ${r.status}`);
  if (!r.ok) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(`heartbeat failed: ${e.name}`); process.exit(1); });
}
