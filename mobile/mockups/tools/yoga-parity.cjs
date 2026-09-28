/**
 * YOGA PARITY — does the browser lay a screen out where the phone would?
 * ──────────────────────────────────────────────────────────────────────────
 * Every measurement in mockups/ is taken on a BROWSER'S layout of the app's
 * tree. The phone lays the same tree out with Yoga, and where the two disagree
 * the audit measures a screen no phone draws. Two such disagreements were
 * found by their symptoms (a shrinkable item's minimum; a box in a column
 * wider than the column) and fixed in zz-render.lib / harness. This finds the
 * rest systematically: it lays every render out AGAIN with Yoga itself — the
 * yoga-layout package, Facebook's C++ engine compiled to WebAssembly, the one
 * React Native runs — and reports every box the two placed apart.
 *
 * How: the screens are drawn with MOCKUPS_YOGA=1, so each box carries its React
 * Native style (`data-rn`). Here each box becomes a Yoga node with that style;
 * each text, image, icon and special drawing becomes a leaf the size the
 * browser drew it, keeping its own flex behaviour (so Yoga may still shrink or
 * stretch it). A scroll view lays its content unbounded along its axis, as the
 * phone's does. Then every box's position and size are compared.
 *
 * Skipped, because they are not layout: a box under a transform (a transform
 * moves the drawing, not the box — and the browser reports the drawing).
 *
 * The ENGINE is React Native's, settings and all: RN lays out with every one
 * of Yoga's errata on (its old bugs, kept for compatibility), and so does
 * this. Its point grid is an iPhone's (a third of a point).
 *
 *   MOCKUPS=1 MOCKUPS_YOGA=1 npx jest "zz-.*\.gen"       (draw with the styles on)
 *   node mockups/tools/yoga-parity.cjs [--src DIR] [--only a,b] [--width 390]
 *        [--factor 1.35 --platform ios|android] [--tolerance 1] [--why] [--all] [--show N]
 *   exits 1 when any box differs by more than the tolerance (points).
 *   --why   where each size difference BEGINS, with its children and ancestors
 *   --all   every differing box, not only the outermost of each group
 */
const path = require('path');
const { chromium, open, screens, MOBILE, WIDTH } = require('./harness.cjs');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const PHONE_W = Number(opt('width', WIDTH));
const SRC = path.resolve(opt('src', path.join(MOBILE, 'mockups', 'out', 'screens')));
const ONLY = opt('only') ? opt('only').split(',') : null;
// A quarter of a point. A browser keeps sizes in 1/64-pixel steps, and across
// a rail of eighteen cards that rounding alone reached 0.14pt; the smallest REAL
// difference this has found was 0.36pt (a poster frame held off its ratio).
const TOL = Number(opt('tolerance', 0.25));
const SHOW = Number(opt('show', 12));
// At a text size: the harness grows each text as that platform does (see
// GROWTH in harness.cjs), and Yoga is handed the grown texts.
const FACTOR = Number(opt('factor', 1));
const PLATFORM = opt('platform', 'ios');

/** The page side: the tree as the browser laid it out, with each box's RN style. */
function readTree() {
  const phone = document.querySelector('.phone');
  const origin = phone.getBoundingClientRect();
  const rectOf = (e) => { const r = e.getBoundingClientRect(); return { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height }; };
  const name = (e) => {
    const t = e.getAttribute('data-t');
    if (t) return `#${t}`;
    const txt = e.tagName === 'SPAN' ? e.textContent.trim().slice(0, 24) : '';
    return `${e.tagName.toLowerCase()}${e.classList.length ? '.' + [...e.classList].join('.') : ''}${txt ? ` "${txt}"` : ''}`;
  };
  const walk = (e) => {
    const rn = e.dataset.rn ? JSON.parse(e.dataset.rn) : null;
    const isText = e.tagName === 'SPAN' && e.hasAttribute('data-scale-cap');
    const box = !!rn && !isText && e.tagName === 'DIV';
    const cs = getComputedStyle(e);
    // A leaf's LAYOUT size. Its rect is what it draws, and under a rotation the
    // drawing's bounding box is larger than the box — the Dispatch's tilted
    // rank stamp measured 23.5pt tall and grew its row by 2.7pt in Yoga. The
    // computed width and height are the box itself, untouched by transforms.
    const px = (v, fallback) => (/^[\d.]+px$/.test(v) ? parseFloat(v) : fallback);
    const r = rectOf(e);
    return {
      name: name(e),
      rn,
      size: { w: px(cs.width, r.w), h: px(cs.height, r.h) },
      kind: box ? 'box' : 'leaf',
      scroll: e.classList.contains('vscroll') ? 'v' : e.classList.contains('hscroll') ? 'h' : null,
      absolute: cs.position === 'absolute',
      hidden: cs.display === 'none',
      // Any transform the browser applied — including an animated one the
      // recorded style does not carry (the Lobby's cover-flow scales its cards).
      transformed: cs.transform !== 'none' && cs.transform !== 'matrix(1, 0, 0, 1, 0, 0)',
      rect: r,
      children: box ? [...e.children].map(walk) : [],
    };
  };
  return { width: origin.width, height: origin.height, children: [...phone.children].map(walk) };
}

