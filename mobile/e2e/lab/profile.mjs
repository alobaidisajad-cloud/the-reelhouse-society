#!/usr/bin/env node
/**
 * A Hermes sampling profile of a screen's opening (the lab's Pr build, e2e/lab/arm.mjs), read as
 * where the JavaScript thread's time went: each function's own time (the samples it was running
 * in) and its total (the samples it was anywhere on the stack in), the heaviest first.
 *
 *   node e2e/lab/profile.mjs <trace.cpuprofile> [--top N]
 *
 * The trace is Hermes's Chrome trace (samples, each naming a stack frame, each frame its parent),
 * symbolicated first by metro-symbolicate against the build's own source map, so a frame names
 * its function and file as written, not as the minified bundle has it.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * A frame as a reader knows it: its function and its file. metro-symbolicate names each frame
 * `fn(file:line:column)` at the sampled spot, so one function sampled at two lines would read as
 * two; the line and column go, and the function is counted once.
 */
export const frameName = (f) => (f.name || '(anonymous)').replace(/:(\d+|null):(\d+|null)\)$/, ')');

/**
 * Each function's own and total milliseconds, from a trace's samples and stack frames. A sample's
 * weight is the time until the next one (the last weighs as the one before it): Hermes samples on
 * a timer, so the gaps are the time each stack held the thread.
 */
export function where(trace) {
  const frames = trace.stackFrames ?? {};
  const samples = [...(trace.samples ?? [])].sort((a, b) => Number(a.ts) - Number(b.ts));
  const own = new Map();
  const total = new Map();
  let all = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const next = samples[i + 1];
    const prev = samples[i - 1];
    const us = next ? Number(next.ts) - Number(s.ts) : prev ? Number(s.ts) - Number(prev.ts) : 0;
    const ms = us / 1000;
    all += ms;
    const seen = new Set();
    let id = s.sf;
    let leaf = true;
    while (id != null && frames[id]) {
      const name = frameName(frames[id]);
      if (leaf) { own.set(name, (own.get(name) ?? 0) + ms); leaf = false; }
      if (!seen.has(name)) { seen.add(name); total.set(name, (total.get(name) ?? 0) + ms); }
      id = frames[id].parent;
    }
  }
  const rows = [...total.keys()].map((name) => ({ name, own: own.get(name) ?? 0, total: total.get(name) ?? 0 }));
  return { all, byOwn: [...rows].sort((a, b) => b.own - a.own), byTotal: [...rows].sort((a, b) => b.total - a.total) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [file, ...rest] = process.argv.slice(2);
  if (!file) { console.error('usage: node e2e/lab/profile.mjs <trace.cpuprofile> [--top N]'); process.exit(2); }
  const top = rest[0] === '--top' ? Number(rest[1]) : 30;
  const { all, byOwn, byTotal } = where(JSON.parse(readFileSync(file, 'utf8')));
  const line = (r) => `${r.own.toFixed(0).padStart(7)} ${r.total.toFixed(0).padStart(7)}  ${r.name}`;
  console.log([`${all.toFixed(0)} ms sampled`, '', '    own   total  (by own time)', ...byOwn.slice(0, top).map(line),
    '', '    own   total  (by total time)', ...byTotal.slice(0, top).map(line)].join('\n'));
}
