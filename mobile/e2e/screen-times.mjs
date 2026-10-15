#!/usr/bin/env node
/**
 * screen-times.mjs — how long each screen took to show what it was opened for,
 * and whether any screen could not read it at all.
 *
 *   node e2e/screen-times.mjs <device log> [--ceilings <json>] [--complete]
 *        [--flow-times <file>] [--record <file>]
 *
 * In the sealed E2E build, useScreenReady writes `[e2e] screen.ready
 * {"name":…,"ms":…}` to the device log: the time from a screen's first render
 * (or its return to focus) until its content is in. A screen whose read failed
 * writes `[e2e] screen.failed {…}` instead. This reads every such line the run
 * wrote and prints, per screen, how often it was opened, the median and the
 * slowest.
 *
 * It fails on any screen.failed, with or without ceilings: a screen that could
 * not read is not a loaded one, whatever the flow went on to tap. Only in a flow
 * that takes the network away on purpose (PLANTS_FAILURES; which flow was
 * running is read from run-flows.sh's --flow-times file) is a failed read the
 * point, and not counted.
 *
 * With a ceilings file ({ "<screen>": { "median": <ms>, "once": <ms> } }, which
 * ceilingsFrom derives from e2e/screen-history.json), it is also a gate. It fails when:
 *   - a screen opened at least MEDIAN_OPENS times has a median above its median
 *     ceiling: its typical opening got slower (one slow opening on a shared
 *     emulator is the machine: the same code's slowest Darkroom ran 634 to 2242 ms
 *     in a day);
 *   - any one opening is above its once ceiling: a stall, however rare;
 *   - a screen reported and has no ceiling (a new screen gets one as it lands);
 *   - with --complete (every flow ran to its end), a ceiling's screen never
 *     reported: it was renamed, or no flow reaches it any more, so the list
 *     cannot rot into ceilings that measure nothing.
 * Without one, it reports the times.
 *
 * With --record (one shard of e2e.yml's flows), the never-reported rule is
 * left to shard-verdict.mjs, which reads every shard: a screen one shard never
 * opens is another's. The record says which screens reported, and whether
 * --complete was given.
 *
 * The emulator draws in software and is slower than any phone a member holds.
 * The ceilings are derived from its own measured runs, to catch a screen that
 * got slower, not to describe a phone.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { flowAt, readFlowTimes, stamp } from './app-crashes.mjs';

/** The flows that cut the network on purpose: exactly those (screenTimes.test.ts). */
export const PLANTS_FAILURES = ['offline_resilience'];

/** A screen opened this often is judged by its median; fewer, by its one-opening ceiling alone. */
export const MEDIAN_OPENS = 3;

/**
 * Each screen's two ceilings, from the recorded history (e2e/screen-history.json:
 * every shard's table, as its run printed it). Set from two runs, one ceiling
 * and twice it for a single opening fitted no screen: the Dispatch opens once a
 * run and its ceiling sat at its typical time, so one run in five read as a hang;
 * the Lobby opens eight times, the first cold, and its slowest is three times its
 * median. So, per screen, rounded up to 50 ms:
 *   - median: half again the slowest typical opening any run had;
 *   - once: twice the opening that nine runs in ten stayed under, so a stall
 *     past it is the app's, not the shared machine's.
 */
export function ceilingsFrom(history) {
  const up = (ms) => Math.ceil(ms / 50) * 50;
  const nearestRank = (xs, p) => xs.slice().sort((a, b) => a - b)[Math.ceil(p * xs.length) - 1];
  const by = new Map();
  for (const s of history.samples) {
    if (!by.has(s.screen)) by.set(s.screen, []);
    by.get(s.screen).push(s);
  }
  return Object.fromEntries([...by.keys()].sort().map((screen) => {
    const ss = by.get(screen);
    return [screen, {
      median: up(1.5 * Math.max(...ss.map((s) => s.median))),
      once: up(2 * nearestRank(ss.map((s) => s.slowest), 0.9)),
    }];
  }));
}

