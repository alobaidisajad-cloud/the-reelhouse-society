#!/usr/bin/env node
/**
 * flow-history.mjs — how long each part of the sealed E2E takes, run after run,
 * and the shard map that history makes.
 *
 * Each shard of e2e.yml writes, in its e2e-logs, the device clock as each part
 * began (flow-times.txt: a flow, a keyboard probe, each attempt), as its flows
 * began (flows-began.txt, before the launch with animations on) and as they
 * ended (flows-ended.txt). A part's time is from its start to the next one's,
 * the phone's settling between them included; the launch's is from the flows'
 * beginning to the first part. A run written before the two marks times its
 * launch from Android stopping the app for it (the launch's first act, in the
 * device log), and its shard's last part only when that shard's job passed
 * (the device log's last line is then its end).
 *
 * The map (e2e/shards.json) is what shardsFrom makes of e2e/flow-history.json,
 * held by shards.test.ts: each part weighs its slower-end time (the 90th
 * percentile of its runs, nearest rank), shard 1 keeps the launch and the
 * keyboard probes, each flow goes to the lightest shard (heaviest first), and
 * each shard's minutes are its weight and a quarter more, so a slow runner's
 * day is inside it. A flow too new to have runs is weighed by an estimate
 * (UNMEASURED_SECONDS) and named in the map's firstRuns, with why, until its
 * first runs are added.
 *
 *   node mobile/e2e/flow-history.mjs --add <run id>...   the runs' parts, added to the history
 *   node mobile/e2e/flow-history.mjs --map               the map the history makes
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const HISTORY = join(HERE, 'flow-history.json');
const MAP = join(HERE, 'shards.json');
/** Kept: the newest runs only, so the map follows the runners as they are now. */
export const KEEP_RUNS = 30;
/** A part with no sample yet: the slowest flow's share, until one is measured. */
export const UNMEASURED_SECONDS = 420;
/** Each shard's minutes: its weight, and this much more. */
export const MARGIN = 1.25;
/** The parts only shard 1 runs, with the probes and the launch. */
export const FIRST_SHARD_PARTS = ['launch', 'stack probe', 'log probe'];

/** A device clock ("MM-DD HH:MM:SS.mmm") in seconds; null when it is not one. */
export const clockSeconds = (text) => {
  const m = /^(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)(?:\.(\d+))?/.exec(String(text ?? '').trim());
  if (!m) return null;
  const [, mo, d, h, mi, s, ms = '0'] = m;
  return Date.UTC(2026, Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s), Number(ms.padEnd(3, '0').slice(0, 3))) / 1000;
};

/**
 * One shard's parts and their seconds, from its e2e-logs folder. passed: the
 * shard's job passed (so an old run's device log ends where its flows did).
 */
export const partsOf = (dir, passed) => {
  const read = (f) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8').replace(/\r/g, '') : '');
  const starts = read('flow-times.txt').split('\n').filter(Boolean).map((l) => {
    const [part, , clock] = l.split('\t');
    return { part, at: clockSeconds(clock) };
  }).filter((s) => s.at !== null);
  if (!starts.length) return [];
  // An older run's launch began as Android stopped the app for it (its first act), on the shard that ran it.
  const launched = /^launch yes$/m.test(read('shard-plan.txt'))
    ? clockSeconds(read('logcat-stream.txt').split('\n').find((l) => / ActivityManager: Force stopping com\.reelhouse\.society /.test(l)))
    : null;
  const began = clockSeconds(read('flows-began.txt')) ?? (launched !== null && launched < starts[0].at ? launched : null);
  let ended = clockSeconds(read('flows-ended.txt'));
  if (ended === null && passed) {
    const last = read('logcat-stream.txt').trimEnd().split('\n').pop();
    ended = clockSeconds(last);
  }
  const seconds = new Map();
  const add = (part, s) => seconds.set(part, (seconds.get(part) ?? 0) + s);
  if (began !== null) add('launch', starts[0].at - began);
  starts.forEach((s, i) => {
    const next = i + 1 < starts.length ? starts[i + 1].at : ended;
    if (next !== null) add(s.part, next - s.at);
  });
  // A part whose last attempt has no end is not measured at all, nor one the
  // budget stopped: its time is only as long as was left.
  const last = starts[starts.length - 1].part;
  if (ended === null) seconds.delete(last);
  for (const part of seconds.keys()) {
    if (/ran out of its time/.test(read(join('flow-hierarchy', `${part}.verdict`)))) seconds.delete(part);
  }
  return [...seconds].map(([part, s]) => ({ part, seconds: Math.round(s) }));
};

