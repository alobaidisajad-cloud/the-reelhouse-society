#!/usr/bin/env node
/**
 * app-crashes.mjs — did the app crash or freeze at any moment of the run?
 *
 *   node e2e/app-crashes.mjs <device log> [--package <id>] [--flow-times <file>]
 *        [--maestro <dir>]... [--stream-alive yes|no] [--device-now "MM-DD HH:MM:SS"]
 *        [--own <file>]
 *
 * A flow can pass over a crash: the app dies in the background, the next step
 * relaunches it, and every check after that is green. So the whole run's log
 * (run-flows.sh copies it from the device as it is written) is read for the
 * app's Java crash, its native crash and its freeze (ANR), with the patterns
 * Maestro's own LogcatReader uses, read in logcat's `threadtime` format. Maestro's
 * per-flow crash and ANR reports (`crash-report.txt`, `anr-report.txt`, under
 * each --maestro dir) count as a second, independent source.
 *
 * A check that did not see the whole run cannot say "no crash": the copy must
 * still have been running at the end (--stream-alive) and its last line must be
 * recent against the device's clock (--device-now). If either is unproven, it
 * says so and fails.
 *
 * A run of a shipped client (--own: its own crashes, from old-clients.json)
 * reports a crash that build carries, fixed since in the app, in a section of
 * its own, and does not fail on it: it says nothing about the server.
 *
 * Prints its report; exits 1 on a crash, a freeze, or an unproven copy.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const APP = 'com.reelhouse.society';

/** "MM-DD HH:MM:SS(.mmm)" as seconds into the year (months as 31 days: only order and gaps matter). */
export function stamp(text) {
  const m = /^(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)(?:\.(\d+))?/.exec(text ?? '');
  if (!m) return NaN;
  return ((((+m[1] * 31 + +m[2]) * 24 + +m[3]) * 60 + +m[4]) * 60 + +m[5]) + (m[6] ? +`0.${m[6]}` : 0);
}

const pidOf = (line) => /^\d\d-\d\d \d\d:\d\d:\d\d\.\d+\s+(\d+)\s/.exec(line)?.[1];
const timeOf = (line) => /^\d\d-\d\d (\d\d:\d\d:\d\d)/.exec(line)?.[1] ?? '??:??:??';
// The app's own process, or one of its named processes ("com.reelhouse.society:remote").
const isApp = (name, pkg) => name === pkg || name.startsWith(`${pkg}:`);

/** What React Native writes when an error destroys its instance with no crash dialog. */
const SOFT = /handleHostException\(message|JavascriptException|ReactNoCrashSoftException.*getOrCreateDestroyTask|Tried to enqueue runnable on already finished thread/;
const SOFT_KIND = 'JS error (React instance destroyed)';
/** What a destroyed React writes after it, as its threads are already gone. */
const AFTERMATH = /Tried to enqueue runnable on already finished thread/;
/** How long an own crash's aftermath may follow it (run 38679641286: 1.1 s). */
export const AFTERMATH_SECONDS = 5;

/**
 * The app's crashes and freezes in logcat lines (`threadtime`), in order.
 * Java: AndroidRuntime's "FATAL EXCEPTION" whose "Process:" line (same pid,
 * just after) names the app. Native: the tombstone's ">>> <process> <<<" line.
 * Freeze: ActivityManager's "ANR in <process>". A soft one: a SOFT line from a
 * pid the log names as the app's (ActivityManager's "Start proc <pid>:<app>",
 * or a "Process: <app>, PID: <pid>" line), since those lines carry no
 * "Process:" of their own; the app looks alive, its screen is gone. Any other
 * process is left out.
 */
export function findCrashes(lines, pkg = APP) {
  const found = [];
  const appPids = new Set();
  const softSeen = new Map();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const started = /\sActivityManager\s*: Start proc (\d+):([^/\s]+)/.exec(line) ?? /Process: ([^,\s]+), PID: (\d+)/.exec(line);
    if (started) {
      const [pid, name] = /Start proc/.test(line) ? [started[1], started[2]] : [started[2], started[1]];
      if (isApp(name, pkg)) appPids.add(pid);
    }
    // AndroidRuntime's lines belong to a hard crash's report, read below.
    if (SOFT.test(line) && appPids.has(pidOf(line)) && !/\sAndroidRuntime\s*:/.test(line)) {
      // One report per process per second: a destruction writes several of these lines.
      // Each report keeps all its lines, so an own crash is matched on every one (splitOwn).
      const key = `${pidOf(line)} ${line.slice(0, 14)}`;
      if (softSeen.has(key)) softSeen.get(key).lines.push(line);
      else {
        const what = /message = "([^"]*)/.exec(line)?.[1] ?? line.replace(/^.*?:\s+/, '').trim();
        const report = { kind: SOFT_KIND, at: line.slice(0, 18), time: timeOf(line), what, detail: [], pid: pidOf(line), lines: [line] };
        softSeen.set(key, report);
        found.push(report);
      }
      continue;
    }
    if (/\s[EF] AndroidRuntime\s*: FATAL EXCEPTION\b/.test(line)) {
      const pid = pidOf(line);
      for (let j = i + 1; j < Math.min(lines.length, i + 8); j++) {
        if (pidOf(lines[j]) !== pid) continue;
        const p = /\sAndroidRuntime\s*: Process: ([^,\s]+)/.exec(lines[j]);
        if (!p) continue;
        if (isApp(p[1], pkg)) {
          const cause = lines.slice(j + 1, j + 4).filter((l) => pidOf(l) === pid)
            .map((l) => l.replace(/^.*?AndroidRuntime\s*: /, '').trim()).filter(Boolean);
          found.push({ kind: 'crash', at: line.slice(0, 18), time: timeOf(line), what: cause[0] ?? '(no cause line)', detail: cause.slice(1) });
        }
        break;
      }
      continue;
    }
    const tomb = /\s(?:DEBUG|crash_dump\d*|tombstoned)\s*:.*>>> (\S+) <<</.exec(line);
    if (tomb && isApp(tomb[1], pkg)) {
      const near = lines.slice(Math.max(0, i - 6), i + 6).map((l) => /(?:Fatal )?signal \d+ \(SIG[A-Z]+\).*$/.exec(l)?.[0]).find(Boolean);
      found.push({ kind: 'native crash', at: line.slice(0, 18), time: timeOf(line), what: near ?? 'a native crash (no signal line near the tombstone)', detail: [] });
      continue;
    }
    const anr = /\s[EIW] ActivityManager\s*: ANR in (\S+)/.exec(line);
    if (anr && isApp(anr[1], pkg)) {
      const reason = lines.slice(i + 1, i + 6).map((l) => /Reason: (.+)$/.exec(l)?.[1]).find(Boolean);
      found.push({ kind: 'freeze (ANR)', at: line.slice(0, 18), time: timeOf(line), what: reason ?? '(no reason line)', detail: [] });
    }
  }
  return found;
}