/** Every screen line in the log: its kind, its screen, its time, and the flow it ran in. */
export function readScreens(log, flowTimes) {
  const out = [];
  for (const line of log.split(/\r?\n/)) {
    const m = /\[e2e\] screen\.(ready|failed) (\{[^}\n]*\})/.exec(line);
    if (!m) continue;
    let event;
    try { event = JSON.parse(m[2]); } catch { continue; }
    if (typeof event.name !== 'string' || typeof event.ms !== 'number') continue;
    out.push({ kind: m[1], name: event.name, ms: event.ms, flow: flowAt(flowTimes, stamp(line)) });
  }
  return out;
}

/** A failed read outside a flow that plants one. */
export const counts = (s) => s.kind === 'failed' && !PLANTS_FAILURES.includes(s.flow.replace(/ \(attempt \d+\)$/, ''));

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const at = args.indexOf(name);
    return at === -1 ? null : args.splice(at, 2)[1];
  };
  const ceilingsFile = flag('--ceilings');
  const flowTimes = readFlowTimes(flag('--flow-times'));
  const record = flag('--record');
  const complete = args.includes('--complete');
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('usage: node e2e/screen-times.mjs <device log> [--ceilings <json>] [--complete]'
      + ' [--flow-times <file>] [--record <file>]');
    process.exit(2);
  }

  const log = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const screens = readScreens(log, flowTimes);
  const times = new Map();
  for (const s of screens.filter((x) => x.kind === 'ready')) {
    if (!times.has(s.name)) times.set(s.name, []);
    times.get(s.name).push(s.ms);
  }

  const ceilings = ceilingsFile ? JSON.parse(readFileSync(ceilingsFile, 'utf8')) : null;
  const problems = [];
  const pad = (s, n) => String(s).padStart(n);
  const rows = [`${'screen'.padEnd(12)} ${pad('opened', 6)} ${pad('median', 9)} ${pad('slowest', 9)} ${pad('ceilings', 15)}`];

  for (const s of screens.filter(counts)) {
    problems.push(`${s.name} could not read during ${s.flow}: it said so, and was never loaded`);
  }
  for (const name of [...times.keys()].sort()) {
    const ms = times.get(name).slice().sort((a, b) => a - b);
    const median = ms[Math.floor((ms.length - 1) / 2)];
    const slowest = ms[ms.length - 1];
    const ceiling = ceilings ? ceilings[name] : undefined;
    rows.push(`${name.padEnd(12)} ${pad(ms.length, 6)} ${pad(`${median} ms`, 9)} ${pad(`${slowest} ms`, 9)} ${pad(ceiling === undefined ? '—' : `${ceiling.median} / ${ceiling.once}`, 15)}`);
    if (!ceilings) continue;
    if (ceiling === undefined) problems.push(`${name} has no ceiling: add it to the ceilings file`);
    else {
      if (ms.length >= MEDIAN_OPENS && median > ceiling.median) {
        problems.push(`${name}'s typical opening took ${median} ms (median of ${ms.length}), over its ceiling of ${ceiling.median} ms`);
      }
      if (slowest > ceiling.once) {
        problems.push(`${name} took ${slowest} ms once, over its one-opening ceiling of ${ceiling.once} ms: a stall`);
      }
    }
  }
  if (record) writeFileSync(record, `${JSON.stringify({ complete, reported: [...times.keys()].sort() })}\n`);
  if (ceilings && complete && !record) {
    for (const name of Object.keys(ceilings).sort()) {
      if (!times.has(name)) problems.push(`${name} has a ceiling but never reported: renamed, or no flow reaches it`);
    }
  }
  const planted = screens.filter((s) => s.kind === 'failed' && !counts(s));
  if (planted.length) console.log(`(${planted.length} failed read${planted.length === 1 ? '' : 's'} in flows that take the network away on purpose: ${[...new Set(planted.map((s) => s.flow))].join(', ')})`);

  if (times.size === 0) console.log('(no screen reported a time: the build may not be the E2E build, or no flow ran)');
  else console.log(rows.join('\n'));
  for (const p of problems) console.log(`✗ ${p}`);
  process.exit(problems.length > 0 || (ceilings && times.size === 0) ? 1 : 0);
}
