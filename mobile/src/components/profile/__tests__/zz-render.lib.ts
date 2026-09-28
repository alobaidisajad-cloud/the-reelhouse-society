import { StyleSheet as RNStyleSheet } from 'react-native';
import { BLOOM, lightGeometry, type Room } from '@/src/theme/light';
/**
 * The React Native tree, converted to HTML that draws the same picture.
 *
 * ── WHY THE FIRST VERSION LOOKED WRONG ───────────────────────────────────────
 * It matched element types called `Svg` and `Circle`. React Native Svg does not
 * render those — it renders `RNSVGSvgView`, `RNSVGGroup`, `RNSVGCircle`,
 * `RNSVGPath`. Nothing matched, so every icon in the app vanished and so did the
 * Projector's dial, which is the centrepiece of that room. And every poster was
 * an empty rectangle, which in the Archive is 54 of them against 11 pieces of
 * text — most of the room.
 *
 * Everything needed was in the tree the whole time. Lucide draws through
 * react-native-svg, so each icon arrives with its real `d` path; the dial
 * arrives as two circles with their real dash arrays. Colours on the inner
 * nodes are packed ARGB integers rather than strings, so they are decoded
 * rather than dropped.
 */

// ── colour ──────────────────────────────────────────────────────────────────
/**
 * react-native-svg hands inner nodes `{ type: 0, payload: <argb int> }`, and
 * expo-linear-gradient hands a bare int. Both are the same packed colour.
 */
export function decodeColour(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  const payload = typeof v === 'number' ? v : (v as { payload?: number }).payload;
  if (typeof payload !== 'number') return null;
  const a = (payload >>> 24) & 255;
  const r = (payload >>> 16) & 255;
  const g = (payload >>> 8) & 255;
  const b = payload & 255;
  const hx = (n: number) => n.toString(16).padStart(2, '0');
  return a === 255 ? `#${hx(r)}${hx(g)}${hx(b)}` : `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`;
}

const CAP = ['butt', 'round', 'square'];
const JOIN = ['miter', 'round', 'bevel'];

// ── style ───────────────────────────────────────────────────────────────────
const PX = new Set([
  'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
  'top', 'bottom', 'left', 'right', 'margin', 'marginTop', 'marginBottom',
  'marginLeft', 'marginRight', 'padding', 'paddingTop', 'paddingBottom',
  'paddingLeft', 'paddingRight', 'borderWidth', 'borderRadius',
  'borderTopWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderRightWidth',
  'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius',
  'borderBottomRightRadius', 'fontSize', 'lineHeight', 'letterSpacing',
  'gap', 'rowGap', 'columnGap', 'flexBasis',
]);
const DIRECT = new Set([
  'color', 'backgroundColor', 'opacity', 'borderColor', 'borderTopColor',
  'borderBottomColor', 'borderLeftColor', 'borderRightColor', 'textAlign',
  'fontWeight', 'fontStyle', 'position', 'zIndex', 'overflow', 'flex',
  'flexDirection', 'alignItems', 'alignContent', 'justifyContent', 'flexWrap', 'alignSelf',
  'textTransform', 'flexGrow', 'flexShrink', 'aspectRatio', 'writingDirection',
  'borderStyle', 'display', 'textDecorationLine', 'textDecorationColor', 'textDecorationStyle',
]);

const FONT_MAP: Record<string, string> = {
  Rye_400Regular: "'Rye', serif",
  SpecialElite_400Regular: "'Special Elite', monospace",
  CourierPrime_400Regular: "'Courier Prime', monospace",
  CourierPrime_700Bold: "'Courier Prime', monospace",
  CourierPrime_400Regular_Italic: "'Courier Prime', monospace",
  Spectral_400Regular: "'Spectral', serif",
  Spectral_500Medium: "'Spectral', serif",
  Spectral_400Regular_Italic: "'Spectral', serif",
};

const kebab = (k: string) => k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());

/**
 * ── THE TWO PROPS WHOSE CSS NAME IS NOT THEIR REACT NATIVE NAME ──────────────
 * Everything else in DIRECT kebab-cases into a real CSS property. `writing-
 * direction` is not one — CSS calls it `direction` — so for as long as this was
 * spelled the React Native way, every right-to-left plate in the gallery was
 * drawn with a LEFT-to-right paragraph and nobody could see it: the browser
 * drops an unknown property in silence, and the plates showed a real bug that
 * was not there while hiding the real one that was.
 *
 * A renamed property is checked below, in `styleToCss`, against the browser's
 * own list — the guard is that a name nobody recognises must not be emitted.
 */
const CSS_NAME: Record<string, string> = { writingDirection: 'direction' };

/**
 * A style prop arrives as an object, an array of them, or — in older RN — a
 * registered id, which is an integer. `StyleSheet.flatten` resolves all three
 * to one flat object, which is what every caller here assumes it is getting.
 *
 * (The id case is defensive only. It was once blamed for the film page's
 * missing backdrop fade; that was wrong — `absoluteFill` is a plain object in
 * this version, and the fade was absent from the proposed SCAFFOLD, not from
 * the app. See zz-render.lib.test.ts.)
 */
export const flat = (s: unknown): Record<string, unknown> => {
  if (!s) return {};
  if (Array.isArray(s)) return s.reduce<Record<string, unknown>>((a, x) => ({ ...a, ...flat(x) }), {});
  if (typeof s === 'number') return (RNStyleSheet.flatten(s) as unknown as Record<string, unknown>) ?? {};
  return s as Record<string, unknown>;
};

/**
 * ── THE INSETS THAT NEVER ARRIVED ────────────────────────────────────────────
 * React Native writes `paddingHorizontal: 24`. CSS has no such property, and
 * the converter only knew `padding` and the four sides — so every inset written
 * the idiomatic RN way was DROPPED. Sections ran edge to edge, the docked
 * plate touched both rails, and rows lost the breathing room they were given.
 * This is the single most common style key in the codebase.
 *
 * Expanded here rather than in the loop so RN's precedence is preserved:
 * `padding` < `paddingHorizontal`/`Vertical` < `paddingLeft`/`Right`/…
 */
