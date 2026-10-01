/**
 * The one page every measuring tool opens a rendered screen in.
 * ──────────────────────────────────────────────────────────────────────────
 * A render (`mockups/out/screens/<name>.html`, or `mockups/paper/out/*.html`)
 * is an HTML fragment of the app's resolved tree. This lays it on a device from
 * mockups/devices.json (390pt unless `width` says otherwise, at that device's
 * height), on the house colour, in the app's OWN font files embedded (never a
 * web font service: a measurement must not depend on a network), and, when
 * asked, at a larger text size as the platform grows it (see GROWTH).
 *
 * A screen that sizes boxes in code from the window is honest only at the width
 * it was DRAWN at: draw it there first (MOCKUPS_WIDTH=320 writes out/screens-320).
 *
 * Playwright comes from the repository root's node_modules.
 */
const fs = require('fs');
const path = require('path');

const MOBILE = path.join(__dirname, '..', '..');
const playwright = require(path.join(MOBILE, '..', 'node_modules', 'playwright'));

// Text is measured UNHINTED, as a phone sets it. At one pixel per point Linux hints glyphs,
// snapping each advance to a whole pixel, while Windows keeps fractions: a letterspaced
// word measured 2.8pt wider in CI than here. Windows ignores the flag; it is already unhinted.
const chromium = Object.create(playwright.chromium);
chromium.launch = (options = {}) => playwright.chromium.launch({
  ...options, args: [...(options.args || []), '--font-render-hinting=none'],
});

const HOUSE = '#0D0B09';
// The one device list (mockups/devices.json), shared with the generators.
const DEVICES = JSON.parse(fs.readFileSync(path.join(MOBILE, 'mockups', 'devices.json'), 'utf8'));
const WIDTH = DEVICES.default;
const HEIGHT = DEVICES.heightAt[WIDTH];
const heightAt = (width) => {
  const h = DEVICES.heightAt[width];
  if (!h) throw new Error(`width ${width} is not in mockups/devices.json (${Object.keys(DEVICES.heightAt).join(', ')})`);
  return h;
};

const FACES = [
  ['Rye', 'rye/400Regular/Rye_400Regular.ttf', 400, 'normal'],
  ['Special Elite', 'special-elite/400Regular/SpecialElite_400Regular.ttf', 400, 'normal'],
  ['Courier Prime', 'courier-prime/400Regular/CourierPrime_400Regular.ttf', 400, 'normal'],
  ['Courier Prime', 'courier-prime/400Regular_Italic/CourierPrime_400Regular_Italic.ttf', 400, 'italic'],
  ['Courier Prime', 'courier-prime/700Bold/CourierPrime_700Bold.ttf', 700, 'normal'],
  ['Spectral', 'spectral/400Regular/Spectral_400Regular.ttf', 400, 'normal'],
  ['Spectral', 'spectral/400Regular_Italic/Spectral_400Regular_Italic.ttf', 400, 'italic'],
  ['Spectral', 'spectral/500Medium/Spectral_500Medium.ttf', 500, 'normal'],
];
let fontCss = null;
function fonts() {
  if (fontCss) return fontCss;
  fontCss = FACES.map(([family, file, weight, style]) => {
    const data = fs.readFileSync(path.join(MOBILE, 'node_modules', '@expo-google-fonts', file)).toString('base64');
    return `@font-face{font-family:'${family}';src:url(data:font/ttf;base64,${data}) format('truetype');font-weight:${weight};font-style:${style}}`;
  }).join('\n');
  return fontCss;
}

// The phone's way where the browser differs: border-box; text no wider than its parent;
// a box in a COLUMN no wider than it less its own margins (`--mx`, not inherited), unless
// it has its own `;width:` or is absolute (Yoga lets those overflow).
const RN_RULES = '@property --mx{syntax:"<length>";inherits:false;initial-value:0px}'
  + '*,*::before,*::after{box-sizing:border-box}span[data-scale-cap]{max-width:100%}'
  + 'div[style*="flex-direction:column"]>div:not([style*=";width:"]):not([style^="width:"]):not([style*="position:absolute"]){max-width:calc(100% - var(--mx))}';

