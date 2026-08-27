import { StyleSheet as RNStyleSheet } from 'react-native';
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
  'gap', 'rowGap', 'columnGap',
]);
const DIRECT = new Set([
  'color', 'backgroundColor', 'opacity', 'borderColor', 'borderTopColor',
  'borderBottomColor', 'borderLeftColor', 'borderRightColor', 'textAlign',
  'fontWeight', 'fontStyle', 'position', 'zIndex', 'overflow', 'flex',
  'flexDirection', 'alignItems', 'justifyContent', 'flexWrap', 'alignSelf',
  'textTransform', 'flexGrow', 'flexShrink', 'aspectRatio', 'writingDirection',
  'borderStyle',
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
    out.push('display:flex', `flex-direction:${(st.flexDirection as string) || 'column'}`);
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
  const ts = st.textShadowColor as string | undefined;
  if (ts) {
    const o = st.textShadowOffset as { width: number; height: number } | undefined;
    out.push(`text-shadow:${o?.width ?? 0}px ${o?.height ?? 0}px ${(st.textShadowRadius as number) ?? 0}px ${ts}`);
  }

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
     * RN's rules in full: positive n → grow n, shrink 1, basis 0%;
     * 0 → grow 0, shrink 0, basis auto; negative → grow 0, shrink 1, basis auto.
     */
    if (k === 'flex' && typeof v === 'number') {
      if (v > 0) out.push(`flex:${v} 1 0%`, 'min-width:0', 'min-height:0');
      else if (v === 0) out.push('flex:0 0 auto');
      else out.push('flex:0 1 auto');
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
    if (PX.has(k)) { out.push(`${kebab(k)}:${typeof v === 'number' ? v + 'px' : v}`); continue; }
    if (DIRECT.has(k)) { out.push(`${kebab(k)}:${v}`); continue; }
  }
  return out.join(';');
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

  const fill = decodeColour(p.fill);
  const stroke = decodeColour(p.stroke);
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

// ── the walk ────────────────────────────────────────────────────────────────
export interface RenderOpts {
  /** poster_path -> data URI. */
  posters?: Record<string, { title: string; data: string }>;
  /** file name -> data URI, for the app's own bundled images. */
  local?: Record<string, string>;
}

interface N { type?: string; props?: Record<string, unknown>; children?: unknown[] }

export function toHtml(node: unknown, opts: RenderOpts = {}, inSvg = false): string {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string') return esc(node);
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map((c) => toHtml(c, opts, inSvg)).join('');

  const n = node as N;
  const t = String(n.type || '');
  const p = n.props || {};
  const st = flat(p.style);

  // ── SVG: the icons and the dial ──
  const tag = SVG_TAG[t];
  if (tag) {
    const kids = (n.children || []).map((c) => toHtml(c, opts, true)).join('');
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
      return `<svg ${attrs} style="${box}${style ? ';' + style : ''}">${kids}</svg>`;
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
    return `<div style="${style};background-image:linear-gradient(${dir},${stops.join(',')})">${kids}</div>`;
  }

  // ── artwork ──
  if (/^(Image|ExpoImage)$/i.test(t)) {
    const src = p.source as { uri?: string; testUri?: string } | undefined;
    const style = css(st, false);

    // A remote poster, matched on its TMDB path — or a video still, matched on
    // its YouTube key. `img.youtube.com/vi/KEY/hqdefault.jpg` carries no TMDB
    // path, so the first pass left every video thumbnail as an empty frame.
    const uri = String(src?.uri ?? '');
    const yt = /\/vi\/([\w-]+)\//.exec(uri);
    const m = yt || /\/w\d+(\/[^/?]+)$/.exec(uri) || /\/(\w+\.jpg)$/.exec(uri);
    const poster = m && opts.posters ? opts.posters[m[1]] || opts.posters['/' + m[1]] : undefined;
    if (poster) return `<img src="${poster.data}" alt="${esc(poster.title)}" style="${style};object-fit:cover" />`;

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
      // `resizeMode: contain` is how these are drawn; object-fit is the same idea.
      if (hit) return `<img src="${hit}" alt="" style="${style};object-fit:contain" />`;
    }

    return `<div class="poster" style="${style}"></div>`;
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
    return `<span style="${css(st, true)}${clamp}">${(n.children || []).map((c) => toHtml(c, opts, inSvg)).join('')}</span>`;
  }
  if (t === 'ActivityIndicator') return '<div class="spinner"></div>';

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
    return `<div class="${cls}" style="${css(st, false)}">${kids}</div>`;
  }

  // A testID travels through as a hook, so the frame can address one element
  // (the docked bar) without guessing at its inline style.
  const tid = typeof p.testID === 'string' ? ` data-t="${esc(p.testID)}"` : '';
  return `<div${tid} style="${css(st, false)}">${kids}</div>`;
}
