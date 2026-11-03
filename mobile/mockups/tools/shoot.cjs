/**
 * SHOOT — photograph renders as PNGs, at a text size, optionally cropped.
 *
 *   node mockups/tools/shoot.cjs --only film-built,reel [--src DIR] [--out DIR]
 *        [--factor 1.35] [--platform android] [--width 320] [--clip x,y,w,h] [--full] [--long-names]
 *
 * Writes <out>/<name>@<factor>.png (default out: mockups/out/shots).
 */
const fs = require('fs');
const path = require('path');
const { chromium, open, shrinkToFit, screens, longNames, STAND_IN, MOBILE, WIDTH } = require('./harness.cjs');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const SRC = path.resolve(opt('src', path.join(MOBILE, 'mockups', 'out', 'screens')));
const OUT = path.resolve(opt('out', path.join(MOBILE, 'mockups', 'out', 'shots')));
const ONLY = opt('only') ? opt('only').split(',') : null;
const FACTOR = Number(opt('factor', '1'));
const PLATFORM = opt('platform', 'ios');
const SIZE = Number(opt('width', String(WIDTH)));
const CLIP = opt('clip') ? opt('clip').split(',').map(Number) : null;
const FULL = args.includes('--full');
// Every @handle made fifteen letters long, as layout.cjs --kinds NAME measures them.
const LONG_NAMES = args.includes('--long-names');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  for (const name of screens(SRC, ONLY)) {
    const page = await open(browser, path.join(SRC, name + '.html'), { factor: FACTOR, platform: PLATFORM, width: SIZE });
    if (LONG_NAMES) await page.evaluate(longNames, STAND_IN);
    // The phone shrinks a label that may shrink before it would cut it; so does the photograph.
    await shrinkToFit(page);
    const file = path.join(OUT, `${name}@${FACTOR}.png`);
    const shot = CLIP
      ? { path: file, clip: { x: CLIP[0], y: CLIP[1], width: CLIP[2], height: CLIP[3] }, fullPage: true }
      : { path: file, fullPage: FULL };
    await page.screenshot(shot);
    await page.close();
    console.log(file);
  }
  await browser.close();
})();
