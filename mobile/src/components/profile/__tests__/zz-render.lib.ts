import { StyleSheet as RNStyleSheet } from 'react-native';
import { BLOOM, lightGeometry, type Room } from '@/src/theme/light';
/**
 * The React Native tree, converted to HTML that draws the same picture.
 *
 * Everything needed is in the rendered tree: react-native-svg renders host types
 * (`RNSVGSvgView`, `RNSVGPath`, …, not `Svg`), so every Lucide icon arrives with
 * its real path and the Projector's dial with its real dash arrays; inner colours
 * arrive as packed ARGB integers and are decoded, not dropped.
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

// The DIRECT keys whose CSS name is not their kebab-case (a browser drops an unknown one).
const CSS_NAME: Record<string, string> = { writingDirection: 'direction' };

/**
 * A style is an object, an array of them, or (older RN) a registered id; each
 * flattens to one object. The id case is defensive: this RN registers none.
 */
export const flat = (s: unknown): Record<string, unknown> => {
  if (!s) return {};
  if (Array.isArray(s)) return s.reduce<Record<string, unknown>>((a, x) => ({ ...a, ...flat(x) }), {});
  if (typeof s === 'number') return (RNStyleSheet.flatten(s) as unknown as Record<string, unknown>) ?? {};
  return s as Record<string, unknown>;
};

/**
 * RN's shorthands CSS lacks (`paddingHorizontal`, the commonest style key here),
 * expanded in RN's order of precedence: `padding` < `…Horizontal` < a side.
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
 * (not a whole number of points), with those widths (drawn as padding by `css`).
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

  // RN's defaults, first so the style's own win: relative, one stacking context each.
  out.push('position:relative', 'z-index:0');

  if (!isText) {
    // RN's shrink 0 (CSS's 1 crushes a scrolling page); not on text, which must ellipsise.
    out.push('flex-shrink:0');

    // A border: CSS draws none without a style, and a style alone draws `medium`
    //    on all four sides, so solid at width 0, and the real widths override.
    if (Object.keys(st).some((k) => /^border(Top|Right|Bottom|Left)?Width$/.test(k))) {
      out.push('border-style:solid', 'border-width:0');
    }
    // A border that is not whole points: a browser snaps borders to whole pixels
    //    (0.5 up, 1.5 down; yoga-parity measured the drift), so it is laid out as padding
    //    of its exact width and drawn as an inset shadow. Dashes keep a real border.
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
    // RN's alignContent is flex-start; CSS's `normal` stretches a wrapping box's lines.
    out.push('display:flex', `flex-direction:${(st.flexDirection as string) || 'column'}`, 'align-content:flex-start');
    // Its side margins, which the harness takes off the column's width when it
    // holds a box to that width (see RN_RULES in mockups/tools/harness.cjs).
    const mx = [st.marginLeft, st.marginRight].reduce<number>((a, m) => a + (typeof m === 'number' ? m : 0), 0);
    if (mx) out.push(`--mx:${mx}px`);
  }

  // The legacy shadow (the brass glow under a count, the altarpiece's lift).
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

  // Yoga gives no flex item an automatic minimum, and holds an aspect ratio against
  // its content; CSS's `min-*: auto` does neither. Before the style, so its own win.
  const shrinks = (typeof st.flexShrink === 'number' && st.flexShrink > 0)
    || (typeof st.flex === 'number' && st.flex !== 0);
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
    // RN's `flex` (Yoga resolveFlexGrow/Shrink): n>0 grow n shrink 0 basis 0; 0 is grow 0
    // shrink 0 basis auto (CSS's `flex: 0` collapses, and Lucide sets it on every icon);
    // n<0 shrink -n basis auto.
    if (k === 'flex' && typeof v === 'number') {
      if (v > 0) out.push(`flex:${v} 0 0%`);
      else if (v === 0) out.push('flex:0 0 auto');
      else out.push(`flex:0 ${-v} auto`);
      continue;
    }
    if (k.startsWith('shadow') || k.startsWith('textShadow') || k === 'elevation') continue;
    if (k === 'transform') {
      // The unit per function: one invalid (`scale(1px)`) discards the whole list.
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
 * A style key the converter drops is a drawing the phone makes and this does not,
 * so each is noted (to MOCKUPS_UNREAD=<file>, when set). DRAWN_ELSEWHERE: keys
 * read by other code here, or with no effect on a still picture.
 */
