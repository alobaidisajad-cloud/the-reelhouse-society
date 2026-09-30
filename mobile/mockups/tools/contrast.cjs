/**
 * CONTRAST — can every word on a drawn screen be read against what is really
 * behind it?
 * ──────────────────────────────────────────────────────────────────────────
 * A colour pair in the theme says nothing about a word laid over a poster, a
 * sunburst, a halftone or a lamp. So: every word is found and boxed; then the
 * same page is photographed with every word made invisible, and each word's
 * colour is scored against the worst 5% of the pixels really under it. A word
 * under 24pt (18.66pt in Rye, the display face) needs 4.5:1; larger, 3:1.
 * A slant turns a word and its ground together, so transforms are undone
 * first (a turned box would reach past the ground it is printed on).
 *
 *   node mockups/tools/contrast.cjs [--src DIR] [--only a,b] [--width 390]
 *     [--passes ios@1,android@2]
 *   exits 1 when any word falls short.
 */
const path = require('path');
const { chromium, open, screens, MOBILE, WIDTH } = require('./harness.cjs');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const SRC = path.resolve(opt('src', path.join(MOBILE, 'mockups', 'out', 'screens')));
const ONLY = opt('only') ? opt('only').split(',') : null;
const W = Number(opt('width', WIDTH));
const PASSES = opt('passes', 'ios@1,ios@1.35,android@2').split(',')
  .map((p) => { const [platform, f] = p.split('@'); return { platform, f: Number(f) }; });

async function measure(browser, file, pass) {
  const page = await open(browser, file, { platform: pass.platform, factor: pass.f, width: W });
  // the whole scroll, as one tall page: a word below the fold is still a word
  await page.evaluate(() => {
    for (const s of document.querySelectorAll('.vscroll')) { s.style.overflow = 'visible'; s.style.height = 'auto'; s.style.flex = 'none'; }
    document.querySelector('.phone').style.height = 'auto';
  });
  await page.addStyleTag({ content: '* { transform: none !important; }' });
  const h = await page.evaluate(() => Math.ceil(document.querySelector('.phone').getBoundingClientRect().height));
  await page.setViewportSize({ width: W, height: h });
  const words = await page.evaluate(() => {
    const out = [];
    for (const e of document.querySelectorAll('.phone *')) {
      const own = [...e.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
      if (!own.length) continue;
      const cs = getComputedStyle(e);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      let o = 1;
      for (let a = e; a && a.nodeType === 1; a = a.parentElement) o *= +getComputedStyle(a).opacity;
      if (o < 0.05) continue;
      const rg = document.createRange(); rg.selectNodeContents(own[0]);
      const r0 = rg.getBoundingClientRect();
      // cut to what is really drawn — by its own clamp too: a clipped tail is not a word on the page
      let box = { l: r0.left, t: r0.top, r: r0.right, b: r0.bottom };
      for (let a = e; a && a !== document.body; a = a.parentElement) {
        if (getComputedStyle(a).overflow === 'visible') continue;
        const c = a.getBoundingClientRect();
        box = { l: Math.max(box.l, c.left), t: Math.max(box.t, c.top), r: Math.min(box.r, c.right), b: Math.min(box.b, c.bottom) };
      }
      if (box.r - box.l < 2 || box.b - box.t < 2) continue;
      out.push({ say: e.textContent.trim().slice(0, 32), color: cs.color, opacity: o, px: parseFloat(cs.fontSize), family: cs.fontFamily,
        x: box.l, y: box.t, w: box.r - box.l, h: box.b - box.t });
    }
    return out;
  });
  await page.addStyleTag({ content: '* { color: transparent !important; text-shadow: none !important; }' });
  const png = (await page.screenshot({ fullPage: true })).toString('base64');
  const verdict = await page.evaluate(async ({ png, words }) => {
    const img = new Image(); img.src = `data:image/png;base64,${png}`; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const lum = (r, gg, bb) => 0.2126 * lin(r) + 0.7152 * lin(gg) + 0.0722 * lin(bb);
    const faults = []; let worst = 99;
    for (const t of words) {
      const [tr, tg, tb, ta0 = 1] = t.color.match(/[\d.]+/g).map(Number);
      const ta = ta0 * t.opacity;
      const x0 = Math.max(0, Math.floor(t.x)), y0 = Math.max(0, Math.floor(t.y));
      const w = Math.min(c.width - x0, Math.ceil(t.w)), h = Math.min(c.height - y0, Math.ceil(t.h));
      if (w < 1 || h < 1) continue;
      const d = g.getImageData(x0, y0, w, h).data;
      const ratios = [];
      for (let i = 0; i < d.length; i += 4) {
        const L1 = lum(tr * ta + d[i] * (1 - ta), tg * ta + d[i + 1] * (1 - ta), tb * ta + d[i + 2] * (1 - ta));
        const L2 = lum(d[i], d[i + 1], d[i + 2]);
        ratios.push((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05));
      }
      ratios.sort((a, b) => a - b);
      const r5 = ratios[Math.floor(ratios.length * 0.05)];
      const large = t.px >= 24 || (/Rye/.test(t.family) && t.px >= 18.66);
      const need = large ? 3 : 4.5;
      worst = Math.min(worst, r5);
      if (r5 < need) faults.push(`${r5.toFixed(2)} < ${need}  "${t.say}" (${t.px.toFixed(1)}px)`);
    }
    return { count: words.length, worst, faults };
  }, { png, words });
  await page.close();
  return verdict;
}

(async () => {
  const files = screens(SRC, ONLY).map((n) => path.join(SRC, `${n}.html`));
  if (!files.length) { console.error(`no screens in ${SRC}`); process.exit(1); }
  const browser = await chromium.launch();
  let faults = 0;
  for (const file of files) {
    for (const pass of PASSES) {
      const v = await measure(browser, file, pass);
      faults += v.faults.length;
      const name = `${path.basename(file, '.html')}  ${pass.platform === 'ios' ? '' : 'android '}×${pass.f}`;
      console.log(`${name.padEnd(36)} ${v.count} words, worst ${v.worst.toFixed(2)}${v.faults.length ? `  ${v.faults.length} SHORT` : ''}`);
      for (const f of v.faults) console.log(`      ${f}`);
    }
  }
  await browser.close();
  console.log(faults ? `\n${faults} word(s) fall short` : '\nALL READABLE');
  process.exit(faults ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
