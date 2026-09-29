/**
 * The house's law of motion (src/theme/motion.ts), held across the whole app:
 * NOTHING OVERSHOOTS. No spring, no bounce, no elastic or back easing, no
 * decay, no Bounce preset: every movement arrives and stops.
 *
 * It was held for the Dispatch alone (motionLaws.test.tsx), and meanwhile the
 * app's press, its tab bar, its top bar and six sheets all sprang.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..', '..', '..');
const OVERSHOOT = /\bwithSpring\b|\.springify\(|\bwithDecay\b|Easing\.(bounce|elastic|back)\b|Animated\.spring\b|\bBounce(In|Out)\w*\b/;

/** Comments out, so a file may explain the law without breaking it. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

function sources(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '__tests__', 'generated'].includes(e.name) || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sources(p, out);
    else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
  }
  return out;
}

describe('nothing in the app overshoots', () => {
  const files = [...sources(path.join(ROOT, 'app')), ...sources(path.join(ROOT, 'src'))];

  it('reads the whole app', () => {
    expect(files.length).toBeGreaterThan(300);
  });

  it('springs nowhere, bounces nowhere', () => {
    const offenders = files
      .filter((f) => OVERSHOOT.test(code(fs.readFileSync(f, 'utf8'))))
      .map((f) => path.relative(ROOT, f).split(path.sep).join('/'));
    expect(offenders).toEqual([]);
  });

  it('the detector says no to each way of overshooting, and nothing to the house curve', () => {
    for (const bad of [
      'scale.value = withSpring(1)', 'SlideInDown.springify()', 'withDecay({ velocity: 1 })',
      'Easing.bounce', 'Easing.elastic(1)', 'Easing.back(2)', 'Animated.spring(v, {})', 'entering={BounceInDown}',
    ]) expect(OVERSHOOT.test(code(bad))).toBe(true);
    expect(OVERSHOOT.test(code('withTiming(1, { duration: MS.quick, easing: arrive() })'))).toBe(false);
    expect(OVERSHOOT.test(code('// withSpring is not used here'))).toBe(false);
  });
});
