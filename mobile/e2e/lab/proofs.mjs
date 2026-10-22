#!/usr/bin/env node
/**
 * proofs.mjs — the light proven on a device (WORKLIST P0.103), from the shots lab.sh took.
 *
 *   node e2e/lab/proofs.mjs <shots-dir>
 *
 * In the folder, for each scene of arm.mjs's SCENES, `<main>-1.png`, `<main>-2.png`, `<svg>-1.png`,
 * `<svg>-2.png`, and once `N-1.png`. Every comparison leaves out the top and bottom 5% (the
 * status and navigation bars: the clock moves) and gives the largest channel difference per
 * pixel, its mean, and the share of pixels over 1, 2, 4 and 8 levels of 255. Each scene:
 *   still    each build shot twice differs by at most STILL_MAX: the shot holds still
 *   present  main's light and the SVG's each change at least PRESENT_SHARE of the screen by
 *            over 2 levels against no light, so "the same" can never mean "both blank"
 *   same     main against the SVG: at most SAME_MAX anywhere, over 4 levels on at most
 *            SAME_OVER_4 of the screen (the study's result was a largest difference of about 8
 *            on about 0.02% of pixels)
 * and a 6×12 signed luma grid of each against no light, top row first, for the eye. It prints
 * the report and exits 1 when any scene fails or cannot be judged.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodePng } from '../png.mjs';
import { SCENES } from './arm.mjs';

export const STILL_MAX = 2;
export const PRESENT_SHARE = 0.005;
export const SAME_MAX = 12;
export const SAME_OVER_4 = 0.0005;

/**
 * Two images ({width, height, pixels} as RGBA bytes, as e2e/png.mjs reads them) compared; null
 * when either is missing or their sizes differ.
 */
export function compare(a, b) {
  if (!a || !b || a.width !== b.width || a.height !== b.height) return null;
  const y0 = Math.round(a.height * 0.05);
  const y1 = Math.round(a.height * 0.95);
  const hist = new Array(256).fill(0);
  let n = 0;
  let sum = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < a.width; x++) {
      const i = (y * a.width + x) * 4;
      const d = Math.max(Math.abs(a.pixels[i] - b.pixels[i]), Math.abs(a.pixels[i + 1] - b.pixels[i + 1]), Math.abs(a.pixels[i + 2] - b.pixels[i + 2]));
      hist[d]++;
      n++;
      sum += d;
    }
  }
  let max = 0;
  for (let d = 255; d > 0; d--) if (hist[d]) { max = d; break; }
  const over = (k) => hist.slice(k + 1).reduce((x, y) => x + y, 0) / n;
  return { max, mean: sum / n, over1: over(1), over2: over(2), over4: over(4), over8: over(8), width: a.width, height: a.height };
}

const luma = (img, i) => 0.2126 * img.pixels[i] + 0.7152 * img.pixels[i + 1] + 0.0722 * img.pixels[i + 2];

/** The signed mean luma of `b` minus `a`, per cell of a 6×12 grid, top row first. */
export function grid(a, b) {
  if (!a || !b || a.width !== b.width || a.height !== b.height) return null;
  const cols = 6;
  const rows = 12;
  const out = [];
  for (let r = 0; r < rows; r++) {
    const cells = [];
    const ya = Math.floor((r * a.height) / rows);
    const yb = Math.floor(((r + 1) * a.height) / rows);
    for (let c = 0; c < cols; c++) {
      const xa = Math.floor((c * a.width) / cols);
      const xb = Math.floor(((c + 1) * a.width) / cols);
      let sum = 0;
      for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) { const i = (y * a.width + x) * 4; sum += luma(b, i) - luma(a, i); }
      cells.push(sum / ((yb - ya) * (xb - xa)));
    }
    out.push(cells);
  }
  return out;
}

/** One scene's verdict from its shots: { ok, lines }. A missing shot is a failure, said by name. */
export function judge(scene, shot) {
  const lines = [];
  const missing = [`${scene.main}-1`, `${scene.main}-2`, `${scene.svg}-1`, `${scene.svg}-2`, 'N-1'].filter((s) => !shot(s));
  if (missing.length) return { ok: false, lines: [`  NO VERDICT: no shot ${missing.join(', ')}`] };
  const m1 = shot(`${scene.main}-1`);
  const s1 = shot(`${scene.svg}-1`);
  const none = shot('N-1');
  const noiseM = compare(m1, shot(`${scene.main}-2`));
  const noiseS = compare(s1, shot(`${scene.svg}-2`));
  const same = compare(m1, s1);
  const litM = compare(none, m1);
  const litS = compare(none, s1);
  if ([noiseM, noiseS, same, litM, litS].some((c) => !c)) return { ok: false, lines: ['  NO VERDICT: the shots are not all one size'] };
  const pct = (x) => `${(100 * x).toFixed(3)}%`;
  const say = (c) => `max ${c.max} · mean ${c.mean.toFixed(3)} · over 1 ${pct(c.over1)} · 2 ${pct(c.over2)} · 4 ${pct(c.over4)} · 8 ${pct(c.over8)}`;
  const checks = [
    [noiseM.max <= STILL_MAX && noiseS.max <= STILL_MAX, `still: each build against itself, main ${noiseM.max}, SVG ${noiseS.max} (at most ${STILL_MAX})`],
    [litM.over2 >= PRESENT_SHARE && litS.over2 >= PRESENT_SHARE, `present: over 2 levels against no light, main ${pct(litM.over2)}, SVG ${pct(litS.over2)} (at least ${pct(PRESENT_SHARE)})`],
    [same.max <= SAME_MAX && same.over4 <= SAME_OVER_4, `same: main against SVG, ${say(same)} (max at most ${SAME_MAX}, over 4 at most ${pct(SAME_OVER_4)})`],
  ];
  for (const [pass, text] of checks) lines.push(`  ${pass ? 'yes' : 'NO '}  ${text}`);
  const fmt = (g) => g.map((row) => `      ${row.map((v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`.padStart(7)).join('')}`).join('\n');
  lines.push(`  main − no light, signed mean luma (${same.width}×${same.height}):`, fmt(grid(none, m1)));
  lines.push('  SVG − no light:', fmt(grid(none, s1)));
  return { ok: checks.every(([pass]) => pass), lines };
}

function main() {
  const dir = process.argv[2];
  if (!dir || !existsSync(dir)) {
    console.error('usage: node e2e/lab/proofs.mjs <shots-dir>');
    process.exit(2);
  }
  const cache = new Map();
  const shot = (name) => {
    if (!cache.has(name)) {
      const f = join(dir, `${name}.png`);
      let img = null;
      try { if (existsSync(f)) img = decodePng(readFileSync(f)); } catch { img = null; }
      cache.set(name, img);
    }
    return cache.get(name);
  };
  let ok = true;
  const out = [];
  for (const scene of SCENES) {
    const v = judge(scene, shot);
    ok &&= v.ok;
    out.push(`## ${v.ok ? 'PASS' : 'FAIL'} — ${scene.what} (${scene.main} against ${scene.svg})`, ...v.lines, '');
  }
  console.log(out.join('\n'));
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
