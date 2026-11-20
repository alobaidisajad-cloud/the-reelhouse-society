#!/usr/bin/env node
/**
 * feel.mjs — the feel of each busy screen, from the speed lab's feel run (feel.sh), judged against
 * e2e/limits.json.
 *
 *   node e2e/lab/feel.mjs <feel dir>          every screen measured, judged; exits 1 on any fault
 *   node e2e/lab/feel.mjs pick <dump.xml>     a control to tap: "x y", the middle of one clickable
 *                                             node in the middle band of the screen (feel.sh)
 *   node e2e/lab/feel.mjs rx <proc/net/dev>   the bytes the phone has received, every interface but lo
 *
 * Per screen (<name>.log, the device log of its run; <name>-<step>-<n>.xml, the screen read by
 * uiautomator after each step settled; <name>.js.txt, sql/9-js-work-per-frame.pfsql over the trace
 * of its scroll; <name>.rx, the bytes received before and after it opened):
 *   tap        each touch, from LabFeelProbe's `feel.tap`: its answer (or, when no commit came, the
 *              JS thread's first sight of it) against one frame; a touch whose stamp is on another
 *              clock fails as unmeasured
 *   commit     React's commits each second (`feel.commits`): the longest while scrolling (between
 *              feel.sh's feel.scroll.begin and feel.scroll.end) against one frame, and the longest
 *              of the rest (opening, tapping, going back) against its own limit
 *   jump       every node with a name of its own (its id, its words or its label) that moved between
 *              two reads of a step with no touch between them: limit 0
 *   jsFrame    the JS thread's running time per frame while scrolling: its 95th percentile and its
 *              worst, against the limit
 *   bytes      what opening the screen downloaded, recorded beside the speed record
 * A screen that measured nothing it should have (no taps, no reads, no trace) fails by name: an
 * instrument that saw nothing is never a pass.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = 'com.reelhouse.society';

/** Every `[e2e] <event> {json}` line of one kind in a device log. */
export function linesOf(log, event) {
  const out = [];
  for (const m of log.matchAll(new RegExp(`\\[e2e\\] ${event.replace('.', '\\.')} (\\{.*\\})`, 'g'))) {
    try { out.push(JSON.parse(m[1])); } catch { /* a line the log cut short is not a measure */ }
  }
  return out;
}

/**
 * Every node of a uiautomator dump: its key (id, else label, else words, with its class) and bounds.
 * Another app's node (the launcher, once back has left the app) has no key and is never clickable:
 * it is not the app's to hold still, nor to tap.
 */
export function nodesOf(xml) {
  const seen = new Map();
  const out = [];
  for (const m of xml.matchAll(/<node\b([^>]*?)\/?>/g)) {
    const attr = (k) => new RegExp(`\\b${k}="([^"]*)"`).exec(m[1])?.[1] ?? '';
    const b = /\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/.exec(attr('bounds'));
    if (!b) continue;
    const name = attr('resource-id') || attr('content-desc') || attr('text');
    const bounds = b.slice(1).map(Number);
    const theirs = attr('package') !== '' && attr('package') !== APP;
    out.push({ name, cls: attr('class'), clickable: attr('clickable') === 'true' && !theirs, bounds });
    if (!name || theirs) continue;
    const base = `${attr('class')}|${name}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out[out.length - 1].key = `${base}#${n}`;
  }
  return out;
}

/** Every named node that moved between two reads: { key, from, to, by }. */
export function jumpsBetween(a, b, atLeast = 1) {
  const before = new Map(nodesOf(a).filter((n) => n.key).map((n) => [n.key, n.bounds]));
  const out = [];
  for (const n of nodesOf(b)) {
    const was = n.key && before.get(n.key);
    if (!was) continue;
    const by = Math.max(...n.bounds.map((v, i) => Math.abs(v - was[i])));
    if (by >= atLeast) out.push({ key: n.key, from: was, to: n.bounds, by });
  }
  return out;
}

