/**
 * PressableScale — the DEFAULT touch target.
 *
 * Why this exists: an audit finding claimed two buttons "have no hitSlop, so
 * they are under the 44pt minimum" and a fix added explicit values. The second
 * half was wrong — PressableScale normalizes an absent hitSlop to 15pt on every
 * side, so the "fix" made those buttons SMALLER.
 *
 * The rule this pins: on a PressableScale, no hitSlop prop does NOT mean no
 * slop. Never add hitSlop to "reach the minimum" without subtracting the 15
 * already there. Passing a partial object silently defaults the sides you omit
 * to 15, so `{top: 10}` is a full slop object, not a single-side tweak.
 *
 * ── AND A HALO IS NOT A SIZE ────────────────────────────────────────────────
 * This file used to assert that a 27pt control was "therefore already past the
 * 44pt minimum", adding the halo to the control. That is false on BOTH
 * platforms, and it is the kind of false comfort that keeps a real defect
 * invisible:
 *
 *   • hitSlop lives entirely inside React Native's own touch dispatch —
 *     `RCTView.pointInside:` on iOS, `TouchTargetHelper.isTouchPointInView` on
 *     Android. It makes a control easier to hit with a FINGER.
 *   • It never reaches the accessibility layer. iOS reports `accessibilityFrame`
 *     from the view's frame; Android reports the node's bounds. React Native
 *     installs no `TouchDelegate` anywhere in its Android source — grep it — so
 *     Google's Accessibility Scanner sees 27dp and flags it, halo or not.
 *
 * So the minimum is a question about the control's OWN geometry, and the only
 * fix for a control under it is `minHeight`/`minWidth`, never more slop. The
 * floor is 48, not 44: this app ships on Android too, where Material's minimum
 * is 48dp against Apple's 44pt, and building to the lower of the two standards
 * is how the app ended up compliant on one platform.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { Text, StyleSheet } from 'react-native';
import PressableScale from '../PressableScale';

const slopOf = (props: Record<string, unknown> = {}) => {
    const { getByTestId } = render(
        <PressableScale testID="target" {...props}><Text>x</Text></PressableScale>,
    );
    return getByTestId('target').props.hitSlop;
};

describe('PressableScale — no hitSlop prop does not mean no slop', () => {
    it('defaults to 15pt on every side', () => {
        expect(slopOf()).toEqual({ top: 15, bottom: 15, left: 15, right: 15 });
    });

    it('which makes a 27pt control comfortable for a finger — and nothing more', () => {
        // 27 + 15 + 15 = 57pt of REACHABLE area. That is the whole of what the
        // default buys. It is not a size, and it is not compliance.
        const s = slopOf();
        expect(27 + s.top + s.bottom).toBe(57);
    });

    it('a halo is not a size: the view keeps its own bounds', () => {
        // The bounds an accessibility service reads come from the style. A
        // control 27pt tall stays 27pt tall no matter how large its halo, which
        // is why `minHeight` is the only fix for a control under the floor.
        const { getByTestId } = render(
            <PressableScale testID="target" style={{ width: 27, height: 27 }} hitSlop={30}>
                <Text>x</Text>
            </PressableScale>,
        );
        const style = StyleSheet.flatten(getByTestId('target').props.style) as { width: number; height: number };
        expect(style.width).toBe(27);
        expect(style.height).toBe(27);
    });

    it('fills in only the sides that were omitted', () => {
        expect(slopOf({ hitSlop: { top: 4 } })).toEqual({ top: 4, bottom: 15, left: 15, right: 15 });
    });

    it('a partial hitSlop can SHRINK the target below the default', () => {
        // The exact trap: {top: 12} looks like an increase and is a 3pt cut.
        const withPartial = slopOf({ hitSlop: { top: 12, bottom: 0 } });
        expect(27 + withPartial.top + withPartial.bottom).toBeLessThan(27 + 15 + 15);
    });

    it('honours an explicit full object', () => {
        expect(slopOf({ hitSlop: { top: 1, bottom: 2, left: 3, right: 4 } }))
            .toEqual({ top: 1, bottom: 2, left: 3, right: 4 });
    });

    it('passes a number straight through', () => {
        expect(slopOf({ hitSlop: 20 })).toBe(20);
    });

    it('null means the caller genuinely wants no slop', () => {
        expect(slopOf({ hitSlop: null })).toBeNull();
    });
});