const BOX: [string, string[]][] = [
  ['padding', ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft']],
  ['margin', ['marginTop', 'marginRight', 'marginBottom', 'marginLeft']],
  ['paddingHorizontal', ['paddingLeft', 'paddingRight']],
  ['paddingVertical', ['paddingTop', 'paddingBottom']],
  ['marginHorizontal', ['marginLeft', 'marginRight']],
  ['marginVertical', ['marginTop', 'marginBottom']],
  ['paddingStart', ['paddingLeft']], ['paddingEnd', ['paddingRight']],
  ['marginStart', ['marginLeft']], ['marginEnd', ['marginRight']],
  // The app is laid out left to right, so `start`/`end` are left and right.
  ['start', ['left']], ['end', ['right']],
  ['borderRadius', ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius']],
  ['borderWidth', ['borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth']],
  ['borderColor', ['borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor']],
];

export function expandBox(style: Record<string, unknown>): Record<string, unknown> {
  const st = { ...style };
  for (const [short, sides] of BOX) {
    if (!(short in st)) continue;
    const v = st[short];
    delete st[short];
    // A side written explicitly always wins over the shorthand it belongs to.
    for (const side of sides) if (!(side in style)) st[side] = v;
  }
  return st;
}

type Side = 'Top' | 'Right' | 'Bottom' | 'Left';

/**
 * The sides of a box whose border a browser cannot lay out at its true width
 * (not a whole number of points), with those widths — see point 5 in `css`.
 * A dashed or dotted border is left alone: it keeps a real, rounded border.
 */
export function thinSides(raw: Record<string, unknown>): Partial<Record<Side, number>> {
  const st = expandBox(raw);
  const out: Partial<Record<Side, number>> = {};
  if (st.borderStyle === 'dashed' || st.borderStyle === 'dotted') return out;
  for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) {
    const w = st[`border${side}Width`];
    if (typeof w === 'number' && w > 0 && !Number.isInteger(w) && typeof (st[`padding${side}`] ?? 0) === 'number') out[side] = w;
  }
  return out;
}

export function css(raw: Record<string, unknown>, isText: boolean): string {
  const st = expandBox(raw);
  const out: string[] = [];

  /**
   * ── TEXT NEEDS TO BE POSITIONED TOO ──────────────────────────────────────
   * RN paints in document order, full stop. In CSS a positioned sibling paints
   * above non-positioned inline content no matter where it sits in the source —
   * so a label written AFTER an absolutely-filled gradient still ended up
   * UNDERNEATH it. The brass stub rendered as a blank gold plate: glyph and
   * chevron present (they are boxes, already positioned), the words gone.
   *
   * Only position and stacking, though. `flex-shrink: 0` is deliberately NOT
   * given to text — a one-line label in a flex row has to be allowed to shrink
   * or it overflows instead of ellipsising.
   */
  out.push('position:relative', 'z-index:0');

  if (!isText) {
    /**
     * ── REACT NATIVE AND CSS DISAGREE ABOUT TWO DEFAULTS ────────────────────
     * Both are silent until the page is given a real 844pt viewport, and then
     * both are catastrophic. This is what turned the film page into a smear.
     *
     * 1. flex-shrink. RN defaults to 0; CSS defaults to 1. Inside a frame that
     *    is shorter than the content, CSS therefore CRUSHES every box to fit —
     *    the poster collapses to a sliver, captions climb into the section
     *    above them, and a page that should scroll is compressed instead. On
     *    an unrolled page nothing is constrained, so the bug could not be seen
     *    until the frame became honest.
     *
     * 2. position. RN defaults to `relative`; CSS defaults to `static`. A
     *    static parent is invisible to an absolutely-positioned child, so
     *    every overlay ESCAPES its own box and anchors to some distant
     *    ancestor — which is how a backdrop's sepia tint ended up washed over
     *    the entire page instead of over the backdrop.
     *
     *    Making every box positioned also repairs paint order for free: RN
     *    paints later siblings on top, and in CSS a positioned element paints
     *    above static in-flow content regardless of order. With everything
     *    relative, paint order is document order — exactly RN's rule.
     *
     * Both are pushed FIRST so any real value in the style overrides them.
     */
    /**
     * 3. z-index scope. In RN a `zIndex` only orders an element against its
     *    SIBLINGS. In CSS it competes across the whole stacking context, so a
     *    `zIndex: 2` buried deep inside the scroll content climbed out and
     *    painted OVER the docked stub — the SOCIETY CRITIQUES heading printed
     *    across the bottom bar. Giving every box `z-index: 0` makes each one a
     *    stacking context, which confines a child's zIndex to its own parent:
     *    exactly RN's rule. A real zIndex in the style still overrides this.
     */
    out.push('flex-shrink:0');

    /**
     * 4. borders. RN needs only a width and a colour; CSS draws nothing until
     *    `border-style` is set, because it defaults to `none` — so every
     *    hairline in the app was silently absent. But setting a style alone is
     *    worse than nothing: CSS's initial `border-width` is `medium`, so a
     *    single `borderBottomWidth: 1` would suddenly draw a 3px box on all
     *    four sides. Both halves are needed: style solid, width zero, and then
     *    the real widths land later and override.
     */
    if (Object.keys(st).some((k) => /^border(Top|Right|Bottom|Left)?Width$/.test(k))) {
      out.push('border-style:solid', 'border-width:0');
    }
    /**
     * 5. a border that is not a whole number of points. A browser snaps every
     *    border to whole pixels — a 0.5pt hairline UP to 1, a 1.5pt frame DOWN
     *    to 1, at any pixel density — so a screen of ruled rows grew points
     *    taller than the phone lays it (mockups/tools/yoga-parity.cjs found it:
     *    the Lobby's ticker, its inside 26pt here and 27pt on the phone). So
     *    such a side is laid out as padding of its exact width, and drawn as an
     *    inset shadow of the same width and colour, where the border would be.
     *    A dashed or dotted line keeps its real border; a shadow cannot dash.
     */
    const lines = Object.entries(thinSides(st)) as [Side, number][];
    if (lines.length) {
      const shadows: string[] = [];
      for (const [side, w] of lines) {
        st[`padding${side}`] = ((st[`padding${side}`] as number | undefined) ?? 0) + w;
        st[`border${side}Width`] = 0;
        const colour = (st[`border${side}Color`] as string | undefined) ?? 'black';
        const [x, y] = side === 'Top' ? [0, w] : side === 'Bottom' ? [0, -w] : side === 'Left' ? [w, 0] : [-w, 0];
        shadows.push(`inset ${x}px ${y}px 0 0 ${colour}`);
      }
      st.boxShadow = [shadows.join(', '), typeof st.boxShadow === 'string' ? st.boxShadow : ''].filter(Boolean).join(', ');
    }
    // RN's alignContent defaults to flex-start; CSS's (`normal`) stretches the
    // lines of a wrapping box, centring a single line in a min-height row that
    // the phone sets at the top (yoga-parity found it). The style's own wins.
    out.push('display:flex', `flex-direction:${(st.flexDirection as string) || 'column'}`, 'align-content:flex-start');
    // Its side margins, which the harness takes off the column's width when it
    // holds a box to that width (see RN_RULES in mockups/tools/harness.cjs).
    const mx = [st.marginLeft, st.marginRight].reduce<number>((a, m) => a + (typeof m === 'number' ? m : 0), 0);
    if (mx) out.push(`--mx:${mx}px`);
  }

  // Shadows were dropped entirely by the first version, and this app leans on
  // them — the brass glow under a count, the lift under the altarpiece.
  const sc = st.shadowColor as string | undefined;
  const so = st.shadowOffset as { width: number; height: number } | undefined;
  const sr = st.shadowRadius as number | undefined;
  const sop = st.shadowOpacity as number | undefined;
  if (sc && (sr || so)) {
    const x = so?.width ?? 0;
    const y = so?.height ?? 0;
    const blur = sr ?? 0;
    const colour = typeof sop === 'number' && /^#|rgb/.test(sc)
      ? (sc.startsWith('#') ? hexToRgba(sc, sop) : sc)
      : sc;
    out.push(`${isText ? 'text-shadow' : 'box-shadow'}:${x}px ${y}px ${blur}px ${colour}`);
  }
  /**
   * ── THE NEW ARCHITECTURE'S OWN CSS ────────────────────────────────────────
   * React Native 0.76+ takes `boxShadow` (inset included) and, from 0.79,
   * `experimental_backgroundImage` (gradients) as CSS strings. The edge light
   * on every lit surface is exactly these two. A legacy shadow above and a
   * `boxShadow` here are separate layers on the device, so both are drawn.
   */
  if (!isText && typeof st.boxShadow === 'string') {
    const legacy = out.findIndex((d) => d.startsWith('box-shadow:'));
    if (legacy >= 0) out[legacy] = `${out[legacy]}, ${st.boxShadow}`;
    else out.push(`box-shadow:${st.boxShadow}`);
  }
  if (!isText && typeof st.experimental_backgroundImage === 'string') {
    out.push(`background-image:${st.experimental_backgroundImage}`);
  }
  const ts = st.textShadowColor as string | undefined;
  if (ts) {
    const o = st.textShadowOffset as { width: number; height: number } | undefined;
    out.push(`text-shadow:${o?.width ?? 0}px ${o?.height ?? 0}px ${(st.textShadowRadius as number) ?? 0}px ${ts}`);
  }

  /**
   * ── A BOX THAT MAY SHRINK, SHRINKS AS FAR AS YOGA LETS IT ─────────────────
   * In Yoga no flex item has an automatic minimum: one that may shrink
   * (flexShrink > 0, or a negative flex) or is sized from a zero basis (a
   * positive flex) goes down to its minWidth, which is 0 unless set. A browser
   * stops it at its content (`min-width: auto`) — so a row of name, badge and
   * time, where the phone shortens the name, was reported OFF at 320pt. Set
   * here, BEFORE the style's own values, so a real minWidth or minHeight still
   * wins (it used to be pushed later, and overrode them).
   */
  const shrinks = (typeof st.flexShrink === 'number' && st.flexShrink > 0)
    || (typeof st.flex === 'number' && st.flex !== 0);
  /**
   * Nor does a box with an aspect ratio grow to fit what is in it. CSS gives
   * such a box an automatic minimum from its content, so a poster whose image
   * is a hair taller than 2:3 pushed its 2:3 frame taller too — 0.36pt on an
   * iPad, a row of three at a time (yoga-parity found it). Yoga holds the ratio.
   */
  if (shrinks || st.aspectRatio !== undefined) out.push('min-width:0', 'min-height:0');

  for (const [k, v] of Object.entries(st)) {
    if (v === undefined || v === null) continue;
    if (k === 'fontFamily') {
      out.push(`font-family:${FONT_MAP[String(v)] || 'monospace'}`);
      if (String(v).includes('Italic')) out.push('font-style:italic');
      if (String(v).includes('700Bold')) out.push('font-weight:700');
      continue;
    }
    if (k === 'flexDirection') continue;
    /**
     * ── `flex: 0` MEANS THE OPPOSITE IN THE TWO LANGUAGES ──────────────────
     * RN's `flex: 0` is grow 0, shrink 0, basis AUTO — "size to your content".
     * CSS's `flex: 0` is grow 0, shrink 1, basis 0% — "collapse to nothing".
     * Lucide sets `flex: 0` on every icon it draws, so passing the value
     * through verbatim gave every icon in the app a zero main size: present in
     * the document, correctly pathed, drawing nothing. Measured at 16x0.
     *
     * RN's rules in full, from its Yoga (Node::resolveFlexGrow/Shrink, with
     * RN's non-web defaults): positive n → grow n, shrink 0, basis 0;
     * 0 → grow 0, shrink 0, basis auto; negative → grow 0, shrink −n, basis
     * auto. (This once wrote shrink 1 for a positive flex — the web's rule.
     * With a basis of 0 the two lay out alike, but not beside a flexBasis.)
     */
    if (k === 'flex' && typeof v === 'number') {
      if (v > 0) out.push(`flex:${v} 0 0%`);
      else if (v === 0) out.push('flex:0 0 auto');
      else out.push(`flex:0 ${-v} auto`);
      continue;
    }
    if (k.startsWith('shadow') || k.startsWith('textShadow') || k === 'elevation') continue;
    if (k === 'transform') {
      /**
       * The unit depends on the function, and getting it wrong is not a near
       * miss — `scale(1px)` is invalid, so the browser discards the WHOLE
       * transform list, taking any translate alongside it. Scale is unitless,
       * rotate and skew are degrees, translate is pixels.
       */
      const unit = (fn: string) =>
        /^scale/.test(fn) ? '' : /^(rotate|skew)/.test(fn) ? 'deg' : 'px';
      const t = (v as Record<string, string | number>[]).map((o) =>
        Object.entries(o).map(([tk, tv]) =>
          `${tk}(${tv}${typeof tv === 'number' ? unit(tk) : ''})`).join(' ')).join(' ');
      out.push(`transform:${t}`);
      continue;
    }
    // Where a transform turns and scales from: a string passes as CSS writes
    // it ('top left'); RN's array form is [x, y, z] in points.
    if (k === 'transformOrigin') {
      out.push(`transform-origin:${Array.isArray(v) ? v.map((x) => (typeof x === 'number' ? `${x}px` : x)).join(' ') : v}`);
      continue;
    }
    // An image's fit, written in its style (Image's `resizeMode`).
    if (k === 'resizeMode') {
      out.push(`object-fit:${({ cover: 'cover', contain: 'contain', stretch: 'fill', center: 'none', repeat: 'none' } as Record<string, string>)[String(v)] ?? 'cover'}`);
      continue;
    }
    if (PX.has(k)) { out.push(`${kebab(k)}:${typeof v === 'number' ? v + 'px' : v}`); continue; }
    if (DIRECT.has(k)) { out.push(`${CSS_NAME[k] ?? kebab(k)}:${v}`); continue; }
    if (!DRAWN_ELSEWHERE.has(k)) noteUnread(k);
  }
  return out.join(';');
}

/**
 * Style keys the converter met and did not turn into CSS. `alignContent` and
 * `flexBasis` were dropped this way without a word, and a dropped key is a
 * drawing the phone does not make. With MOCKUPS_UNREAD=<file> set, each is
 * written to that file as it is first met, so a run over every screen lists
 * them all.
 * DRAWN_ELSEWHERE: read by other code in this file, or with no effect on a
 * still picture — and nothing else.
 */
const DRAWN_ELSEWHERE = new Set([
  'boxShadow', 'experimental_backgroundImage', // above, in this function
  'tintColor', // an image's: drawn by the image branch in toHtml
  'includeFontPadding', // Android's extra line padding; every text here strips it
  'pointerEvents', 'cursor', 'userSelect', // touch only
  // NOT drawn, on purpose: where ANDROID sets a text inside a box taller than
  // its lines (iOS ignores it and sets it at the top, as this does). No text in
  // the app has a set height; one stretched by its row would differ on Android.
  'textAlignVertical',
]);
const UNREAD = new Set<string>();
function noteUnread(k: string): void {
  if (UNREAD.has(k)) return;
  UNREAD.add(k);
  if (process.env.MOCKUPS_UNREAD) require('fs').appendFileSync(process.env.MOCKUPS_UNREAD, `${k}\n`);
}

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ── svg ─────────────────────────────────────────────────────────────────────
const SVG_TAG: Record<string, string> = {
  RNSVGSvgView: 'svg', RNSVGGroup: 'g', RNSVGPath: 'path', RNSVGCircle: 'circle',
  RNSVGRect: 'rect', RNSVGLine: 'line', RNSVGEllipse: 'ellipse',
  RNSVGDefs: 'defs', RNSVGLinearGradient: 'linearGradient',
  RNSVGRadialGradient: 'radialGradient', RNSVGStop: 'stop', RNSVGText: 'text',
  RNSVGMask: 'mask',
};

function svgAttrs(type: string, p: Record<string, unknown>): string {
  const a: string[] = [];
  const put = (k: string, v: unknown) => { if (v !== undefined && v !== null && v !== '') a.push(`${k}="${esc(String(v))}"`); };

  if (type === 'RNSVGSvgView') {
    put('xmlns', 'http://www.w3.org/2000/svg');
    put('width', p.width); put('height', p.height);
    /**
     * ── EVERY ICON WAS CLIPPED TO ITS TOP-LEFT CORNER ──────────────────────
     * This line used to be `p.viewBox ?? (cond ? undefined : undefined)` —
     * undefined either way, so NO svg ever got a viewBox. Lucide draws in a
     * 24-unit box and renders at `size`, so a 16pt icon showed the top-left
     * 16 units of a 24-unit drawing: a bookmark became a bracket, a play
     * triangle became a corner. Twenty icons a page, in every mockup ever
     * shown, and it read as "the icons look wrong" rather than as one bug.
     *
     * react-native-svg does not keep `viewBox` as a string — it splits it into
     * minX / minY / vbWidth / vbHeight, which is why looking for `viewBox`
     * found nothing and the expression was quietly written to give up.
     */
    const vbW = p.vbWidth ?? p.bbWidth;
    const vbH = p.vbHeight ?? p.bbHeight;
    const viewBox = typeof p.viewBox === 'string'
      ? p.viewBox
      : (vbW !== undefined && vbH !== undefined
        ? `${p.minX ?? 0} ${p.minY ?? 0} ${vbW} ${vbH}`
        : undefined);
    put('viewBox', viewBox);
    put('fill', p.fill === null ? 'none' : (typeof p.fill === 'string' ? p.fill : undefined));
    put('stroke', typeof p.stroke === 'string' ? p.stroke : undefined);
    put('stroke-width', p.strokeWidth);
    put('stroke-linecap', typeof p.strokeLinecap === 'string' ? p.strokeLinecap : undefined);
    put('stroke-linejoin', typeof p.strokeLinejoin === 'string' ? p.strokeLinejoin : undefined);
    return a.join(' ');
  }

  /**
   * ── A GRADIENT IS ONE NATIVE NODE, NOT A TREE OF STOPS ───────────────────
   * react-native-svg folds a gradient's <Stop> children into the node itself:
   * `name` is its id, `gradient` is [offset, argb, offset, argb, …], and
   * `gradientUnits` is 0/1. Without this the room's light rendered as three
   * rectangles filled with a reference to nothing — i.e. not at all.
   *
   * And an ELLIPTICAL radial gradient (rx ≠ ry) has no SVG 1.1 attribute: a
   * browser knows only `r`. It is a circle of radius rx, squashed vertically
   * about its own centre by a transform — which is exactly the same shape.
   */
  if (type === 'RNSVGRadialGradient' || type === 'RNSVGLinearGradient') {
    put('id', p.name);
    if (p.gradientUnits === 1) put('gradientUnits', 'userSpaceOnUse');
    if (type === 'RNSVGRadialGradient') {
      put('cx', p.cx); put('cy', p.cy); put('fx', p.fx ?? p.cx); put('fy', p.fy ?? p.cy);
      const rx = Number(p.rx ?? p.r), ry = Number(p.ry ?? p.r);
      put('r', rx);
      if (rx && ry && rx !== ry) {
        const cx = Number(p.cx), cy = Number(p.cy);
        put('gradientTransform', `translate(${cx} ${cy}) scale(1 ${ry / rx}) translate(${-cx} ${-cy})`);
      }
    } else {
      put('x1', p.x1); put('y1', p.y1); put('x2', p.x2); put('y2', p.y2);
    }
    return a.join(' ');
  }

  // A mask, like a gradient, carries its id as `name` and its units as 0/1.
  if (type === 'RNSVGMask') {
    put('id', p.name);
    if (p.maskUnits === 1) put('maskUnits', 'userSpaceOnUse');
    put('x', p.x); put('y', p.y); put('width', p.width); put('height', p.height);
    return a.join(' ');
  }
  // Anything masked names its mask by id alone.
  if (typeof p.mask === 'string' && p.mask) put('mask', `url(#${p.mask})`);

  // A fill that points at a gradient arrives as { type: 1, brushRef: <id> }.
  const brush = (v: unknown) =>
    v && typeof v === 'object' && (v as { type?: number }).type === 1
      ? `url(#${(v as { brushRef?: string }).brushRef})` : null;
  const fill = brush(p.fill) ?? decodeColour(p.fill);
  const stroke = brush(p.stroke) ?? decodeColour(p.stroke);
  put('fill', fill ?? (p.fill === null ? 'none' : undefined));
  put('stroke', stroke);
  put('stroke-width', p.strokeWidth);
  if (typeof p.strokeLinecap === 'number') put('stroke-linecap', CAP[p.strokeLinecap]);
  if (typeof p.strokeLinejoin === 'number') put('stroke-linejoin', JOIN[p.strokeLinejoin]);
  put('stroke-dasharray', Array.isArray(p.strokeDasharray) ? (p.strokeDasharray as unknown[]).join(' ') : p.strokeDasharray);
  put('stroke-dashoffset', p.strokeDashoffset);
  for (const k of ['d', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'offset', 'stopColor', 'stopOpacity', 'id']) {
    if (p[k] !== undefined) put(k === 'stopColor' ? 'stop-color' : k === 'stopOpacity' ? 'stop-opacity' : k, p[k]);
  }
  return a.join(' ');
}

// Each veil's gradients get their own ids, should a page hold two.
let veilSeq = 0;

// ── the bloom ───────────────────────────────────────────────────────────────
/** The bloom, drawn from `BLOOM` in a box styled by the caller. */
function bloomHtml(uri: string, style: string, opts: RenderOpts): string {
  const m = /\/w\d+(\/[^/?]+)$/.exec(uri) || /\/(\w+\.jpg)$/.exec(uri);
  const poster = m && opts.posters ? opts.posters[m[1]] || opts.posters['/' + m[1]] : undefined;
  const fade = `linear-gradient(180deg,${BLOOM.mask.map(([at, a]) => `rgba(0,0,0,${a}) ${at * 100}%`).join(',')})`;
  const img = poster
    ? `<img src="${poster.data}" alt="" style="width:100%;height:100%;object-fit:cover;` +
      `filter:blur(${BLOOM.blur}px) saturate(${BLOOM.saturate}) sepia(${BLOOM.sepia});` +
      `opacity:${BLOOM.opacity};transform:scale(${BLOOM.scale})" />`
    : '';
  return `<div data-t="room-bloom" style="${style};-webkit-mask-image:${fade};mask-image:${fade}">${img}</div>`;
}

// ── the walk ────────────────────────────────────────────────────────────────
export interface RenderOpts {
  /** poster_path -> data URI. */
  posters?: Record<string, { title: string; data: string }>;
  /** file name -> data URI, for the app's own bundled images. */
  local?: Record<string, string>;
  /** The parent's box, which its absolute children are placed in (see placeInside). */
  within?: Frame;
  /** Modals met on the way down, drawn after the render as layers over the phone. */
  layers?: string[];
}

interface N { type?: string; props?: Record<string, unknown>; children?: unknown[] }

/**
 * What a box's absolute children are placed by: its thin border sides (see
 * `thinSides`), its numeric padding per side, and how it lays out.
 */
interface Frame {
  edge: Partial<Record<Side, number>>;
  pad: Partial<Record<Side, number>>;
  dir: string; justify: string; align: string; wrapReverse: boolean;
}

function frameOf(raw: Record<string, unknown>): Frame {
  const st = expandBox(raw);
  const pad: Frame['pad'] = {};
  for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) {
    const v = st[`padding${side}`];
    if (typeof v === 'number' && v) pad[side] = v;
  }
  return {
    edge: thinSides(raw), pad,
    dir: String(st.flexDirection ?? 'column'),
    justify: String(st.justifyContent ?? 'flex-start'),
    align: String(st.alignItems ?? 'stretch'),
    wrapReverse: st.flexWrap === 'wrap-reverse',
  };
}

