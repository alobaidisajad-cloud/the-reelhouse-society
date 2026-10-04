#!/usr/bin/env node
/**
 * attempt.mjs — a failed attempt: does it say anything about the app?
 *
 *   node e2e/attempt.mjs --kind flow|probe --exit <code> --junit <report.xml>
 *        --debug <maestro --debug-output dir> --log <device log for the attempt>
 *        --left <seconds> --need <seconds> --retries <so far> --max <cap>
 *        --device alive|gone [--attempt <1|2>]
 *
 * Prints "retry" or "final" on its first line, then why, then the evidence;
 * exits 0 for "retry", 1 for "final". run-flows.sh runs a flow again only on 0.
 *
 * Only an attempt that tells us nothing about the app is run again, once:
 *
 *   NEVER BEGAN (flows and probes): Maestro failed before it began a single
 *   step. Three records must agree: its JUnit report says the flow failed, its
 *   step record (its commands file) holds no step, and its own log names no step.
 *   Run 37165878763: Maestro's driver check passes before the driver on the
 *   phone listens (`isDriverReachable` only opens the port), so its first call,
 *   `deviceInfo`, died 230 ms in, before the app was touched.
 *
 *   LOST ITS DRIVER (probes only): Maestro's own error is its transport death,
 *   DeviceServerDiedException or DeviceUnreachableException ("an infrastructure
 *   failure, not a test failure", in Maestro's source). Run 37155828199: Android
 *   held every key 10 s for a window animation, and the one typing call outran
 *   Maestro's fixed 120 s deadline. A probe saves nothing and the flows walk its
 *   path; a FLOW that lost its driver is not run again, because it had begun and
 *   may have saved something (verify-writes.mjs wants exactly one row) — it is
 *   reported as no verdict on the app instead.
 *
 * And never, whatever Maestro said: when the attempt ran out of its time, the
 * emulator is gone, the app crashed or froze in it (the device's log, or
 * Maestro's own crash/ANR report), it was already the second attempt, the run
 * already ran `--max` attempts again, or fewer than `--need` seconds are left.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { findCrashes, maestroReports } from './app-crashes.mjs';

/** Maestro's transport deaths: its own "infrastructure, not a test failure" types. */
export const TRANSPORT_DEATHS = ['maestro.android.DeviceServerDiedException', 'maestro.DeviceUnreachableException'];
const DEATH = new RegExp(`\\b(${TRANSPORT_DEATHS.map((c) => c.replace(/\./g, '\\.')).join('|')})\\b`);

const unescapeXml = (s) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** The JUnit report Maestro wrote (JUnitTestSuiteReporter): did it fail, and with what. */
export function readJunit(file) {
  if (!file || !existsSync(file)) return null;
  const xml = readFileSync(file, 'utf8');
  const testcase = /<testcase\b[^>]*>/.exec(xml);
  if (!testcase) return null;
  const failure = /<failure\b[^>]*>([\s\S]*?)<\/failure>/.exec(xml) ?? /<failure\b[^>]*\bmessage="([^"]*)"/.exec(xml);
  const status = /\bstatus="([^"]*)"/.exec(testcase[0])?.[1] ?? '';
  const message = failure ? unescapeXml(failure[1]).trim() : '';
  const firstLine = message.split(/\r?\n/)[0].trim();
  // A Maestro failure (an assertion, a missing element) is its message alone; any
  // other exception is its stack trace, whose first line is "<class>: <message>".
  const cls = /^((?:[a-z_][\w$]*\.)+[A-Z][\w$]*)(?::|$)/.exec(firstLine)?.[1] ?? null;
  return { failed: !!failure || status === 'ERROR', status, firstLine, cls };
}

const walk = (dir, keep, out = []) => {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    let s;
    try { s = statSync(p); } catch { continue; }
    if (s.isDirectory()) walk(p, keep, out);
    else if (keep(e)) out.push(p);
  }
  return out;
};

/** The steps Maestro recorded (its commands file, written when the flow ends): how many. */
export function recordedSteps(debugDir) {
  let steps = 0;
  for (const f of walk(debugDir, (e) => /^commands.*\.json$/.test(e))) {
    try {
      const entries = JSON.parse(readFileSync(f, 'utf8'));
      if (Array.isArray(entries)) steps += entries.length;
    } catch { steps += 1; } // a record it cannot read is not "no step"
  }
  return steps;
}

