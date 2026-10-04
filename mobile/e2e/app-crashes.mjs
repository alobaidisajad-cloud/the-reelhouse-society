#!/usr/bin/env node
/**
 * app-crashes.mjs — did the app crash or freeze at any moment of the run?
 *
 *   node e2e/app-crashes.mjs <device log> [--package <id>] [--flow-times <file>]
 *        [--maestro <dir>]... [--stream-alive yes|no] [--device-now "MM-DD HH:MM:SS"]
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

/**
 * The app's crashes and freezes in logcat lines (`threadtime`), in order.
 * Java: AndroidRuntime's "FATAL EXCEPTION" whose "Process:" line (same pid,
 * just after) names the app. Native: the tombstone's ">>> <process> <<<" line.
 * Freeze: ActivityManager's "ANR in <process>". Any other process is left out.
 */
export function findCrashes(lines, pkg = APP) {
  const found = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
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
    console.error('usage: node e2e/app-crashes.mjs <device log> [--package id] [--flow-times file] [--maestro dir]... [--stream-alive yes|no] [--device-now "MM-DD HH:MM:SS"]');
    process.exit(2);
  }
  const pkg = opt('--package') ?? APP;
  const lines = existsSync(file) ? readFileSync(file, 'utf8').split(/\r?\n/) : [];
  const times = readFlowTimes(opt('--flow-times'));
  const crashes = findCrashes(lines, pkg);
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
    out.push(`No crash or freeze of ${pkg}: ${stamped.length} log lines read, ${timeOf(stamped[0] ?? '')} to ${timeOf(stamped[stamped.length - 1] ?? '')}, and Maestro reported none.`);
  }
  console.log(out.join('\n'));
  process.exit(crashes.length || reports.length || unproven ? 1 : 0);
}
