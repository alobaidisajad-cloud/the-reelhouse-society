/**
 * aTextGlowHasRoom.guard.test.ts — a wide glow on a word is never cut by the
 * word's own box.
 *
 * A text shadow is drawn by the Text view itself, and each phone cuts that
 * drawing at a box, read from React Native's own source:
 *
 *   iOS: RCTParagraphComponentView draws the text in `drawRect:` of a view the
 *   size of its bounds, so all that falls outside the BORDER box is lost, on
 *   all four sides. Padding is inside the bounds: padding is room.
 *
 *   Android: ReactTextView's onDraw calls TextView's, which clips to the view's
 *   full height (the bottom padding only while its text fills the height React
 *   Native measured for it) but, across, to the box INSIDE its padding. Padding
 *   is room above and below; across, only the space between the glyphs and
 *   that inner box is, which no style can promise. That side is ANDROID_ACROSS
 *   below, held true by reading the source it rests on.
 *
 * A glow past the cut ends in a straight line: the title wears its rectangle.
 * So every Text style with `textShadowRadius` of 12 or more carries padding of
 * at least the radius (less or more by its offset) on each side it needs, and a
 * negative margin of the same, so its layout stays where it was. A radius that
 * is not a number is read with its largest value from DYNAMIC, or it is padded
 * by the same expression.
 *
 * The em box stands for the glyphs: a lineHeight's leading is not counted as
 * room, because a display face's ascent fills most of it.
 */
import { readFileSync, readdirSync } from 'fs';
import { join, relative, sep } from 'path';
import ts from 'typescript';
import { readCode, MOBILE } from '@/test-utils/readCode';
import { effects } from '@/src/theme/theme';

const WIDE = 12;

/** Radii that are not a number: the file, the expression, its largest value, and why. */
const DYNAMIC: { file: string; expr: string; max: number; why: string }[] = [
  {
    file: 'app/(modals)/login.tsx',
    expr: 'interpolate(titleGlow.value, [0, 1], [4, 10])',
    max: 10,
    why: 'the title breathes from 4 to 10',
  },
  {
    file: 'src/components/Preloader.tsx',
    expr: 'd.shadowRadius',
    max: 35,
    why: 'each countdown digit has its own radius, 20, 28 or 35, and is padded by the same',
  },
];

type Side = 'top' | 'bottom' | 'left' | 'right';
const SIDES: Side[] = ['top', 'bottom', 'left', 'right'];
/** Each side's padding keys, the most particular first, as React Native reads them. */
const PADDING: Record<Side, string[]> = {
  top: ['paddingTop', 'paddingVertical', 'padding'],
  bottom: ['paddingBottom', 'paddingVertical', 'padding'],
  left: ['paddingLeft', 'paddingStart', 'paddingHorizontal', 'padding'],
  right: ['paddingRight', 'paddingEnd', 'paddingHorizontal', 'padding'],
};

interface Glow {
  where: string;
  /** The radius, or its largest value. */
  r: number;
  /** The radius as written, when it is not a number. */
  expr?: string;
  offset: { width: number; height: number };
  /** Each side's padding: a number, the radius's own expression, or unreadable. */
  room: Record<Side, number | string>;
}

const num = (e: ts.Expression): number | undefined => {
  if (ts.isNumericLiteral(e)) return Number(e.text);
  if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(e.operand)) {
    return -Number(e.operand.text);
  }
  return undefined;
};
const keyOf = (p: ts.ObjectLiteralElementLike) =>
  (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : undefined);

