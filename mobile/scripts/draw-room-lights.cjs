#!/usr/bin/env node
/**
 * Draws each room's hung light (assets/images/light-<room>.png), as the approved drawings light
 * them (design/redesign/darkroom.html .safelight, lounge.html .lamplight): an ellipse 70% x 62% of
 * an 860 x 900 box, centred across it and a quarter down, its colour at the room's strength
 * falling off on one bell curve in twenty steps. Pre-drawn pictures, not gradients, so the grain
 * can be baked in: a triangular dither of one level, and a little more where the light is, so a
 * soft light never bands on an eight-bit screen. Drawn at half the box's points (430 x 450), shown
 * at 860 x 900. The same pictures every time: the noise is seeded.
 *
 *   node mobile/scripts/draw-room-lights.cjs
 */
const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

const ROOMS = {
  // The Darkroom's safelight.
  darkroom: { rgb: [150, 30, 16], peak: 0.30 },
  // The Lounge's club light.
  lounge: { rgb: [196, 150, 26], peak: 0.085 },
};
const W = 430;
const H = 450;
// The bell: the light at each twentieth of the way out, as a share of its peak.
const BELL = [1, 0.9917, 0.9667, 0.9263, 0.873, 0.8087, 0.7363, 0.6593, 0.5803, 0.5023, 0.4273,
  0.3577, 0.294, 0.2377, 0.189, 0.1477, 0.1133, 0.0857, 0.0637, 0.0463, 0];
const bellAt = (t) => {
  if (t >= 1) return 0;
  const f = t * 20;
  const i = Math.floor(f);
  const k = f - i;
  return BELL[i] * (1 - k) + BELL[i + 1] * k;
};
const cx = W * 0.5;
const cy = H * 0.26;
const rx = W * 0.70;
const ry = H * 0.62;

for (const [room, { rgb, peak }] of Object.entries(ROOMS)) {
  let seed = 1924;
  const rand = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
  const png = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const a = peak * bellAt(Math.sqrt(dx * dx + dy * dy));
      const grain = (rand() + rand() - 1) + (rand() - 0.5) * a * 255 * 0.12;
      const o = (y * W + x) * 4;
      png.data[o] = rgb[0];
      png.data[o + 1] = rgb[1];
      png.data[o + 2] = rgb[2];
      png.data[o + 3] = a > 0 ? Math.max(0, Math.min(255, Math.round(a * 255 + grain))) : 0;
    }
  }
  const out = path.join(__dirname, '..', 'assets', 'images', `light-${room}.png`);
  fs.writeFileSync(out, PNG.sync.write(png, { colorType: 6 }));
  console.log(`drew ${path.relative(process.cwd(), out)} (${fs.statSync(out).size} bytes)`);
}
