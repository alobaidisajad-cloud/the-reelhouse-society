/**
 * The one page every measuring tool opens a rendered screen in.
 * ──────────────────────────────────────────────────────────────────────────
 * A render (`mockups/out/screens/<name>.html`, or `mockups/paper/out/*.html`)
 * is an HTML fragment of the app's resolved tree. This lays it on a phone —
 * 390pt wide unless `width` says otherwise (360 is the narrowest the app
 * targets; a box sized in JS from the window is still sized for 390, so only
 * a layout made of flex alone is honest at another width), the house colour
 * behind it — with the app's OWN font files
 * embedded (never a web font service: a measurement must not depend on a
 * network), and, when asked, at a larger text size exactly as the app allows
 * it: each text grows by the size it carries, capped by its own
 * `maxFontSizeMultiplier` (`data-scale-cap`), frozen text not at all.
 *
 * Playwright comes from the repository root's node_modules.
 */
const fs = require('fs');
const path = require('path');

const MOBILE = path.join(__dirname, '..', '..');
const { chromium } = require(path.join(MOBILE, '..', 'node_modules', 'playwright'));

const HOUSE = '#0D0B09';
const WIDTH = 390;
const HEIGHT = 844;

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

/**
 * Two layout rules where the browser and React Native disagree, set the
 * phone's way for every render:
 *   · a box's width INCLUDES its padding and border (RN is border-box);
 *   · a text is never measured wider than the space its parent gives it — RN
 *     measures text against the available width, so a one-line label in a
 *     narrow cell ellipsises or shrinks to fit INSIDE the cell; a browser lets
 *     a centred text grow to its natural width and spill over its neighbour.
 */
const RN_RULES = '*,*::before,*::after{box-sizing:border-box}span[data-scale-cap]{max-width:100%}';

/**
 * Every render in a folder, by name. A `<name>@<size>.html` is not a screen of
 * its own: it is `<name>` laid out at that text size (see `open`).
 */
function screens(dir, only) {
  const names = fs.readdirSync(dir).filter((f) => f.endsWith('.html') && !f.includes('@')).map((f) => f.slice(0, -5)).sort();
  return only ? names.filter((n) => only.includes(n)) : names;
}

/**
 * How each platform grows a text at the member's setting `f`, given the
 * text's own ceiling `cap` (1 = frozen). Read from React Native 0.81's source,
 * new architecture, which is what this app runs:
 *
 *   ios      size, line height: × min(f, cap)       RCTAttributedTextUtils.mm
 *            letter spacing:    not grown at all     (NSKern, as written)
 *   android  size:              × min(f, cap)       TextAttributeProps.setFontSize
 *            line height:       × f, NO ceiling      TextAttributeProps.setLineHeight
 *            letter spacing:    × f, NO ceiling      TextAttributeProps.getLetterSpacing
 *                               — which the app undoes: AccessibilityProvider
 *                               hands Android spacing ÷ f (androidTracking.ts),
 *                               so it is drawn as iOS draws it, and is here.
 *
 * Android's ceiling-less line height is why it has its own pass: at its
 * largest setting (2×) a text is 1.35× its size on a line 2× as tall. Android
 * 14 grows large sizes a little less than linearly; this grows them linearly,
 * so what it measures is the most Android can draw, never less.
 */
const GROWTH = {
  ios: (f, cap) => ({ size: Math.min(f, cap), line: Math.min(f, cap), track: 1 }),
  android: (f, cap) => ({ size: Math.min(f, cap), line: cap === 1 ? 1 : f, track: 1 }),
};

/**
 * Open one render. `factor` is the member's text size (1 = default; 1.35 is
 * the most this app lets a word grow; Android lets the setting reach 2), and
 * `platform` whose rules grow it (see GROWTH).
 *
 * If the generator also wrote `<name>@<factor>.html` — the screen laid out at
 * that text size, because something on it sizes a box from the text size —
 * that is the one opened. The text in it is still at its base size (the phone
 * grows text natively, not in the style), so it is grown here just the same.
 */