/**
 * Where Yoga puts an absolute box along an axis on which it has NO inset —
 * by the parent's justifyContent (main axis) or the child's alignment (cross
 * axis), read from React Native 0.81's Yoga (AbsoluteLayout.cpp). Measured
 * from the parent's BORDER, not its padding: RN keeps the errata
 * AbsolutePositionWithoutInsetsExcludesPadding on. A browser puts such a box
 * where it would sit in the flow, inside the padding — the Dispatch's scroll
 * thumb was 23.8pt off.
 */
function unplacedAt(frame: Frame, st: Record<string, unknown>, main: boolean): 'start' | 'end' | 'center' {
  if (main) {
    const j = frame.justify;
    return j === 'flex-end' ? 'end' : j === 'center' || j === 'space-around' || j === 'space-evenly' ? 'center' : 'start';
  }
  const own = typeof st.alignSelf === 'string' && st.alignSelf !== 'auto' ? st.alignSelf : frame.align;
  let a: string = own === 'flex-end' ? 'end' : own === 'center' ? 'center' : 'start';
  if (frame.wrapReverse) a = a === 'end' ? 'start' : a === 'center' ? 'center' : 'end';
  return a as 'start' | 'end' | 'center';
}

/**
 * Where the browser must be told to put an absolutely placed box, so that it
 * lands where React Native's Yoga puts it. Two differences, both measured by
 * mockups/tools/yoga-parity.cjs:
 *
 *   · Its insets are measured from the parent's border — and `css` draws a
 *     thin border as padding (point 5 there), so the browser would measure
 *     from the border's OUTER edge: a child pinned `top: 0` sat on the line.
 *     Each inset is moved in by that side's thin border.
 *   · A PERCENTAGE — of its size or of an inset — is of the parent's INNER
 *     size in React Native (Yoga's errata AbsolutePercentAgainstInnerSize,
 *     which RN keeps on): the parent less its padding and borders. A browser
 *     takes it of the size less the borders alone. The film page's 48%-high
 *     shade was 23.5pt here and 12.7pt on the phone. So the padding, and the
 *     thin border drawn as padding, come off the base. (Strictly, Yoga takes
 *     it of the space the parent was OFFERED, which is its size unless the
 *     parent sizes to its content inside one that does not stretch it — a
 *     case a browser cannot follow, and yoga-parity reports.)
 */
