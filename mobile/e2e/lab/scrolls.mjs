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
 * scroll was never measured, fails by name; it prints the table and exits 1 on any.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir || !existsSync(dir)) { console.error('usage: node e2e/lab/scrolls.mjs <scrolls-dir>'); process.exit(2); }
  const { lines, failed } = judge(dir);
  console.log([...lines, '', ...(failed.length ? ['FAILED:', ...failed] : ['every list held three screen heights, and every scroll was measured'])].join('\n'));
  process.exit(failed.length ? 1 : 0);
}