/** A clickable node to tap, in the middle band of the screen: [x, y], or null. */
export function pick(xml) {
  const nodes = nodesOf(xml);
  const screen = nodes[0]?.bounds;
  if (!screen) return null;
  const h = screen[3] - screen[1];
  const mid = nodes.filter((n) => n.clickable && n.name && (n.bounds[1] + n.bounds[3]) / 2 > screen[1] + h * 0.3 && (n.bounds[1] + n.bounds[3]) / 2 < screen[1] + h * 0.7
    && n.bounds[2] - n.bounds[0] >= 20 && n.bounds[3] - n.bounds[1] >= 20);
  const n = mid[0];
  return n ? [Math.round((n.bounds[0] + n.bounds[2]) / 2), Math.round((n.bounds[1] + n.bounds[3]) / 2)] : null;
}

/** The bytes received on every interface but loopback, from /proc/net/dev. */
export function rxOf(text) {
  let total = 0;
  for (const line of text.split('\n')) {
    const m = /^\s*([^:\s]+):\s*(\d+)/.exec(line);
    if (m && m[1] !== 'lo') total += Number(m[2]);
  }
  return total;
}

/** The JS thread's ms per frame, from trace_processor's answer to 9-js-work-per-frame.pfsql. */
export function jsFramesOf(text) {
  return text.split('\n').map((l) => l.trim().replace(/"/g, '').split(/[,\s]+/)).filter((c) => c.length >= 2 && /^\d+$/.test(c[0]) && /^\d+(\.\d+)?$/.test(c[1])).map((c) => Number(c[1]));
}

const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] : null; };

/** One screen measured: { name, taps, commit, jumps, jsFrame, bytes } and its faults against the limits. */
export function measureScreen(dir, name, files, limits) {
  const read = (f) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : '');
  const log = read(`${name}.log`);
  const faults = [];
  const taps = linesOf(log, 'feel.tap');
  const apart = taps.filter((t) => t.clocks === 'apart');
  const timed = taps.filter((t) => t.clocks !== 'apart').map((t) => ({ ...t, response: t.answer ?? t.js }));
  if (apart.length) faults.push(`${name}: ${apart.length} touch(es) stamped on another clock than JavaScript's: tap response unmeasured`);
  if (!taps.length) faults.push(`${name}: no touch was measured (feel.tap): the probe saw nothing`);
  for (const t of timed) if (t.response > limits.tapMs) faults.push(`${name}: a tap answered in ${t.response} ms, past the next frame (${limits.tapMs.toFixed(1)} ms)${t.answer == null ? ' (the JS thread first saw it then)' : ''}`);
  // The scroll's own seconds, between feel.sh's marks: a commit there must fit a frame.
  const from = log.indexOf('feel.scroll.begin');
  const to = log.indexOf('feel.scroll.end');
  const scrolling = from >= 0 && to > from ? log.slice(from, to) : '';
  const rest = from >= 0 && to > from ? log.slice(0, from) + log.slice(to) : log;
  const longestOf = (part) => { const c = linesOf(part, 'feel.commits'); return c.length ? Math.max(...c.map((x) => x.longest)) : null; };
  const longest = longestOf(rest);
  const longestScrolling = longestOf(scrolling);
  if (longest == null) faults.push(`${name}: no commit was timed (feel.commits): the probe saw nothing`);
  else if (longest > limits.commitMs) faults.push(`${name}: a commit took ${longest} ms, over ${limits.commitMs} ms`);
  if (longestScrolling != null && longestScrolling > limits.commitScrollMs) faults.push(`${name}: a commit while scrolling took ${longestScrolling} ms, over a frame (${limits.commitScrollMs.toFixed(1)} ms)`);
  const steps = new Map();
  for (const f of files.filter((x) => x.startsWith(`${name}-`) && x.endsWith('.xml'))) {
    const [, step, n] = /^.+-([a-z]+)-(\d+)\.xml$/.exec(f) ?? [];
    if (step) steps.set(step, [...(steps.get(step) ?? []), [Number(n), f]]);
  }
  const jumps = [];
  for (const [step, reads] of steps) {
    const ordered = reads.sort((a, b) => a[0] - b[0]).map(([, f]) => read(f));
    for (let i = 1; i < ordered.length; i++) for (const j of jumpsBetween(ordered[i - 1], ordered[i])) jumps.push({ step, ...j });
  }
  if (!steps.size) faults.push(`${name}: the screen was never read (no uiautomator dump): layout jumps unmeasured`);
  for (const j of jumps.slice(0, 5)) faults.push(`${name}: ${j.step}: ${j.key.split('#')[0].split('|')[1]} moved ${j.by}px with no touch (${j.from.join(',')} → ${j.to.join(',')})`);
  if (jumps.length > limits.jumps && jumps.length > 5) faults.push(`${name}: and ${jumps.length - 5} more moves`);
  const js = jsFramesOf(read(`${name}.js.txt`));
  const jsFrame = js.length ? { frames: js.length, p95: pct(js, 0.95), worst: Math.max(...js) } : null;
  if (!jsFrame) faults.push(`${name}: no frame of the JS thread was read from the scroll's trace: JS work per frame unmeasured`);
  else {
    if (jsFrame.p95 > limits.jsFrameP95Ms) faults.push(`${name}: the JS thread worked ${jsFrame.p95} ms in the 95th-percentile frame, over ${limits.jsFrameP95Ms} ms`);
    if (jsFrame.worst > limits.jsFrameWorstMs) faults.push(`${name}: the JS thread worked ${jsFrame.worst} ms in one frame, over ${limits.jsFrameWorstMs} ms`);
  }
  const rx = read(`${name}.rx`).split(/\n-{3,}\n/);
  const bytes = rx.length === 2 ? rxOf(rx[1]) - rxOf(rx[0]) : null;
  return {
    screen: { name, taps: timed.length, tapWorst: timed.length ? Math.max(...timed.map((t) => t.response)) : null, commitLongest: longest, commitScrolling: longestScrolling, jumps: jumps.length, jsFrame, bytes },
    faults,
  };
}