/** The nearest-rank 90th percentile. */
const p90 = (xs) => [...xs].sort((a, b) => a - b)[Math.max(0, Math.ceil(0.9 * xs.length) - 1)];

/** Each part's weight, in seconds, from the history's samples. */
export const weightsFrom = (history) => {
  const by = new Map();
  for (const s of history.samples) by.set(s.part, [...(by.get(s.part) ?? []), s.seconds]);
  return Object.fromEntries([...by].sort(([a], [b]) => a.localeCompare(b)).map(([part, xs]) => [part, p90(xs)]));
};

/** The shard map the history makes for these flows, on this many shards. */
export const shardsFrom = (history, flows, count = 3) => {
  const weights = weightsFrom(history);
  const weight = (part) => weights[part] ?? UNMEASURED_SECONDS;
  const shards = Array.from({ length: count }, (_, i) => ({
    ...(i === 0 ? { keyboardProbes: true, launchWithAnimations: true } : {}),
    flows: [],
    load: i === 0 ? FIRST_SHARD_PARTS.reduce((sum, p) => sum + weight(p), 0) : 0,
  }));
  const heaviestFirst = [...flows].sort((a, b) => weight(b) - weight(a) || a.localeCompare(b));
  for (const flow of heaviestFirst) {
    const lightest = shards.reduce((best, s) => (s.load < best.load ? s : best));
    lightest.flows.push(flow);
    lightest.load += weight(flow);
  }
  return shards.map(({ load, flows: own, ...rest }) => ({
    ...rest,
    flows: own.sort(),
    minutes: Math.ceil((load * MARGIN) / 60),
  }));
};

/** The flows the runner runs, by name, from the shared file list. */
export const flowNames = () => createRequire(import.meta.url)('../test-utils/universe.js').files('runFlows')
  .map((f) => basename(f, '.yaml')).sort();

/** Add each run's parts (every shard's) to the history; runs already in it are left. */
const add = (runs) => {
  const history = JSON.parse(readFileSync(HISTORY, 'utf8'));
  for (const run of runs) {
    if (history.samples.some((s) => s.run === Number(run))) { console.log(`${run}: already in the history`); continue; }
    const jobs = JSON.parse(execFileSync('gh', ['run', 'view', String(run), '--json', 'jobs'], { encoding: 'utf8' })).jobs;
    const tmp = mkdtempSync(join(tmpdir(), 'flow-history-'));
    try {
      let added = 0;
      for (const job of jobs) {
        const m = /shard (\d+) of/.exec(job.name);
        if (!m) continue;
        const dir = join(tmp, m[1]);
        // A shard with no logs is said; any other failure ends the run, in gh's words.
        try {
          execFileSync('gh', ['run', 'download', String(run), '-n', `e2e-logs-${m[1]}`, '-D', dir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        } catch (e) {
          const said = String(e.stderr || e.message).trim();
          if (!/no (valid )?artifacts?\b/i.test(said)) throw new Error(`${run} shard ${m[1]}: the logs could not be downloaded: ${said}`);
          console.log(`${run} shard ${m[1]}: no logs`);
          continue;
        }
        for (const p of partsOf(dir, job.conclusion === 'success')) {
          history.samples.push({ run: Number(run), shard: Number(m[1]), ...p });
          added++;
        }
      }
      console.log(`${run}: ${added} part(s)`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
  const newest = [...new Set(history.samples.map((s) => s.run))].sort((a, b) => b - a).slice(0, KEEP_RUNS);
  history.samples = history.samples.filter((s) => newest.includes(s.run))
    .sort((a, b) => a.run - b.run || a.shard - b.shard || a.part.localeCompare(b.part));
  writeFileSync(HISTORY, `${JSON.stringify(history, null, 2)}\n`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args[0] === '--add' && args.length > 1) add(args.slice(1));
  else if (args[0] === '--map') {
    const history = JSON.parse(readFileSync(HISTORY, 'utf8'));
    const map = JSON.parse(readFileSync(MAP, 'utf8'));
    console.log(JSON.stringify({ ...map, shards: shardsFrom(history, flowNames(), map.shards.length) }, null, 2));
  } else {
    console.error('usage: node mobile/e2e/flow-history.mjs --add <run id>... | --map');
    process.exit(2);
  }
}
