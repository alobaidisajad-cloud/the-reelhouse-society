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
 *   UNDER    a line in a scroller that something fixed (a docked bar) covers at
 *            the top of the scroll and still covers scrolled to the end;
 *
 * And every control (a pressable, marked by the render lib with its hitSlop):
 *
 *   STEAL    its touch area — box plus hitSlop — overlaps a neighbour's; both
 *            platforms give the overlap to the LATER control;
 *   NAMELESS a screen reader can call it nothing but "button": no label, and
 *            no words inside it.
 *
 * And every view (by its React Native style, drawn with MOCKUPS_YOGA=1):
 *
 *   SHADOW   asked to cast an iOS shadow while it clips (overflow hidden),
 *            which iOS cannot draw.
 *
 * What is NOT a fault, because the phone does it on purpose:
 *   · a one-line text that ellipsises, or a clamped one — the clamp IS the
 *     design; only the box itself is checked against its ancestors;
 *   · a label that shrinks to fit (`adjustsFontSizeToFit`) — it is shrunk here
 *     exactly as far as the phone would shrink it, and is a fault only if even
 *     its floor does not fit;
 *   · anything inside a scroller, which is reached by scrolling — and a line
 *     scrolling under a bar it can scroll clear of.
 *
 *   node mockups/tools/layout.cjs [--src DIR] [--only a,b] [--skip c,d] [--passes ios@1,android@2] [--width 360] [--kinds STEAL,NAMELESS] [--shorts] [--json OUT] [--sites OUT] [--require FILE]
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
 * The passes: a platform and a text-size setting each. A text with a cap grows
 * no further than it; a text WITHOUT one grows to the system's largest size —
 * iOS's largest accessibility size is 3.1×, Android's setting reaches 2 — so
 * both are measured. Android also grows line height past any cap (see harness
 * GROWTH). `--passes ios@1,android@2` to choose.
 */
const PASSES = opt('passes', opt('factors') ? opt('factors').split(',').map((f) => `ios@${f}`).join(',') : 'ios@1,ios@1.35,ios@3.1,android@1.35,android@2')
  .split(',').map((p) => { const [platform, f] = p.split('@'); return { platform, f: Number(f) }; });
const JSON_OUT = opt('json');
// Also list every text the phone shortens ("…" or a clamp) — for reading, not a fault.
const SHORTS = args.includes('--shorts');
// Only these kinds (`--kinds STEAL,NAMELESS`): the screens the unit tests build
// carry deliberate stress content — an unbreakable 48-letter title — whose
// word-fit findings are the point of that test, not a fault of the app.
const KINDS = opt('kinds') ? opt('kinds').split(',') : null;
// Captures only (they carry `data-src`): `--sites OUT` lists every source file
// whose controls were measured beside a neighbour; `--require FILE` fails the
// run for each file named there (one per line, `#` comments) that was not. The
// touch rules that used to be typed out by hand (stackedRowHitSlop) became
// that list — mockups/touch-measured.txt — so a test that stops drawing a
// control is a failure, not a check that silently stopped happening.
const SITES_OUT = opt('sites');
const REQUIRE = opt('require');
/**
 * `--allow FILE`: the controls SMALL is told not to report, one per line —
 *   <source file>[  /<label pattern>/]  —  <why, at length>
 * A line without a reason of real length is refused: an exception with a thin
 * reason is a defect wearing a label.
 */
/**
 * An exception line: `<file> [/pattern/] [@/source pattern/] — <why>`.
 *   /pattern/          matched against the control's label or the text's words
 *   @/source pattern/  matched against the SOURCE LINE the element was written
 *                      on (its `data-src`), so it names one JSX element however
 *                      the file moves around it — `@/act\.film\?\.title/`
 */
const readAllow = (flag) => (opt(flag) ? fs.readFileSync(opt(flag), 'utf8').split(/\r?\n/)
  .map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  .map((l) => {
    const m = /^(\S+)(?:\s+\/(.+?)\/)?(?:\s+@\/(.+?)\/)?\s+—\s+(.+)$/.exec(l);
    if (!m || m[4].length < 60) throw new Error(`--${flag}: "${l.slice(0, 80)}" must be "<file> [/pattern/] [@/source/] — <why, 60+ characters>"`);
    let lines = null;
    if (m[3]) {
      const src = fs.readFileSync(path.join(MOBILE, m[1]), 'utf8').split(/\r?\n/);
      lines = src.map((t, i) => (new RegExp(m[3]).test(t) ? i + 1 : 0)).filter(Boolean);
      if (!lines.length) throw new Error(`--${flag}: @/${m[3]}/ matches no line of ${m[1]} — an exception for nothing`);
    }
    return { file: m[1], label: m[2] || null, lines };
  }) : []);