function placeInside(st: Record<string, unknown>, frame: Frame | undefined): Record<string, unknown> {
  if (!frame || st.position !== 'absolute') return st;
  const { edge, pad } = frame;
  const across = (a: Side, b: Side) => (pad[a] ?? 0) + (pad[b] ?? 0) + (edge[a] ?? 0) + (edge[b] ?? 0);
  const base = { v: across('Top', 'Bottom'), h: across('Left', 'Right') };
  const out = { ...st };
  const keys: [string, 'v' | 'h', Side | null][] = [
    ['top', 'v', 'Top'], ['bottom', 'v', 'Bottom'], ['left', 'h', 'Left'], ['right', 'h', 'Right'],
    ['start', 'h', 'Left'], ['end', 'h', 'Right'],
    ['height', 'v', null], ['minHeight', 'v', null], ['maxHeight', 'v', null],
    ['width', 'h', null], ['minWidth', 'h', null], ['maxWidth', 'h', null],
  ];
  for (const [k, axis, side] of keys) {
    const v = out[k];
    const shift = side ? edge[side] ?? 0 : 0;
    if (typeof v === 'number') {
      if (shift) out[k] = v + shift;
    } else if (typeof v === 'string' && /^-?[\d.]+%$/.test(v)) {
      const p = parseFloat(v);
      const less = (p / 100) * base[axis] - shift;
      if (less) out[k] = `calc(${v} - ${+less.toFixed(4)}px)`;
    }
  }
  // An axis with no inset at all: placed as Yoga places it (see unplacedAt).
  const ex = expandBox(st);
  const axes = [
    { horizontal: true, keys: ['left', 'right', 'start', 'end'], s: 'Left', e: 'Right', startK: 'left', endK: 'right', size: ex.width },
    { horizontal: false, keys: ['top', 'bottom'], s: 'Top', e: 'Bottom', startK: 'top', endK: 'bottom', size: ex.height },
  ] as const;
  for (const a of axes) {
    if (a.keys.some((k) => out[k] !== undefined && out[k] !== null)) continue;
    const main = frame.dir.startsWith('row') === a.horizontal;
    let at = unplacedAt(frame, st, main);
    if (main && frame.dir.endsWith('reverse') && at !== 'center') at = at === 'start' ? 'end' : 'start';
    const thinS = edge[a.s as Side] ?? 0, thinE = edge[a.e as Side] ?? 0;
    if (at === 'start') out[a.startK] = thinS;
    else if (at === 'end') out[a.endK] = thinE;
    else if (typeof a.size === 'number') {
      const m = (k: string) => (typeof ex[k] === 'number' ? (ex[k] as number) : 0);
      const outer = a.size + m(`margin${a.s}`) + m(`margin${a.e}`);
      out[a.startK] = `calc(50% - ${+((thinS + thinE + outer) / 2 - thinS).toFixed(4)}px)`;
    }
  }
  return out;
}

