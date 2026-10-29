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
 *   node mockups/tools/contrast.cjs [--src DIR] [--only a,b] [--width 390] [--controls]
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

/**
 * The page photographed in overlapping bands: one picture of a stack 500 films long is too tall
 * to decode. Every box measured is shorter than the overlap, so each lies whole in some band.
 */
const BAND = 4000, OVERLAP = 600;
async function photograph(page) {
  const { width, height } = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }));
  const bands = [];
  for (let y = 0; ; y += BAND - OVERLAP) {
    const tall = Math.min(BAND, height - y);
    bands.push({ y, png: (await page.screenshot({ fullPage: true, clip: { x: 0, y, width, height: tall } })).toString('base64') });
    if (y + tall >= height) break;
  }
  return bands;
}
/** Puts `window.picture(bands)` on the page: the bands decoded, read as one picture by `read(x, y, w, h)`. */
const installPicture = () => {
  window.picture = async (bands) => {
    const tiles = [];
    for (const b of bands) {
      const img = new Image(); img.src = `data:image/png;base64,${b.png}`; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
      tiles.push({ g, y: b.y, h: img.height });
    }
    const last = tiles[tiles.length - 1];
    // A box's pixels from the first band that holds it whole (or, taller than the overlap, from its top down).
    const read = (x, y, w, h) => {
      const t = tiles.find((s) => y >= s.y && y + h <= s.y + s.h) || tiles.find((s) => y >= s.y && y < s.y + s.h);
      return t.g.getImageData(x, y - t.y, w, Math.min(h, t.y + t.h - y)).data;
    };
    return { w: tiles[0].g.canvas.width, h: last.y + last.h, read };
  };
};