/**
 * A shipped client's own crashes (old-clients.json's ownCrashes), set apart.
 * A soft crash is its own when every line of its report holds that crash's
 * `match`, or is the aftermath; a later report from the same process, within
 * AFTERMATH_SECONDS and made only of aftermath, is its own too. Everything else
 * stays in `rest`. With no own crashes, `rest` is `crashes`.
 */
export function splitOwn(crashes, own = []) {
  const mine = [];
  const rest = [];
  const lastOwn = new Map();
  for (const c of crashes) {
    if (!own.length || c.kind !== SOFT_KIND) { rest.push(c); continue; }
    const hit = own.find((o) => c.lines.some((l) => l.includes(o.match))
      && c.lines.every((l) => l.includes(o.match) || AFTERMATH.test(l)));
    if (hit) {
      mine.push({ ...c, own: hit, aftermath: false });
      lastOwn.set(c.pid, { since: stamp(c.at), own: hit });
      continue;
    }
    const before = lastOwn.get(c.pid);
    const gap = before ? stamp(c.at) - before.since : NaN;
    if (before && gap >= 0 && gap <= AFTERMATH_SECONDS && c.lines.every((l) => AFTERMATH.test(l))) {
      mine.push({ ...c, own: before.own, aftermath: true });
      continue;
    }
    rest.push(c);
  }
  return { mine, rest };
}

/** The file run-flows.sh writes from `old-clients.cjs --own-crashes`; none when no file. */
export function readOwn(file) {
  if (!file) return { client: '', ownCrashes: [] };
  const o = JSON.parse(readFileSync(file, 'utf8'));
  const whole = typeof o.client === 'string' && o.client && Array.isArray(o.ownCrashes)
    && o.ownCrashes.every((c) => c.class && typeof c.match === 'string' && c.match && c.fixedIn);
  if (!whole) throw new Error(`${file} does not hold a client's own crashes`);
  return o;
}

/** One own crash, as the gate and attempt.mjs name it. */
export const ownName = (client, o) => `${client}'s own crash, class ${o.class}, fixed in ${o.fixedIn}`;

