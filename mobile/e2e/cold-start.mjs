#!/usr/bin/env node
/**
 * cold-start.mjs — how each launch of the app in the run went, as a table (WORKLIST P0.104).
 *
 *   node e2e/cold-start.mjs <device log> [--measured <dir>] [--flow-times <file>] [--package <id>]
 *
 * A launch is a "Start proc <pid>:<app>/" line of ActivityManager: the app's main process
 * started cold. For each, from the device's whole log (`threadtime`):
 *   - Displayed: ActivityTaskManager's "Displayed <app>/…: +1s234ms", the first after the start;
 *   - first screen ready: the first `[e2e] screen.ready` the process wrote (useScreenReady), its
 *     screen and the time since the process started;
 *   - skipped frames and Davey frames: Choreographer's "Skipped N frames" and OpenGLRenderer's
 *     "Davey! duration=Nms" in the process, from its start to that first screen ready.
 * One launch is made by run-flows.sh on purpose before the flows (on the run's phone, the old process
 * gone 3 s, `am start-activity -W`): its dir (--measured) holds the log's line it began at
 * (cold-from.txt: the launch is the first at or after it, as a pid can come again), am's answer
 * (cold-am.txt: TotalTime) and, once a screen said it was ready, `dumpsys meminfo`
 * (cold-meminfo.txt: the native heap). Every other launch is Maestro's or the one with animations on.
 *
 * Every cell holds a value or says why not ("not measured: …"). A log with no launch of the app
 * has no table, and fails as such. Prints the table (markdown); exits 1 with no launch.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { APP, flowAt, readFlowTimes, stamp } from './app-crashes.mjs';

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pidOf = (line) => /^\d\d-\d\d \d\d:\d\d:\d\d\.\d+\s+(\d+)\s/.exec(line)?.[1];
const ms = (from, to) => Math.round((stamp(to) - stamp(from)) * 1000);

/** The measured launch's records, each null when it was not written. */
export function readMeasured(dir) {
  const read = (name) => (dir && existsSync(join(dir, name)) ? readFileSync(join(dir, name), 'utf8') : null);
  const from = Number(read('cold-from.txt')?.trim());
  const am = read('cold-am.txt');
  const mem = read('cold-meminfo.txt');
  const total = am && /TotalTime: (\d+)/.exec(am);
  // The App Summary's "Native Heap:" (PSS, kB), or the table's row when there is no summary.
  const native = mem && (/^\s*Native Heap:\s+(\d+)/m.exec(mem) ?? /^\s*Native Heap\s+(\d+)/m.exec(mem));
  return { from: Number.isInteger(from) && from > 0 ? from : null, totalTime: total ? Number(total[1]) : null, amSaid: am, nativeKb: native ? Number(native[1]) : null };
}

/** Every cold start of the app's main process in logcat lines, with what the log says of it. */
export function readLaunches(lines, pkg = APP) {
  const start = new RegExp(`\\sActivityManager\\s*: Start proc (\\d+):${esc(pkg)}/`);
  const displayed = new RegExp(`\\sActivityTaskManager\\s*: Displayed ${esc(pkg)}/[^:]*(?: for user \\d+)?: \\+(?:(\\d+)s)?(\\d+)ms`);
  const starts = [];
  lines.forEach((l, i) => { const m = start.exec(l); if (m) starts.push({ pid: m[1], at: i }); });
  return starts.map((s, n) => {
    const end = n + 1 < starts.length ? starts[n + 1].at : lines.length;
    const own = (l) => pidOf(l) === s.pid;
    let shown = null;
    let ready = null;
    for (let i = s.at + 1; i < end; i++) {
      const l = lines[i];
      const d = shown === null && displayed.exec(l);
      if (d) shown = Number(d[1] ?? 0) * 1000 + Number(d[2]);
      const r = ready === null && own(l) && /\[e2e\] screen\.ready (\{.*\})/.exec(l);
      if (r) {
        let name = '?';
        try { name = JSON.parse(r[1]).name ?? '?'; } catch { /* the name is read as it is, or not at all */ }
        ready = { name, after: ms(lines[s.at], l), at: i };
      }
    }
    // The cold start: from the process's start to its first screen ready, or its last line.
    const until = ready ? ready.at : end;
    let skipped = 0;
    let daveys = 0;
    let longest = 0;
    for (let i = s.at + 1; i < until; i++) {
      const l = lines[i];
      if (!own(l)) continue;
      const k = /\sChoreographer\s*: Skipped (\d+) frames/.exec(l);
      if (k) skipped += Number(k[1]);
      const d = /\sOpenGLRenderer\s*: Davey! duration=(\d+)ms/.exec(l);
      if (d) { daveys++; longest = Math.max(longest, Number(d[1])); }
    }
    return { pid: s.pid, at: s.at, line: lines[s.at], displayed: shown, ready, skipped, daveys, longest };
  });
}

