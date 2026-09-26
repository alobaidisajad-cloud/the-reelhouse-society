/**
 * LAYOUT — does every word fit where it is set, at every text size the app allows?
 * ──────────────────────────────────────────────────────────────────────────
 * For each render, at each text size (default ×1 and ×1.35), every text box is
 * checked for:
 *
 *   CUT      its glyphs reach past an ancestor that clips (overflow hidden),
 *            sideways OR downward — a label cut in half vertically is as lost
 *            as one cut at the side (an earlier audit only measured width);
 *   OFF      it runs off the phone's edge, outside a horizontal rail;
 *   CLASH    its lines overlap another text's lines;
 *   RUN      one of its words is wider than the line it is set on — a pasted
 *            link, `Daring...Unforgettable...`. The phone breaks such a word
 *            mid-letter (or shrinks it below the type floor), so it is a
 *            fault at every size, and it is checked before any shrink.
 *   HANG     a mark's count (MarkFigure) that touches its icon, runs past its
 *            reach (its own column, or for an 'open' bar the next icon), is
 *            cut short, or was shrunk below the 10pt floor. None of those is a
 *            text box crossing a clipping ancestor, so CUT and CLASH cannot
 *            see them.
 *
 * What is NOT a fault, because the phone does it on purpose:
 *   · a one-line text that ellipsises, or a clamped one — the clamp IS the
 *     design; only the box itself is checked against its ancestors;
 *   · a label that shrinks to fit (`adjustsFontSizeToFit`) — it is shrunk here
 *     exactly as far as the phone would shrink it, and is a fault only if even
 *     its floor does not fit;
 *   · anything inside a scroller, which is reached by scrolling.
 *
 *   node mockups/tools/layout.cjs [--src DIR] [--only a,b] [--skip c,d] [--passes ios@1,android@2] [--width 360] [--shorts] [--json OUT]
 *   exits 1 when anything is found.
 */
const fs = require('fs');
const path = require('path');
const { chromium, open, shrinkToFit, screens, MOBILE, WIDTH } = require('./harness.cjs');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
// The phone's width. 360 is the narrowest the app targets — see harness.open
// for which renders are honest at a width other than the one they were made at.
const PHONE_W = Number(opt('width', WIDTH));
const SRC = path.resolve(opt('src', path.join(MOBILE, 'mockups', 'out', 'screens')));
const ONLY = opt('only') ? opt('only').split(',') : null;
// Plates that are not the app: a proposal kept for comparison, never shipped.
const SKIP = opt('skip') ? opt('skip').split(',') : [];
/**
 * The passes: a platform and a text-size setting each. iOS grows nothing past
 * the app's 1.35, so 1.35 is its largest case. Android grows line height and
 * tracking with no ceiling (see harness GROWTH), so it is measured at its own
 * largest setting, 2, as well. `--passes ios@1,android@2` to choose.
 */
const PASSES = opt('passes', opt('factors') ? opt('factors').split(',').map((f) => `ios@${f}`).join(',') : 'ios@1,ios@1.35,android@1.35,android@2')
  .split(',').map((p) => { const [platform, f] = p.split('@'); return { platform, f: Number(f) }; });
const JSON_OUT = opt('json');
// Also list every text the phone shortens ("…" or a clamp) — for reading, not a fault.
const SHORTS = args.includes('--shorts');

/**
 * What both page passes need, defined ONCE as real code and installed in the
 * page as `window.RN` — a pass runs inside the page and cannot import.
 */
