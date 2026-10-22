#!/usr/bin/env node
/**
 * scrolls.mjs — the signed-in lab's timed scrolls, judged (WORKLIST P0.104).
 *
 *   node e2e/lab/scrolls.mjs <scrolls-dir>        (the folder scrolls.sh filled)
 *
 * For each screen and round (<name>-<round>.moves and .gfx): whether the list moved on each of the
 * first FAR swipes (every swipe is 60% of the screen, so FAR of them are three screen heights; a
 * swipe that left the screen as it was means the list ran out), and Android's own frame counts for
 * the scroll (dumpsys gfxinfo, reset just before it): frames drawn, janky frames, and the 50th, 90th
 * and 99th percentile frame times. The emulator draws with a software GPU, so frame times are this
 * runner's, compared build to build, never a phone's. A screen whose list stopped short, or whose
 * scroll was never measured, fails by name; it prints the table and exits 1 on any. With a reel/
 * folder (the Reel on A and on its arms, WORKLIST P0.111), it prints what each layer costs too
 * (costs): named, not judged, so the fix can follow the numbers.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { holm, P_CALL } from './analyze.mjs';

export const FAR = 5;

/** How many of the first FAR swipes moved the screen, from the hashes taken before and after each. */
export function moved(text) {
  const hashes = text.split('\n').map((l) => /^([0-9a-f]{32})\b/.exec(l.trim())?.[1]).filter(Boolean);
  let n = 0;
  for (let i = 1; i <= FAR && i < hashes.length; i++) {
    if (hashes[i] === hashes[i - 1]) break;
    n++;
  }
  return { swipes: hashes.length - 1, moved: n };
}

/** The scroll's frame counts from dumpsys gfxinfo; null when it measured nothing. */
export function framesOf(text) {
  const n = (re) => { const m = re.exec(text); return m ? +m[1] : null; };
  const frames = n(/Total frames rendered: (\d+)/);
  if (!frames) return null;
  return { frames, janky: n(/Janky frames: (\d+)/), p50: n(/50th percentile: (\d+)ms/), p90: n(/90th percentile: (\d+)ms/), p99: n(/99th percentile: (\d+)ms/) };
}

/** Every screen-round in the folder, judged: { lines, failed }. */
export function judge(dir) {
  const read = (f) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : '');
  const runs = readdirSync(dir).filter((f) => f.endsWith('.moves')).map((f) => f.replace(/\.moves$/, '')).sort();
  const lines = [`screen        frames  janky   p50   p90   p99  moved (of the first ${FAR} swipes)`];
  const failed = [];
  for (const run of runs) {
    const m = moved(read(`${run}.moves`));
    const f = framesOf(read(`${run}.gfx`));
    const cell = (v) => String(v ?? '—').padStart(5);
    lines.push(`${run.padEnd(12)} ${cell(f?.frames).padStart(6)} ${cell(f?.janky).padStart(6)} ${cell(f?.p50)} ${cell(f?.p90)} ${cell(f?.p99)}  ${m.moved}/${FAR}`);
    if (m.moved < FAR) failed.push(`${run}: the list stopped after ${m.moved} of ${FAR} swipes: it holds less than three screen heights`);
    if (!f) failed.push(`${run}: no frames were measured for its scroll`);
  }
  if (runs.length === 0) failed.push('no screen was scrolled');
  return { lines, failed };
}

/** A screen's opening time from its device log (useScreenReady's line); null when it never said. */
export function readyOf(text, name = 'reel') {
  const at = text.indexOf(`[e2e] screen.ready {"name":"${name}","ms":`);
  if (at < 0) return null;
  const ms = Number.parseInt(text.slice(at + `[e2e] screen.ready {"name":"${name}","ms":`.length), 10);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * The JavaScript tasks over 50 ms a run's device log counts (LabFrameLog's lines, in the lab's
 * builds); null when the record never ran (no `lab.frames.on`), so a build without it reads blank.
 */
export function jsLongOf(text) {
  if (!text.includes('[e2e] lab.frames.on ')) return null;
  let long = 0;
  for (const m of text.matchAll(/\[e2e\] lab\.frames (\{.*\})/g)) {
    try { long += JSON.parse(m[1]).js?.long ?? 0; } catch { /* a line cut short by the log is not a count */ }
  }
  return long;
}

/**
 * The Reel's measures, each read from one round: its opening, the frames its ten swipes drew (more
 * is smoother), and its middle and slow frame times. Not the janky share: on the lab's software GPU
 * every frame is janky (speed lab 39810996153: janky = frames on every screen), so it tells no build
 * from another.
 */
export const REEL_MEASURES = [
  { key: 'ready', head: 'opened ms', of: (r) => r.ready },
  { key: 'frames', head: 'frames', of: (r) => r.frames },
  { key: 'p50', head: 'p50 ms', of: (r) => r.p50 },
  { key: 'p90', head: 'p90 ms', of: (r) => r.p90 },
  { key: 'js', head: 'JS over 50 ms', of: (r) => r.jsLong },
];

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const i = (s.length - 1) / 2; return (s[Math.floor(i)] + s[Math.ceil(i)]) / 2; };

