/**
 * Makes every picture of Buster from drawing.mjs:
 *
 *   node brand/buster/render.mjs          the app's pictures, and their data
 *   node brand/buster/render.mjs --brand  the marketing set, in brand/buster/art
 *
 * The app's pictures are drawn four times over and brought down to their exact
 * size with a Lanczos filter, once for each screen density (1x to 4x), so a
 * phone never stretches one. The brass points are left out of them and their
 * places measured, for the app to draw live (they blink and glance aside).
 */
import { chromium } from 'playwright';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { OPT, DEFS, MOODS, buster, seated, shadow, stamp, smallBuster } from './drawing.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOBILE = path.join(HERE, '..', '..', 'mobile');
const ASSETS = path.join(MOBILE, 'assets', 'buster');
const DATA = path.join(MOBILE, 'src', 'components', 'busterArt.ts');
const BRAND = path.join(HERE, 'art');

/**
 * One frame for every mood the app shows, so a mood never moves the layout.
 * Measured from their pixels, those four reach 35 to 174.5 across and 31.5 to
 * 216 down; this is centred on that with six units spare at the sides and room
 * under the longest hem for the shadow. 152 by 209 is 8 by 11, so 48, 56 and 80
 * points are whole points tall (66, 77, 110) and whole pixels at every density.
 * Seated is cut at the seat backs: 48 points by 54.
 */
const FRAME = { x: 28.75, y: 26, w: 152, h: 209 };
const SEATED = { x: 28.75, y: 26, w: 152, h: 171 };
/** Marketing shows every mood, startled's hat flying high among them. */
const POSTER = { x: 20, y: -24, w: 168, h: 248 };

/** Heavier ink and points as he gets smaller, as small type is cut heavier. */
const OPTICAL = { 48: { inkW: 1.25, pointW: 1.3 }, 56: { inkW: 1.15, pointW: 1.2 }, 80: { inkW: 1, pointW: 1 } };

/** Every picture the app shows: the only ones it ships. */
const APP = [
  ['unimpressed', 48], ['unimpressed', 80],
  ['suspicious', 48], ['suspicious', 56], ['suspicious', 80],
  ['moved', 80], ['dimmed', 80], ['seated', 48],
];
/** 1x is the plain name, as React Native and Jest both need to find it. */
const SCALES = [1, 2, 3, 4];
const fileFor = (key, scale) => `${key}${scale === 1 ? '' : `@${scale}x`}.png`;
const SUPERSAMPLE = 4;

const page = (inner, frame, px) => `<!doctype html><html><head><style>
  html,body{margin:0;background:transparent}svg{display:block}
</style></head><body>
<svg id="art" xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px * frame.h / frame.w}" viewBox="${frame.x} ${frame.y} ${frame.w} ${frame.h}">
${DEFS}<g id="all">${inner}</g></svg></body></html>`;

/** Draws one SVG at `px` wide and returns the PNG, plus what was measured on it. */
async function draw(browser, inner, frame, px) {
  const tab = await browser.newPage({ viewport: { width: Math.ceil(px), height: Math.ceil(px * frame.h / frame.w) }, deviceScaleFactor: 1 });
  await tab.setContent(page(inner, frame, px));
  const measured = await tab.evaluate(() => {
    const art = document.getElementById('art');
    const box = art.getBoundingClientRect();
    // The centre from the box (true under any turn); the radius from the scale
    // the point is drawn at, since a turned circle's box is wider than it is.
    return [...art.querySelectorAll('[data-eye]')].map((c) => {
      const r = c.getBoundingClientRect(), m = c.getScreenCTM();
      return {
        x: (r.left + r.width / 2 - box.left) / box.width,
        y: (r.top + r.height / 2 - box.top) / box.height,
        r: Number(c.getAttribute('r')) * Math.hypot(m.a, m.b) / box.width,
      };
    });
  });
  const png = await tab.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: px, height: px * frame.h / frame.w } });
  await tab.close();
  return { png, measured: { eyes: measured, hem: await hemOf(png) } };
}

/** How far down the sheet ends, from its pixels: the last row a quarter opaque. */
async function hemOf(png) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let y = info.height - 1; y >= 0; y--) {
    for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * info.channels + 3] > 64) return (y + 1) / info.height;
  }
  return 1;
}

const round = (n) => Math.round(n * 10000) / 10000;

/**
 * The most opaque pixel on each edge of a picture. A frame that cuts the
 * drawing shows here, where an outline's geometry would not: what a clip hides
 * still has a box.
 */
