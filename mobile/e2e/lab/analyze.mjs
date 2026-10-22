#!/usr/bin/env node
/**
 * analyze.mjs — the speed lab's timed rounds, as numbers (WORKLIST P0.104).
 *
 *   node e2e/lab/analyze.mjs <lab-dir>           (the folder lab.sh filled: launches.tsv, runs/)
 *   node e2e/lab/analyze.mjs --diff <json>       ({a: [...], b: [...]}: one comparison)
 *
 * Per build, the median and 90th percentile of each measure over its fresh starts (data
 * cleared, as Maestro's clearState does). Then each build against A (the app as it is), as the
 * difference of medians with a permutation test's p. A measure is called different only when
 * its p, adjusted by Holm's method over all the measures of that comparison, is under 0.01:
 * thirty measures at 0.01 each would call one by chance about a quarter of the time. Z is A's
 * own APK installed as another build: if Z against A calls any measure different, the device
 * was not steady enough for any call, and the run fails. Seeded, so one folder always gives
 * one report.
 *
 * The log's measures (Displayed, the first screen ready, skipped and Davey frames) are read by
 * e2e/cold-start.mjs, the Sealed E2E's own cold-start table. RenderThread and the emulator's
 * software GPU do not transfer to phones; the report says so beside them.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readLaunches } from '../cold-start.mjs';

export const P_CALL = 0.01;
const PERMUTATIONS = 20000;

/** A seeded random number generator, so a folder always gives the same report. */
const seeded = (seed) => () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); const i = (s.length - 1) * p; const lo = Math.floor(i); return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo); };
const med = (xs) => q(xs, 0.5);

/**
 * b's median minus a's, and how often a random split of the pooled values differs at least as
 * much (the permutation test's two-sided p). Null with fewer than three values on a side.
 */
export function diff(a, b, seed = 20261022) {
  if (a.length < 3 || b.length < 3) return null;
  const rand = seeded(seed);
  const mid = med(b) - med(a);
  const pool = [...a, ...b];
  let hits = 0;
  for (let i = 0; i < PERMUTATIONS; i++) {
    for (let j = pool.length - 1; j > 0; j--) { const k = Math.floor(rand() * (j + 1)); [pool[j], pool[k]] = [pool[k], pool[j]]; }
    if (Math.abs(med(pool.slice(a.length)) - med(pool.slice(0, a.length))) >= Math.abs(mid) - 1e-9) hits++;
  }
  return { mid, p: (hits + 1) / (PERMUTATIONS + 1) };
}

/** Holm's step-down adjustment of a family of p values, in their own order. */
export function holm(ps) {
  const order = ps.map((p, i) => ({ p, i })).sort((x, y) => x.p - y.p);
  const out = new Array(ps.length);
  let floor = 0;
  order.forEach(({ p, i }, rank) => { floor = Math.max(floor, Math.min(1, p * (ps.length - rank))); out[i] = floor; });
  return out;
}

/** Every thread's CPU (ms) from one `/proc/<pid>/task/<tid>/stat` per line; null with none. */
function fromThreads(text, pid) {
  const cpu = { main: 0, render: 0, js: 0, glide: 0, gc: 0, okhttp: 0, total: 0 };
  for (const line of text.split('\n')) {
    const m = /^(\d+) \((.*)\) \S+ (.*)$/.exec(line.trim());
    if (!m) continue;
    const [, tid, name, restText] = m;
    const rest = restText.split(' ');
    // After the state, utime and stime are the 11th and 12th fields, in clock ticks of 10 ms.
    const ms = (+rest[10] + +rest[11]) * 10;
    if (!Number.isFinite(ms)) continue;
    cpu.total += ms;
    if (tid === pid) cpu.main += ms;
    else if (name === 'RenderThread') cpu.render += ms;
    else if (/^mqt_(v_)?js/.test(name)) cpu.js += ms;
    else if (/^glide-/.test(name)) cpu.glide += ms;
    else if (name === 'HeapTaskDaemon') cpu.gc += ms;
    else if (/^OkHttp/.test(name)) cpu.okhttp += ms;
  }
  return cpu.total ? cpu : null;
}

const kbIn = (text, re) => { const m = re.exec(text); return m ? +m[1] / 1024 : undefined; };
const numIn = (text, re) => { const m = re.exec(text); return m ? +m[1] : undefined; };

/** One fresh start's measures, from its files in runs/. */
export function launchOf(dir, row) {
  const [arm, n, pid, load, startSecs] = row.split('\t');
  const base = join(dir, 'runs', `${arm}-${n}`);
  const read = (ext) => (existsSync(`${base}.${ext}`) ? readFileSync(`${base}.${ext}`, 'utf8') : '');
  const am = read('am');
  const rec = { arm, n, pid, load: parseFloat(load), startSecs: +startSecs, totalTime: numIn(am, /TotalTime: (\d+)/) };
  const launch = readLaunches(read('log').split('\n')).find((l) => l.pid === pid);
  if (launch) {
    rec.displayed = launch.displayed ?? undefined;
    rec.ready = launch.ready?.after;
    rec.skipped = launch.skipped;
    rec.daveys = launch.daveys;
  }
  const snap = read('snap');
  const part = (from, to) => { const a = snap.indexOf(from); if (a < 0) return ''; const b = to ? snap.indexOf(to, a) : -1; return snap.slice(a, b < 0 ? undefined : b); };
  const cpu = fromThreads(part('PID', 'MEM'), pid);
  if (cpu) for (const [k, v] of Object.entries(cpu)) rec[`cpu_${k}`] = v;
  const mem = part('MEM', 'GFX');
  rec.pss = kbIn(mem, /TOTAL PSS:\s+(\d+)/) ?? kbIn(mem, /^\s*TOTAL\s+(\d+)/m);
  rec.native = kbIn(mem, /^\s*Native Heap:\s+(\d+)/m) ?? kbIn(mem, /^\s*Native Heap\s+(\d+)/m);
  rec.graphics = kbIn(mem, /^\s*Graphics:\s+(\d+)/m);
  const gfx = part('GFX');
  rec.frames = numIn(gfx, /Total frames rendered: (\d+)/);
  rec.janky = numIn(gfx, /Janky frames: (\d+)/);
  rec.frameP90 = numIn(gfx, /90th percentile: (\d+)ms/);
  return rec;
}

