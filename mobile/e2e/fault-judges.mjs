#!/usr/bin/env node
/**
 * fault-judges.mjs — the fault runs' judges (WORKLIST P0.76), over the device log of a run whose
 * flows break the network between the app and the house on purpose (.maestro/faults/*.yaml).
 *
 *   node e2e/fault-judges.mjs <device log> --flow-times <file>
 *
 * Each fault flow is listed in FAULT_FLOWS with what its fault does to the app's reads, and is
 * judged from the app's own lines in the log (src/hooks/useStateSaid.ts, useScreenReady):
 *   - `fails` (every read reaches nothing): no room is drawn empty (`state.empty`), since a failure
 *     must be said as one; and at least one failure is said (`state.failed` or `screen.failed`),
 *     or the fault was never set and the flow proves nothing;
 *   - `slow` (every read is slow): no failure is said (a slow answer is no failed one), and at
 *     least one screen is ready;
 *   - every flow: each wait begun (`screen.reading`) ends (`screen.ready` or `screen.failed`) within
 *     SPINNER_LIMIT_S seconds, and none is still waiting when its flow ends.
 * A crash in any flow is app-crashes.mjs's to judge, over the same log.
 *
 * Exit 0 when every flow holds; 1 naming each fault; 2 when the log or the flow times cannot be read,
 * or a listed flow never ran.
 */
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { flowAt, readFlowTimes, stamp } from './app-crashes.mjs';

/** Each fault flow, by name, and what its fault does to every read. */
export const FAULT_FLOWS = {
  house_unreachable: 'fails',
  slow_link: 'slow',
};

/**
 * Longest a screen may wait. Until P4.6 sets each kind of request's deadline, the plan's bound:
 * nothing spins more than about 20 s with no way out.
 */
export const SPINNER_LIMIT_S = 20;

const LINE = /\[e2e\] (state\.empty|state\.failed|screen\.reading|screen\.ready|screen\.failed) (\{[^}\n]*\})/;

/** Every state and wait line in the log: its event, what or which screen, its time, and its flow (attempts as one). */
export function readLines(log, times) {
  const out = [];
  for (const line of log.split(/\r?\n/)) {
    const m = LINE.exec(line);
    if (!m) continue;
    let detail;
    try { detail = JSON.parse(m[2] ?? ''); } catch { continue; }
    const at = stamp(line);
    if (Number.isNaN(at)) continue;
    out.push({ event: m[1], what: String(detail.what ?? detail.name ?? ''), at, flow: flowAt(times, at).replace(/ \(attempt \d+\)$/, '') });
  }
  return out;
}

/** Where each flow's run ended: the next flow's start, or the log's last line. */
const endsOf = (times, lastAt) => new Map(times.map((t, i) => [t.name, times[i + 1]?.since ?? lastAt]));

/** Each fault found in one flow's lines, in words. */
export function judgeFlow(name, expects, lines, endsAt) {
  const faults = [];
  const said = (event) => lines.filter((l) => l.event === event);
  if (expects === 'fails') {
    for (const l of said('state.empty')) faults.push(`${name}: a failure drawn as an empty room ("${l.what}")`);
    if (!said('state.failed').length && !said('screen.failed').length) {
      faults.push(`${name}: no failure was said, so the fault was never set and the flow proves nothing`);
    }
  }
  if (expects === 'slow') {
    for (const l of [...said('state.failed'), ...said('screen.failed')]) faults.push(`${name}: a slow answer said as a failure ("${l.what}")`);
    if (!said('screen.ready').length) faults.push(`${name}: no screen was ready on the slow link`);
  }
  const open = new Map();
  for (const l of lines) {
    if (l.event === 'screen.reading') { if (!open.has(l.what)) open.set(l.what, l.at); continue; }
    if (l.event !== 'screen.ready' && l.event !== 'screen.failed') continue;
    const began = open.get(l.what);
    if (began === undefined) continue;
    open.delete(l.what);
    const waited = l.at - began;
    if (waited > SPINNER_LIMIT_S) faults.push(`${name}: ${l.what} waited ${Math.round(waited)} s, past ${SPINNER_LIMIT_S} s`);
  }
  for (const [screen, began] of open) {
    faults.push(`${name}: ${screen} was still waiting when the flow ended, ${Math.round(endsAt - began)} s after it began`);
  }
  return faults;
}

/** Every fault in the run; `unread` when a listed flow never ran. */
export function judge(log, times) {
  const lines = readLines(log, times);
  const lastAt = Math.max(...log.split(/\r?\n/).map(stamp).filter((s) => !Number.isNaN(s)), 0);
  const ends = endsOf(times, lastAt);
  const ran = new Set(times.map((t) => t.name));
  const unread = Object.keys(FAULT_FLOWS).filter((f) => !ran.has(f));
  const faults = Object.entries(FAULT_FLOWS).filter(([f]) => ran.has(f))
    .flatMap(([f, expects]) => judgeFlow(f, expects, lines.filter((l) => l.flow === f), ends.get(f) ?? lastAt));
  return { faults, unread };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--flow-times');
  const logFile = args[0];
  const timesFile = at < 0 ? null : args[at + 1];
  if (!logFile || !existsSync(logFile) || !timesFile || !existsSync(timesFile)) {
    console.error('usage: node e2e/fault-judges.mjs <device log> --flow-times <file> (both must exist)');
    process.exit(2);
  }
  const { faults, unread } = judge(readFileSync(logFile, 'utf8'), readFlowTimes(timesFile));
  if (unread.length) { console.error(`never ran: ${unread.join(', ')}`); process.exit(2); }
  for (const f of faults) console.log(`✗ ${f}`);
  console.log(faults.length ? `${faults.length} fault(s) in the fault runs` : `every fault flow held: ${Object.keys(FAULT_FLOWS).join(', ')}`);
  process.exit(faults.length ? 1 : 0);
}
