#!/usr/bin/env node
/**
 * ios-launch.cjs — the verdict on one launch of the app on an iPhone
 * simulator (ios-launch.yml).
 *
 *   node mobile/e2e/ios-launch.cjs <samples> <js-log> <launched-at-epoch-s> [reports-dir]
 *
 * <samples> holds one line per second after the launch: "<seconds> <pid>",
 * the pid launchd lists for the app, or "-" when none runs. Its clock starts
 * when the app's process first appears, not when the launch was asked for, so
 * a slow simulator is never read as a crash. The app passes when:
 *   - the same process is running 5 s and 25 s after it appeared;
 *   - its first screen said it was ready (in the JS log);
 *   - no crash report for it was written since the launch.
 * Exit 0: it passed. Exit 1: the app failed: it died, came back as another
 * process or left a crash report; never tried again. Exit 2: the simulator
 * never started it, or too late to watch for 25 s. Exit 3: it stayed up with
 * no crash report but its first screen was not ready within 25 s, which a
 * fresh simulator's first launch can take (run 38698154462: its JavaScript
 * began 31 s after its process). Exits 2 and 3 get once more; a second 3 is
 * the app's failure.
 */
const { existsSync, readFileSync, readdirSync, statSync } = require('fs');
const { homedir } = require('os');
const { join } = require('path');

const READY = '[e2e] screen.ready {"name":"welcome"';
const WATCH = [5, 25];

/** {code, line} for these samples, whether it drew, and the crash reports since the launch. */
const verdict = ({ samples, ready, reports }) => {
  const running = samples.filter((s) => /^\d+$/.test(s.pid));
  if (reports.length) return { code: 1, line: `the app crashed: ${reports.length} crash report(s) since the launch (${reports.join(', ')})` };
  if (!running.length) return { code: 2, line: 'the simulator never started the app' };
  const first = running[0];
  const last = samples[samples.length - 1];
  if (last.t < first.t + WATCH[1]) return { code: 2, line: `the app started at ${first.t} s, too late to watch it for ${WATCH[1]} s` };
  for (const w of WATCH) {
    const at = samples.find((s) => s.t >= first.t + w);
    if (at.pid !== first.pid) {
      return { code: 1, line: `the app's process ${first.pid} was not running ${w} s after it started (${at.pid === '-' ? 'none' : `process ${at.pid}`})` };
    }
  }
  if (!ready) return { code: 3, line: `the app ran ${WATCH[1]} s but its first screen never said it was ready` };
  return { code: 0, line: `alive at ${WATCH.join(' s and ')} s (process ${first.pid}, started at ${first.t} s); first screen ready; no crash report` };
};

const readSamples = (text) => text.split(/\r?\n/).filter(Boolean).map((l) => {
  const [t, pid] = l.trim().split(/\s+/);
  return { t: Number(t), pid: pid ?? '-' };
});

/** The app's crash reports written at or after the launch. */
const reportsSince = (dir, epochS) => (existsSync(dir) ? readdirSync(dir) : [])
  .filter((f) => /reelhouse|society/i.test(f) && /\.(ips|crash)$/.test(f))
  .filter((f) => statSync(join(dir, f)).mtimeMs >= epochS * 1000);

if (require.main === module) {
  const [samplesFile, logFile, launchedAt, dir = join(homedir(), 'Library', 'Logs', 'DiagnosticReports')] = process.argv.slice(2);
  const v = verdict({
    samples: readSamples(readFileSync(samplesFile, 'utf8')),
    ready: existsSync(logFile) && readFileSync(logFile, 'utf8').includes(READY),
    reports: reportsSince(dir, Number(launchedAt)),
  });
  console.log(v.line);
  process.exit(v.code);
}

module.exports = { readSamples, reportsSince, verdict };
