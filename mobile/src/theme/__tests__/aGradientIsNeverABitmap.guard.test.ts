/**
 * aGradientIsNeverABitmap.guard.test.ts — a drawing that is only a gradient is
 * drawn as a native background, never as an SVG.
 *
 * react-native-svg paints every drawing into a bitmap the size of its view, on
 * the main thread (Android's SvgView keeps it as `mBitmap`). For a shape it
 * must; for a plain gradient over a box it is pure waste: the room's light and
 * the Lobby's vignette cost 20 MB that way (study run 37628665206), and every
 * screen held its own. React Native draws `experimental_backgroundImage`
 * gradients as shaders, storing nothing.
 *
 * So an <Svg> whose only drawing is boxes, ellipses or circles filled with a
 * gradient is refused, except where this file says why. And no gradient is
 * written `radial-gradient(circle <r> at …)`: React Native 0.81 swallows the
 * `at` after a single size and takes the position for the size.
 */
import { readdirSync, readFileSync } from 'fs';
import { join, relative, sep } from 'path';

const MOBILE = join(__dirname, '..', '..', '..');
const files: string[] = [];
const walk = (dir: string) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!['node_modules', '__tests__'].includes(e.name)) walk(p); } else if (/\.tsx?$/.test(e.name)) files.push(p);
  }
};
walk(join(MOBILE, 'app'));
walk(join(MOBILE, 'src'));
const rel = (p: string) => relative(MOBILE, p).split(sep).join('/');

/** Gradient-only drawings kept as SVGs: how many in each file, and why. */
const KEPT: Record<string, { count: number; why: string }> = {
  'src/components/Buster.tsx': {
    count: 2,
    why: 'his floor shadow, laid out with him through his picture’s viewBox and the size of his picture, not a ' +
      'screen; and an eye, 22 points, its glow drawn with the two brass points on it. A closed design.',
  },
  'src/components/profile/TasteDNAExportCanvas.tsx': {
    count: 1,
    why: 'mounted only while a member’s taste is exported, captured to an image, then unmounted',
  },
};

const GRADIENT_ONLY = new Set(['Defs', 'RadialGradient', 'LinearGradient', 'SvgRadialGradient', 'SvgLinearGradient', 'Stop', 'Rect', 'Ellipse', 'Circle']);

function gradientOnlySvgs(): Record<string, number> {
  const found: Record<string, number> = {};
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/<Svg\b[\s\S]*?<\/Svg>/g)) {
      const tags = new Set([...m[0].matchAll(/<([A-Z][A-Za-z.]*)/g)].map((t) => t[1]).filter((t) => t !== 'Svg'));
      const gradient = [...tags].some((t) => /Gradient$/.test(t));
      if (gradient && [...tags].every((t) => GRADIENT_ONLY.has(t))) found[rel(f)] = (found[rel(f)] ?? 0) + 1;
    }
  }
  return found;
}

it('reads the app (a scan that finds no SVGs proves nothing)', () => {
  const svgs = files.filter((f) => /<Svg\b/.test(readFileSync(f, 'utf8')));
  expect(svgs.length).toBeGreaterThan(10);
});

it('draws no gradient as an SVG bitmap, but where this file says why', () => {
  expect(gradientOnlySvgs()).toEqual(Object.fromEntries(Object.entries(KEPT).map(([k, v]) => [k, v.count])));
});

it('writes no radial gradient with a single size before its position', () => {
  const misread: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/radial-gradient\(\s*(?:(?:circle|ellipse)\s+)?([^\s,()]+)\s+at\b/g)) misread.push(`${rel(f)}: ${m[0]}`);
  }
  expect(misread).toEqual([]);
});