/**
 * Every render in a folder, by name. A `<name>@<size>.html` is not a screen of
 * its own: it is `<name>` laid out at that text size (see `open`).
 */
function screens(dir, only) {
  const names = fs.readdirSync(dir).filter((f) => f.endsWith('.html') && !f.includes('@')).map((f) => f.slice(0, -5)).sort();
  return only ? names.filter((n) => only.includes(n)) : names;
}

// How a platform grows a text at setting `f` under its cap (1 = frozen), from RN 0.81's
// new-architecture source; linear (Android 14 grows large sizes a little less).
const GROWTH = {
  // RCTAttributedTextUtils.mm: size and line × min(f, cap); spacing (NSKern) never.
  ios: (f, cap) => ({ size: Math.min(f, cap), line: Math.min(f, cap), track: 1 }),
  // TextAttributeProps: size × min(f, cap); line and spacing × f, NO ceiling (the
  // app's Text hands a capped text's spacing ÷ f: androidTracking.ts).
  android: (f, cap) => ({
    size: Math.min(f, cap), line: cap === 1 ? 1 : f, track: Number.isFinite(cap) ? 1 : f }),
};

/**
 * Open one render, at the member's text size `factor` (1 = default) grown by
 * `platform`'s rules (see GROWTH). A `<name>@<size>.html` the generator laid out
 * at that size (a box sized from the text size) is opened instead; its text is
 * still at base size, as the phone grows text natively, so it is grown here too.
 */
async function open(browser, file, { factor = 1, platform = 'ios', width = WIDTH, height = heightAt(width) } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  // Written as `@1.35` (iOS; larger iOS sizes reuse it) and `@android-<f>`.
  const variants = (platform === 'ios' ? [`@${Math.min(factor, 1.35)}`] : [`@${platform}-${factor}`])
    .map((v) => file.replace(/\.html$/, `${v}.html`));
  const sized = factor !== 1 ? variants.find((v) => fs.existsSync(v)) : null;
  const html = fs.readFileSync(sized || file, 'utf8');
  await page.setContent(
    `<!doctype html><html><head><meta charset="utf-8"><style>${fonts()}${RN_RULES}</style></head>` +
    // The phone: its exact height, a flex column like RN's root, so `flex: 1` fills it.
    `<body style="margin:0;background:${HOUSE}"><div class="phone" style="width:${width}px;height:${height}px;position:relative;display:flex;flex-direction:column;background:${HOUSE}">${html}</div></body></html>`,
    { waitUntil: 'load' },
  );
  await page.evaluate(() => document.fonts.ready);
  if (factor !== 1) {
    await page.evaluate(([f, growth]) => {
      const grow = new Function('f', 'cap', `return (${growth})(f, cap)`);
      // Each text grown once by its own allowance (a nested span carries its own size).
      const all = [...document.querySelectorAll('[data-scale-cap]')];
      const plan = all.map((e) => {
        const cs = getComputedStyle(e);
        // 0: it escaped the app's Text (which gives 1.35), so on a phone it has NO cap.
        const cap = Number(e.dataset.scaleCap);
        const g = grow(f, cap === 0 ? Infinity : cap);
        const ls = parseFloat(cs.letterSpacing);
        return [e, parseFloat(cs.fontSize) * g.size,
          cs.lineHeight === 'normal' ? null : parseFloat(cs.lineHeight) * g.line,
          Number.isFinite(ls) && ls !== 0 ? ls * g.track : null];
      });
      for (const [e, size, lh, ls] of plan) {
        e.style.fontSize = size + 'px';
        if (lh) e.style.lineHeight = lh + 'px';
        if (ls !== null) e.style.letterSpacing = ls + 'px';
      }
    }, [factor, GROWTH[platform].toString()]);
    await page.evaluate(() => document.fonts.ready);
  }
  return page;
}

