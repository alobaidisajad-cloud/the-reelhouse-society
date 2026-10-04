#!/usr/bin/env node
/**
 * animation-waits.mjs — where Android held the driver on an animation that would not end.
 *
 *   node e2e/animation-waits.mjs <device log> [--flow-times <file>]
 *
 * Android's UiAutomation waits, before and after every key and tap a test
 * injects, for every window to finish animating — 5 s at most, then it logs
 * "Timed out waiting for animations to complete, animatingContainer=…
 * animationType=… animateStarting=…" and goes on. One stuck animation turns
 * typing from half a second a key into ten (run 37155828199), until a single
 * typing call outruns Maestro's 120 s deadline. That line NAMES what was
 * animating, so the whole run's log is read for it — failed flows and passed
 * ones, the warm-up first — and each wait is put on the flow that was running.
 *
 * Prints the report; exits 1 when Android waited at all (run-flows.sh raises a
 * warning: slow is not failed, but a stuck animation is never left unseen),
 * 0 when it never did.
 */
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { flowAt, readFlowTimes, stamp } from './app-crashes.mjs';

export const ANIMATING = /Timed out waiting for animations/;
const SECONDS_PER_WAIT = 5; // WindowManagerService.waitForAnimationsToComplete's timeout, as UiAutomation calls it

/**
 * What Android said was animating, most often first: "<container> (<type>) × n".
 * Only lines that name it (Android 14's "animatingContainer=…"); a bare
 * "Timed out waiting for animations" is counted by the caller, not named here.
 */
export function animatingRead(lines) {
  const kinds = new Map();
  for (const l of lines) {
    if (!ANIMATING.test(l)) continue;
    const container = /animatingContainer=(.*?)\s+animationType=/.exec(l)?.[1];
    if (container === undefined) continue;
    const type = /animationType=(\S+)/.exec(l)?.[1] ?? '?';
    const starting = /animateStarting=true/.test(l) ? ', a starting window' : '';
    const key = `${container.slice(0, 110)} (${type}${starting})`;
    kinds.set(key, (kinds.get(key) ?? 0) + 1);
  }
  return [...kinds].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} × ${n}`);
}

/** The waits, by the flow that was running: [{ flow, lines }], in the run's order. */
export function waitsByFlow(lines, times) {
  const byFlow = new Map();
  for (const l of lines) {
    if (!ANIMATING.test(l)) continue;
    const flow = flowAt(times, stamp(l));
    if (!byFlow.has(flow)) byFlow.set(flow, []);
    byFlow.get(flow).push(l);
  }
  return [...byFlow].map(([flow, hits]) => ({ flow, lines: hits }));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--flow-times');
  const times = readFlowTimes(at === -1 ? undefined : args[at + 1]);
  const file = args[0];
  if (!file || file.startsWith('--')) {
    console.error('usage: node e2e/animation-waits.mjs <device log> [--flow-times file]');
    process.exit(2);
  }
  const lines = existsSync(file) ? readFileSync(file, 'utf8').split(/\r?\n/) : [];
  const groups = waitsByFlow(lines, times);
  if (!groups.length) {
    console.log('Android never waited on a stuck animation.');
    process.exit(0);
  }
  const clock = (l) => /^\d\d-\d\d (\d\d:\d\d:\d\d)/.exec(l)?.[1] ?? '??';
  const out = [`Android held the test's every key and tap on an animation that would not end (${SECONDS_PER_WAIT} s each wait):`];
  for (const g of groups) {
    out.push(`${g.flow}: ${g.lines.length} wait${g.lines.length === 1 ? '' : 's'}, about ${g.lines.length * SECONDS_PER_WAIT}s lost, ${clock(g.lines[0])} to ${clock(g.lines[g.lines.length - 1])}`);
    const kinds = animatingRead(g.lines);
    for (const kind of kinds.slice(0, 3)) out.push(`  animating: ${kind}`);
    if (!kinds.length) out.push('  animating: (Android\'s lines did not name it)');
  }
  console.log(out.join('\n'));
  process.exit(1);
}