/** The measured launch: the first at or after the line its launch began at (1-based), or none. */
export const measuredOf = (launches, measured) => (measured.from === null ? undefined : launches.find((l) => l.at + 1 >= measured.from));

/** The table's rows, every cell a value or its reason. */
export function tableOf(launches, measured, times = [], anyReady = true) {
  const noReady = anyReady ? 'not measured: no screen said it was ready before this process ended' : 'not measured: no ready marker in this build';
  const it = measuredOf(launches, measured);
  return launches.map((l, i) => {
    const mine = l === it;
    const reached = Boolean(l.ready);
    return [
      String(i + 1),
      mine ? 'the measured launch (run-flows.sh)' : flowAt(times, stamp(l.line)),
      l.displayed !== null ? `${l.displayed} ms` : 'not measured: Android logged no "Displayed" for it',
      reached ? `${l.ready.name}, ${l.ready.after} ms` : noReady,
      // Counted to the first screen ready, or to the process's end when none came.
      `${l.skipped}${reached ? '' : ' (no screen ready: to its end)'}`,
      l.daveys ? `${l.daveys}, longest ${l.longest} ms` : '0',
      !mine ? "not measured: am's time is taken at the measured launch alone"
        : measured.totalTime !== null ? `${measured.totalTime} ms` : `not measured: am said no TotalTime (${(measured.amSaid ?? 'nothing').trim().split('\n')[0].slice(0, 80) || 'nothing'})`,
      !mine ? 'not measured: read at the measured launch alone'
        : measured.nativeKb !== null ? `${(measured.nativeKb / 1024).toFixed(1)} MB`
          : reached ? 'not measured: dumpsys meminfo said no native heap' : 'not measured: no screen said it was ready, so no reading was taken',
    ];
  });
}

export const HEAD = ['#', 'launch', 'Displayed', 'first screen ready (after start)', 'skipped frames', 'Davey frames', 'am TotalTime', 'native heap at ready'];

/** The table as markdown, with what does not transfer to a phone said under it. */
export function markdownOf(rows, measuredFound) {
  const line = (cells) => `| ${cells.map((c) => c.replace(/\|/g, '/')).join(' | ')} |`;
  return [
    line(HEAD),
    line(HEAD.map(() => '---')),
    ...rows.map(line),
    '',
    'Skipped frames and Davey frames are counted from the process start to its first screen ready. On this emulator most',
    'of that time is RenderThread in goldfish_pipe, the emulator\'s software GPU, which a phone does not have: they show',
    'a change between runs, not a phone\'s numbers.',
    ...(measuredFound ? [] : ['', 'The measured launch is not in this log: run-flows.sh made none, or its process never started.']),
  ].join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.lastIndexOf(name); return i === -1 ? undefined : args[i + 1]; };
  const file = args[0];
  if (!file || file.startsWith('--')) {
    console.error('usage: node e2e/cold-start.mjs <device log> [--measured dir] [--flow-times file] [--package id]');
    process.exit(2);
  }
  const pkg = opt('--package') ?? APP;
  const lines = existsSync(file) ? readFileSync(file, 'utf8').split(/\r?\n/) : [];
  const launches = readLaunches(lines, pkg);
  if (!launches.length) {
    console.log(`No launch of ${pkg} in the device log (no "Start proc …:${pkg}/" line): no cold-start table.`);
    process.exit(1);
  }
  const measured = readMeasured(opt('--measured'));
  const rows = tableOf(launches, measured, readFlowTimes(opt('--flow-times')), lines.some((l) => l.includes('[e2e] screen.ready')));
  console.log(markdownOf(rows, measuredOf(launches, measured) !== undefined));
}