/** Maestro's own crash and ANR reports under `dirs`, as found. */
export function maestroReports(dirs) {
  const out = [];
  const walk = (d) => {
    let entries;
    try { entries = readdirSync(d); } catch { return; }
    for (const e of entries) {
      const p = join(d, e);
      let s;
      try { s = statSync(p); } catch { continue; }
      if (s.isDirectory()) walk(p);
      else if (e === 'crash-report.txt' || e === 'anr-report.txt') {
        const first = readFileSync(p, 'utf8').split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? '(empty)';
        out.push({ kind: e === 'crash-report.txt' ? 'crash (Maestro\'s report)' : 'freeze (Maestro\'s report)', file: p, what: first.slice(0, 200) });
      }
    }
  };
  for (const d of dirs) walk(d);
  return out;
}

/** The flow that was running at `seconds`, from run-flows.sh's flow-times file. */
export function flowAt(times, seconds) {
  let name = 'before the first flow';
  for (const t of times) if (t.since <= seconds) name = t.attempt > 1 ? `${t.name} (attempt ${t.attempt})` : t.name;
  return name;
}

export function readFlowTimes(file) {
  if (!file || !existsSync(file)) return [];
  return readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => {
    const [name, attempt, since] = l.split('\t');
    return { name, attempt: Number(attempt) || 1, since: stamp(since) };
  }).filter((t) => !Number.isNaN(t.since)).sort((a, b) => a.since - b.since);
}

/** Whether the copy saw the whole run: still running, and its last line recent. */
export function streamProof(lines, alive, deviceNow) {
  if (alive !== 'yes') return 'the device log copy had stopped before the run ended';
  if (!deviceNow) return 'the device did not answer for its clock, so the copy cannot be shown to reach the end';
  const last = [...lines].reverse().map(stamp).find((s) => !Number.isNaN(s));
  if (last === undefined) return 'the device log copy holds no lines';
  const gap = stamp(deviceNow) - last;
  if (Number.isNaN(gap)) return `the device's clock ("${deviceNow}") could not be read`;
  if (gap > 120) return `the copy's last line is ${Math.round(gap)}s older than the device's clock: it stopped early`;
  return null;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.lastIndexOf(name); return i === -1 ? undefined : args[i + 1]; }; // the last one given wins
  const all = (name) => args.flatMap((a, i) => (a === name ? [args[i + 1]] : []));
  const file = args[0];
  if (!file || file.startsWith('--')) {
    console.error('usage: node e2e/app-crashes.mjs <device log> [--package id] [--flow-times file] [--maestro dir]... [--stream-alive yes|no] [--device-now "MM-DD HH:MM:SS"] [--own file]');
    process.exit(2);
  }
  const pkg = opt('--package') ?? APP;
  const lines = existsSync(file) ? readFileSync(file, 'utf8').split(/\r?\n/) : [];
  const times = readFlowTimes(opt('--flow-times'));
  let own;
  try { own = readOwn(opt('--own')); } catch (e) { console.error(`app-crashes: ${e.message}`); process.exit(2); }
  const { mine, rest: crashes } = splitOwn(findCrashes(lines, pkg), own.ownCrashes);
  const reports = maestroReports(all('--maestro'));
  const unproven = existsSync(file)
    ? streamProof(lines, opt('--stream-alive') ?? 'yes', opt('--device-now'))
    : `the device log copy (${file}) was never written`;

  const out = [];
  if (crashes.length || reports.length) {
    out.push(`${pkg} crashed or froze during the run — a flow that passed over it hides it, so the run fails:`);
    for (const c of crashes) {
      out.push(`${c.time} ${c.kind} during ${flowAt(times, stamp(c.at))}: ${c.what.slice(0, 200)}`);
      for (const d of c.detail) out.push(`  ${d.slice(0, 200)}`);
    }
    for (const r of reports) out.push(`${r.kind}: ${r.what} (${r.file})`);
  }
  if (unproven) out.push(`The crash check cannot vouch for the whole run: ${unproven}.`);
  if (!out.length) {
    const stamped = lines.filter((l) => !Number.isNaN(stamp(l)));
    const but = mine.length ? ` but ${own.client}'s own` : '';
    out.push(`No crash or freeze of ${pkg}${but}: ${stamped.length} log lines read, ${timeOf(stamped[0] ?? '')} to ${timeOf(stamped[stamped.length - 1] ?? '')}, and Maestro reported none.`);
  }
  if (mine.length) {
    out.push(`${own.client} carries these crashes, each fixed since in the app; they do not fail this run:`);
    for (const c of mine) {
      if (c.aftermath) out.push(`  ${c.time} then, from the same process: ${c.what.slice(0, 200)} (${c.lines.length} line${c.lines.length === 1 ? '' : 's'})`);
      else out.push(`${c.time} ${ownName(own.client, c.own)}: during ${flowAt(times, stamp(c.at))}: ${c.what.slice(0, 200)}`);
    }
  }
  console.log(out.join('\n'));
  process.exit(crashes.length || reports.length || unproven ? 1 : 0);
}