/**
 * b against a: the difference of their medians, and a rank-sum permutation test's two-sided p.
 * Ranks, not medians, decide p: the lab's values tie often (gfxinfo's frame times come in 50 ms
 * steps; the counts are small whole numbers), and a test of medians loses its power to ties (two
 * groups apart by every value gave p 0.0015 on medians, under 0.0001 on ranks). Null with fewer
 * than three values on a side.
 */
export function rankDiff(a, b, seed = 20261022) {
  if (a.length < 3 || b.length < 3) return null;
  const pool = [...a, ...b];
  const order = pool.map((v, i) => ({ v, i })).sort((x, y) => x.v - y.v);
  const rank = new Array(pool.length);
  for (let s = 0; s < order.length;) {
    let e = s;
    while (e + 1 < order.length && order[e + 1].v === order[s].v) e++;
    for (let k = s; k <= e; k++) rank[order[k].i] = (s + e) / 2 + 1;
    s = e + 1;
  }
  const gap = (ranks) => ranks.slice(a.length).reduce((t, r) => t + r, 0) / b.length - ranks.slice(0, a.length).reduce((t, r) => t + r, 0) / a.length;
  const seen = Math.abs(gap(rank));
  let state = seed;
  const rand = () => { state = (state * 1103515245 + 12345) % 2147483648; return state / 2147483648; };
  const shuffled = [...rank];
  let hits = 0;
  const TRIES = 20000;
  for (let t = 0; t < TRIES; t++) {
    for (let j = shuffled.length - 1; j > 0; j--) { const k = Math.floor(rand() * (j + 1)); [shuffled[j], shuffled[k]] = [shuffled[k], shuffled[j]]; }
    if (Math.abs(gap(shuffled)) >= seen - 1e-9) hits++;
  }
  return { mid: median(b) - median(a), p: (hits + 1) / (TRIES + 1) };
}

/**
 * What each of the Reel's layers costs (WORKLIST P0.111), from scrolls.sh's reel/ folder
 * (<build>-<round>): per build, each measure's median over its rounds, and each arm against A, its
 * difference called (*) when its Holm-adjusted rank-sum p (rankDiff) is under P_CALL. A round that did not
 * scroll three screen heights, or measured no frames, is left out and named: { lines, failed }.
 */
export function costs(dir) {
  const read = (f) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : '');
  const builds = new Map();
  const failed = [];
  for (const run of readdirSync(dir).filter((f) => f.endsWith('.moves')).map((f) => f.replace(/\.moves$/, '')).sort()) {
    const f = framesOf(read(`${run}.gfx`));
    const m = moved(read(`${run}.moves`));
    if (!f) { failed.push(`reel ${run}: no frames were measured for its scroll`); continue; }
    if (m.moved < FAR) { failed.push(`reel ${run}: the list stopped after ${m.moved} of ${FAR} swipes`); continue; }
    const build = run.replace(/-\d+$/, '');
    const log = read(`${run}.log`);
    builds.set(build, [...(builds.get(build) ?? []), { ...f, ready: readyOf(log), jsLong: jsLongOf(log) }]);
  }
  const base = builds.get('A') ?? [];
  if (base.length === 0) failed.push('reel: A, the app as it is, was never scrolled: nothing to compare');
  const values = (rows, m) => rows.map(m.of).filter((v) => v != null);
  const arms = [...builds.keys()].filter((b) => b !== 'A').sort();
  const tests = arms.flatMap((arm) => REEL_MEASURES.map((m) => ({ arm, key: m.key, d: rankDiff(values(base, m), values(builds.get(arm), m)) })));
  const adjusted = holm(tests.map((t) => t.d?.p ?? 1));
  const called = new Map(tests.map((t, i) => [`${t.arm} ${t.key}`, { ...t, p: adjusted[i] }]));
  const cell = (rows, m, arm) => {
    const xs = values(rows, m);
    if (xs.length === 0) return '—'.padStart(18);
    const t = arm && called.get(`${arm} ${m.key}`);
    const shift = t?.d ? ` ${t.d.mid >= 0 ? '+' : ''}${Math.round(t.d.mid * 10) / 10}${t.p < P_CALL ? '*' : ' '}` : '';
    return `${Math.round(median(xs) * 10) / 10}${shift}`.padStart(18);
  };
  const lines = [
    `The Reel, opened cold and scrolled, on A and each arm (* = differs from A, Holm p < ${P_CALL})`,
    `build  rounds${REEL_MEASURES.map((m) => m.head.padStart(18)).join('')}`,
    ...['A', ...arms].filter((b) => builds.has(b)).map((b) =>
      `${b.padEnd(6)} ${String(builds.get(b).length).padStart(6)}${REEL_MEASURES.map((m) => cell(builds.get(b), m, b === 'A' ? null : b)).join('')}`),
  ];
  return { lines, failed };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir || !existsSync(dir)) { console.error('usage: node e2e/lab/scrolls.mjs <scrolls-dir>'); process.exit(2); }
  const judged = judge(dir);
  const reel = existsSync(join(dir, 'reel')) ? costs(join(dir, 'reel')) : { lines: [], failed: [] };
  const lines = [...judged.lines, ...(reel.lines.length ? ['', ...reel.lines] : [])];
  const failed = [...judged.failed, ...reel.failed];
  console.log([...lines, '', ...(failed.length ? ['FAILED:', ...failed] : ['every list held three screen heights, and every scroll was measured'])].join('\n'));
  process.exit(failed.length ? 1 : 0);
}