/** Every style object in a source that sets `textShadowRadius`, read as a Glow. */
function glowsIn(text: string, file: string): Glow[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: Glow[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const props = new Map<string, ts.Expression>();
      for (const p of node.properties) { const k = keyOf(p); if (k && ts.isPropertyAssignment(p)) props.set(k, p.initializer); }
      const radius = props.get('textShadowRadius');
      if (radius) {
        const owner = ts.isPropertyAssignment(node.parent) ? keyOf(node.parent) : undefined;
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        const r = num(radius);
        const expr = r === undefined ? radius.getText(sf) : undefined;
        out.push({
          where: `${file} · ${owner ?? `style at line ${line}`}`,
          r: r ?? (DYNAMIC.find((d) => d.file === file && d.expr === expr)?.max ?? NaN),
          expr,
          offset: offsetOf(node, props.get('textShadowOffset'), sf),
          room: Object.fromEntries(SIDES.map((side) => {
            const k = PADDING[side].find((key) => props.has(key));
            if (!k) return [side, 0];
            const v = props.get(k)!;
            return [side, num(v) ?? v.getText(sf)];
          })) as Record<Side, number | string>,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** The offset written in the style, or the one a spread effect brings, or none. */
function offsetOf(node: ts.ObjectLiteralExpression, written: ts.Expression | undefined, sf: ts.SourceFile) {
  const read = (e: ts.Expression) => {
    const o = { width: 0, height: 0 };
    if (!ts.isObjectLiteralExpression(e)) throw new Error(`unreadable textShadowOffset: ${e.getText(sf)}`);
    for (const p of e.properties) {
      const k = keyOf(p);
      if ((k === 'width' || k === 'height') && ts.isPropertyAssignment(p)) {
        const v = num(p.initializer);
        if (v === undefined) throw new Error(`unreadable textShadowOffset: ${e.getText(sf)}`);
        o[k] = v;
      }
    }
    return o;
  };
  if (written) return read(written);
  for (const p of node.properties) {
    if (ts.isSpreadAssignment(p) && /^effects\.\w+$/.test(p.expression.getText(sf))) {
      const effect = effects[p.expression.getText(sf).slice('effects.'.length) as keyof typeof effects] as { textShadowOffset?: { width: number; height: number } };
      if (effect?.textShadowOffset) return { ...effect.textShadowOffset };
    }
  }
  return { width: 0, height: 0 };
}

/** What each side needs: the radius, less the offset on the side it moves away from. */
const needOf = (g: Glow): Record<Side, number> => ({
  top: g.r - g.offset.height, bottom: g.r + g.offset.height,
  left: g.r - g.offset.width, right: g.r + g.offset.width,
});

/** The sides a phone cuts that have less room than the glow needs. */
function cutSides(g: Glow, os: 'ios' | 'android'): Side[] {
  const need = needOf(g);
  const sides: Side[] = os === 'ios' ? SIDES : ['top', 'bottom'];
  return sides.filter((side) => {
    const room = g.room[side];
    if (typeof room === 'string') return !(g.expr && room === g.expr && g.offset.width === 0 && g.offset.height === 0);
    return room < need[side];
  });
}

/** Text glows whose box gives no room, each with why it is kept. */
const KEPT: Record<string, string> = {};

// Why Android's left and right are not checked; its last test holds it true.
const ANDROID_ACROSS = 'TextView cuts a span shadow at its content edge; padding cannot widen that';

const files: string[] = [];
const walk = (dir: string) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!['node_modules', '__tests__'].includes(e.name)) walk(p); } else if (/\.tsx?$/.test(e.name) && !/\.d\.ts$/.test(e.name)) files.push(p);
  }
};
walk(join(MOBILE, 'app'));
walk(join(MOBILE, 'src'));
const rel = (p: string) => relative(MOBILE, p).split(sep).join('/');
const glows = files.flatMap((f) => glowsIn(readCode(f), rel(f)));
const wide = glows.filter((g) => !(g.r < WIDE));

it('reads every text glow in the app (a scan that finds none proves nothing)', () => {
  expect(glows.length).toBeGreaterThan(20);
  expect(wide.length).toBeGreaterThanOrEqual(14);
});

it('knows the largest value of every radius that is not a number', () => {
  const unknown = glows.filter((g) => Number.isNaN(g.r)).map((g) => `${g.where}: ${g.expr}`);
  expect(unknown).toEqual([]);
  for (const d of DYNAMIC) expect(glows.some((g) => g.where.startsWith(`${d.file} ·`) && g.expr === d.expr)).toBe(true);
});

it('gives every wide glow room inside its box, on every side a phone cuts', () => {
  const cut = wide
    .filter((g) => !(g.where in KEPT))
    .flatMap((g) => (['ios', 'android'] as const).flatMap((os) => {
      const sides = cutSides(g, os);
      return sides.length ? [`${os} ${g.where} (radius ${g.r}): ${sides.join(', ')}`] : [];
    }));
  expect(cut).toEqual([]);
  expect(Object.keys(KEPT).filter((k) => !wide.some((g) => g.where === k))).toEqual([]);
});

it('can fail: a planted title glow with no room is cut, and one padded by its radius is not', () => {
  const [bare] = glowsIn('const s = { title: { fontSize: 30, textShadowRadius: 20 } };', 'planted.ts');
  expect(cutSides(bare, 'ios')).toEqual(['top', 'bottom', 'left', 'right']);
  expect(cutSides(bare, 'android')).toEqual(['top', 'bottom']);
  const [low] = glowsIn('const s = { t: { textShadowRadius: 14, textShadowOffset: { width: 0, height: 2 }, padding: 14, margin: -14 } };', 'planted.ts');
  expect(cutSides(low, 'ios')).toEqual(['bottom']);
  const [padded] = glowsIn('const s = { t: { textShadowRadius: 20, padding: 20, margin: -20 } };', 'planted.ts');
  expect(cutSides(padded, 'ios')).toEqual([]);
  const [spread] = glowsIn('const s = { t: { ...effects.textShadowDeep, textShadowRadius: 12, padding: 12 } };', 'planted.ts');
  expect(spread.offset).toEqual(effects.textShadowDeep.textShadowOffset);
  expect(cutSides(spread, 'ios')).toEqual(['bottom']);
});

it('rests Android’s rule on the source it reads: text is drawn through TextView', () => {
  expect(ANDROID_ACROSS.length).toBeGreaterThan(0);
  const RN = join(MOBILE, 'node_modules', 'react-native', 'ReactAndroid', 'src', 'main', 'java', 'com', 'facebook', 'react');
  const view = readFileSync(join(RN, 'views', 'text', 'ReactTextView.java'), 'utf8');
  expect(view).toMatch(/class ReactTextView extends AppCompatTextView/);
  expect(view).toMatch(/protected void onDraw\(Canvas canvas\)[\s\S]*?super\.onDraw\(canvas\)/);
  const flags = readFileSync(join(RN, 'internal', 'featureflags', 'ReactNativeFeatureFlagsDefaults.kt'), 'utf8');
  expect(flags).toMatch(/override fun enablePreparedTextLayout\(\): Boolean = false/);
});