export function toHtml(node: unknown, opts: RenderOpts = {}, inSvg = false): string {
  // The top of a render: modals found anywhere inside are drawn after it, each
  // as its own layer over the whole phone (see `Modal` below).
  if (!opts.layers) {
    const layers: string[] = [];
    const html = toHtml(node, { ...opts, layers }, inSvg);
    return html + layers.join('');
  }
  if (node === null || node === undefined) return '';
  if (typeof node === 'string') return esc(node);
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map((c) => toHtml(c, opts, inSvg)).join('');

  const n = node as N;
  const t = String(n.type || '');
  const p = n.props || {};

  /**
   * ── A MODAL IS A WINDOW OF ITS OWN ───────────────────────────────────────
   * On the phone a Modal's content is a separate root the size of the screen,
   * in a `flex: 1` container — white unless `transparent` (RN's Modal.js).
   * Jest's Modal draws it inline, wherever the component happens to sit, so a
   * sheet whose layout is `flex: 1` was laid out inside a box sized by its
   * content: a browser let it run to its content's height, and Yoga — the
   * phone's engine — collapsed it to nothing (yoga-parity found it). It is
   * lifted out here and drawn over the whole phone, as the phone draws it.
   */
  if (t === 'Modal') {
    const fill = { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 };
    const container = { flex: 1, backgroundColor: p.transparent === true ? 'transparent' : (p.backdropColor ?? 'white') };
    const inner = (n.children || []).map((c) => toHtml(c, { ...opts, within: frameOf(container) }, inSvg)).join('');
    opts.layers!.push(`<div data-t="modal"${rnAttr(fill)} style="${css(fill, false)};z-index:1000">` +
      `<div${rnAttr(container)} style="${css(container, false)}">${inner}</div></div>`);
    return '';
  }
  /**
   * ── WHERE A CONTROL WAS WRITTEN ──────────────────────────────────────────
   * A capture run wraps each PressableScale in a `SrcMark` carrying the file
   * and line of the JSX that made it (jest.setup.ts). It is not a box: its
   * child is drawn exactly as it would be without it, and the site is written
   * onto that child as `data-src`, so the touch checks can say which line of
   * source a finding — or a clean measurement — belongs to.
   */
  if (t === 'SrcMark') {
    const inner = (n.children || []).map((c) => toHtml(c, opts, inSvg)).join('');
    return typeof p.src === 'string' ? inner.replace(/^<(\w+)/, `<$1 data-src="${esc(p.src)}"`) : inner;
  }
  // `rn` is the style as React Native has it — what the Yoga check reads.
  // `st` is where the browser must draw it: the same, unless it is placed
  // absolutely (see placeInside). This node's children are placed in ITS box.
  const rn = flat(p.style);
  const around = opts.within?.edge ?? {};
  const st = placeInside(rn, opts.within);
  opts = { ...opts, within: frameOf(rn) };

  // ── SVG: the icons and the dial ──
  const tag = SVG_TAG[t];
  if (tag) {
    // A gradient's stops live in its own `gradient` prop (see svgAttrs).
    const packed = Array.isArray(p.gradient) ? (p.gradient as number[]) : null;
    const kids = packed
      ? Array.from({ length: packed.length / 2 }, (_, i) => {
        const c = decodeColour(packed[i * 2 + 1]) ?? '#000';
        const m = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(c);
        return m
          ? `<stop offset="${packed[i * 2]}" stop-color="rgb(${m[1]},${m[2]},${m[3]})" stop-opacity="${m[4]}"></stop>`
          : `<stop offset="${packed[i * 2]}" stop-color="${c}"></stop>`;
      }).join('')
      : (n.children || []).map((c) => toHtml(c, opts, true)).join('');
    const attrs = svgAttrs(t, p);
    if (t === 'RNSVGSvgView') {
      // Style carries position/size for absolutely-placed art like the dial ring.
      const style = css(st, false).replace(/display:flex;flex-direction:\w+;?/, '');
      /**
       * ── AN SVG'S width/height ATTRIBUTES DO NOT SURVIVE FLEXBOX ───────────
       * Every icon in this app sits inside a flex row or column, and as a flex
       * item the svg's attribute-based intrinsic size collapses to ZERO on the
       * main axis — measured: a 16pt back arrow computing to 16x0, a 14pt
       * chevron to 0x14. The icon is in the document, correctly pathed, and
       * draws nothing. Restating the box in CSS is what actually holds it.
       */
      const box = [
        typeof p.width === 'number' ? `width:${p.width}px` : '',
        typeof p.height === 'number' ? `height:${p.height}px` : '',
        'flex:none',
      ].filter(Boolean).join(';');
      return `<svg ${attrs}${rnAttr(rn)} style="${box}${style ? ';' + style : ''}">${kids}</svg>`;
    }
    return `<${tag}${attrs ? ' ' + attrs : ''}>${kids}</${tag}>`;
  }

  /**
   * ── THE TIER WASH ──────────────────────────────────────────────────────────
   * expo-linear-gradient renders as `ViewManagerAdapter_ExpoLinearGradient`
   * with colours as packed ints and `locations` 0..1. It draws the warm
   * atmosphere behind the membership plate that shifts with a member's rank —
   * a large part of how that page feels, and entirely absent from the first
   * mockup because nothing matched this element name.
   */
  if (/ExpoLinearGradient/.test(t)) {
    const cols = (p.colors as unknown[] | undefined) || [];
    const locs = (p.locations as number[] | undefined) || [];
    const stops = cols.map((c, i) => {
      const colour = decodeColour(c) ?? 'transparent';
      const at = typeof locs[i] === 'number' ? ` ${(locs[i] * 100).toFixed(1)}%` : '';
      return colour + at;
    });
    // Default direction is top to bottom; `start`/`end` override it.
    const s0 = p.start as { x: number; y: number } | undefined;
    const e0 = p.end as { x: number; y: number } | undefined;
    let dir = 'to bottom';
    if (s0 && e0) {
      const deg = (Math.atan2(e0.x - s0.x, -(e0.y - s0.y)) * 180) / Math.PI;
      dir = `${deg.toFixed(1)}deg`;
    }
    const kids = (n.children || []).map((c) => toHtml(c, opts, inSvg)).join('');
    const style = css(st, false);
    // THE PHONE'S RAMP, KEPT FOR WHOEVER MEASURES IT. A CSS angle is not the
    // same gradient: it drops the start and end OFFSETS (a brass ramp runs 0.15
    // to 0.85, not corner to corner) and a native gradient interpolates in the
    // box's UNIT space, not in pixels. Drawn this way it looks close enough to
    // design with; measured this way it put every word on a brass plate against
    // the darkest stop, which the words never touch. So the real parameters ride
    // along, and a contrast check reads the colour under each word from them.
    const grad = encodeURIComponent(JSON.stringify({
      s: s0 ?? { x: 0.5, y: 0 }, e: e0 ?? { x: 0.5, y: 1 },
      c: cols.map((c) => decodeColour(c) ?? 'transparent'),
      l: cols.map((_, i) => (typeof locs[i] === 'number' ? locs[i] : cols.length > 1 ? i / (cols.length - 1) : 0)),
    }));
    return `<div data-grad="${grad}"${rnAttr(rn)} style="${style};background-image:linear-gradient(${dir},${stops.join(',')})">${kids}</div>`;
  }

  /**
   * ── THE BLOOM ──────────────────────────────────────────────────────────────
   * Drawn on the GPU through Skia, which does not run here. Its wrapper carries
   * the artwork (`nativeID`), and the recipe is `BLOOM` itself — so this draws
   * the same blur, colour, opacity and fade the component does, from the same
   * numbers, rather than a second copy of them.
   */
  if (p.testID === 'room-bloom') {
    return bloomHtml(String(p.nativeID ?? ''), css(st, false), opts);
  }
  /**
   * ── THE LIGHT A VEIL CARRIES ──────────────────────────────────────────────
   * Skia again. Its wrapper carries the room, the hem, the veil's stops and
   * the art; this draws, from `lightGeometry` — the one the component draws
   * from — the room's light, masked by the veil's stops, ending at the hem.
   * At rest, which is what a proof shows, the light has not moved.
   */
  if (p.testID === 'room-veil-light') {
    const r = JSON.parse(String(p.nativeID)) as { room: Room; hem: number; art: string | null; stops: [number, number][]; W: number; H: number };
    const g = lightGeometry(r.room, r.W, r.H, r.hem);
    const k = ++veilSeq;
    const ramp = `linear-gradient(180deg,${r.stops.map(([at, a]) => `rgba(0,0,0,${a}) ${at * 100}%`).join(',')})`;
    const radial = (id: string, e: { cx: number; cy: number; rx: number; ry: number }, stops: string) =>
      `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${e.cx}" cy="${e.cy}" fx="${e.cx}" fy="${e.cy}" r="${e.rx}" ` +
      `gradientTransform="translate(${e.cx} ${e.cy}) scale(1 ${e.ry / e.rx}) translate(${-e.cx} ${-e.cy})">${stops}</radialGradient>`;
    const rgb = g.pool.rgb.join(',');
    const stop = (at: number, colour: string, a: number) => `<stop offset="${at}" stop-color="${colour}" stop-opacity="${a}"></stop>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${r.W}" height="${r.H}" style="position:absolute;top:0;left:0;width:${r.W}px;height:${r.H}px"><defs>` +
      radial(`vpool${k}`, g.pool, g.pool.stops.map(([at, a]) => stop(at, `rgb(${rgb})`, a)).join('')) +
      `<linearGradient id="vfloor${k}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${g.floor.height}">${g.floor.stops.map(([at, a]) => stop(at, '#000', a)).join('')}</linearGradient>` +
      radial(`vcorners${k}`, g.corners, g.corners.stops.map(([at, a]) => stop(at, '#000', a)).join('')) +
      `</defs><rect x="0" y="0" width="${r.W}" height="${r.H}" fill="url(#vpool${k})"></rect>` +
      `<rect x="0" y="0" width="${r.W}" height="${r.H}" fill="url(#vfloor${k})"></rect>` +
      `<rect x="0" y="0" width="${r.W}" height="${r.H}" fill="url(#vcorners${k})"></rect></svg>`;
    const bloom = r.art
      ? bloomHtml(r.art, `position:absolute;top:0px;left:${g.bloom.left}px;width:${g.bloom.width}px;height:${g.bloom.height}px;overflow:hidden`, opts)
      : '';
    return `<div data-t="room-veil-light" style="position:absolute;top:0px;left:0px;width:${r.W}px;height:${r.hem}px;` +
      `-webkit-mask-image:${ramp};mask-image:${ramp}">${svg}${bloom}</div>`;
  }

  // ── artwork ──
  if (/^(Image|ExpoImage)$/i.test(t)) {
    const src = p.source as { uri?: string; testUri?: string } | undefined;
    /**
     * ── AN IMAGE PINNED TO ALL FOUR EDGES DOES NOT STRETCH ────────────────────
     * The app fills a frame with `StyleSheet.absoluteFillObject`, which React
     * Native reads as "cover this box". CSS does that for ordinary boxes, but an
     * IMG is a replaced element: with all four insets at 0 and no width, the
     * browser keeps its INTRINSIC size — so a 342pt-wide poster sat inside a
     * 119pt cell and the Darkroom's grid came out zoomed and overhanging. The
     * box has to be restated, exactly as it is for svg elsewhere in this file.
     */
    const fills = rn.position === 'absolute' &&
      [rn.top, rn.left, rn.right, rn.bottom].every((v) => v === 0);
    // Inside a thin border, "the whole box" is the box less that border.
    const less = (a?: number, b?: number) => ((a ?? 0) + (b ?? 0) ? ` - ${(a ?? 0) + (b ?? 0)}px` : '');
    const style = css(st, false) + (fills
      ? `;width:calc(100%${less(around.Left, around.Right)});height:calc(100%${less(around.Top, around.Bottom)})`
      : '');

    // A remote poster, matched on its TMDB path — or a video still, matched on
    // its YouTube key. `img.youtube.com/vi/KEY/hqdefault.jpg` carries no TMDB
    // path, so the first pass left every video thumbnail as an empty frame.
    const uri = String(src?.uri ?? '');
    const yt = /\/vi\/([\w-]+)\//.exec(uri);
    const m = yt || /\/w\d+(\/[^/?]+)$/.exec(uri) || /\/(\w+\.jpg)$/.exec(uri);
    const poster = m && opts.posters ? opts.posters[m[1]] || opts.posters['/' + m[1]] : undefined;

    // The image's own fit, where it names one (expo-image's `contentFit`, or
    // Image's `resizeMode` as a prop or in its style) — else the default below.
    const FIT: Record<string, string> = { cover: 'cover', contain: 'contain', fill: 'fill', stretch: 'fill', none: 'none', center: 'none', repeat: 'none', 'scale-down': 'scale-down' };
    const named = FIT[String(p.contentFit ?? p.resizeMode ?? rn.resizeMode ?? '')];
    /**
     * `tintColor` paints every opaque pixel of the image in one colour (how
     * the seal's mark and a premium frame are coloured). An <img> cannot be
     * recoloured, so the image becomes the MASK of a box of that colour.
     */
    const tint = (rn.tintColor ?? p.tintColor) as string | undefined;
    const draw = (data: string, alt: string, fit: string) => {
      if (!tint) return `<img src="${data}" alt="${esc(alt)}"${a11yAttr(p)}${rnAttr(rn)} style="${style};object-fit:${fit}" />`;
      const size = fit === 'fill' ? '100% 100%' : fit === 'none' ? 'auto' : fit === 'scale-down' ? 'contain' : fit;
      const mask = `url(${data}) center/${size} no-repeat`;
      return `<div${a11yAttr(p)}${rnAttr(rn)} style="${style};background-color:${tint};-webkit-mask:${mask};mask:${mask}"></div>`;
    };
    if (poster) return draw(poster.data, poster.title, named ?? 'cover');

    /**
     * A bundled asset. `require('…/rating-full.png')` arrives as
     * `source.testUri`, and there are FIVE of these per ledger row — 45 of the
     * 54 images in the Archive were rating reels, not posters, which is why
     * that room still read as empty after the artwork landed.
     */
    const local = String(src?.testUri ?? '');
    if (local && opts.local) {
      const name = local.split('/').pop() || '';
      const hit = opts.local[name];
      // `resizeMode: contain` is how these are drawn, unless the image says otherwise.
      if (hit) return draw(hit, '', named ?? 'contain');
    }

    return `<div class="poster"${a11yAttr(p)}${rnAttr(rn)} style="${style}"></div>`;
  }

  /**
   * ── `numberOfLines` IS HOW THIS APP STOPS TEXT OVERFLOWING ─────────────────
   * Ignoring it does not merely lose a nicety — it makes the mockup show
   * overflow the real app CLIPS. A one-line video caption wrapped to three and
   * ran into the next section, and "WHERE TO WATCH collides with the captions"
   * read as a layout fault to go and fix. There was nothing to fix.
   *
   * One line ellipsises; more than one clamps. Both are what RN does.
   */
  if (t === 'Text') {
    const lines = typeof p.numberOfLines === 'number' ? p.numberOfLines : 0;
    const clamp = lines === 1
      ? ';display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'
      : lines > 1
        ? `;display:-webkit-box;-webkit-line-clamp:${lines};-webkit-box-orient:vertical;overflow:hidden`
        : '';
    /**
     * ── AND HOW FAR IT IS ALLOWED TO GROW ──────────────────────────────────
     * `allowFontScaling` and `maxFontSizeMultiplier` are the only record of
     * whether a given Text answers the member's type-size setting, and the HTML
     * carried neither — so an audit that scaled the page had to scale
     * EVERYTHING, and reported a decorative stamp overflowing as though it were
     * a real fault. Emitted as a data attribute so a measurement at
     * accessibility sizes can apply each element's own cap.
     *
     * Absent `allowFontScaling` means RN scales it: the default is true.
     */
    const cap = p.allowFontScaling === false
      ? 1
      : (typeof p.maxFontSizeMultiplier === 'number' ? p.maxFontSizeMultiplier : 0);
    /**
     * And whether it SHRINKS rather than overflows.
     *
     * `adjustsFontSizeToFit` has no CSS equivalent, so a measurement of this
     * HTML sees a label escaping its column where the real app quietly reduces
     * it. Emitting the floor lets an audit model the shrink and report only the
     * case where even the floor is not enough — which is the case that matters.
     */
    const fit = p.adjustsFontSizeToFit === true
      ? (typeof p.minimumFontScale === 'number' ? p.minimumFontScale : 0.5)
      : 0;
    const capAttr = ` data-scale-cap="${cap}"${fit ? ` data-fit-min="${fit}"` : ''}`;
    // The harness holds every text to its parent's width (RN measures text
    // against the space it is given) — but a Text with its OWN width keeps it,
    // as it does in Yoga: the ticket's rotated ADMIT ONE is 96pt inside a 42pt
    // stub, and capped it read as 36pt cut when it fits with 18 to spare.
    const ownWidth = st.width !== undefined && st.width !== null && st.width !== 'auto' ? ';max-width:none' : '';
    return `<span${capAttr}${a11yAttr(p)}${rnAttr(rn)} style="${css(st, true)}${clamp}${ownWidth}">${(n.children || []).map((c) => toHtml(c, opts, inSvg)).join('')}</span>`;
  }
  if (t === 'ActivityIndicator') return '<div class="spinner"></div>';

  /**
   * ── A FIELD SHOWS WHAT IS IN IT, OR WHAT IT ASKS FOR ──────────────────────
   * A TextInput has no children — its text lives in `value` / `placeholder` —
   * so every field in every render was an empty box, and no placeholder in
   * the app had ever been measured for fit or colour ("Search salons…" drew
   * as a blank black slot). It is drawn now with the same text-size cap a Text
   * carries: one line vertically centred (a long placeholder ends in "…", as
   * iOS draws it); a multiline field wraps; a secret field shows its dots.
   */
  if (t === 'TextInput') {
    const raw = typeof p.value === 'string' && p.value ? p.value
      : typeof p.defaultValue === 'string' && p.defaultValue ? p.defaultValue : '';
    const isPlaceholder = !raw && typeof p.placeholder === 'string';
    const shown: string = raw ? (p.secureTextEntry ? '•'.repeat(raw.length) : raw) : isPlaceholder ? String(p.placeholder) : '';
    const cap = p.allowFontScaling === false ? 1 : (typeof p.maxFontSizeMultiplier === 'number' ? p.maxFontSizeMultiplier : 0);
    const colour = isPlaceholder && typeof p.placeholderTextColor === 'string' ? `color:${p.placeholderTextColor};` : '';
    // A multiline field breaks a word wider than itself mid-letter, as the phone
    // does — and wraps its spaces too: `pre-wrap` lets a space at a line's end
    // hang past the box, which the audit then measured as overflow.
    const layout = p.multiline === true
      ? 'display:block;white-space:break-spaces;overflow-wrap:anywhere'
      : 'display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:auto;margin-bottom:auto';
    const text = shown ? `<span data-scale-cap="${cap}" style="${colour}${layout}">${esc(shown)}</span>` : '';
    return `<div${rnAttr(rn)} style="${css(st, false)}">${text}</div>`;
  }

  const kids = (n.children || []).map((c) => toHtml(c, opts, inSvg)).join('');

  /**
   * ── A SCROLL VIEW IS NOT A TALL DIV ──────────────────────────────────────
   * Rendered as a plain div, the page unrolls to its full height and anything
   * docked to the bottom of the screen docks to the bottom of THREE THOUSAND
   * pixels instead — which is how a bar that is present in the markup can be
   * impossible to find. Tagging it lets the frame give the page a real 844pt
   * viewport with the content scrolling inside it, as the device does.
   * Horizontal rails are tagged apart: they must not claim the vertical space.
   */
  if (t === 'RCTScrollView') {
    const cls = p.horizontal ? 'hscroll' : 'vscroll';
    /**
     * ── AND IT GROWS, AS REACT NATIVE'S DOES ────────────────────────────────
     * ScrollView puts its own style under the screen's: `baseVertical` /
     * `baseHorizontal` — flexGrow 1, flexShrink 1, and a ROW when horizontal.
     * Jest's host element carries only the screen's style, so a rail drawn from
     * it neither filled its slot nor laid out as a row, and the Lobby's cards
     * came out 3pt shorter than the phone draws them (mockups/tools/
     * yoga-parity.cjs found it). An explicit grow or shrink wins over `flex`, in
     * Yoga and — written after the shorthand — in the browser alike.
     */
    const base = (s: Record<string, unknown>): Record<string, unknown> => ({
      ...s,
      flexDirection: s.flexDirection ?? (p.horizontal ? 'row' : 'column'),
      flexGrow: s.flexGrow ?? 1,
      flexShrink: s.flexShrink ?? 1,
    });
    const sv = base(st);
    /**
     * ── AND ITS CONTENT HAS A STYLE OF ITS OWN ─────────────────────────────
     * `contentContainerStyle` is where a screen reserves the room under a
     * docked bar. It arrives as a prop on the scroll view, not on any child, so
     * dropping it drew every such page with its last lines trapped under the
     * bar — a fault the device does not have. It wraps the content, as RN does.
     */
    /**
     * ── AND A HORIZONTAL ONE LAYS ITS CONTENT IN A ROW ──────────────────────
     * React Native gives a horizontal scroll view's content container
     * `flexDirection: 'row'` (ScrollView's `contentContainerHorizontal`), sized
     * to its content, under whatever `contentContainerStyle` says. Without it
     * every rail drawn straight from a ScrollView was drawn as a COLUMN — the
     * writing room's six tools each 358pt wide, stacked — and a measurement of
     * the rail measured something the phone never draws.
     */
    const ccs = p.contentContainerStyle ? flat(p.contentContainerStyle) : null;
    const box = { ...(p.horizontal ? { flexDirection: 'row' } : {}), ...(ccs ?? {}) };
    const inner = Object.keys(box).length ? css(box, false) + (p.horizontal ? ';width:max-content' : '') : '';
    // Jest's ScrollView renders `<RCTScrollView>{refreshControl}<View>{children}</View>`:
    // that bare View IS the content container, so it takes the container's
    // style — wrapped again, the children would sit in a column inside the row.
    const raw = n.children || [];
    const last = raw[raw.length - 1] as { type?: string; props?: { style?: unknown }; children?: unknown[] } | undefined;
    // What sits in the content container sits inside ITS border, not the scroll view's.
    const within = { ...opts, within: frameOf(box) };
    if (inner && last && typeof last === 'object' && last.type === 'View' && !last.props?.style) {
      const before = raw.slice(0, -1).map((c) => toHtml(c, opts, inSvg)).join('');
      const content = (last.children || []).map((c) => toHtml(c, within, inSvg)).join('');
      return `<div class="${cls}"${rnAttr(base(rn))} style="${css(sv, false)}">${before}<div${rnAttr(box)} style="${inner}">${content}</div></div>`;
    }
    const wrapped = inner ? (n.children || []).map((c) => toHtml(c, within, inSvg)).join('') : kids;
    return `<div class="${cls}"${rnAttr(base(rn))} style="${css(sv, false)}">${inner ? `<div${rnAttr(box)} style="${inner}">${wrapped}</div>` : kids}</div>`;
  }

  // A testID travels through as a hook, so the frame can address one element
  // (the docked bar) without guessing at its inline style.
  const tid = typeof p.testID === 'string' ? ` data-t="${esc(p.testID)}"` : '';
  return `<div${tid}${pressAttr(p)}${a11yAttr(p)}${rnAttr(rn)} style="${css(st, false)}">${kids}</div>`;
}

