#!/usr/bin/env node
/**
 * thumb.mjs — a screenshot, shrunk (box average) and brightened ×4 so a dark
 * room is visible, printed as base64 PNG: annotations can be read without
 * signing in, artifacts cannot.
 *
 *   node e2e/study/thumb.mjs <png> [width=72]     (run from mobile/, for pngjs)
 */
import { readFileSync } from 'node:fs';
import pngjs from 'pngjs';

const { PNG } = pngjs;
const [file, w = '72'] = process.argv.slice(2);
const src = PNG.sync.read(readFileSync(file));
const W = +w;
const H = Math.round((src.height * W) / src.width);
const out = new PNG({ width: W, height: H });
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const x0 = Math.floor((x * src.width) / W), x1 = Math.floor(((x + 1) * src.width) / W);
    const y0 = Math.floor((y * src.height) / H), y1 = Math.floor(((y + 1) * src.height) / H);
    const sum = [0, 0, 0];
    let n = 0;
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
      const i = (yy * src.width + xx) * 4;
      sum[0] += src.data[i]; sum[1] += src.data[i + 1]; sum[2] += src.data[i + 2]; n++;
    }
    const o = (y * W + x) * 4;
    for (let c = 0; c < 3; c++) out.data[o + c] = Math.min(255, Math.round((sum[c] / n) * 4));
    out.data[o + 3] = 255;
  }
}
process.stdout.write(PNG.sync.write(out).toString('base64'));