(async () => {
  const Y = await import('yoga-layout');
  const Yoga = Y.default;
  const { Align, Justify, FlexDirection, Edge, PositionType, Wrap, Display, Overflow, Gutter } = Y;

  const FD = { row: FlexDirection.Row, column: FlexDirection.Column, 'row-reverse': FlexDirection.RowReverse, 'column-reverse': FlexDirection.ColumnReverse };
  const JU = { 'flex-start': Justify.FlexStart, center: Justify.Center, 'flex-end': Justify.FlexEnd, 'space-between': Justify.SpaceBetween, 'space-around': Justify.SpaceAround, 'space-evenly': Justify.SpaceEvenly };
  const AL = { auto: Align.Auto, 'flex-start': Align.FlexStart, center: Align.Center, 'flex-end': Align.FlexEnd, stretch: Align.Stretch, baseline: Align.Baseline, 'space-between': Align.SpaceBetween, 'space-around': Align.SpaceAround };
  const WR = { wrap: Wrap.Wrap, nowrap: Wrap.NoWrap, 'wrap-reverse': Wrap.WrapReverse };
  const EDGES = { '': Edge.All, Horizontal: Edge.Horizontal, Vertical: Edge.Vertical, Top: Edge.Top, Right: Edge.Right, Bottom: Edge.Bottom, Left: Edge.Left, Start: Edge.Start, End: Edge.End };
  const has = (v) => v !== undefined && v !== null;

  /** Apply one RN style to a Yoga node. What does not affect layout is ignored. */
  const apply = (n, s, { flexOnly = false } = {}) => {
    if (!s) return;
    // The flex item's own behaviour, which a leaf keeps too.
    if (typeof s.flex === 'number') n.setFlex(s.flex);
    if (has(s.flexGrow)) n.setFlexGrow(s.flexGrow);
    if (has(s.flexShrink)) n.setFlexShrink(s.flexShrink);
    if (has(s.flexBasis)) n.setFlexBasis(s.flexBasis);
    if (has(s.alignSelf) && AL[s.alignSelf] !== undefined) n.setAlignSelf(AL[s.alignSelf]);
    for (const [suffix, edge] of Object.entries(EDGES)) {
      const m = s[`margin${suffix}`];
      if (m === 'auto') n.setMarginAuto(edge);
      else if (has(m)) n.setMargin(edge, m);
    }
    if (s.position === 'absolute') n.setPositionType(PositionType.Absolute);
    for (const [k, edge] of [['top', Edge.Top], ['right', Edge.Right], ['bottom', Edge.Bottom], ['left', Edge.Left], ['start', Edge.Start], ['end', Edge.End]]) {
      if (has(s[k])) n.setPosition(edge, s[k]);
    }
    if (flexOnly) return;
    if (has(s.flexDirection) && FD[s.flexDirection] !== undefined) n.setFlexDirection(FD[s.flexDirection]);
    if (has(s.justifyContent) && JU[s.justifyContent] !== undefined) n.setJustifyContent(JU[s.justifyContent]);
    if (has(s.alignItems) && AL[s.alignItems] !== undefined) n.setAlignItems(AL[s.alignItems]);
    if (has(s.alignContent) && AL[s.alignContent] !== undefined) n.setAlignContent(AL[s.alignContent]);
    if (has(s.flexWrap) && WR[s.flexWrap] !== undefined) n.setFlexWrap(WR[s.flexWrap]);
    for (const k of ['width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight']) {
      if (has(s[k])) n[`set${k[0].toUpperCase()}${k.slice(1)}`](s[k]);
    }
    for (const [suffix, edge] of Object.entries(EDGES)) {
      const p = s[`padding${suffix}`];
      if (has(p)) n.setPadding(edge, p);
      const b = s[`border${suffix}Width`];
      if (has(b)) n.setBorder(edge, b);
    }
    if (has(s.gap)) n.setGap(Gutter.All, s.gap);
    if (has(s.rowGap)) n.setGap(Gutter.Row, s.rowGap);
    if (has(s.columnGap)) n.setGap(Gutter.Column, s.columnGap);
    if (has(s.aspectRatio)) n.setAspectRatio(s.aspectRatio);
    if (s.display === 'none') n.setDisplay(Display.None);
    if (s.overflow === 'hidden') n.setOverflow(Overflow.Hidden);
  };

  /**
   * Build the Yoga tree. Returns OUR record of it — { n, d, moved, kids } — because
   * yoga-layout hands back a fresh wrapper from getChild(), so a node cannot be
   * found again by identity; the tree we built is walked instead.
   */
  // No rounding to a pixel grid. The phone snaps every edge to its grid (a
  // third of a point on an iPhone), which a browser cannot copy, so a centred
  // child came out up to half a point apart for no reason of layout. Unsnapped,
  // both engines give exact coordinates and the tolerance can be a fraction of
  // a point — tight enough to catch a 0.36pt error at every width, which at a
  // whole point hid until three of them stacked up on an iPad.
  const config = Yoga.Config.create();
  config.setPointScaleFactor(0);
  // React Native lays out with ALL of Yoga's errata on — its old bugs, kept for
  // compatibility (YogaLayoutableShadowNode::layoutTree passes YGErrataAll unless
  // a view asks for strict conformance, and none here does). Without this the
  // engine measured is not the one on the phone: a `flex: 1` column inside a row
  // that is only as wide as its content collapsed to zero here, where the phone
  // stretches it (errata StretchFlexBasis).
  config.setErrata(Y.Errata.All);
  const build = (d, transformed) => {
    const n = Yoga.Node.create(config);
    const moved = transformed || d.transformed;
    const kids = [];
    if (d.kind === 'box') {
      apply(n, d.rn);
      // RN's defaults, which a style that says nothing still has.
      if (!d.rn || !has(d.rn.flexDirection)) n.setFlexDirection(FlexDirection.Column);
      // A scroll view lays its content unbounded along its own axis. Its own
      // grow, shrink and row are NOT added here: the render lib writes them
      // (ScrollView's baseVertical/baseHorizontal), so a render that lost them
      // is caught here instead of quietly repaired.
      if (d.scroll) n.setOverflow(Overflow.Scroll);
      d.children.forEach((c, i) => { const k = build(c, moved); kids.push(k); n.insertChild(k.n, i); });
      const self = { n, d, moved, kids };
      kids.forEach((k) => { k.parent = self; });
      return self;
    } else {
      // A leaf is the size the browser laid it out, and keeps its own flex behaviour.
      n.setWidth(d.size.w);
      n.setHeight(d.size.h);
      apply(n, d.rn, { flexOnly: true });
      if (d.absolute && !(d.rn && d.rn.position === 'absolute')) n.setPositionType(PositionType.Absolute);
      if (d.hidden) n.setDisplay(Display.None);
    }
    return { n, d, moved, kids };
  };

  const browser = await chromium.launch();
  let total = 0, compared = 0;
  const report = [];
  for (const screen of screens(SRC, ONLY)) {
    const page = await open(browser, path.join(SRC, screen + '.html'), { width: PHONE_W, factor: FACTOR, platform: PLATFORM });
    const tree = await page.evaluate(readTree);
    await page.close();
    const root = Yoga.Node.create(config);
    root.setWidth(tree.width);
    root.setHeight(tree.height);
    root.setFlexDirection(FlexDirection.Column);
    const top = tree.children.map((c) => build(c, false));
    top.forEach((k, i) => root.insertChild(k.n, i));
    root.calculateLayout(tree.width, tree.height);
    // Each box's absolute place: the sum of its ancestors' offsets, walked on OUR tree.
    const off = [];
    const notes = [];
    let boxes = 0;
    const visit = (k, x, y, trail) => {
      const l = k.n.getComputedLayout();
      const X = x + l.left, Y2 = y + l.top;
      const here = [...trail, k.d.name];
      if (k.d.kind === 'box' && !k.moved && !k.d.hidden) {
        boxes++;
        const b = k.d.rect;
        const dx = X - b.x, dy = Y2 - b.y, dw = l.width - b.w, dh = l.height - b.h;
        const worst = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dw), Math.abs(dh));
        if (worst > TOL) {
          // The OUTERMOST box that differs is the cause; its children move with it.
          const inherited = off.some((o) => o.trail.length < here.length && here.slice(0, o.trail.length).join('/') === o.trail.join('/') && Math.abs(o.dy - dy) < TOL && Math.abs(o.dx - dx) < TOL);
          off.push({ name: k.d.name, trail: here, dx, dy, dw, dh, worst, inherited,
            style: JSON.stringify(k.d.rn).slice(0, 160),
            kidsDom: k.kids.map((c) => `${c.d.kind === 'leaf' ? 'leaf ' : ''}${c.d.name} ${c.d.rect.w.toFixed(0)}×${c.d.rect.h.toFixed(0)}`).slice(0, 6) });
        }
      }
      // A box that moved is explained by what came before it: its earlier
      // siblings, sized by the browser and by Yoga, side by side.
      // (A note, not a difference: kept apart, and never counted.)
      if (args.includes('--why') && !k.moved) {
        // Its first box moved: the cause is this box's own padding or
        // alignment — shown with every child, sized by both.
        const first = k.kids.find((c) => c.d.kind === 'box' && !c.moved && !c.d.absolute);
        const inFlow = k.kids.filter((c) => !c.d.absolute);
        if (first && Math.abs((y + l.top + first.n.getComputedLayout().top) - first.d.rect.y) > TOL && inFlow[0] === first) {
          notes.push({ name: '(first child moved)', trail: [...here, '…'], dx: 0, dy: 0, dw: 0, dh: 0, style: JSON.stringify(k.d.rn || {}).slice(0, 160),
            kidsDom: k.kids.map((c) => { const cl = c.n.getComputedLayout(); return `${c.d.kind === 'leaf' ? 'leaf ' : ''}${c.d.name} browser y${(c.d.rect.y - k.d.rect.y).toFixed(2)} h${c.d.rect.h.toFixed(2)}  yoga y${cl.top.toFixed(2)} h${cl.height.toFixed(2)} ${JSON.stringify(c.d.rn || {}).slice(0, 80)}`; }) });
        }
        for (let i = 1; i < k.kids.length; i++) {
          const a = k.kids[i], lay = a.n.getComputedLayout();
          if (!a.moved && Math.abs((y + l.top + lay.top) - a.d.rect.y) > TOL && a.d.kind === 'box') {
            const prev = k.kids.slice(0, i).map((p) => { const pl = p.n.getComputedLayout(); return `${p.d.kind === 'leaf' ? 'leaf ' : ''}${p.d.name} browser ${p.d.rect.h.toFixed(1)} yoga ${pl.height.toFixed(1)} ${JSON.stringify(p.d.rn || {}).slice(0, 90)}`; });
            notes.push({ name: `(before ${a.d.name})`, trail: [...here, '…'], dx: 0, dy: 0, dw: 0, dh: 0, style: '', kidsDom: prev });
            break;
          }
        }
      }
      k.kids.forEach((c) => visit(c, X, Y2, here));
    };
    top.forEach((k) => visit(k, 0, 0, []));
    compared += boxes;

    // --dump '<fragment>': the first box whose style contains the fragment, and
    // each of its children, as each engine laid them out.
    const DUMP = opt('dump');
    if (DUMP) {
      const find = (k) => (JSON.stringify(k.d.rn || {}).includes(DUMP) ? k : k.kids.map(find).find(Boolean));
      const hit = top.map(find).find(Boolean);
      if (!hit) console.log(`      (no box with ${DUMP})`);
      else {
        const row = (k, tag) => { const l = k.n.getComputedLayout(); return `${tag} ${k.d.kind === 'leaf' ? 'leaf ' : ''}${k.d.name.slice(0, 24)}  browser ${k.d.rect.w.toFixed(2)}×${k.d.rect.h.toFixed(2)}  yoga ${l.width.toFixed(2)}×${l.height.toFixed(2)} @${l.top.toFixed(2)}  ${JSON.stringify(k.d.rn || {}).slice(0, 110)}`; };
        console.log(row(hit, '      DUMP'));
        hit.kids.forEach((c) => console.log(row(c, '        ·')));
      }
    }

    // --why: where a size difference BEGINS — the innermost box whose own size
    // differs with no differing box inside it — and its children, sized by both.
    if (args.includes('--why')) {
      const sizeOff = (k) => { const l = k.n.getComputedLayout(); return Math.max(Math.abs(l.width - k.d.rect.w), Math.abs(l.height - k.d.rect.h)) > TOL; };
      const origins = [];
      const seek = (k) => {
        if (k.moved || k.d.hidden) return false;
        const inner = k.kids.map(seek).some(Boolean);
        if (k.d.kind === 'box' && sizeOff(k) && !inner) origins.push(k);
        return inner || (k.d.kind === 'box' && sizeOff(k));
      };
      top.forEach(seek);
      for (const k of origins.slice(0, SHOW)) {
        const l = k.n.getComputedLayout();
        console.log(`      ORIGIN ${k.d.name}  browser ${k.d.rect.w.toFixed(1)}×${k.d.rect.h.toFixed(1)}  yoga ${l.width.toFixed(1)}×${l.height.toFixed(1)}  ${JSON.stringify(k.d.rn).slice(0, 140)}`);
        const line = (c, mark) => {
          const cl = c.n.getComputedLayout();
          console.log(`         ${mark} ${c.d.kind === 'leaf' ? 'leaf ' : ''}${c.d.name.slice(0, 40)}  browser ${c.d.rect.w.toFixed(1)}×${c.d.rect.h.toFixed(1)}  yoga ${cl.width.toFixed(1)}×${cl.height.toFixed(1)}${c.d.absolute ? ' abs' : ''}${c.moved ? ' moved' : ''}  ${JSON.stringify(c.d.rn || {}).slice(0, 90)}`);
        };
        k.kids.forEach((c) => line(c, '·'));
        // Every ancestor, innermost first: who decides this box's room.
        for (let a = k.parent, depth = 0; a && depth < 7; a = a.parent, depth++) {
          const al = a.n.getComputedLayout();
          console.log(`         ↑${depth} ${a.d.name.slice(0, 30)}${a.d.scroll ? ` (${a.d.scroll}scroll)` : ''}${a.moved ? ' moved' : ''}  browser ${a.d.rect.w.toFixed(1)}×${a.d.rect.h.toFixed(1)}  yoga ${al.width.toFixed(1)}×${al.height.toFixed(1)}  ${JSON.stringify(a.d.rn || {}).slice(0, 120)}`);
        }
        if (k.parent) {
          const pl = k.parent.n.getComputedLayout();
          console.log(`         parent ${k.parent.d.name}  browser ${k.parent.d.rect.w.toFixed(1)}×${k.parent.d.rect.h.toFixed(1)}  yoga ${pl.width.toFixed(1)}×${pl.height.toFixed(1)}  ${JSON.stringify(k.parent.d.rn || {}).slice(0, 110)}`);
          k.parent.kids.forEach((c) => line(c, c === k ? '▶' : '○'));
        }
      }
    }
    root.freeRecursive();
    total += off.length;
    report.push({ screen, off });
    console.log(`${screen.padEnd(40)} ${off.length ? `${off.length} box(es) apart` : 'agrees'}   (${boxes} boxes)`);
    const f = (v) => (v >= 0 ? '+' : '') + v.toFixed(1);
    const shown = [...off.filter((x) => args.includes('--all') || !x.inherited), ...notes];
    for (const o of shown.slice(0, SHOW)) {
      console.log(`      x ${f(o.dx).padStart(7)}  y ${f(o.dy).padStart(7)}  w ${f(o.dw).padStart(7)}  h ${f(o.dh).padStart(7)}   ${o.trail.slice(-4).join(' › ')}`);
      if (args.includes('--why')) {
        console.log(`         style ${o.style}`);
        for (const c of o.kidsDom) console.log(`           · ${c}`);
      }
    }
  }
  await browser.close();
  console.log(total ? `\n${total} box(es) placed differently by the browser and by Yoga (of ${compared} compared)` : `\nALL ${compared} BOXES AGREE with Yoga`);
  process.exit(total ? 1 : 0);
})();