/**
 * A control, marked with the area it answers touches in: its box grown by its
 * `hitSlop`, as the host view receives it (PressableScale has already filled
 * the sides a partial slop left out). mockups/tools/layout.cjs measures these
 * against each other — two areas that overlap hand the overlap to the LATER
 * control, on both platforms.
 */
function pressAttr(p: Record<string, unknown>): string {
  const presses = ['onClick', 'onPress', 'onResponderRelease'].some((k) => typeof p[k] === 'function');
  if (!presses || p.disabled === true || p.accessibilityState && (p.accessibilityState as { disabled?: boolean }).disabled) return '';
  const s = p.hitSlop;
  const side = (k: string) => (typeof s === 'number' ? s : s && typeof s === 'object' ? Number((s as Record<string, number>)[k] ?? 0) : 0);
  return ` data-press="${[side('top'), side('right'), side('bottom'), side('left')].join(',')}"`;
}

/**
 * What a screen reader is told about an element: its label, and whether it
 * and everything inside it are hidden from it. A control with no label of its
 * own is named, on iOS, from the labels and words inside it — so labels are
 * carried on every element, not only on controls, and the audit reads them.
 */
function a11yAttr(p: Record<string, unknown>): string {
  const label = typeof p.accessibilityLabel === 'string' ? ` aria-label="${esc(p.accessibilityLabel)}"` : '';
  const hidden = p.accessibilityElementsHidden === true || p.importantForAccessibility === 'no-hide-descendants' ? ' aria-hidden="true"' : '';
  // An accessible element is ONE stop for a screen reader: what is inside it is
  // read as part of it, not reached separately.
  const whole = p.accessible === true ? ' data-accessible' : '';
  return label + hidden + whole;
}

/**
 * The React Native style itself, carried on the element when MOCKUPS_YOGA=1 —
 * so mockups/tools/yoga-parity.cjs can lay the same tree out with Yoga, the
 * phone's own engine, and report every box the browser placed differently.
 * Off by default: an ordinary render carries only CSS.
 */
function rnAttr(st: Record<string, unknown>): string {
  return process.env.MOCKUPS_YOGA === '1' ? ` data-rn="${esc(JSON.stringify(st))}"` : '';
}
