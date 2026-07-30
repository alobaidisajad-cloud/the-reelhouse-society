/**
 * PressableScale — the DEFAULT touch target.
 *
 * Why this exists: an audit finding claimed two buttons "have no hitSlop, so
 * they are under the 44pt minimum" and a fix added explicit values. Both were
 * wrong — PressableScale already normalizes an absent hitSlop to 15pt on every
 * side, so those buttons were compliant, and the "fix" made them SMALLER.
 *
 * The rule this pins: on a PressableScale, no hitSlop prop does NOT mean no
 * slop. Never add hitSlop to "reach 44pt" without subtracting the 15 already
 * there. Passing a partial object silently defaults the sides you omit to 15,
 * so `{top: 10}` is a full slop object, not a single-side tweak.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
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

    it('a 27pt control is therefore already past the 44pt minimum', () => {
        const s = slopOf();
        expect(27 + s.top + s.bottom).toBeGreaterThanOrEqual(44);
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
