#!/usr/bin/env node
/**
 * wake.mjs — a scheduled run GitHub skipped is started by this computer, and every night it carries
 * is written down.
 *
 *   node mobile/scripts/wake.mjs [--dry-run]          the computer's task (Windows Task Scheduler)
 *   node mobile/scripts/wake.mjs --verify <workflow> <slot>
 *                                                     a run that says the wake task started it, checked
 *
 * GitHub starts a schedule late when Actions is busy, and when it is busy enough it drops the run.
 * So for each schedule register/alert-rules.json names (heartbeatsAreKept.test.ts holds it to the
 * workflows), the task finds its latest time that is at least GRACE_MINUTES old and at most
 * LOOKBACK_HOURS old. If no run of that workflow was started by that schedule since then, and the
 * wake task has not already started one for it, the task starts one by workflow_dispatch with the
 * input wake_night set to that time. The workflow names such a run "Carried by the wake task: <time>"
 * (its run-name), so its heartbeat and the night's flake history count it as that night's run, and
 * its heartbeat job asks this script's --verify first: a time that is not one of the workflow's own,
 * is in the future, or is older than LOOKBACK_HOURS is refused.
 *
 * The token can start workflows of this repository and nothing more GitHub offers to narrow (a
 * fine-grained token with Actions read and write on this repository alone). It is read from the
 * private settings file outside the repo and outside OneDrive (scripts/private-settings.cjs), as
 * GITHUB_WAKE_TOKEN, and never printed. Every start, and every night that needed none, is appended
 * to wake-log.jsonl in the same folder. A workflow GitHub has turned off (after 60 days without
 * activity, or by hand) is reported as a fault: the task exits 1 and its own heartbeat says error.
 * The heartbeat is the monitor `wake-task` (register/alert-rules.json, machine_heartbeats), at the
 * address WAKE_HEARTBEAT_URL in the same private file; without one, the task says so and goes on.
 */
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RULES_FILE = join(HERE, '..', 'register', 'alert-rules.json');

/** The words a carried run's name begins with: the workflows' run-name and the night's history read them. */
export const WAKE_TITLE = 'Carried by the wake task';
/** How long after its time a schedule's run is waited for before the task starts it. */
export const GRACE_MINUTES = 120;
/** How far back a missed time is still carried: a run started days late is no night's run. */
export const LOOKBACK_HOURS = 26;
const MINUTE = 60_000;

/**
 * A schedule as GitHub reads it, of the one shape the house writes: a minute, an hour, and either
 * every day or one day of the week ("17 3 * * *", "47 7 * * 1"). Any other shape throws, so a new
 * schedule is never carried at a time the task guessed.
 */
export function parseCron(cron) {
  const m = /^(\d{1,2}) (\d{1,2}) \* \* (\*|[0-6])$/.exec(String(cron).trim());
  if (!m) throw new Error(`the wake task reads "M H * * *" or "M H * * D" schedules only, not "${cron}"`);
  const [minute, hour] = [Number(m[1]), Number(m[2])];
  if (minute > 59 || hour > 23) throw new Error(`no such time in "${cron}"`);
  return { minute, hour, day: m[3] === '*' ? null : Number(m[3]) };
}

/** Every time the schedule fires from `from` to `to` (milliseconds, UTC), oldest first. */
export function slotsBetween(cron, from, to) {
  const { minute, hour, day } = parseCron(cron);
  const out = [];
  const start = new Date(from);
  for (let d = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()); d <= to; d += 24 * 60 * MINUTE) {
    const at = d + (hour * 60 + minute) * MINUTE;
    if (at >= from && at <= to && (day === null || new Date(at).getUTCDay() === day)) out.push(at);
  }
  return out;
}

/** The latest time the schedule fired that is old enough to carry and not too old, or null. */
export function dueSlot(cron, now, grace = GRACE_MINUTES, lookback = LOOKBACK_HOURS) {
  const slots = slotsBetween(cron, now - lookback * 60 * MINUTE, now - grace * MINUTE);
  return slots.length ? slots[slots.length - 1] : null;
}

/** A time as the input and the run's name carry it: 2026-11-21T03:17Z. */
export const slotName = (at) => `${new Date(at).toISOString().slice(0, 16)}Z`;

/** A slot's name read back to its time, or null when it is not exactly one. */
export function parseSlot(text) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/.test(String(text))) return null;
  const at = Date.parse(`${String(text).slice(0, 16)}:00Z`);
  return Number.isNaN(at) || slotName(at) !== text ? null : at;
}

/** The name a run carried for this time has. */
export const wakeTitle = (at) => `${WAKE_TITLE}: ${slotName(at)}`;

/**
 * Whether a run (GitHub's workflow run, as its API gives it) is this time's run: started by the
 * schedule at or after it (GitHub stamps a late run when it starts it, never before its time), or
 * started by the wake task for it.
 */
export const carries = (run, at) =>
  (run.event === 'schedule' && Date.parse(run.created_at) >= at - MINUTE) || run.display_title === wakeTitle(at);