const SMALL_ALLOW = readAllow('allow');
/**
 * `--allow-short FILE`: texts that may be cut short even at their floor, in the
 * same form — `<source file> [/text pattern/] — <why>`. A film's title is
 * content of any length, and a card that ends it with "…" is the design; a line
 * of the house's own copy cut short is a defect, and is not listed. The text's
 * source line comes from the drawing run (mockups/srcMark.ts).
 */
const SHORT_ALLOW = readAllow('allow-short');

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
  return page.evaluate(([SHORTS, ALLOW, SHORT_OK]) => {
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
      // A label that may SHRINK has been shrunk as the phone shrinks it (step
      // 2). If even at its floor its glyphs run past its OWN box, the phone
      // draws it cut — "Masterp…" — however roomy its parents are. The check
      // below this only asks the parents, and a label that ellipsises itself
      // clips nothing above it: a verdict word three times too wide passed.
      // (A mark's count is judged by HANG below, which owns its reach.)
      if (e.dataset.fitMin && getComputedStyle(e).display !== 'inline'
        && !e.closest('[data-t="mark-count"], [data-t="mark-count-open"]')) {
        const box = e.getBoundingClientRect();
        const g = document.createRange(); g.selectNodeContents(e);
        const over = g.getBoundingClientRect().width - box.width;
        const full = e.closest('[data-src]')?.dataset.src || '';
        const site = full.replace(/:\d+$/, '');
        const line = Number(full.split(':').pop());
        const onPurpose = SHORT_OK.some(({ file, label, lines }) => file === site
          && (!label || new RegExp(label).test(say(e))) && (!lines || lines.includes(line)));
        if (over > 0.75 && !onPurpose) {
          found.push({ kind: 'CUT', text: say(e) + (site ? ` [${site}]` : ''), size: parseFloat(getComputedStyle(e).fontSize), by: `${over.toFixed(1)}pt cut at its floor` });
          continue;
        }
      }
      let inRail = false;
      for (let a = e.parentElement; a && !a.classList.contains('phone'); a = a.parentElement) {
        if (a.classList.contains('hscroll')) { inRail = true; break; }
        // Inside a scroller, what lies past its edge is reached by scrolling:
        // nothing ABOVE the scroller cuts it. (This walked on past the scroller
        // and blamed the sheet holding it — the film tray's last act, below the
        // fold of a tray that scrolls on a small phone at large type.) Clipping
        // INSIDE the scroller was checked on the way up.
        if (a.classList.contains('vscroll')) break;
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
    /**
     * A text in a scroller slides under a bar that stays put (a docked
     * counter, a floating header) — that is scrolling, not a clash. It IS one
     * only if no scroll position separates them: the text is under the bar at
     * the top AND still under it scrolled to the end (no room was reserved for
     * it). So a pair where one text scrolls and the other does not is measured
     * at both ends of the scroll; overlapping at both, it overlaps at every
     * position between. (The frame used to grow to its content, so a docked
     * bar sat below everything and this never came up.)
     */
    const scrollOf = (e) => {
      const s = e.closest('.vscroll');
      if (!s) return null;
      const end = Math.max(...[...s.children].map((c) => c.getBoundingClientRect().bottom));
      return { s, travel: Math.max(0, end - s.getBoundingClientRect().bottom) };
    };
    for (let i = 0; i < lines.length; i++) {
      for (let j = i + 1; j < lines.length; j++) {
        const A = lines[i], B = lines[j];
        if (A.e.contains(B.e) || B.e.contains(A.e)) continue;
        const sA = scrollOf(A.e), sB = scrollOf(B.e);
        // How far A moves against B as the member scrolls (0: they move together).
        const aMoves = sA && !sA.s.contains(B.e) ? sA.travel : 0;
        const bMoves = sB && !sB.s.contains(A.e) ? sB.travel : 0;
        if (aMoves && bMoves) continue; // two scrollers: each can be moved clear of the other
        let hit = 0;
        for (const a of A.ls) for (const b of B.ls) {
          const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          const shift = aMoves - bMoves; // A's lines move up by this, relative to B's, at the end
          const hEnd = Math.min(a.bottom - shift, b.bottom) - Math.max(a.top - shift, b.top);
          // line boxes carry leading; overlap must reach into the glyphs
          const least = Math.min(a.height, b.height) * 0.35;
          if (w > 1 && h > least && (shift === 0 || hEnd > least)) {
            const x = Math.max(a.left, b.left) + w / 2, y = Math.max(a.top, b.top) + h / 2;
            if (x >= 0 && y >= 0 && x <= innerWidth && y <= innerHeight && !(shows(A.e, x, y) && shows(B.e, x, y))) continue;
            hit = Math.max(hit, h);
          }
        }
        if (hit) found.push({ kind: 'CLASH', text: `${say(A.e)}  ×  ${say(B.e)}`, size: parseFloat(getComputedStyle(A.e).fontSize), by: `${hit.toFixed(1)}pt` });
      }
    }
    // UNDER: a line in a scroller that something which does NOT scroll with it
    // (a docked bar, a tray) covers at the top of the scroll AND still covers
    // scrolled to the very end — so no scroll position ever shows it. This is
    // the docked-bar law: a bar over a scroller reserves its own height at the
    // foot. CLASH cannot see it: covered words are exempt there, rightly for an
    // open sheet, and so an opaque bar hid a line from both checks. The page
    // under an open modal is not measured: the modal is meant to cover it.
    const coverOf = (e, x, y) => {
      for (const t of document.elementsFromPoint(x, y)) {
        if (t === e || e.contains(t) || t.contains(e)) return null;
        const cs = getComputedStyle(t);
        const bg = cs.backgroundColor.match(/[\d.]+/g);
        if ((bg && (bg[3] === undefined || +bg[3] > 0.9) && +cs.opacity > 0.9) || (cs.backgroundImage !== 'none' && t.tagName !== 'SPAN') || t.tagName === 'IMG') return t;
      }
      return null;
    };
    const modals = [...document.querySelectorAll('[data-t="modal"]')];
    const topModal = modals[modals.length - 1];
    const coveredLines = (e, s) => linesOf(e)
      .filter((q) => !parked(q) && q.top + q.height / 2 >= 0 && q.top + q.height / 2 <= innerHeight)
      .filter((q) => { const c = coverOf(e, (q.left + q.right) / 2, q.top + q.height / 2); return c && !s.contains(c); }).length;
    for (const s of document.querySelectorAll('.vscroll')) {
      if (topModal && !topModal.contains(s)) continue;
      const inside = live.filter((e) => e.closest('.vscroll') === s);
      const atTop = inside.filter((e) => coveredLines(e, s) > 0);
      if (!atTop.length) continue;
      const { travel } = scrollOf(inside[0]);
      const moved = [...s.children].map((c) => [c, c.style.transform]);
      for (const [c, was] of moved) c.style.transform = `translateY(${-travel}px)${was ? ' ' + was : ''}`;
      const atEnd = atTop.filter((e) => coveredLines(e, s) > 0);
      for (const [c, was] of moved) c.style.transform = was;
      for (const e of atEnd) found.push({ kind: 'UNDER', text: say(e), size: parseFloat(getComputedStyle(e).fontSize), by: 'covered at every scroll position' });
    }
    // STEAL: two controls whose touch areas — the box grown by its hitSlop —
    // overlap. Both platforms hand a touch in the overlap to the LATER control
    // (iOS RCTView walks its subviews in reverse; Android's TouchTargetHelper
    // walks children from the last), so the earlier one loses taps aimed at it:
    // the autopsy slider scored a notch too high, a mis-tap pinned the wrong
    // film. The rule: each may claim at most half the real gap to its
    // neighbour. MEASURED here, on the page as laid out, where
    // stackedRowHitSlop used to type forty gaps out of the stylesheets by hand.
    // Not a fault: a control inside another, or set ON another (its own box
    // inside the other's) — a layer, where the later one is meant to win.
    // The halo is drawn INSIDE the control and measured there, so it is scaled
    // and tilted by every transform above it — as hitSlop is on the phone, where
    // it lives in the view's own coordinates. Added to the transformed box
    // instead, a card in the Pulse rail (tilted, 0.94) grew full-size halos.
    const haloOf = (e) => {
      const [t, rt, b, l] = e.dataset.press.split(',').map(Number);
      const cs = getComputedStyle(e);
      const edge = (side) => parseFloat(cs[`border${side}Width`]) || 0;
      const probe = document.createElement('div');
      probe.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;top:${-(t + edge('Top'))}px;`
        + `left:${-(l + edge('Left'))}px;right:${-(rt + edge('Right'))}px;bottom:${-(b + edge('Bottom'))}px`;
      // The probe is placed from the control's own box, which needs it positioned
      // (every drawn view is; a hand-made page may not be) — for the measurement only.
      const was = e.style.position;
      if (cs.position === 'static') e.style.position = 'relative';
      e.appendChild(probe);
      const x = probe.getBoundingClientRect();
      probe.remove();
      e.style.position = was;
      return { left: x.left, right: x.right, top: x.top, bottom: x.bottom };
    };
    const controls = [...document.querySelectorAll('[data-press]')]
      .filter((e) => opacityOf(e) > 0.05 && getComputedStyle(e).display !== 'none' && (!topModal || topModal.contains(e)))
      .map((e) => ({ e, r: e.getBoundingClientRect(), x: haloOf(e) }))
      .filter((c) => c.r.width > 0 && c.r.height > 0 && !parked(c.r));
    // NAMELESS: a control a screen reader can only call "button" — no label,
    // and no words inside it to read (a picture, an icon). The Editorial Desk's
    // stills and its drop-cap toggle were these.
    // Named as iOS names it: the control's own label, else the labels and words
    // inside it — leaving out whatever is hidden from a screen reader.
    const spoken = (e) => {
      if (e.nodeType === 3) return e.textContent.trim();
      if (e.nodeType !== 1 || e.getAttribute('aria-hidden') === 'true') return '';
      return e.getAttribute('aria-label') || [...e.childNodes].map(spoken).join('');
    };
    for (const c of controls) {
      // Hidden, or part of a larger named control a screen reader stops on once
      // (a rating's ten halves under "Your rating"): not reached on its own.
      if (c.e.closest('[aria-hidden="true"]') || c.e.parentElement?.closest('[data-accessible][aria-label]')) continue;
      if (!spoken(c.e)) {
        found.push({ kind: 'NAMELESS', text: c.e.dataset.t || '(a control with no name)', size: 0, by: `${c.r.width.toFixed(0)}×${c.r.height.toFixed(0)} at ${c.r.left.toFixed(0)},${c.r.top.toFixed(0)}` });
      }
    }
    // SMALL (asked for by name — `--kinds SMALL`): a control whose OWN box is
    // under the 48pt floor on either side. A halo is invisible to both
    // platforms' accessibility layers (iOS reports the view's frame; RN installs
    // no Android TouchDelegate), so the box is the only answer to "is this big
    // enough". Part of a larger named control (a rating's halves) is not one.
    const excused = (e) => ALLOW.some(({ file, label, lines }) => (e.dataset.src || '').replace(/:\d+$/, '') === file
      && (!label || new RegExp(label).test(e.getAttribute('aria-label') || ''))
      && (!lines || lines.includes(Number((e.dataset.src || '').split(':').pop()))));
    for (const c of controls) {
      if (c.e.closest('[aria-hidden="true"]') || c.e.parentElement?.closest('[data-accessible][aria-label]')) continue;
      if (excused(c.e)) continue;
      if (c.r.width < 48 - 0.5 || c.r.height < 48 - 0.5) {
        found.push({ kind: 'SMALL', text: (c.e.getAttribute('aria-label') || say(c.e) || 'a control') + (c.e.dataset.src ? ` [${c.e.dataset.src}]` : ''), size: 0, by: `${c.r.width.toFixed(0)}×${c.r.height.toFixed(0)}` });
      }
    }
    const layerOf = (e) => e.closest('.vscroll, .hscroll, [data-t="modal"]');
    const within = (p, q) => p.left >= q.left - 0.5 && p.right <= q.right + 0.5 && p.top >= q.top - 0.5 && p.bottom <= q.bottom + 0.5;
    const nameOf = (e) => (e.getAttribute('aria-label') || e.dataset.t || say(e) || 'a control') + (e.dataset.src ? ` [${e.dataset.src}]` : '');
    // What was MEASURED, by source file (a capture's `data-src`): every file
    // with a control that stood within 30pt of another — near enough that two
    // default halos would meet — so an overlap there would have been seen.
    // `--require` turns this into a promise a later run has to keep.
    const near = (A, B) => {
      const dx = Math.max(A.r.left, B.r.left) - Math.min(A.r.right, B.r.right);
      const dy = Math.max(A.r.top, B.r.top) - Math.min(A.r.bottom, B.r.bottom);
      return (dx < 0 && dy <= 30) || (dy < 0 && dx <= 30);
    };
    const measured = new Set();
    // Two controls under the SAME transforms are compared in their flat layout:
    // a tilt or a scale moves both alike, so it cannot make or undo an overlap
    // between them — while the box around a tilted control is larger than the
    // control (a tilted Pulse card's far-edge REPORT met the near-edge top of the
    // card's body). Controls under different transforms are compared on screen.
    const moved = [...document.querySelectorAll('*')].filter((n) => {
      const t = getComputedStyle(n).transform;
      return t && t !== 'none' && !new DOMMatrix(t).isIdentity;
    });
    for (const c of controls) c.ctx = moved.filter((n) => n.contains(c.e)).map((n) => moved.indexOf(n)).join(',');
    const was = moved.map((n) => n.style.transform);
    const flatten = (on) => moved.forEach((n, i) => {
      n.style.removeProperty('transform');
      if (on) n.style.setProperty('transform', 'none', 'important'); else if (was[i]) n.style.transform = was[i];
    });
    const pairs = (same) => {
      for (let i = 0; i < controls.length; i++) {
        for (let j = i + 1; j < controls.length; j++) {
          const A = controls[i], B = controls[j];
          if ((A.ctx === B.ctx && A.ctx !== '') !== same) continue;
          if (A.e.contains(B.e) || B.e.contains(A.e) || layerOf(A.e) !== layerOf(B.e)) continue;
          if (within(A.r, B.r) || within(B.r, A.r)) continue;
          if (near(A, B)) for (const c of [A, B]) if (c.e.dataset.src) measured.add(c.e.dataset.src);
          const w = Math.min(A.x.right, B.x.right) - Math.max(A.x.left, B.x.left);
          const h = Math.min(A.x.bottom, B.x.bottom) - Math.max(A.x.top, B.x.top);
          if (w > 0.5 && h > 0.5) {
            // Only where a finger can reach both: under a sheet, neither is there.
            const x = Math.max(A.x.left, B.x.left) + w / 2, y = Math.max(A.x.top, B.x.top) + h / 2;
            if (x >= 0 && y >= 0 && x <= innerWidth && y <= innerHeight && (coverOf(A.e, x, y) || coverOf(B.e, x, y))) continue;
            found.push({ kind: 'STEAL', text: `${nameOf(A.e)}  ←  ${nameOf(B.e)}`, size: 0, by: `${Math.min(w, h).toFixed(1)}pt overlap` });
          }
        }
      }
    };
    pairs(false);
    if (moved.length) {
      const onScreen = controls.map((c) => [c.r, c.x]);
      flatten(true);
      for (const c of controls) { c.r = c.e.getBoundingClientRect(); c.x = haloOf(c.e); }
      pairs(true);
      flatten(false);
      controls.forEach((c, i) => { [c.r, c.x] = onScreen[i]; });
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
    // SHADOW: a view asked to cast an iOS shadow while it clips. `overflow:
    // 'hidden'` sets clipsToBounds, and a layer that masks to its bounds cannot
    // draw anything outside them — the shadow simply never exists on iOS, while
    // Android draws one from elevation. Four shipped on the log's surfaces; this
    // asks every view on every drawn screen (its React Native style is on the
    // page as data-rn), not the four someone wrote down.
    for (const e of document.querySelectorAll('[data-rn]')) {
      let rn;
      try { rn = JSON.parse(e.dataset.rn); } catch { continue; }
      if (rn.overflow !== 'hidden' || !((rn.shadowOpacity ?? 0) > 0) || rn.shadowColor === 'transparent') continue;
      if (parked(e.getBoundingClientRect())) continue;
      found.push({ kind: 'SHADOW', text: e.dataset.t || say(e) || `a view at ${e.getBoundingClientRect().left.toFixed(0)},${e.getBoundingClientRect().top.toFixed(0)}`, size: 0, by: 'clips: iOS draws no shadow' });
    }
    return { found, texts: texts.length, invisible, measured: [...measured] };
  }, [SHORTS, SMALL_ALLOW, SHORT_ALLOW]);
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
      // SMALL is reported only when asked for by name (see the check).
      r.found = r.found.filter((x) => (KINDS ? KINDS.includes(x.kind) : x.kind !== 'SMALL'));
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
  // Each site is `file:line` — the JSX that made the control. The promise
  // (--require) is kept per FILE, so an edit above a control does not break it.
  const measured = [...new Set(Object.values(report).flatMap((r) => r.measured))].sort();
  const measuredFiles = [...new Set(measured.map((m) => m.replace(/:\d+$/, '')))];
  if (SITES_OUT) fs.writeFileSync(SITES_OUT, measured.join('\n') + '\n');
  if (REQUIRE) {
    const lost = fs.readFileSync(REQUIRE, 'utf8').split('\n').map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#') && !measuredFiles.includes(l));
    for (const f of lost) console.log(`LOST  ${f} — no control of it was measured beside a neighbour`);
    faults += lost.length;
  }
  console.log(faults ? `\n${faults} finding(s)` : '\nALL CLEAN');
  process.exit(faults ? 1 : 0);
})();
