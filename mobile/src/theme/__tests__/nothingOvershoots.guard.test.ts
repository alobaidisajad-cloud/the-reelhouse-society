/**
 * The house's law of motion (src/theme/motion.ts), held across the whole app:
 * NOTHING OVERSHOOTS. No spring, no bounce, no elastic or back easing, no
 * decay, no Bounce preset: every movement arrives and stops.
 *
 * It was held for the Dispatch alone (motionLaws.test.tsx), and meanwhile the
 * app's press, its tab bar, its top bar and six sheets all sprang.
 */
import * as path from 'path';
import { readCode, stripComments } from '@/test-utils/readCode';
import { files as universe } from '@/test-utils/universe';

const ROOT = path.join(__dirname, '..', '..', '..');
const OVERSHOOT = /\bwithSpring\b|\.springify\(|\bwithDecay\b|Easing\.(bounce|elastic|back)\b|Animated\.spring\b|\bBounce(In|Out)\w*\b/;

describe('nothing in the app overshoots', () => {
  // The generated icon list names lucide's icons, not motion.
  const files = universe('appCode').filter((f) => !/[\\/]generated[\\/]/.test(f));

  it('reads the whole app', () => {
    expect(files.length).toBeGreaterThan(300);
  });

  it('springs nowhere, bounces nowhere', () => {
    // Comments out, so a file may explain the law without breaking it.
    const offenders = files
      .filter((f) => OVERSHOOT.test(readCode(f)))
      .map((f) => path.relative(ROOT, f).split(path.sep).join('/'));
    expect(offenders).toEqual([]);
  });

  it('the detector says no to each way of overshooting, and nothing to the house curve', () => {
    for (const bad of [
      'scale.value = withSpring(1)', 'SlideInDown.springify()', 'withDecay({ velocity: 1 })',
      'Easing.bounce', 'Easing.elastic(1)', 'Easing.back(2)', 'Animated.spring(v, {})', 'entering={BounceInDown}',
    ]) expect(OVERSHOOT.test(stripComments(bad))).toBe(true);
    expect(OVERSHOOT.test(stripComments('withTiming(1, { duration: MS.quick, easing: arrive() })'))).toBe(false);
    expect(OVERSHOOT.test(stripComments('// withSpring is not used here'))).toBe(false);
  });
});