/** Why a carried run's time is refused for this workflow, or null when it is one of its own and fair. */
export function verify(rules, workflow, text, now) {
  const rule = rules.heartbeats.find((h) => h.workflow === workflow);
  if (!rule) return `no schedule of ${workflow} in register/alert-rules.json`;
  const at = parseSlot(text);
  if (at === null) return `"${text}" is not a time as the wake task writes one (2026-11-21T03:17Z)`;
  if (at > now) return `${text} has not come yet`;
  if (at < now - LOOKBACK_HOURS * 60 * MINUTE) return `${text} is older than ${LOOKBACK_HOURS} hours: no night's run`;
  if (!slotsBetween(rule.cron, at, at).length) return `${text} is not a time of ${workflow}'s schedule (${rule.cron})`;
  return null;
}

/**
 * One pass of the task over every schedule: for each, its due time and what was done. `api` reads
 * runs, starts one, and reads a workflow's state; `dryRun` starts nothing.
 */
export async function wake({ rules, now, api, dryRun = false }) {
  const results = [];
  for (const { workflow, cron } of rules.heartbeats) {
    const state = await api.state(workflow);
    const at = dueSlot(cron, now);
    if (at === null) { results.push({ workflow, slot: null, action: 'none due', state }); continue; }
    const runs = await api.runs(workflow, at - MINUTE);
    if (runs.some((r) => carries(r, at))) { results.push({ workflow, slot: slotName(at), action: 'ran', state }); continue; }
    if (state !== 'active') { results.push({ workflow, slot: slotName(at), action: 'not started: the workflow is turned off', state }); continue; }
    if (dryRun) { results.push({ workflow, slot: slotName(at), action: 'would start', state }); continue; }
    await api.dispatch(workflow, { wake_night: slotName(at) });
    results.push({ workflow, slot: slotName(at), action: 'started', state });
  }
  return results;
}

/** The faults in a pass: a workflow GitHub turned off is one, whatever its night. */
export const faultsOf = (results) => results.filter((r) => r.state !== 'active').map((r) => `${r.workflow} is ${r.state}: its schedule no longer runs`);

/** GitHub's REST API for one repository: the runs, a start, a workflow's state. */
export function githubApi({ repo, token, fetchImpl = fetch }) {
  const call = async (method, path, body) => {
    const r = await fetchImpl(`https://api.github.com/repos/${repo}${path}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'wake-task',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    // a status, never the request: its headers hold the token
    if (!r.ok) throw new Error(`GitHub answered ${r.status} to ${method} ${path.split('?')[0]}`);
    return r.status === 204 ? null : r.json();
  };
  return {
    // GitHub's date filter reads whole seconds.
    runs: async (workflow, from) => (await call('GET', `/actions/workflows/${workflow}/runs?per_page=100&created=${encodeURIComponent(`>=${new Date(from).toISOString().slice(0, 19)}Z`)}`)).workflow_runs ?? [],
    dispatch: (workflow, inputs) => call('POST', `/actions/workflows/${workflow}/dispatches`, { ref: 'main', inputs }),
    state: async (workflow) => (await call('GET', `/actions/workflows/${workflow}`)).state,
  };
}

/** The repository as origin names it: owner/name. */
export function repoOf(remote) {
  const m = /github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?\s*$/.exec(String(remote));
  if (!m) throw new Error('origin is not a GitHub repository');
  return m[1];
}

async function main(argv) {
  const rules = JSON.parse(readFileSync(RULES_FILE, 'utf8'));
  if (argv[0] === '--verify') {
    const why = verify(rules, argv[1], argv[2], Date.now());
    if (why) { console.log(`::error title=Not a night the wake task carried::${why}`); process.exit(1); }
    console.log(`${argv[1]}: the run the wake task started for ${argv[2]}, one of its schedule's own times`);
    return;
  }
  if (argv.some((a) => a !== '--dry-run')) { console.error('usage: node mobile/scripts/wake.mjs [--dry-run] | --verify <workflow> <slot>'); process.exit(2); }
  const dryRun = argv.includes('--dry-run');
  const require = createRequire(import.meta.url);
  const { privateDir, readPrivate } = require('./private-settings.cjs');
  const token = readPrivate('GITHUB_WAKE_TOKEN');
  if (!token && !dryRun) { console.error(`No GITHUB_WAKE_TOKEN in ${join(privateDir(), 'production.env')}: nothing can be started.`); process.exit(1); }
  const repo = repoOf(execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: HERE, encoding: 'utf8' }));
  const now = Date.now();
  let results = [];
  let faults = [];
  try {
    results = await wake({ rules, now, api: githubApi({ repo, token }), dryRun });
    faults = faultsOf(results);
  } catch (e) {
    faults = [e.message];
  }
  mkdirSync(privateDir(), { recursive: true });
  for (const r of results) {
    appendFileSync(join(privateDir(), 'wake-log.jsonl'), `${JSON.stringify({ at: new Date(now).toISOString(), ...r, dryRun })}\n`);
    console.log(`${r.workflow}: ${r.slot ?? 'no time due'} — ${r.action}`);
  }
  for (const f of faults) console.log(`✗ ${f}`);
  const { checkinUrl } = await import('./heartbeat.mjs');
  const url = checkinUrl(readPrivate('WAKE_HEARTBEAT_URL'), 'wake-task', faults.length ? 'error' : 'ok');
  if (!url) console.log('No WAKE_HEARTBEAT_URL in the private settings: the wake task ran, and no monitor outside this computer knows.');
  else if (!dryRun) console.log(`heartbeat wake-task: ${(await fetch(url, { signal: AbortSignal.timeout(15_000) })).status}`);
  process.exit(faults.length ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).catch((e) => { console.error(`the wake task failed: ${e.message}`); process.exit(1); });
}