async function open(browser, file, { factor = 1, height = HEIGHT, platform = 'ios', width = WIDTH } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  // A generator that lays a screen out at large sizes writes `@1.35` (iOS) and
  // `@android-1.35` / `@android-2`. iOS grows nothing past 1.35, so its larger
  // settings reuse `@1.35`.
  const variants = (platform === 'ios' ? [`@${Math.min(factor, 1.35)}`] : [`@${platform}-${factor}`])
    .map((v) => file.replace(/\.html$/, `${v}.html`));
  const sized = factor !== 1 ? variants.find((v) => fs.existsSync(v)) : null;
  const html = fs.readFileSync(sized || file, 'utf8');
  await page.setContent(
    `<!doctype html><html><head><meta charset="utf-8"><style>${fonts()}${RN_RULES}</style></head>` +
    `<body style="margin:0;background:${HOUSE}"><div class="phone" style="width:${width}px;min-height:${HEIGHT}px;position:relative;background:${HOUSE}">${html}</div></body></html>`,
    { waitUntil: 'load' },
  );
  await page.evaluate(() => document.fonts.ready);
  if (factor !== 1) {
    await page.evaluate(([f, growth]) => {
      const grow = new Function('f', 'cap', `return (${growth})(f, cap)`);
      // Scale every text box by its own allowance, once, from the size it was
      // rendered at. Nested text inherits nothing: each span carries its size.
      const all = [...document.querySelectorAll('[data-scale-cap]')];
      const plan = all.map((e) => {
        const cs = getComputedStyle(e);
        // 0 means the Text set no cap of its own: AccessibilityProvider gives
        // every Text the app-wide 1.35 (scaledTextProps). 1 means frozen.
        const cap = Number(e.dataset.scaleCap);
        const g = grow(f, cap === 0 ? 1.35 : cap);
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
async function shrinkToFit(page) {
  await page.evaluate(() => {
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
      // No tolerance: a label a fraction of a point too wide is still drawn with
      // "…" — the phone shrinks it that last fraction, so this does too.
      if (getComputedStyle(e).display === 'inline') return true;
      // scrollWidth and clientWidth are WHOLE pixels: 23.4pt of figures in a
      // 23.3pt box reads 23 and 23, "fits", and is drawn "99…". The glyphs'
      // own extent against the box is measured unrounded.
      const box = e.getBoundingClientRect();
      const r = document.createRange(); r.selectNodeContents(e);
      if (r.getBoundingClientRect().width > box.width + 0.05) return false;
      return e.scrollWidth <= e.clientWidth && e.scrollHeight <= e.clientHeight;
    };
    for (const e of document.querySelectorAll('span[data-fit-min]')) {
      const min = Number(e.dataset.fitMin || 0);
      if (!min || fits(e)) continue;
      const base = parseFloat(getComputedStyle(e).fontSize);
      const ls = parseFloat(getComputedStyle(e).letterSpacing) || 0;
      let fitted = false;
      for (let k = 0.97; k >= min - 1e-6; k -= 0.03) {
        e.style.fontSize = base * k + 'px';
        if (ls) e.style.letterSpacing = ls * k + 'px';
        if (fits(e)) { fitted = true; break; }
      }
      // The phone shrinks smoothly, down to EXACTLY its floor; steps of 0.03
      // stop short of it (from 12pt with a 10pt floor the last step is 10.2).
      // So the floor itself is tried last, as the phone would reach it.
      if (!fitted) {
        e.style.fontSize = base * min + 'px';
        if (ls) e.style.letterSpacing = ls * min + 'px';
      }
    }
  });
}

module.exports = { chromium, open, shrinkToFit, screens, fonts, GROWTH, HOUSE, WIDTH, HEIGHT, MOBILE };
