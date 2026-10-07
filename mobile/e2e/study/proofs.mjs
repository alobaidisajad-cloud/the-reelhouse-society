#!/usr/bin/env node
/**
 * proofs.mjs — the study's yes-or-no answers, from what ab.sh left.
 *
 *   node e2e/study/proofs.mjs <study-dir> [shots-folder]   (run from mobile/, for pngjs)
 *   With a shots folder (the iOS simulator's), only the screenshots are compared.
 *
 *   P: the patched prefetch downloads ("Finished loading File") and decodes nothing
 *   S: expo-image built from source says nothing below ERROR in the log
 *   shots: the welcome drawn with SVG light (B) against native gradients (E),
 *          pixel by pixel, beside B against B and E against E (the noise floor).
 *          The status and navigation bars are left out: the clock moves.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pngjs from 'pngjs';

const { PNG } = pngjs;
const dir = process.argv[2];
const SHOTS = process.argv[3] ?? 'shots';
const shotsOnly = process.argv[3] != null;
const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
const ORIG = '[-2147483648x-2147483648]';
const out = [];

if (!shotsOnly) {
const p = read(join(dir, 'proofs', 'P.log')).split('\n').filter((l) => /Glide/.test(l) && l.includes('Finished loading'));
out.push('## P — the download-only prefetch on a device');
if (!p.some((l) => l.includes(ORIG))) out.push('  NO VERDICT: the log holds no prefetch at all (did P start? are Glide logs on?)');
out.push(`  prefetches that downloaded only (File):  ${p.filter((l) => l.includes(ORIG) && / File /.test(l)).length}`);
out.push(`  prefetches that decoded (full size):     ${p.filter((l) => l.includes(ORIG) && !/ File /.test(l)).length}`);
out.push(`  loads by views:                          ${p.filter((l) => !l.includes(ORIG)).length}`);
for (const l of p.filter((x) => x.includes(ORIG)).slice(0, 3)) out.push(`    e.g. ${l.replace(/^.*Finished loading /, '').slice(0, 150)}`);

const s = read(join(dir, 'proofs', 'S.log')).split('\n');
out.push('', '## S — expo-image from source: Glide below ERROR');
if (!s.some((l) => /screen.ready/.test(l))) out.push('  NO VERDICT: the log never shows the first screen ready, so silence proves nothing');
out.push(`  Glide lines at V/D/I: ${s.filter((l) => / [VDI] Glide/.test(l)).length} (of ${s.length} log lines)`);
out.push(`  Glide lines at W/E:   ${s.filter((l) => / [WE] Glide/.test(l)).length}`);
}

const png = (name) => {
  const f = join(dir, SHOTS, `${name}.png`);
  if (!existsSync(f)) return null;
  try { return PNG.sync.read(readFileSync(f)); } catch { return null; }
};
function compare(a, b, heatmap) {
  if (!a || !b || a.width !== b.width || a.height !== b.height) return 'missing or different sizes';
  const y0 = Math.round(a.height * 0.05);
  const y1 = Math.round(a.height * 0.95);
  const hist = new Array(256).fill(0);
  let n = 0;
  let sum = 0;
  const heat = heatmap ? new PNG({ width: a.width, height: a.height }) : null;
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < a.width; x++) {
      const i = (y * a.width + x) * 4;
      const d = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]));
      hist[d]++;
      n++;
      sum += d;
      if (heat) { const v = Math.min(255, d * 32); heat.data[i] = v; heat.data[i + 1] = v; heat.data[i + 2] = v; heat.data[i + 3] = 255; }
    }
  }
  if (heat) writeFileSync(join(dir, SHOTS, heatmap), PNG.sync.write(heat));
  let max = 0;
  for (let d = 255; d >= 0; d--) if (hist[d]) { max = d; break; }
  const over = (k) => hist.slice(k + 1).reduce((x, y) => x + y, 0);
  const pct = (c) => `${((100 * c) / n).toFixed(3)}%`;
  return `max ${max} · mean ${(sum / n).toFixed(3)} · over 1: ${pct(over(1))} · over 2: ${pct(over(2))} · over 4: ${pct(over(4))} · over 8: ${pct(over(8))}  (${a.width}×${a.height}, levels of 255)`;
}
const [b1, b2, e1, e2] = ['B1', 'B2', 'E1', 'E2'].map(png);
out.push('', `## The welcome (${SHOTS}), SVG light (B) against native gradients (E), largest channel difference per pixel`);
out.push(`  B1 vs B2 (noise):  ${compare(b1, b2)}`);
out.push(`  E1 vs E2 (noise):  ${compare(e1, e2)}`);
out.push(`  B1 vs E1:          ${compare(b1, e1, 'B1-E1-x32.png')}`);
out.push(`  B2 vs E2:          ${compare(b2, e2)}`);
// Where the light is, and whether B and E draw the same of it: each shot
// against N (no light at all), as a signed mean (luma, 0–255) per region of a
// 6×12 grid, top row first. B−N and E−N must both be clearly non-zero where the
// lamp, the floor and the corners fall, and match each other there.
const n1 = png('N1');
const luma = (img, i) => 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2];
function grid(a, b) {
  if (!a || !b || a.width !== b.width || a.height !== b.height) return null;
  const cols = 6, rows = 12, rows_ = [];
  for (let r = 0; r < rows; r++) {
    const cells = [];
    for (let c = 0; c < cols; c++) {
      let sum = 0, n = 0;
      const y0 = Math.floor((r * a.height) / rows), y1 = Math.floor(((r + 1) * a.height) / rows);
      const x0 = Math.floor((c * a.width) / cols), x1 = Math.floor(((c + 1) * a.width) / cols);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * a.width + x) * 4; sum += luma(b, i) - luma(a, i); n++; }
      cells.push(sum / n);
    }
    rows_.push(cells);
  }
  return rows_;
}
const fmtGrid = (g) => g.map((row) => '    ' + row.map((v) => (v >= 0 ? '+' : '') + v.toFixed(2)).map((s) => s.padStart(7)).join('')).join('\n');
for (const [name, a, b] of [['B1 − N1 (the SVG light)', n1, b1], ['E1 − N1 (the native light)', n1, e1], ['E1 − B1 (native minus SVG)', b1, e1]]) {
  const g = grid(a, b);
  out.push('', `  ${name}, signed mean luma per region:`);
  out.push(g ? fmtGrid(g) : '    (a shot is missing)');
}
// Banding: distinct luma levels down the middle column, where the pool falls.
const levels = (img) => {
  if (!img) return '—';
  const seen = new Set();
  const x = Math.floor(img.width / 2);
  for (let y = Math.floor(img.height * 0.05); y < Math.floor(img.height * 0.6); y++) seen.add(Math.round(luma(img, (y * img.width + x) * 4)));
  return seen.size;
};
out.push('', `  distinct levels down the middle (5%–60% of the height): B1 ${levels(b1)} · E1 ${levels(e1)} · N1 ${levels(n1)}`);
const elog = read(join(dir, SHOTS, 'E1.log')).split('\n').filter((l) => /background|gradient/i.test(l) && /reelhouse|ReactNative|unknown/i.test(l));
out.push(`  E's log lines about backgrounds or gradients: ${elog.length}`);
for (const l of elog.slice(0, 4)) out.push(`    ${l.slice(0, 160)}`);

console.log(out.join('\n'));
