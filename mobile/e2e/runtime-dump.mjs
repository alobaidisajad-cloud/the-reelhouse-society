#!/usr/bin/env node
/**
 * runtime-dump.mjs — the phone's own JavaScript runtime, as the E2E build wrote
 * it, held to the committed copy.
 *
 *   node e2e/runtime-dump.mjs <device log> --copy <committed json> [--write <json>]
 *
 * The E2E build's first screen writes, once a launch, the own property names of
 * the global object and of the built-ins the app touches (src/utils/e2eRuntime.ts),
 * in parts: `[e2e] runtime {"of":…,"part":1,"parts":2,"names":[…]}`. Each launch's
 * parts are joined by its process id, and every launch's runtime must be whole
 * and equal to the committed copy (run-flows.sh names it), which
 * runtimeDump.contract.test.ts holds against Node and the list of what the phone
 * lacks. So a phone runtime that changes (a React Native or Hermes upgrade, a
 * polyfill added or dropped) fails the run until the copy is committed again and
 * the list read against it.
 *
 * --write keeps the first whole runtime as JSON in the run's kept logs: the file
 * to commit as the copy. Prints its report; exits 1 when no launch wrote a whole
 * runtime, one differs from the copy, or there is no copy.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';

const pidOf = (line) => /^\d\d-\d\d \d\d:\d\d:\d\d\.\d+\s+(\d+)\s/.exec(line)?.[1] ?? '?';

/** Each launch's runtime, by process id: { pid, dump, missing } (missing: parts never seen). */
export function readLaunches(log) {
  const byPid = new Map();
  for (const line of log.split(/\r?\n/)) {
    const at = line.indexOf('[e2e] runtime {');
    if (at === -1) continue;
    let part;
    try { part = JSON.parse(line.slice(at + '[e2e] runtime '.length)); } catch { part = null; }
    const pid = pidOf(line);
    if (!byPid.has(pid)) byPid.set(pid, { parts: new Map(), broken: [] });
    const launch = byPid.get(pid);
    if (!part || typeof part.of !== 'string' || !Number.isInteger(part.part) || !Number.isInteger(part.parts)) {
      launch.broken.push(line.slice(at, at + 80));
      continue;
    }
    if (!launch.parts.has(part.of)) launch.parts.set(part.of, { parts: part.parts, got: new Map() });
    launch.parts.get(part.of).got.set(part.part, part.names);
  }
  return [...byPid.entries()].map(([pid, { parts, broken }]) => {
    const dump = {};
    const missing = [...broken.map((b) => `a line that could not be read (${b}…)`)];
    for (const [of, { parts: n, got }] of parts) {
      const names = [];
      let absent = false;
      for (let i = 1; i <= n; i++) {
        if (!got.has(i)) { missing.push(`${of} part ${i} of ${n}`); continue; }
        const p = got.get(i);
        if (p === null) absent = true;
        else names.push(...p);
      }
      dump[of] = absent ? null : names.sort();
    }
    return { pid, dump, missing };
  });
}

/**
 * Globals a native module installs on the runtime when the module first starts, which can come
 * before or after the first screen writes the runtime: each launch may have them or not, so they are
 * never held to the copy, either way. Each named with what installs it. Nothing else is excused.
 */
export const INSTALLED_LATE = {
  // Its native module installs it as a JSI function when it first starts; the app reads it only
  // under __DEV__ (useViewRefHandler). Sealed E2E 40183148664: a launch had it, once the Lobby was
  // drawn only when first seen and that launch's first screen wrote the runtime at another moment.
  isViewFlatteningDisabled: 'react-native-gesture-handler',
};

/** How a runtime differs from the copy, one line a built-in ([] when equal). */
export function differences(dump, copy) {
  const out = [];
  for (const of of [...new Set([...Object.keys(copy), ...Object.keys(dump)])].sort()) {
    if (!(of in dump)) { out.push(`${of}: not written by the phone`); continue; }
    if (!(of in copy)) { out.push(`${of}: written by the phone, not in the copy`); continue; }
    const a = dump[of];
    const b = copy[of];
    if (a === null || b === null) {
      if (a !== b) out.push(`${of}: ${a === null ? 'absent on the phone' : 'absent in the copy'}`);
      continue;
    }
    const late = (n) => of === 'globalThis' && n in INSTALLED_LATE;
    const gained = a.filter((n) => !b.includes(n) && !late(n));
    const lost = b.filter((n) => !a.includes(n) && !late(n));
    const list = (xs) => `${xs.slice(0, 12).join(', ')}${xs.length > 12 ? ` and ${xs.length - 12} more` : ''}`;
    if (gained.length) out.push(`${of}: the phone has ${list(gained)}, the copy does not`);
    if (lost.length) out.push(`${of}: the copy has ${list(lost)}, the phone does not`);
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(name); return i === -1 ? undefined : args[i + 1]; };
  const file = args[0];
  const copyFile = opt('--copy');
  if (!file || file.startsWith('--') || !copyFile) {
    console.error('usage: node e2e/runtime-dump.mjs <device log> --copy <committed json> [--write <json>]');
    process.exit(2);
  }
  const launches = readLaunches(existsSync(file) ? readFileSync(file, 'utf8') : '');
  const whole = launches.filter((l) => l.missing.length === 0);
  const problems = [];
  for (const l of launches.filter((x) => x.missing.length)) {
    problems.push(`launch ${l.pid} wrote its runtime incompletely: ${l.missing.join('; ')}`);
  }
  if (whole.length === 0) problems.push('no launch wrote a whole runtime: the build may not be the E2E build, or no screen was drawn');
  const write = opt('--write');
  if (whole.length && write) writeFileSync(write, `${JSON.stringify(whole[0].dump, null, 1)}\n`);
  if (!existsSync(copyFile)) {
    problems.push(`there is no committed copy of the phone's runtime (${copyFile})${whole.length && write
      ? `: commit this run's ${basename(write)} (in its e2e-logs) as ${copyFile}, then run runtimeDump.contract.test.ts` : ''}`);
  } else {
    const copy = JSON.parse(readFileSync(copyFile, 'utf8'));
    for (const l of whole) {
      const diff = differences(l.dump, copy);
      if (diff.length) problems.push(`launch ${l.pid}'s runtime is not the copy:\n  ${diff.join('\n  ')}`);
    }
  }
  if (!problems.length) {
    console.log(`The phone's runtime, written by ${whole.length} launch${whole.length === 1 ? '' : 'es'}, is the committed copy (${copyFile}).`);
  }
  for (const p of problems) console.log(`✗ ${p}`);
  process.exit(problems.length ? 1 : 0);
}