async function edges(png) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const a = (x, y) => data[(y * info.width + x) * info.channels + 3];
  const most = (pts) => Math.max(...pts.map(([x, y]) => a(x, y)));
  const xs = [...Array(info.width).keys()], ys = [...Array(info.height).keys()];
  return {
    top: most(xs.map((x) => [x, 0])), bottom: most(xs.map((x) => [x, info.height - 1])),
    left: most(ys.map((y) => [0, y])), right: most(ys.map((y) => [info.width - 1, y])),
  };
}

async function renderApp(browser) {
  fs.mkdirSync(ASSETS, { recursive: true });
  const entries = [];
  for (const [mood, size] of APP) {
    Object.assign(OPT, OPTICAL[size], { points: false });
    const frame = mood === 'seated' ? SEATED : FRAME;
    const inner = mood === 'seated' ? seated() : buster({ mood });
    const height = size * frame.h / frame.w;
    if (!Number.isInteger(height)) throw new Error(`${mood}-${size} is ${height}pt tall: not a whole point`);
    let measured;
    for (const scale of SCALES) {
      const w = size * scale, h = height * scale;
      const drawn = await draw(browser, inner, frame, w * SUPERSAMPLE);
      measured = drawn.measured;
      // Seated is cut by its frame on purpose: the seat backs run on past it.
      const edge = await edges(drawn.png);
      const cut = Object.entries(edge).filter(([side, alpha]) => alpha > 2 && !(mood === 'seated' && side !== 'top'));
      if (cut.length) throw new Error(`${mood}-${size}: the frame cuts the drawing at ${cut.map(([s]) => s).join(', ')}`);
      await sharp(drawn.png).resize(w, h, { kernel: 'lanczos3' })
        .png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 })
        .toFile(path.join(ASSETS, fileFor(`${mood}-${size}`, scale)));
    }
    // Where the drawing turns him: his head, at (100, 120).
    const pivot = { x: (100 - frame.x) / frame.w, y: (120 - frame.y) / frame.h };
    entries.push({ key: `${mood}-${size}`, size, height, measured, pivot });
  }
  writeData(entries);
}

function writeData(entries) {
  const lines = entries.map(({ key, size, height, measured, pivot }) => {
    const eyes = measured.eyes.map((e) => `{ x: ${round(e.x)}, y: ${round(e.y)}, r: ${round(e.r)} }`).join(', ');
    return `  '${key}': {\n    picture: require('../../assets/buster/${key}.png'),\n    width: ${size}, height: ${height},\n`
      + `    eyes: [${eyes}],\n    hem: ${round(measured.hem)},\n    pivot: { x: ${round(pivot.x)}, y: ${round(pivot.y)} },\n  },`;
  });
  fs.writeFileSync(DATA, `/**
 * Every picture of Buster the app ships, and what was measured on each.
 * Written by the renderer beside the drawing (brand/buster); not by hand.
 *
 * Fractions of the picture: \`eyes\` where each brass point sits and how big it
 * is, \`hem\` how far down the sheet ends, \`pivot\` where his sway turns him.
 */
export const BUSTER_ART = {
${lines.join('\n')}
} as const;

export type BusterArtKey = keyof typeof BUSTER_ART;
`);
}

async function renderBrand(browser) {
  fs.mkdirSync(BRAND, { recursive: true });
  Object.assign(OPT, { inkW: 1, pointW: 1, points: true });
  const WIDTH = 1600;
  const jobs = [
    ...Object.keys(MOODS).map((m) => [`buster-${m}`, buster({ mood: m }), POSTER]),
    ['buster-seated', seated(), SEATED],
    ['buster-with-shadow', shadow(214) + buster(), POSTER],
    ['buster-stamp-brass', stamp(), { x: 36, y: 22, w: 130, h: 198 }],
    ['buster-stamp-ink', stamp({ ink: '#0D0B09', ground: '#E9DFC8' }), { x: 36, y: 22, w: 130, h: 198 }],
    ['buster-small', smallBuster(), { x: 30, y: 20, w: 142, h: 204 }],
  ];
  for (const [name, inner, frame] of jobs) {
    const { png } = await draw(browser, inner, frame, WIDTH);
    await sharp(png).png({ compressionLevel: 9, effort: 10 }).toFile(path.join(BRAND, `${name}.png`));
    fs.writeFileSync(path.join(BRAND, `${name}.svg`),
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${frame.x} ${frame.y} ${frame.w} ${frame.h}" width="${frame.w * 4}" height="${frame.h * 4}">${DEFS}${inner}</svg>\n`);
  }
}

const browser = await chromium.launch();
try {
  if (process.argv.includes('--brand')) await renderBrand(browser);
  else await renderApp(browser);
} finally {
  await browser.close();
}