const EMULATOR_ONLY = ' (emulator only)';
export const METRICS = [
  ['totalTime', 'first frame (am TotalTime, ms)'],
  ['displayed', 'Displayed (ms)'],
  ['ready', 'first screen ready (ms after start)'],
  ['skipped', 'frames skipped by the main thread'],
  ['daveys', 'frames over 700 ms'],
  ['cpu_main', 'CPU, main thread (ms, 8 s)'],
  ['cpu_render', `CPU, RenderThread (ms)${EMULATOR_ONLY}`],
  ['cpu_js', 'CPU, JS thread (ms)'],
  ['cpu_glide', 'CPU, Glide threads (ms)'],
  ['cpu_gc', 'CPU, GC thread (ms)'],
  ['cpu_okhttp', 'CPU, network threads (ms)'],
  ['cpu_total', 'CPU, whole app (ms)'],
  ['pss', 'memory, total PSS (MB)'],
  ['native', 'memory, native heap (MB)'],
  ['graphics', `memory, graphics (MB)${EMULATOR_ONLY}`],
  ['frames', 'frames drawn'],
  ['janky', 'janky frames'],
  ['frameP90', `frame time p90 (ms)${EMULATOR_ONLY}`],
];

const fmt = (x) => (x == null || !Number.isFinite(x) ? '—' : Math.abs(x) >= 100 ? String(Math.round(x)) : x.toFixed(1));

/** The report's lines and whether the A/A pair stayed quiet. */
export function report(launches) {
  const arms = [...new Set(launches.map((r) => r.arm))];
  const vals = (arm, key) => launches.filter((r) => r.arm === arm && Number.isFinite(r[key])).map((r) => r[key]);
  const out = [`## The builds — median / p90 of ${arms.map((a) => `${a} ${launches.filter((r) => r.arm === a).length}`).join(', ')} fresh starts`];
  out.push(['measure'.padEnd(46), ...arms.map((a) => a.padStart(13))].join(''));
  for (const [key, label] of [...METRICS, ['load', 'device load at the start (1-min)']]) {
    out.push([label.padEnd(46), ...arms.map((a) => { const v = vals(a, key); return (v.length ? `${fmt(med(v))}/${fmt(q(v, 0.9))}` : '—').padStart(13); })].join(''));
  }
  out.push('', `## Each build against A: difference of medians, p from a permutation test, * where Holm's p < ${P_CALL}`);
  let quiet = true;
  for (const arm of arms.filter((a) => a !== 'A')) {
    const rows = METRICS.map(([key, label]) => ({ label, d: diff(vals('A', key), vals(arm, key)) })).filter((r) => r.d);
    const adjusted = holm(rows.map((r) => r.d.p));
    const called = rows.filter((_, i) => adjusted[i] < P_CALL);
    if (arm === 'Z' && called.length) quiet = false;
    out.push(`${arm} − A${arm === 'Z' ? ' (the same APK twice: noise alone, and must call nothing)' : ''}`);
    if (!rows.length) out.push('  (too few starts)');
    rows.forEach((r, i) => out.push(`  ${adjusted[i] < P_CALL ? '*' : ' '} ${r.label.padEnd(46)} ${fmt(r.d.mid).padStart(7)}  p ${r.d.p.toFixed(4)}  Holm ${adjusted[i].toFixed(4)}`));
  }
  if (!arms.includes('Z')) quiet = false;
  out.push('', quiet ? 'A/A: Z against A calls nothing: the device was steady.' : 'A/A: FAILED — Z against A called a difference (or Z never ran), so no call above can be trusted.');
  return { lines: out, quiet };
}

function main() {
  const at = process.argv.indexOf('--diff');
  if (at >= 0) {
    const { a, b } = JSON.parse(readFileSync(process.argv[at + 1], 'utf8'));
    console.log(JSON.stringify(diff(a, b)));
    return;
  }
  const dir = process.argv[2];
  if (!dir || !existsSync(join(dir, 'launches.tsv'))) {
    console.error('usage: node e2e/lab/analyze.mjs <lab-dir holding launches.tsv>');
    process.exit(2);
  }
  const rows = readFileSync(join(dir, 'launches.tsv'), 'utf8').split('\n').filter(Boolean);
  const { lines, quiet } = report(rows.map((row) => launchOf(dir, row)));
  console.log(lines.join('\n'));
  process.exit(quiet ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
