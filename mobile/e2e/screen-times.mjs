#!/usr/bin/env node
/**
 * screen-times.mjs — how long each screen took to show what it was opened for.
 *
 *   node e2e/screen-times.mjs <device log> [--ceilings <json>] [--complete]
 *
 * In the sealed E2E build, useScreenReady writes `[e2e] screen.ready
 * {"name":…,"ms":…}` to the device log: the time from a screen's first render
 * (or its return to focus) until its content is in. This reads every such line
 * the run wrote and prints, per screen, how often it was opened, the median and
 * the slowest.
 *
 * With a ceilings file ({ "<screen>": <ms> }), it is a gate. It fails when:
 *   - a screen's slowest opening is above its ceiling;
 *   - a screen reported and has no ceiling (a new screen gets one as it lands);
 *   - with --complete (every flow ran to its end), a ceiling's screen never
 *     reported: it was renamed, or no flow reaches it any more, so the list
 *     cannot rot into ceilings that measure nothing.
 * Without one, it only reports.
 *
 * The emulator draws in software and is slower than any phone a member holds.
 * The ceilings are set from its own measured runs, to catch a screen that got
 * slower, not to describe a phone.
 */
import { existsSync, readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = (name) => {
  const at = args.indexOf(name);
  return at === -1 ? null : args.splice(at, 2)[1];
};
const ceilingsFile = flag('--ceilings');
const complete = args.includes('--complete');
const file = args.find((a) => !a.startsWith('--'));
if (!file) {
  console.error('usage: node e2e/screen-times.mjs <device log> [--ceilings <json>] [--complete]');
  process.exit(2);
}

const log = existsSync(file) ? readFileSync(file, 'utf8') : '';
const times = new Map();
for (const m of log.matchAll(/\[e2e\] screen\.ready (\{[^}\n]*\})/g)) {
  let event;
  try { event = JSON.parse(m[1]); } catch { continue; }
  if (typeof event.name !== 'string' || typeof event.ms !== 'number') continue;
  if (!times.has(event.name)) times.set(event.name, []);
  times.get(event.name).push(event.ms);
}

const ceilings = ceilingsFile ? JSON.parse(readFileSync(ceilingsFile, 'utf8')) : null;
const problems = [];
const pad = (s, n) => String(s).padStart(n);
const rows = [`${'screen'.padEnd(12)} ${pad('opened', 6)} ${pad('median', 9)} ${pad('slowest', 9)} ${pad('ceiling', 9)}`];

for (const name of [...times.keys()].sort()) {
  const ms = times.get(name).slice().sort((a, b) => a - b);
  const median = ms[Math.floor((ms.length - 1) / 2)];
  const slowest = ms[ms.length - 1];
  const ceiling = ceilings ? ceilings[name] : undefined;
  rows.push(`${name.padEnd(12)} ${pad(ms.length, 6)} ${pad(`${median} ms`, 9)} ${pad(`${slowest} ms`, 9)} ${pad(ceiling === undefined ? '—' : `${ceiling} ms`, 9)}`);
  if (!ceilings) continue;
  if (ceiling === undefined) problems.push(`${name} has no ceiling: add it to the ceilings file`);
  else if (slowest > ceiling) problems.push(`${name} took ${slowest} ms, over its ceiling of ${ceiling} ms`);
}
if (ceilings && complete) {
  for (const name of Object.keys(ceilings).sort()) {
    if (!times.has(name)) problems.push(`${name} has a ceiling but never reported: renamed, or no flow reaches it`);
  }
}

if (times.size === 0) console.log('(no screen reported a time: the build may not be the E2E build, or no flow ran)');
else console.log(rows.join('\n'));
for (const p of problems) console.log(`✗ ${p}`);
process.exit(problems.length > 0 || (ceilings && times.size === 0) ? 1 : 0);