async function measure(browser, file, pass) {
  const page = await open(browser, file, { platform: pass.platform, factor: pass.f, width: W });
  // the whole scroll, as one tall page: a word below the fold is still a word
  await page.evaluate(() => {
    for (const s of document.querySelectorAll('.vscroll')) { s.style.overflow = 'visible'; s.style.height = 'auto'; s.style.flex = 'none'; }
    // Grown to its whole scroll, never shrunk below the phone: a sheet is drawn anchored to the
    // phone's foot, and a frame shrunk to a short page put it above the picture, unmeasured.
    const phone = document.querySelector('.phone');
    phone.style.minHeight = `${phone.getBoundingClientRect().height}px`;
    phone.style.height = 'auto';
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
  // A screen that drew no words (a capture taken as it navigated away) has nothing to measure,
  // and no height to photograph.
  if (!words.length || h < 1) { await page.close(); return { count: 0, worst: 99, faults: [] }; }
  await page.addStyleTag({ content: '* { color: transparent !important; text-shadow: none !important; }' });
  const bands = await photograph(page);
  await page.evaluate(installPicture);
  const verdict = await page.evaluate(async ({ bands, words }) => {
    const P = await window.picture(bands);
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const lum = (r, gg, bb) => 0.2126 * lin(r) + 0.7152 * lin(gg) + 0.0722 * lin(bb);
    const faults = []; let worst = 99;
    for (const t of words) {
      const [tr, tg, tb, ta0 = 1] = t.color.match(/[\d.]+/g).map(Number);
      const ta = ta0 * t.opacity;
      const x0 = Math.max(0, Math.floor(t.x)), y0 = Math.max(0, Math.floor(t.y));
      const w = Math.min(P.w - x0, Math.ceil(t.w)), h = Math.min(P.h - y0, Math.ceil(t.h));
      if (w < 1 || h < 1) continue;
      const d = P.read(x0, y0, w, h);
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
  }, { bands, words });
  await page.close();
  return verdict;
}

/**
 * --controls: what identifies a control, against what is around it, at 3:1
 * (WCAG 1.4.11). Words are measured above; here:
 *   FIELD  a text field's edge — any side's border, or its fill — against the
 *          ground just outside it: an empty field must be seen to be a field.
 *   ICON   the icon of a control that has no words of its own, against the
 *          ground really under it (the worst 5% of those pixels, as a word's).
 */
async function measureControls(browser, file, pass) {
  const page = await open(browser, file, { platform: pass.platform, factor: pass.f, width: W });
  await page.evaluate(() => {
    for (const s of document.querySelectorAll('.vscroll')) { s.style.overflow = 'visible'; s.style.height = 'auto'; s.style.flex = 'none'; }
    // Grown to its whole scroll, never shrunk below the phone: a sheet is drawn anchored to the
    // phone's foot, and a frame shrunk to a short page put it above the picture, unmeasured.
    const phone = document.querySelector('.phone');
    phone.style.minHeight = `${phone.getBoundingClientRect().height}px`;
    phone.style.height = 'auto';
  });
  await page.addStyleTag({ content: '* { transform: none !important; color: transparent !important; text-shadow: none !important; }' });
  const h = await page.evaluate(() => Math.ceil(document.querySelector('.phone').getBoundingClientRect().height));
  await page.setViewportSize({ width: W, height: h });
  const found = await page.evaluate((ALLOW_FIELDS) => {
    const seen = (e) => {
      let o = 1;
      for (let a = e; a && a.nodeType === 1; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (cs.display === 'none' || cs.visibility === 'hidden' || a.getAttribute('aria-hidden') === 'true') return 0;
        o *= +cs.opacity;
      }
      return o;
    };
    const site = (e) => e.closest('[data-src]')?.dataset.src || '';
    // A field drawn with no edge of its own sits in a box that has one (a search bar's frame):
    // that box is the field a member sees, and the one measured.
    // A field's drawn sides, from its own React Native style where the capture carries it: a
    // border that is not whole points (1.5) is drawn here as an inset shadow, not a border.
    const sidesOf = (e) => {
      let rn = {};
      try { rn = JSON.parse(e.dataset.rn || '{}'); } catch { /* the computed style alone */ }
      const cs = getComputedStyle(e);
      return ['Top', 'Right', 'Bottom', 'Left'].filter((s) => {
        const w = rn[`border${s}Width`] ?? rn.borderWidth;
        return (typeof w === 'number' ? w : parseFloat(cs[`border${s}Width`])) >= 0.5;
      });
    };
    const edged = (e) => sidesOf(e).length > 0
      || !/rgba\(0, 0, 0, 0\)|transparent/.test(getComputedStyle(e).backgroundColor);
    // A field drawn with no box of its own (a test's bare field, unstyled) is not a screen's.
    const fields = [...document.querySelectorAll('[data-field]')]
      .filter((e) => seen(e) > 0.05 && e.getBoundingClientRect().height > 8).map((e) => {
        let box = e;
        for (let a = e, i = 0; a && i < 4 && !edged(box); a = a.parentElement, i++) if (edged(a)) box = a;
        const r = box.getBoundingClientRect();
        return { say: e.dataset.field || '(a field)', src: site(e), x: r.left, y: r.top, w: r.width, h: r.height, sides: sidesOf(box) };
      }).filter((f) => f.w > 8 && f.h > 8 && !(f.say in ALLOW_FIELDS));
    // A control with no words of its own is known by its icon alone.
    const icons = [];
    for (const c of document.querySelectorAll('[data-press]')) {
      if (seen(c) < 0.05) continue;
      const words = [...c.querySelectorAll('span[data-scale-cap]')].some((s) => s.textContent.trim() && seen(s) > 0.05);
      if (words) continue;
      for (const svg of c.querySelectorAll('svg')) {
        if (seen(svg) < 0.05) continue;
        const r = svg.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) continue;
        const ink = [svg, ...svg.querySelectorAll('*')].map((n) => {
          const cs = getComputedStyle(n);
          const s = cs.stroke !== 'none' && parseFloat(cs.strokeWidth) > 0 ? cs.stroke : null;
          const f = cs.fill !== 'none' && !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.fill) ? cs.fill : null;
          return s || f;
        }).find((x) => x && /^rgb/.test(x));
        if (!ink) continue;
        icons.push({ say: c.getAttribute('aria-label') || '(an icon)', src: site(c), color: ink, opacity: seen(svg), x: r.left, y: r.top, w: r.width, h: r.height });
      }
    }
    return { fields, icons };
  }, ALLOW_FIELDS);
  // Drawn off the photographed page (a sheet a test mounted with no screen under it hangs above
  // the top): not measured here, and said; it is measured where a screen draws it in place.
  const onPage = (b) => b.y >= 0 && b.y + b.h <= h;
  const off = found.fields.filter((b) => !onPage(b)).length + found.icons.filter((b) => !onPage(b)).length;
  found.fields = found.fields.filter(onPage);
  found.icons = found.icons.filter(onPage);
  if ((!found.fields.length && !found.icons.length) || h < 1) { await page.close(); return { count: 0, worst: 99, faults: [], off }; }
  const drawn = await photograph(page);
  await page.addStyleTag({ content: 'svg { visibility: hidden !important; }' });
  const bare = await photograph(page);
  await page.evaluate(installPicture);
  const verdict = await page.evaluate(async ({ drawn, bare, found }) => {
    const A = await window.picture(drawn);
    const B = await window.picture(bare);
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const ratio = (L1, L2) => (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    // The median luminance along a line of pixels (x0,y0)→(x1,y1), one pixel thick.
    // The luminance at quantile q along a line of pixels (x0,y0)→(x1,y1), one pixel thick.
    const line = (P, x0, y0, x1, y1, q = 0.5) => {
      const out = [];
      const n = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
      for (let i = 0; i <= n; i++) {
        // The pixel the point falls in: a 1pt edge at b - 0.5 is row b - 1, which rounding missed.
        const x = Math.floor(x0 + ((x1 - x0) * i) / n), y = Math.floor(y0 + ((y1 - y0) * i) / n);
        if (x < 0 || y < 0 || x >= P.w || y >= P.h) continue;
        const d = P.read(x, y, 1, 1);
        out.push(lum(d[0], d[1], d[2]));
      }
      out.sort((a, b) => a - b);
      return out.length ? out[Math.min(out.length - 1, Math.floor(out.length * q))] : null;
    };
    // An edge is its ink: a dashed one is half gaps, so it is read at whichever end of its
    // pixels stands further from the ground (its gaps are the ground itself).
    const edge = (P, x0, y0, x1, y1, ground) => {
      const lo = line(P, x0, y0, x1, y1, 0.25), hi = line(P, x0, y0, x1, y1, 0.75);
      if (lo === null || ground === null) return null;
      return ratio(lo, ground) > ratio(hi, ground) ? lo : hi;
    };
    const faults = []; let worst = 99; let count = 0;
    for (const f of found.fields) {
      count++;
      const { x, y, w, h } = f;
      const r = x + w, b = y + h;
      // Each drawn side: its edge pixels against the ground 3pt outside it.
      const out = { Top: line(A, x + 4, y - 3, r - 4, y - 3), Bottom: line(A, x + 4, b + 3, r - 4, b + 3),
        Left: line(A, x - 3, y + 4, x - 3, b - 4), Right: line(A, r + 3, y + 4, r + 3, b - 4) };
      const edges = {
        Top: [edge(A, x + 4, y + 0.5, r - 4, y + 0.5, out.Top), out.Top],
        Bottom: [edge(A, x + 4, b - 0.5, r - 4, b - 0.5, out.Bottom), out.Bottom],
        Left: [edge(A, x + 0.5, y + 4, x + 0.5, b - 4, out.Left), out.Left],
        Right: [edge(A, r - 0.5, y + 4, r - 0.5, b - 4, out.Right), out.Right],
      };
      const by = f.sides.map((s) => edges[s]).filter(([e, o]) => e !== null && o !== null).map(([e, o]) => ratio(e, o));
      // Its fill, a little inside, against the ground outside it.
      const fill = line(A, x + 6, y + h / 2, r - 6, y + h / 2);
      const outside = [edges.Top[1], edges.Bottom[1]].filter((v) => v !== null);
      if (fill !== null && outside.length) by.push(Math.min(...outside.map((o) => ratio(fill, o))));
      const best = by.length ? Math.max(...by) : 1;
      worst = Math.min(worst, best);
      if (best < 3) faults.push(`FIELD ${best.toFixed(2)} < 3  "${f.say}"${f.src ? ` [${f.src}]` : ''}  (box ${Math.round(x)},${Math.round(y)} ${Math.round(w)}×${Math.round(h)}, edges ${f.sides.join('/') || 'none'})`);
    }
    for (const t of found.icons) {
      count++;
      const [tr, tg, tb, ta0 = 1] = t.color.match(/[\d.]+/g).map(Number);
      const ta = ta0 * t.opacity;
      const x0 = Math.max(0, Math.floor(t.x)), y0 = Math.max(0, Math.floor(t.y));
      const w = Math.min(B.w - x0, Math.ceil(t.w)), h = Math.min(B.h - y0, Math.ceil(t.h));
      if (w < 1 || h < 1) continue;
      const d = B.read(x0, y0, w, h);
      const rs = [];
      for (let i = 0; i < d.length; i += 4) {
        rs.push(ratio(lum(tr * ta + d[i] * (1 - ta), tg * ta + d[i + 1] * (1 - ta), tb * ta + d[i + 2] * (1 - ta)), lum(d[i], d[i + 1], d[i + 2])));
      }
      rs.sort((a, b) => a - b);
      const r5 = rs[Math.floor(rs.length * 0.05)];
      worst = Math.min(worst, r5);
      if (r5 < 3) faults.push(`ICON ${r5.toFixed(2)} < 3  "${t.say}"${t.src ? ` [${t.src}]` : ''}  (box ${Math.round(t.x)},${Math.round(t.y)} ${Math.round(t.w)}×${Math.round(t.h)}, ink ${t.color})`);
    }
    return { count, worst, faults };
  }, { drawn, bare, found });
  await page.close();
  return { ...verdict, off };
}

const CONTROLS = args.includes('--controls');

/**
 * Writing surfaces that are a page, not a box: the fields listed in mockups/field-edge-exceptions.txt
 * ("<its spoken name> — <why>"), whose edge --controls does not measure.
 */
const ALLOW_FIELDS = Object.fromEntries(require('fs').readFileSync(path.join(MOBILE, 'mockups', 'field-edge-exceptions.txt'), 'utf8')
  .split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#')).map((l) => l.split(' — ')).map(([label, why]) => [label.trim(), why]));

(async () => {
  const files = screens(SRC, ONLY).map((n) => path.join(SRC, `${n}.html`));
  if (!files.length) { console.error(`no screens in ${SRC}`); process.exit(1); }
  const browser = await chromium.launch();
  let faults = 0;
  for (const file of files) {
    for (const pass of PASSES) {
      // A screen that cannot be photographed is not passed: it is said, and counted.
      const v = await (CONTROLS ? measureControls : measure)(browser, file, pass)
        .catch((e) => ({ count: 0, worst: 0, faults: [`UNMEASURED: ${String(e.message || e).split('\n')[0]}`] }));
      faults += v.faults.length;
      const name = `${path.basename(file, '.html')}  ${pass.platform === 'ios' ? '' : 'android '}×${pass.f}`;
      console.log(`${name.padEnd(36)} ${v.count} ${CONTROLS ? 'controls' : 'words'}, worst ${v.worst.toFixed(2)}${v.faults.length ? `  ${v.faults.length} SHORT` : ''}${v.off ? `  (${v.off} off the page)` : ''}`);
      for (const f of v.faults) console.log(`      ${f}`);
    }
  }
  await browser.close();
  console.log(faults ? `\n${faults} ${CONTROLS ? 'control(s)' : 'word(s)'} fall short` : CONTROLS ? '\nALL SEEN' : '\nALL READABLE');
  process.exit(faults ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