/** Maestro's own log for the attempt: present at all, the steps it began, and a transport death in it. */
export function maestroLog(debugDir) {
  const files = walk(debugDir, (e) => e === 'maestro.log');
  const text = files.map((f) => readFileSync(f, 'utf8')).join('\n');
  return {
    present: files.length > 0 && text.trim().length > 0,
    steps: (text.match(/CliConsoleListener\.onCommand(?:Start|Finished|Reset):/g) ?? []).length,
    death: DEATH.exec(text)?.[1] ?? null,
  };
}

export function decide(o) {
  const evidence = [];
  const junit = readJunit(o.junit);
  const steps = recordedSteps(o.debug);
  const log = maestroLog(o.debug);
  const lines = o.log && existsSync(o.log) ? readFileSync(o.log, 'utf8').split(/\r?\n/) : [];
  const crashes = [...findCrashes(lines), ...maestroReports([o.debug])];
  const reason = junit?.firstLine ? junit.firstLine.slice(0, 300) : '(Maestro wrote no report)';

  evidence.push(`Maestro said: ${reason}`);
  evidence.push(`steps Maestro recorded: ${steps}; steps in its own log: ${log.present ? log.steps : '(no log)'}`);
  evidence.push(`app crash or freeze in this attempt: ${crashes.length ? crashes.map((c) => `${c.kind} — ${c.what}`.slice(0, 160)).join('; ') : 'none'}`);

  const final = (why) => ({ retry: false, why: `not run again: ${why}`, evidence });
  if (o.exit === 124 || o.exit === 137) return final('it ran out of its time');
  if (o.device !== 'alive') return final('the emulator no longer answers');
  if (crashes.length) return final(`the app crashed or froze during it — ${crashes[0].what.slice(0, 160)}`);

  const neverBegan = !!junit?.failed && steps === 0 && log.present && log.steps === 0;
  const death = junit?.cls && TRANSPORT_DEATHS.includes(junit.cls) ? junit.cls : (!junit?.firstLine && log.death) || null;
  let kind;
  if (neverBegan) kind = 'Maestro never began a step';
  else if (death && o.kind === 'probe') kind = `Maestro lost its connection to the phone (${death.split('.').pop()})`;
  else if (death) {
    const record = `${steps} step${steps === 1 ? '' : 's'} on record${log.present ? `, ${log.steps} in its log` : ', and no log of its own'}`;
    return final(`Maestro lost its driver (${death.split('.').pop()}) — no verdict on the app; but the records cannot show the flow never began (${record}), and a flow that may have saved something is never run twice`);
  }
  else if (!junit) return final('Maestro left no report to read');
  else return final('a step failed, which is the app\'s answer');

  if (o.attempt >= 2) return final(`${kind}, again, on its second attempt`);
  if (o.retries >= o.max) return final(`${kind}, but this run has already run ${o.retries} attempt${o.retries === 1 ? '' : 's'} again (the most it may)`);
  if (o.left < o.need) return final(`${kind}, but ${o.left}s are left and running it again needs ${o.need}s`);
  return { retry: true, why: `run again: ${kind}`, evidence };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.lastIndexOf(name); return i === -1 ? undefined : args[i + 1]; }; // the last one given wins
  const num = (name) => Number(opt(name) ?? NaN);
  const o = {
    kind: opt('--kind'), exit: num('--exit'), junit: opt('--junit'), debug: opt('--debug') ?? '', log: opt('--log'),
    left: num('--left'), need: num('--need'), retries: num('--retries'), max: num('--max'), device: opt('--device'),
    attempt: Number(opt('--attempt') ?? 1),
  };
  if (!['flow', 'probe'].includes(o.kind) || [o.exit, o.left, o.need, o.retries, o.max, o.attempt].some(Number.isNaN) || !['alive', 'gone'].includes(o.device)) {
    console.error('usage: node e2e/attempt.mjs --kind flow|probe --exit N --junit F --debug D --log F --left S --need S --retries N --max N --device alive|gone [--attempt N]');
    process.exit(2);
  }
  const d = decide(o);
  console.log([d.retry ? 'retry' : 'final', d.why, ...d.evidence.map((e) => `  ${e}`)].join('\n'));
  process.exit(d.retry ? 0 : 1);
}
