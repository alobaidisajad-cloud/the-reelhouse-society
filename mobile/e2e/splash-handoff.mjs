#!/usr/bin/env node
/**
 * splash-handoff.mjs — the app never took Android's splash over.
 *
 *   node e2e/splash-handoff.mjs <device log> [--package <id>] [--flow-times <file>]
 *
 * plugins/withSplashWithoutHandoff.js keeps the app from taking the splash
 * over, because a takeover gives the app's main thread 2 s, and when it is late
 * the app's main window is left animating until a relaunch (run 37201431874).
 * This proves it held, on every launch of the run, from the device's whole log:
 *
 *   - the app's processes are the ones ActivityManager started for it
 *     ("Start proc <pid>:com.reelhouse.society/…"), so another app's own
 *     takeover never counts;
 *   - a takeover is "SplashScreenView: Building from parcel" in one of them
 *     (the copy Android hands over; the system's own splash logs only "Build");
 *   - a late one is ActivityTaskManager's "Activity transferring splash screen
 *     timeout for ActivityRecord{… <app>/…}".
 *
 * A log with no launch of the app proves nothing, and fails as such.
 * Prints its report; exits 1 on any takeover, any timeout, or no launch.
 */
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { APP, flowAt, readFlowTimes, stamp } from './app-crashes.mjs';

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pidOf = (line) => /^\d\d-\d\d \d\d:\d\d:\d\d\.\d+\s+(\d+)\s/.exec(line)?.[1];

/** Every launch, takeover and timeout of the app in logcat lines (`threadtime`). */
export function readHandoffs(lines, pkg = APP) {
  const start = new RegExp(`\\sActivityManager\\s*: Start proc (\\d+):${esc(pkg)}(?::[\\w.]+)?/`);
  const timeout = new RegExp(`\\sActivityTaskManager\\s*: Activity transferring splash screen timeout for ActivityRecord\\{\\S+ \\S+ ${esc(pkg)}/`);
  const pids = new Set();
  for (const l of lines) {
    const m = start.exec(l);
    if (m) pids.add(m[1]);
  }
  return {
    launches: pids.size,
    takeovers: lines.filter((l) => /\sSplashScreenView\s*: Building from parcel\b/.test(l) && pids.has(pidOf(l))),
    timeouts: lines.filter((l) => timeout.test(l)),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.lastIndexOf(name); return i === -1 ? undefined : args[i + 1]; };
  const file = args[0];
  if (!file || file.startsWith('--')) {
    console.error('usage: node e2e/splash-handoff.mjs <device log> [--package id] [--flow-times file]');
    process.exit(2);
  }
  const pkg = opt('--package') ?? APP;
  const lines = existsSync(file) ? readFileSync(file, 'utf8').split(/\r?\n/) : [];
  const times = readFlowTimes(opt('--flow-times'));
  const { launches, takeovers, timeouts } = readHandoffs(lines, pkg);
  const when = (l) => `${/^\d\d-\d\d (\d\d:\d\d:\d\d)/.exec(l)?.[1] ?? '??'} during ${flowAt(times, stamp(l))}`;

  if (!launches) {
    console.log(`No launch of ${pkg} in the device log (no "Start proc …:${pkg}" line), so nothing shows the splash was never handed over.`);
    process.exit(1);
  }
  if (!takeovers.length && !timeouts.length) {
    console.log(`${pkg} never took Android's splash over: ${launches} launch${launches === 1 ? '' : 'es'}, no takeover, no handover timeout.`);
    process.exit(0);
  }
  const out = [
    `${pkg} took Android's splash over on ${takeovers.length} of ${launches} launch${launches === 1 ? '' : 'es'}` +
      (timeouts.length ? `, and ${timeouts.length} handover${timeouts.length === 1 ? '' : 's'} ran past Android's 2 s` : '') + '.',
    'A takeover gives the app\'s busy main thread 2 s; a late one leaves its main window animating until a relaunch.',
    'MainActivity must clear the splash exit listener (plugins/withSplashWithoutHandoff.js): read the generated MainActivity.',
  ];
  for (const l of timeouts.slice(0, 5)) out.push(`  timeout ${when(l)}`);
  for (const l of takeovers.slice(0, 5)) out.push(`  takeover ${when(l)} (pid ${pidOf(l)})`);
  if (takeovers.length > 5) out.push(`  … and ${takeovers.length - 5} more takeovers`);
  console.log(out.join('\n'));
  process.exit(1);
}