/** The feel limits from e2e/limits.json, each a number. */
export function feelLimits(limits = JSON.parse(readFileSync(join(HERE, '..', 'limits.json'), 'utf8'))) {
  const f = limits.measures;
  return { tapMs: f.tapResponse.value, commitMs: f.commitLongest.value, commitScrollMs: f.commitScrolling.value, jumps: f.layoutJumps.value, jsFrameP95Ms: f.jsFrameP95.value, jsFrameWorstMs: f.jsFrameWorst.value };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === 'pick') { const p = pick(readFileSync(arg, 'utf8')); console.log(p ? p.join(' ') : ''); process.exit(p ? 0 : 1); }
  if (cmd === 'rx') { console.log(rxOf(readFileSync(arg, 'utf8'))); process.exit(0); }
  const dir = cmd;
  if (!dir || !existsSync(dir)) { console.error('usage: node e2e/lab/feel.mjs <feel dir> | pick <dump.xml> | rx <proc/net/dev>'); process.exit(2); }
  const { readdirSync } = await import('node:fs');
  const files = readdirSync(dir);
  const names = [...new Set(files.filter((f) => f.endsWith('.log')).map((f) => f.replace(/\.log$/, '')))].sort();
  const limits = feelLimits();
  const all = names.map((n) => measureScreen(dir, n, files, limits));
  const cell = (v) => String(v ?? '—').padStart(9);
  console.log(`screen      taps  tapWorst  commit  jumps  jsP95  jsWorst     bytes`);
  for (const { screen: s } of all) console.log(`${s.name.padEnd(10)}${cell(s.taps)}${cell(s.tapWorst)}${cell(s.commitLongest)}${cell(s.jumps)}${cell(s.jsFrame?.p95)}${cell(s.jsFrame?.worst)}${cell(s.bytes)}`);
  const faults = all.flatMap((a) => a.faults);
  if (!names.length) faults.push('no screen was run');
  console.log(faults.length ? `\nFAILED:\n  ${faults.join('\n  ')}` : '\nevery screen within its feel limits');
  process.exit(faults.length ? 1 : 0);
}