const DRAWN_ELSEWHERE = new Set([
  'boxShadow', 'experimental_backgroundImage', // above, in this function
  'tintColor', // an image's: drawn by the image branch in toHtml
  'includeFontPadding', // Android's extra line padding; every text here strips it
  'pointerEvents', 'cursor', 'userSelect', // touch only
  'textAlignVertical', // Android-only; no text here is taller than its lines
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
    // react-native-svg splits viewBox into minX/minY/vbWidth/vbHeight; without it, a
    // 16pt Lucide icon shows only the top-left 16 units of its 24-unit drawing.
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

  // react-native-svg folds a gradient's stops into its node: `name` is the id,
  // `gradient` is [offset, argb, …], units are 0/1. SVG 1.1 has no elliptical
  // radial, so rx ≠ ry is a circle of rx squashed about its centre (the same shape).
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
 * Where to tell the browser to put an absolute box so it lands where Yoga does
 * (both measured by yoga-parity.cjs):
 *   · insets move in by a thin border, which `css` draws as padding;
 *   · a percentage is of the parent's INNER size (Yoga's errata
 *     AbsolutePercentAgainstInnerSize, on in RN), so padding comes off its base.
 * (Yoga strictly takes the space the parent was offered; yoga-parity reports
 * the one case a browser cannot follow.)
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

  // A Modal is its own screen-sized root in a flex 1 container, white unless
  // transparent (RN's Modal). Jest draws it inline, so it is lifted out and drawn over all.
  if (t === 'Modal') {
    const fill = { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 };
    const container = { flex: 1, backgroundColor: p.transparent === true ? 'transparent' : (p.backdropColor ?? 'white') };
    const inner = (n.children || []).map((c) => toHtml(c, { ...opts, within: frameOf(container) }, inSvg)).join('');
    opts.layers!.push(`<div data-t="modal"${rnAttr(fill)} style="${css(fill, false)};z-index:1000">` +
      `<div${rnAttr(container)} style="${css(container, false)}">${inner}</div></div>`);
    return '';
  }
  // A capture run's SrcMark (jest.setup.ts) is not a box: its source line goes onto its child.
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
      // As a flex item an svg's attribute size collapses on the main axis (a 16pt icon
      // measured 16x0), so the box is restated in CSS.
      const box = [
        typeof p.width === 'number' ? `width:${p.width}px` : '',
        typeof p.height === 'number' ? `height:${p.height}px` : '',
        'flex:none',
      ].filter(Boolean).join(';');
      return `<svg ${attrs}${rnAttr(rn)} style="${box}${style ? ';' + style : ''}">${kids}</svg>`;
    }
    return `<${tag}${attrs ? ' ' + attrs : ''}>${kids}</${tag}>`;
  }

  // expo-linear-gradient's host (colours as packed ints, `locations` 0..1).
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
    // The phone's real ramp rides along for the contrast check: the CSS angle drops the
    // start/end offsets and interpolates in pixels, not the box's unit space.
    const grad = encodeURIComponent(JSON.stringify({
      s: s0 ?? { x: 0.5, y: 0 }, e: e0 ?? { x: 0.5, y: 1 },
      c: cols.map((c) => decodeColour(c) ?? 'transparent'),
      l: cols.map((_, i) => (typeof locs[i] === 'number' ? locs[i] : cols.length > 1 ? i / (cols.length - 1) : 0)),
    }));
    return `<div data-grad="${grad}"${rnAttr(rn)} style="${style};background-image:linear-gradient(${dir},${stops.join(',')})">${kids}</div>`;
  }

  // The bloom is Skia, which does not run here: drawn from the same `BLOOM` numbers.
  if (p.testID === 'room-bloom') {
    return bloomHtml(String(p.nativeID ?? ''), css(st, false), opts);
  }
  // A veil's light, Skia too: drawn at rest from the component's own `lightGeometry`,
  // masked by the veil's stops, ending at the hem.
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
    // An <img> pinned to four edges keeps its intrinsic size (a replaced element), so
    // an absolute fill restates the box.
    const fills = rn.position === 'absolute' &&
      [rn.top, rn.left, rn.right, rn.bottom].every((v) => v === 0);
    // Inside a thin border, "the whole box" is the box less that border.
    const less = (a?: number, b?: number) => ((a ?? 0) + (b ?? 0) ? ` - ${(a ?? 0) + (b ?? 0)}px` : '');
    const style = css(st, false) + (fills
      ? `;width:calc(100%${less(around.Left, around.Right)});height:calc(100%${less(around.Top, around.Bottom)})`
      : '');

    // A remote poster by its TMDB path, or a video still by its YouTube key (/vi/KEY/).
    const uri = String(src?.uri ?? '');
    const yt = /\/vi\/([\w-]+)\//.exec(uri);
    const m = yt || /\/w\d+(\/[^/?]+)$/.exec(uri) || /\/(\w+\.jpg)$/.exec(uri);
    const poster = m && opts.posters ? opts.posters[m[1]] || opts.posters['/' + m[1]] : undefined;

    // The image's own fit, where it names one (expo-image's `contentFit`, or
    // Image's `resizeMode` as a prop or in its style) — else the default below.
    const FIT: Record<string, string> = { cover: 'cover', contain: 'contain', fill: 'fill', stretch: 'fill', none: 'none', center: 'none', repeat: 'none', 'scale-down': 'scale-down' };
    const named = FIT[String(p.contentFit ?? p.resizeMode ?? rn.resizeMode ?? '')];
    // `tintColor` paints every opaque pixel one colour: drawn as a coloured box the image masks.
    const tint = (rn.tintColor ?? p.tintColor) as string | undefined;
    const draw = (data: string, alt: string, fit: string) => {
      if (!tint) return `<img src="${data}" alt="${esc(alt)}"${a11yAttr(p)}${rnAttr(rn)} style="${style};object-fit:${fit}" />`;
      const size = fit === 'fill' ? '100% 100%' : fit === 'none' ? 'auto' : fit === 'scale-down' ? 'contain' : fit;
      const mask = `url(${data}) center/${size} no-repeat`;
      return `<div${a11yAttr(p)}${rnAttr(rn)} style="${style};background-color:${tint};-webkit-mask:${mask};mask:${mask}"></div>`;
    };
    if (poster) return draw(poster.data, poster.title, named ?? 'cover');

    // A bundled asset (`require('…/rating-full.png')`) arrives as `source.testUri`.
    const local = String(src?.testUri ?? '');
    if (local && opts.local) {
      const name = local.split('/').pop() || '';
      const hit = opts.local[name];
      // `resizeMode: contain` is how these are drawn, unless the image says otherwise.
      if (hit) return draw(hit, '', named ?? 'contain');
    }

    return `<div class="poster"${a11yAttr(p)}${rnAttr(rn)} style="${style}"></div>`;
  }

  // numberOfLines, as RN does it: one line ellipsises, more clamp. Ignored, the
  // picture shows overflow the phone clips.
  if (t === 'Text') {
    const lines = typeof p.numberOfLines === 'number' ? p.numberOfLines : 0;
    const clamp = lines === 1
      ? ';display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'
      : lines > 1
        ? `;display:-webkit-box;-webkit-line-clamp:${lines};-webkit-box-orient:vertical;overflow:hidden`
        : '';
    // Each Text's own growth cap (1 = frozen, 0 = none; RN scales by default), for
    // measuring at accessibility sizes.
    const cap = p.allowFontScaling === false
      ? 1
      : (typeof p.maxFontSizeMultiplier === 'number' ? p.maxFontSizeMultiplier : 0);
    // And its shrink floor, as CSS has no adjustsFontSizeToFit: the audit models it.
    const fit = p.adjustsFontSizeToFit === true
      ? (typeof p.minimumFontScale === 'number' ? p.minimumFontScale : 0.5)
      : 0;
    // With its base size, so the audit can hold it to the type floor at whatever
    // size it measures (the app's Text sets the floor at the size the phone draws).
    const fitBase = fit && typeof st.fontSize === 'number' ? ` data-fit-base="${st.fontSize}"` : '';
    const capAttr = ` data-scale-cap="${cap}"${fit ? ` data-fit-min="${fit}"${fitBase}` : ''}`;
    // The harness holds text to its parent's width, but a Text with its OWN width keeps
    // it, as in Yoga (the ticket's rotated ADMIT ONE is 96pt in a 42pt stub).
    const ownWidth = st.width !== undefined && st.width !== null && st.width !== 'auto' ? ';max-width:none' : '';
    return `<span${capAttr}${a11yAttr(p)}${rnAttr(rn)} style="${css(st, true)}${clamp}${ownWidth}">${(n.children || []).map((c) => toHtml(c, opts, inSvg)).join('')}</span>`;
  }
  if (t === 'ActivityIndicator') return '<div class="spinner"></div>';

  // A field's text is its value or placeholder (it has no children), with a Text's cap:
  // one line centred and ellipsised as iOS draws it, multiline wraps, secrets are dots.
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

  // A scroll view is tagged, so the frame gives it a real viewport (a docked bar then
  // docks to the screen, not the page's foot); horizontal rails are tagged apart.
  if (t === 'RCTScrollView') {
    const cls = p.horizontal ? 'hscroll' : 'vscroll';
    // RN's own base style under the screen's (baseVertical/Horizontal): grow 1,
    // shrink 1, a row when horizontal. Jest's host carries only the screen's.
    const base = (s: Record<string, unknown>): Record<string, unknown> => ({
      ...s,
      flexDirection: s.flexDirection ?? (p.horizontal ? 'row' : 'column'),
      flexGrow: s.flexGrow ?? 1,
      flexShrink: s.flexShrink ?? 1,
    });
    const sv = base(st);
    // The content container: `contentContainerStyle` (where a page reserves room under
    // a docked bar) over RN's row for a horizontal one (contentContainerHorizontal).
    const ccs = p.contentContainerStyle ? flat(p.contentContainerStyle) : null;
    const box = { ...(p.horizontal ? { flexDirection: 'row' } : {}), ...(ccs ?? {}) };
    const inner = Object.keys(box).length ? css(box, false) + (p.horizontal ? ';width:max-content' : '') : '';
    // Jest's ScrollView ends in a bare View that IS the content container, so it takes
    // the container's style (wrapped again, the children would stack inside the row).
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
 * A control's touch area: its box grown by the host's `hitSlop`. layout.cjs
 * measures these against each other (an overlap goes to the LATER control).
 */
function pressAttr(p: Record<string, unknown>): string {
  const presses = ['onClick', 'onPress', 'onResponderRelease'].some((k) => typeof p[k] === 'function');
  if (!presses || p.disabled === true || p.accessibilityState && (p.accessibilityState as { disabled?: boolean }).disabled) return '';
  const s = p.hitSlop;
  const side = (k: string) => (typeof s === 'number' ? s : s && typeof s === 'object' ? Number((s as Record<string, number>)[k] ?? 0) : 0);
  return ` data-press="${[side('top'), side('right'), side('bottom'), side('left')].join(',')}"`;
}

/**
 * What a screen reader is told: a label (on every element, as iOS names an
 * unlabelled control from inside it), hidden, or read as one stop.
 */
function a11yAttr(p: Record<string, unknown>): string {
  const label = typeof p.accessibilityLabel === 'string' ? ` aria-label="${esc(p.accessibilityLabel)}"` : '';
  const hidden = p.accessibilityElementsHidden === true || p.importantForAccessibility === 'no-hide-descendants' ? ' aria-hidden="true"' : '';
  // An accessible element is ONE stop for a screen reader: what is inside it is
  // read as part of it, not reached separately.
  const whole = p.accessible === true ? ' data-accessible' : '';
  return label + hidden + whole;
}

/** The RN style, carried when MOCKUPS_YOGA=1 so yoga-parity.cjs can lay it out with Yoga. */
function rnAttr(st: Record<string, unknown>): string {
  return process.env.MOCKUPS_YOGA === '1' ? ` data-rn="${esc(JSON.stringify(st))}"` : '';
}
