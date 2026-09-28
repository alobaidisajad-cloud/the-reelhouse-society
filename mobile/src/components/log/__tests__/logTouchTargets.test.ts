/**
 * logTouchTargets.test.ts — the composer's controls clear the floor by their
 * own geometry.
 *
 * A halo is invisible to both platforms' accessibility layers: hitSlop lives
 * inside React Native's touch dispatch, iOS reports `accessibilityFrame` from
 * the view's frame, and RN installs no Android `TouchDelegate`. So the only
 * thing that answers "is this control big enough" is the control's own size —
 * and the floor is 48, Android's, the higher of the two.
 *
 * ── MEASURED, NOT READ ──────────────────────────────────────────────────────
 * This file used to read each control's height out of its stylesheet, and
 * enumerate every `<PressableScale` on the page by hand. Both are measured now,
 * on the drawn page, at every width and text size (the CI mockups job):
 *
 *   · every control on the composer is DRAWN by some state of zz-composer.gen
 *     — mockups/tools/drawn.cjs fails naming any that is not;
 *   · every drawn control's own box is at least 48 on both sides — the SMALL
 *     check in mockups/tools/layout.cjs, with the page's three exceptions
 *     argued in mockups/touch-small-exceptions.txt.
 *
 * Reading them had missed two: the drop-cap toggle, whose file shadows the
 * shared style with a 16pt one of its own (the test read the other), and the
 * calendar — never on the list at all — with 28pt month arrows.
 *
 * What is left is how the boxes are BUILT, asked of the style values.
 */
import { StyleSheet, type ViewStyle } from 'react-native';
import { st } from '@/src/components/log/LogModalStyles';

const FLOOR = 48;
const v = (x: object) => StyleSheet.flatten(x) as ViewStyle;

describe('the boxes are built to reach the floor without a halo', () => {
  it('the header did not grow to pay for CLOSE', () => {
    // Raising the button to 48 must not push the chrome down the page: the
    // button's own box supplies the air the padding used to. 8 + 48 + 8 is the
    // 64 this header always was, and the mark stays 24pt from the top.
    const header = v(st.header);
    expect((header.paddingTop as number) + (header.paddingBottom as number) + (v(st.closeBtn).minHeight as number)).toBeLessThanOrEqual(64);
  });

  it('the shared box clears the floor both ways, and never stretches the chip in it', () => {
    // A flex container defaults to align-items: stretch, which would have grown
    // the chip to 48 and undone the reason the box exists. And a chip is only
    // as wide as its label — a stack called "80s" would have been 32pt across.
    const hit = v(st.hit48);
    expect(hit.minHeight).toBeGreaterThanOrEqual(FLOOR);
    expect(hit.minWidth).toBeGreaterThanOrEqual(FLOOR);
    expect(hit.alignItems).toBe('flex-start');
  });

  it('an ornament is never narrower than the box around it', () => {
    // If the ornament inside the 48pt box is narrower, it sits left in a wider
    // target and leaves dead space after it — so a row of pills gets two
    // different gaps depending on each label's length. DVD and VHS are ~42pt.
    const box = v(st.hit48).minWidth as number;
    for (const ornament of [st.tag, st.listChip]) {
      expect(v(ornament).minWidth).toBeGreaterThanOrEqual(box);
    }
  });
});