/**
 * Shrink-to-fit, as the phone does it: a label that may shrink
 * (`adjustsFontSizeToFit`, `data-fit-min`) steps down toward its floor until
 * it fits its own box and every ancestor that clips it. ONE implementation,
 * used by the audit and the camera alike — a photograph that skips this shows
 * "Max von May…" where the phone draws the whole name a little smaller.
 */
/**
 * How far a label may shrink at the size it is drawn now, as the app's Text
 * holds it (src/components/text: a word never shrinks under 10pt, or under its
 * own size if it is set smaller). `data-fit-min` is the fraction the capture
 * drew at ×1; where that was the floor's own fraction, the screen asked for
 * that or less, and at a larger size the floor is what holds. Without a base
 * size (a page drawn by hand) the fraction is taken as written.
 */
function fitMinOf(e) {
  const asked = Number(e.dataset.fitMin || 0);
  const base = Number(e.dataset.fitBase || 0);
  if (!asked || !base) return asked;
  const floor = Math.min(10, base);
  if (asked > floor / base + 1e-6) return asked;
  return Math.min(1, floor / parseFloat(getComputedStyle(e).fontSize));
}

async function shrinkToFit(page) {
  await page.evaluate((fitMinSrc) => {
    const fitMinOf = new Function(`return (${fitMinSrc})`)();
    const truncates = (e) => { const cs = getComputedStyle(e); return cs.textOverflow === 'ellipsis' || cs.webkitLineClamp !== 'none' && cs.webkitLineClamp !== ''; };
    const rectOf = (e) => {
      const box = e.getBoundingClientRect();
      if (truncates(e)) return box;
      const r = document.createRange(); r.selectNodeContents(e);
      const g = r.getBoundingClientRect();
      const block = getComputedStyle(e).display !== 'inline';
      return block ? { left: g.left, right: g.right, top: box.top, bottom: box.bottom } : g;
    };
    const fits = (e) => {
      const q = rectOf(e);
      for (let a = e.parentElement; a && !a.classList.contains('phone'); a = a.parentElement) {
        if (a.classList.contains('hscroll') || a.classList.contains('vscroll')) break;
        const cs = getComputedStyle(a);
        if (cs.overflow === 'visible' && cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
        const b = a.getBoundingClientRect();
        if (q.right > b.right + 0.75 || q.left < b.left - 0.75 || q.bottom > b.bottom + 0.75 || q.top < b.top - 0.75) return false;
      }
      if (getComputedStyle(e).display === 'inline') return true;
      // No tolerance, and unrounded (scroll widths are whole pixels): a fraction too
      // wide is drawn "99…", so the phone shrinks that last fraction too.
      const box = e.getBoundingClientRect();
      const r = document.createRange(); r.selectNodeContents(e);
      if (r.getBoundingClientRect().width > box.width + 0.05) return false;
      return e.scrollWidth <= e.clientWidth && e.scrollHeight <= e.clientHeight;
    };
    for (const e of document.querySelectorAll('span[data-fit-min]')) {
      const min = fitMinOf(e);
      if (!min || fits(e)) continue;
      const base = parseFloat(getComputedStyle(e).fontSize);
      const ls = parseFloat(getComputedStyle(e).letterSpacing) || 0;
      let fitted = false;
      for (let k = 0.97; k >= min - 1e-6; k -= 0.03) {
        e.style.fontSize = base * k + 'px';
        if (ls) e.style.letterSpacing = ls * k + 'px';
        if (fits(e)) { fitted = true; break; }
      }
      // The phone reaches EXACTLY its floor, which 0.03 steps can miss: set it last.
      if (!fitted) {
        e.style.fontSize = base * min + 'px';
        if (ls) e.style.letterSpacing = ls * min + 'px';
      }
    }
  }, fitMinOf.toString());
}

module.exports = { chromium, open, shrinkToFit, fitMinOf, screens, fonts, GROWTH, HOUSE, WIDTH, HEIGHT, MOBILE };
