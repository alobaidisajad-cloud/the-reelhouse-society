#!/usr/bin/env node
/**
 * analyze.mjs — the cold-start study's numbers, from what ab.sh left in a folder.
 *
 *   node e2e/study/analyze.mjs <study-dir>
 *
 * Per build (A B C D) and kind of start (fresh = data cleared, returning = kept):
 * the median and 90th percentile of each measure, then each comparison that the
 * study exists for, as the median difference with a 95% bootstrap interval. A
 * difference counts only when its interval leaves out zero. Seeded, so the same
 * folder always gives the same report.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir || !existsSync(join(dir, 'launches.tsv'))) {
  console.error('usage: node e2e/study/analyze.mjs <study-dir holding launches.tsv>');
  process.exit(2);
}
const ORIG = '[-2147483648x-2147483648]';
const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
const stamp = (line) => {
  const m = /^\d\d-\d\d (\d\d):(\d\d):(\d\d\.\d\d\d)/.exec(line);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : null;
};

function fromLog(text, pid) {
  const r = { skipped: 0, daveys: 0, daveyMs: 0, nativeGcs: 0, nativeGcMs: 0, decodes: 0, downloads: 0, viewLoads: 0, splashTimeout: 0 };
  let t0 = null;
  for (const line of text.split('\n')) {
    const t = stamp(line);
    if (t == null) continue;
    let m;
    if ((m = /Start proc (\d+):com\.reelhouse\.society/.exec(line)) && m[1] === pid) t0 = t;
    if (t0 == null) continue;
    const dt = +(t - t0).toFixed(3);
    if (dt > 9) continue;
    if ((m = /Displayed com\.reelhouse\.society\/\.MainActivity.*: \+(?:(\d+)s)?(\d+)ms/.exec(line))) r.displayedMs = (+(m[1] ?? 0)) * 1000 + +m[2];
    if (/transferring splash screen timeout/.test(line) && line.includes('reelhouse')) r.splashTimeout = 1;
    const p = line.trim().split(/\s+/)[2];
    if (p !== pid) continue;
    if (/Running "main"/.test(line)) r.jsMain = dt * 1000;
    if ((m = /screen\.ready \{"name":"(\w+)","ms":(\d+)/.exec(line)) && r.ready == null) { r.screen = m[1]; r.ready = dt * 1000; }
    if (/Building from parcel/.test(line)) r.parcel = dt * 1000;
    if ((m = /Skipped (\d+) frames/.exec(line))) r.skipped += +m[1];
    if ((m = /Davey! duration=(\d+)ms/.exec(line))) { r.daveys++; r.daveyMs += +m[1]; }
    if ((m = /NativeAlloc concurrent copying GC.*total ([\d.]+)(ms|s)\b/.exec(line))) { r.nativeGcs++; r.nativeGcMs += m[2] === 's' ? m[1] * 1000 : +m[1]; }
    if (/Glide/.test(line) && /Finished loading/.test(line)) {
      if (line.includes(ORIG)) {
        if (/Finished loading File /.test(line)) r.downloads++;
        else r.decodes++;
      } else r.viewLoads++;
    }
  }
  if (r.parcel != null && r.displayedMs != null && t0 != null) r.handover = r.parcel; // ms from process start
  return r;
}

function fromThreads(text, pid) {
  const cpu = { main: 0, render: 0, js: 0, glide: 0, gc: 0, okhttp: 0, total: 0 };
  // Each line is a thread's /proc/<pid>/task/<tid>/stat: "tid (name) state ...";
  // after the state, utime and stime are the 11th and 12th fields (clock ticks).
  for (const line of text.split('\n')) {
    const m = /^(\d+) \((.*)\) \S+ (.*)$/.exec(line.trim());
    if (!m) continue;
    const [, tid, name, restText] = m;
    const rest = restText.split(' ');
    const u = +rest[10];
    const s = +rest[11];
    if (!Number.isFinite(u) || !Number.isFinite(s)) continue;
    const ms = (u + s) * 10;
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

function fromMem(text) {
  const kb = (re) => { const m = re.exec(text); return m ? +m[1] : undefined; };
  return {
    pssMb: kb(/TOTAL PSS:\s+(\d+)/) ?? kb(/^\s*TOTAL\s+(\d+)/m),
    nativeMb: kb(/^\s*Native Heap:\s+(\d+)/m) ?? kb(/^\s*Native Heap\s+(\d+)/m),
    graphicsMb: kb(/^\s*Graphics:\s+(\d+)/m),
  };
}

function fromGfx(text) {
  const n = (re) => { const m = re.exec(text); return m ? +m[1] : undefined; };
  return { frames: n(/Total frames rendered: (\d+)/), janky: n(/Janky frames: (\d+)/), p90: n(/90th percentile: (\d+)ms/), p99: n(/99th percentile: (\d+)ms/) };
}

const launches = read(join(dir, 'launches.tsv')).trim().split('\n').filter(Boolean).map((l) => {
  const [arm, mode, n, pid, load, startSecs, measureSecs] = l.split('\t');
  const f = join(dir, 'runs', `${arm}-${mode}-${n}`);
  const am = read(`${f}.am`);
  const total = /TotalTime: (\d+)/.exec(am);
  const rec = { arm, mode, n, pid, load: parseFloat(load), startSecs: +startSecs, measureSecs: +measureSecs, totalTime: total ? +total[1] : undefined, ...fromLog(read(`${f}.log`), pid) };
  const snap = read(`${f}.snap`);
  const part = (from, to) => { const a = snap.indexOf(from); if (a < 0) return ''; const b = to ? snap.indexOf(to, a) : -1; return snap.slice(a, b < 0 ? undefined : b); };
  const cpu = fromThreads(part('PID', 'MEM'), pid);
  if (cpu) for (const [k, v] of Object.entries(cpu)) rec[`cpu_${k}`] = v;
  const mem = fromMem(part('MEM', 'GFX'));
  rec.pss = mem.pssMb != null ? mem.pssMb / 1024 : undefined;
  rec.native = mem.nativeMb != null ? mem.nativeMb / 1024 : undefined;
  rec.graphics = mem.graphicsMb != null ? mem.graphicsMb / 1024 : undefined;
  const gfx = fromGfx(part('GFX'));
  rec.frames = gfx.frames; rec.janky = gfx.janky; rec.frameP90 = gfx.p90;
  return rec;
}).filter((r) => r.mode !== 'discard');

// ── statistics ──
let seed = 20261007;
const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); const i = (s.length - 1) * p; const lo = Math.floor(i); return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo); };
const med = (xs) => q(xs, 0.5);
const vals = (arm, mode, key) => launches.filter((r) => r.arm === arm && r.mode === mode && Number.isFinite(r[key])).map((r) => r[key]);
// Permutation test on the difference of medians: how often a random split of
// the pooled starts differs at least as much as the real one. Small samples and
// many measures, so a difference is called only at p < 0.01 — and the A/A pair
// (Z is A's own APK, installed as another build) shows what noise alone calls.
function diff(a, b) {
  if (a.length < 3 || b.length < 3) return null;
  const obs = med(b) - med(a);
  const pool = [...a, ...b];
  let hits = 0;
  const N = 10000;
  for (let i = 0; i < N; i++) {
    for (let j = pool.length - 1; j > 0; j--) { const k = Math.floor(rand() * (j + 1)); [pool[j], pool[k]] = [pool[k], pool[j]]; }
    const d = med(pool.slice(a.length)) - med(pool.slice(0, a.length));
    if (Math.abs(d) >= Math.abs(obs) - 1e-9) hits++;
  }
  return { mid: obs, p: (hits + 1) / (N + 1) };
}

const METRICS = [
  ['totalTime', 'first frame (am TotalTime, ms)'],
  ['displayedMs', 'Displayed (ms)'],
  ['jsMain', 'JS starts (ms after process)'],
  ['ready', 'first screen ready (ms after process)'],
  ['handover', 'splash handed over (ms after process)'],
  ['splashTimeout', 'splash timeouts (per start)'],
  ['skipped', 'frames skipped by main thread'],
  ['daveys', 'frames over 700 ms'],
  ['daveyMs', 'time in frames over 700 ms (ms)'],
  ['nativeGcs', 'native-memory GCs'],
  ['nativeGcMs', 'native-memory GC time (ms)'],
  ['decodes', 'prefetch decodes (full size)'],
  ['downloads', 'prefetch downloads (no decode)'],
  ['viewLoads', 'image loads by views'],
  ['cpu_main', 'CPU, main thread (ms, 8 s)'],
  ['cpu_render', 'CPU, RenderThread (ms)'],
  ['cpu_js', 'CPU, JS thread (ms)'],
  ['cpu_glide', 'CPU, Glide threads (ms)'],
  ['cpu_gc', 'CPU, GC thread (ms)'],
  ['cpu_okhttp', 'CPU, network threads (ms)'],
  ['cpu_total', 'CPU, whole app (ms)'],
  ['pss', 'memory, total PSS (MB)'],
  ['native', 'memory, native heap (MB)'],
  ['graphics', 'memory, graphics (MB)'],
  ['frames', 'frames drawn'],
  ['janky', 'janky frames'],
  ['frameP90', 'frame time p90 (ms)'],
  ['load', 'device load at launch (1-min)'],
  ['startSecs', 'seconds the start took (host clock)'],
  ['measureSecs', 'seconds the measuring took'],
];
const ARMS = ['A', 'Z', 'B', 'C', 'E', 'S', 'P'];
const fmt = (x) => (x == null || !Number.isFinite(x) ? '—' : Math.abs(x) >= 100 ? String(Math.round(x)) : x.toFixed(1));

for (const mode of ['fresh']) {
  const counts = ARMS.map((a) => `${a}=${launches.filter((r) => r.arm === a && r.mode === mode).length}`).join(' ');
  console.log(`\n## ${mode} starts (${counts}) — median / p90`);
  console.log(['measure'.padEnd(40), ...ARMS.map((a) => a.padStart(13))].join(''));
  for (const [key, label] of METRICS) {
    const cells = ARMS.map((a) => { const v = vals(a, mode, key); return v.length ? `${fmt(med(v))}/${fmt(q(v, 0.9))}`.padStart(13) : '—'.padStart(13); });
    console.log([label.padEnd(40), ...cells].join(''));
  }
  console.log(`\n## ${mode}: differences in medians (p from a permutation test; * = p < 0.01)`);
  for (const [x, y, what] of [['A', 'Z', 'Z−A: the same APK twice (noise alone)'], ['A', 'B', 'B−A: the fix'], ['B', 'C', 'C−B: the two full-screen SVGs removed'], ['B', 'E', 'E−B: the light as native gradients'], ['B', 'S', 'S−B: expo-image from source (Glide logs off)'], ['A', 'P', 'P−A: download-only prefetch']]) {
    const lines = [];
    for (const [key, label] of METRICS) {
      if (key === 'load') continue;
      const d = diff(vals(x, mode, key), vals(y, mode, key));
      if (!d) continue;
      const sure = d.p < 0.01;
      if (sure || ['totalTime', 'cpu_main', 'cpu_total', 'decodes', 'nativeGcMs', 'handover', 'skipped'].includes(key)) {
        lines.push(`  ${sure ? '*' : ' '} ${label.padEnd(38)} ${fmt(d.mid).padStart(7)}  p=${d.p.toFixed(4)}`);
      }
    }
    console.log(`${what}\n${lines.join('\n') || '  (too few starts)'}`);
  }
}