function pageHelpers() {
    const phone = document.querySelector('.phone').getBoundingClientRect();
    const opacityOf = (e) => { let o = 1; for (let x = e; x && x.nodeType === 1; x = x.parentElement) o *= +getComputedStyle(x).opacity; return o; };
    const truncates = (e) => { const cs = getComputedStyle(e); return cs.textOverflow === 'ellipsis' || cs.webkitLineClamp !== 'none' && cs.webkitLineClamp !== ''; };
    const texts = [...document.querySelectorAll('span[data-scale-cap]')].filter((e) =>
      [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
    // Sideways, the glyphs' own extent; down, the text's LINE boxes — a tall
    // face (a drop cap in Rye) has a font box taller than the line it is set
    // in, and that is how the design sets it, not a cut.
    const rectOf = (e) => {
      const box = e.getBoundingClientRect();
      if (truncates(e)) return box;
      const r = document.createRange(); r.selectNodeContents(e);
      const g = r.getBoundingClientRect();
      const block = getComputedStyle(e).display !== 'inline';
      return block ? { left: g.left, right: g.right, top: box.top, bottom: box.bottom, width: g.width, height: box.height } : g;
    };
    // A text parked thousands of points away is an export canvas laid out
    // off-screen on purpose (a picture to share), not a word on this screen.
    const parked = (q) => q.right < phone.left - 1000 || q.left > phone.right + 1000 || q.bottom < phone.top - 1000;
    const linesOf = (e) => {
      if (truncates(e)) return [e.getBoundingClientRect()];
      const r = document.createRange(); r.selectNodeContents(e);
      return [...r.getClientRects()].filter((q) => q.width > 0.5 && q.height > 0.5);
    };
    return { phone, opacityOf, truncates, texts, rectOf, parked, linesOf };
}

async function audit(page) {
  await page.addScriptTag({ content: `window.RN = (${pageHelpers})();` });

  // 1 · RUN — before anything shrinks.
  await page.evaluate(() => {
    const { texts } = window.RN;
    // RUN: a word wider than the line it is set on. Asked BEFORE any shrink,
    // and by the text's LINES, not its box — a clamped text is otherwise
    // measured by its box, which never grows, so the word ran past the phone's
    // edge unseen. On a phone the word is broken mid-letter instead (or, where
    // it may shrink, drawn below the type floor); neither is a fit.
    //
    // A text that may SHRINK is laid out the way the phone lays it out: the
    // largest size, down to its floor, at which it fits its line limit with
    // words allowed to break mid-letter (that is how the phone counts lines).
    // It is a fault only if, at the size chosen, a word is still wider than
    // its line — so a title that shrinks until its long word fits is not one,
    // and a tagline that stops shrinking as soon as a broken word squeezes it
    // into three lines is.
    const hostOf = (e) => { let h = e; while (h.parentElement && getComputedStyle(h).display === 'inline') h = h.parentElement; return h; };
    const overlong = (e, host) => {
      const hb = host.getBoundingClientRect();
      const hs = getComputedStyle(host);
      const left = hb.left + parseFloat(hs.paddingLeft) + parseFloat(hs.borderLeftWidth);
      const right = hb.right - parseFloat(hs.paddingRight) - parseFloat(hs.borderRightWidth);
      const r = document.createRange(); r.selectNodeContents(e);
      return Math.max(0, ...[...r.getClientRects()].filter((q) => q.width > 0.5).map((q) => Math.max(q.right - right, left - q.left)));
    };
    const lineCount = (host) => {
      const r = document.createRange(); r.selectNodeContents(host);
      return new Set([...r.getClientRects()].filter((q) => q.width > 0.5).map((q) => Math.round(q.top))).size;
    };
    for (const e of texts) {
      if (getComputedStyle(e).whiteSpace === 'nowrap') continue; // one line: ellipsis or shrink, judged below
      const host = hostOf(e);
      const min = Number(e.dataset.fitMin || 0);
      const limit = parseInt(getComputedStyle(host).webkitLineClamp, 10);
      if (!min || e !== host || !(limit > 0)) {
        const over = overlong(e, host);
        if (over > 0.75) e.dataset.run = String(over);
        continue;
      }
      const st = e.style;
      const saved = [st.fontSize, st.letterSpacing, st.overflowWrap, st.webkitLineClamp];
      const cs = getComputedStyle(e);
      const base = parseFloat(cs.fontSize);
      const ls = parseFloat(cs.letterSpacing) || 0;
      const size = (k) => { st.fontSize = base * k + 'px'; if (ls) st.letterSpacing = ls * k + 'px'; };
      st.webkitLineClamp = 'unset';
      st.overflowWrap = 'anywhere';
      let chosen = min;
      for (let k = 1; k >= min - 1e-6; k -= 0.02) { size(k); if (lineCount(e) <= limit) { chosen = k; break; } }
      size(chosen);
      st.overflowWrap = 'normal';
      const over = overlong(e, host);
      [st.fontSize, st.letterSpacing, st.overflowWrap, st.webkitLineClamp] = saved;
      if (over > 0.75) e.dataset.run = String(over);
    }
  });

  // 2 · shrink-to-fit, exactly as the camera does (harness.shrinkToFit).
  await shrinkToFit(page);

  // 3 · the faults, on the page as the phone draws it.
  return page.evaluate((SHORTS) => {
    const { phone, opacityOf, truncates, texts, rectOf, parked, linesOf } = window.RN;
    const runs = [...document.querySelectorAll('[data-run]')].map((e) => [e, Number(e.dataset.run)]);
    const found = [];
    const live = texts.filter((e) => opacityOf(e) > 0.05 && getComputedStyle(e).visibility !== 'hidden');
    const invisible = texts.length - live.length;
    const say = (e) => e.textContent.trim().replace(/\s+/g, ' ').slice(0, 48);
    for (const [e, over] of runs) {
      if (!live.includes(e) || parked(e.getBoundingClientRect())) continue;
      found.push({ kind: 'RUN', text: say(e), size: parseFloat(getComputedStyle(e).fontSize), by: `${over.toFixed(1)}pt over its line` });
    }
    for (const e of live) {
      const q = rectOf(e);
      if (q.width < 0.5 || q.height < 0.5 || parked(q)) continue;
      let inRail = false;
      for (let a = e.parentElement; a && !a.classList.contains('phone'); a = a.parentElement) {
        if (a.classList.contains('hscroll')) { inRail = true; break; }
        if (a.classList.contains('vscroll')) continue;
        const cs = getComputedStyle(a);
        if (cs.overflow === 'visible' && cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
        // A piece set INSIDE a clamped text (the closing » of a long bio) is
        // hidden by the clamp with the rest of the tail: a shortening, which
        // the clamp's own text reports — not a box cutting a word.
        if (a.tagName === 'SPAN' && cs.webkitLineClamp !== 'none' && cs.webkitLineClamp !== '') break;
        const b = a.getBoundingClientRect();
        const dx = Math.max(0, q.right - b.right, b.left - q.left);
        const dy = Math.max(0, q.bottom - b.bottom, b.top - q.top);
        // An INLINE text (a drop cap set into its paragraph) is measured by
        // its font box, which stands proud of the ink; allow that slack. A line
        // really cut short loses far more than a third of its size.
        const inline = getComputedStyle(e).display === 'inline';
        const slackY = inline ? Math.max(0.75, 0.3 * parseFloat(getComputedStyle(e).fontSize)) : 0.75;
        if (dx > 0.75 || dy > slackY) {
          found.push({ kind: 'CUT', text: say(e), size: parseFloat(getComputedStyle(e).fontSize), by: `${dx > 0.75 ? dx.toFixed(1) + 'pt across' : ''}${dx > 0.75 && dy > 0.75 ? ', ' : ''}${dy > 0.75 ? dy.toFixed(1) + 'pt down' : ''}` });
          break;
        }
      }
      // SHORT: a text that fits only because the phone cuts it — "…" at the end
      // of a one-line label, or lines dropped by a clamp. Reported apart from
      // faults: a long film title ellipsising is the design; a chrome label
      // losing its count ("· 12 CRITIQUES") is not, and only a reader can tell.
      // A clamp may drop lines past its limit — that is the design. A box too
      // SHORT for the lines it allows is not: a two-line title in a box one
      // line tall loses its second line at a size where it was promised two.
      // (The filmography's fixed 26pt did exactly this at large type, and it
      // was filed here as a mere shortening.)
      const clamp = parseInt(getComputedStyle(e).webkitLineClamp, 10);
      if (clamp > 1 && getComputedStyle(e).lineHeight !== 'normal') {
        const cs = getComputedStyle(e);
        const lh = parseFloat(cs.lineHeight);
        // the CONTENT box: padding is not a line
        const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
        const border = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
        const st = e.style; const was = [st.webkitLineClamp, st.height, st.maxHeight, st.display];
        st.webkitLineClamp = 'unset'; st.height = 'auto'; st.maxHeight = 'none'; st.display = 'block';
        const total = Math.round((e.getBoundingClientRect().height - pad - border) / lh);
        [st.webkitLineClamp, st.height, st.maxHeight, st.display] = was;
        const shown = Math.floor((e.clientHeight - pad + 0.75) / lh);
        if (shown < Math.min(clamp, total)) {
          found.push({ kind: 'CUT', text: say(e), size: parseFloat(getComputedStyle(e).fontSize), by: `${Math.min(clamp, total) - shown} of ${Math.min(clamp, total)} lines under its box` });
        }
      }
      if (SHORTS && truncates(e)) {
        const cs = getComputedStyle(e);
        const over = cs.textOverflow === 'ellipsis' ? e.scrollWidth > e.clientWidth + 1 : e.scrollHeight > e.clientHeight + 1;
        if (over) found.push({ kind: 'SHORT', text: say(e), size: parseFloat(cs.fontSize), by: cs.textOverflow === 'ellipsis' ? `${(e.scrollWidth - e.clientWidth).toFixed(0)}pt hidden` : 'lines hidden' });
      }
      if (!inRail && (q.right > phone.right + 0.75 || q.left < phone.left - 0.75)) {
        found.push({ kind: 'OFF', text: say(e), size: parseFloat(getComputedStyle(e).fontSize), by: `${Math.max(q.right - phone.right, phone.left - q.left).toFixed(1)}pt` });
      }
    }
    // CLASH: lines of two different texts overlapping, neither inside the other.
    // Only where both texts can actually be SEEN: a sheet laid over the page
    // (an open tray) covers the words under it, and covered words cannot clash.
    const shows = (e, x, y) => {
      for (const t of document.elementsFromPoint(x, y)) {
        if (t === e || e.contains(t) || t.contains(e)) return true;
        const cs = getComputedStyle(t);
        const bg = cs.backgroundColor.match(/[\d.]+/g);
        if (bg && (bg[3] === undefined || +bg[3] > 0.9) && +cs.opacity > 0.9) return false;
        if (cs.backgroundImage !== 'none' && t.tagName !== 'SPAN') return false;
        if (t.tagName === 'IMG') return false;
      }
      return false;
    };
    const lines = live.map((e) => ({ e, ls: linesOf(e).filter((q) => !parked(q)) }));
    for (let i = 0; i < lines.length; i++) {
      for (let j = i + 1; j < lines.length; j++) {
        const A = lines[i], B = lines[j];
        if (A.e.contains(B.e) || B.e.contains(A.e)) continue;
        let hit = 0;
        for (const a of A.ls) for (const b of B.ls) {
          const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          // line boxes carry leading; overlap must reach into the glyphs
          if (w > 1 && h > Math.min(a.height, b.height) * 0.35) {
            const x = Math.max(a.left, b.left) + w / 2, y = Math.max(a.top, b.top) + h / 2;
            if (x >= 0 && y >= 0 && x <= innerWidth && y <= innerHeight && !(shows(A.e, x, y) && shows(B.e, x, y))) continue;
            hit = Math.max(hit, h);
          }
        }
        if (hit) found.push({ kind: 'CLASH', text: `${say(A.e)}  ×  ${say(B.e)}`, size: parseFloat(getComputedStyle(A.e).fontSize), by: `${hit.toFixed(1)}pt` });
      }
    }
    // HANG: a mark's count, beside its icon. It is laid over the icon's line,
    // absolutely, so nothing it does moves anything else — which is exactly
    // why none of the checks above can see it go wrong. Its glyphs (a Range,
    // not its box: a box stops where the ellipsis starts) must stand clear of
    // the icon, end inside the column it belongs to, be whole, and be at least
    // the type floor after the phone's shrink.
    // A count's REACH (MarkFigure): `mark-count` stays inside its own column;
    // `mark-count-open` may run on to the next column's icon, never onto it.
    for (const hang of document.querySelectorAll('[data-t="mark-count"], [data-t="mark-count-open"]')) {
      const t = hang.querySelector('span[data-scale-cap]');
      if (!t || opacityOf(t) <= 0.05) continue;
      const figure = hang.parentElement;
      const icon = [...figure.children].find((c) => c !== hang);
      const column = figure.parentElement;
      const r = document.createRange(); r.selectNodeContents(t);
      const q = r.getBoundingClientRect();
      if (parked(q)) continue;
      // The icon at REST. A capture can freeze the certify pulse mid-way (the
      // heart at 1.15× for 160ms), and a transformed box is not the layout.
      // offsetWidth ignores transforms; the icon is centred in the figure.
      const fb = figure.getBoundingClientRect();
      const ib = icon ? { right: fb.left + fb.width / 2 + icon.offsetWidth / 2 } : null;
      const cb = column.getBoundingClientRect();
      let limit = cb.right, past = 'past its column';
      if (hang.dataset.t === 'mark-count-open') {
        const nextFirst = column.nextElementSibling && column.nextElementSibling.firstElementChild;
        const nextIcon = nextFirst && nextFirst.dataset.t === 'mark-figure' ? nextFirst.firstElementChild : nextFirst;
        if (nextIcon) { limit = nextIcon.getBoundingClientRect().left - 1; past = 'into the next icon'; }
      }
      const size = parseFloat(getComputedStyle(t).fontSize);
      const why = [];
      if (ib && q.left < ib.right + 1) why.push(`${(ib.right + 1 - q.left).toFixed(1)}pt into its icon`);
      if (q.right > limit + 0.5) why.push(`${(q.right - limit).toFixed(1)}pt ${past}`);
      // Unrounded: scrollWidth/clientWidth are whole pixels and read a figure
      // 0.1pt too wide for its box as fitting, while it is drawn "99…".
      if (q.width > t.getBoundingClientRect().width + 0.05) why.push('cut short');
      if (size < 10 - 0.01) why.push('below the 10pt floor');
      if (why.length) found.push({ kind: 'HANG', text: say(t), size, by: why.join(', ') });
    }
    return { found, texts: texts.length, invisible };
  }, SHORTS);
}

(async () => {
  const browser = await chromium.launch();
  const report = {};
  let faults = 0;
  for (const name of screens(SRC, ONLY).filter((n) => !SKIP.includes(n))) {
    for (const { platform, f } of PASSES) {
      const page = await open(browser, path.join(SRC, name + '.html'), { factor: f, platform, width: PHONE_W });
      // The whole page in view, so "which text is on top here" can be asked
      // anywhere on it, not only in the first screenful.
      const h = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.setViewportSize({ width: PHONE_W, height: Math.min(h, 16000) });
      const r = await audit(page);
      await page.close();
      // iOS keeps the plain key, so reports written before Android was measured still compare.
      report[platform === 'ios' ? `${name}@${f}` : `${name}@${platform}-${f}`] = r;
      const real = r.found.filter((x) => x.kind !== 'SHORT').length;
      faults += real;
      const tag = `${name}  ${platform === 'ios' ? '' : 'android '}×${f}`.padEnd(44);
      console.log(`${tag} ${r.found.length ? `${real} found${r.found.length > real ? `, ${r.found.length - real} shortened` : ''}` : 'clean'}   (${r.texts} texts${r.invisible ? `, ${r.invisible} invisible` : ''})`);
      for (const x of r.found) console.log(`      ${x.kind.padEnd(5)} ${String(x.size.toFixed(1)).padStart(5)}pt  ${x.by.padEnd(22)} "${x.text}"`);
    }
  }
  await browser.close();
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 1));
  console.log(faults ? `\n${faults} finding(s)` : '\nALL CLEAN');
  process.exit(faults ? 1 : 0);
})();
