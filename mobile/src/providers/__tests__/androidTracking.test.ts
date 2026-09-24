/**
 * A tracked label is as wide on Android as on iOS (see androidTracking.ts).
 *
 * Two things are proven: the arithmetic, and that the ONE wrapper around every
 * <Text> really applies it on Android and never on iOS. The wrapper patches a
 * `render` that the test renderer's Text does not have, so this gives Text one
 * and reads what reaches it — the real wiring, not a copy of it.
 */
import { StyleSheet } from 'react-native';
import { androidTracking } from '../androidTracking';

describe('androidTracking — the arithmetic', () => {
  it('hands Android spacing ÷ setting, so it draws the written spacing', () => {
    expect(androidTracking({ letterSpacing: 2 }, true, 2)).toEqual({ letterSpacing: 1 });
    expect(androidTracking({ letterSpacing: 1.35 }, undefined, 1.35)).toEqual({ letterSpacing: 1 });
  });

  it('reads the spacing through arrays and registered styles', () => {
    const s = StyleSheet.create({ a: { letterSpacing: 3 } });
    expect(androidTracking([s.a, { color: 'red' }], true, 1.5)).toEqual({ letterSpacing: 2 });
    expect(androidTracking([{ letterSpacing: 9 }, s.a], true, 3)).toEqual({ letterSpacing: 1 });
  });

  it('changes nothing at the default size, for frozen text, or with no spacing', () => {
    expect(androidTracking({ letterSpacing: 2 }, true, 1)).toBeNull();
    expect(androidTracking({ letterSpacing: 2 }, false, 2)).toBeNull();
    expect(androidTracking({ fontSize: 12 }, true, 2)).toBeNull();
    expect(androidTracking({ letterSpacing: 0 }, true, 2)).toBeNull();
    expect(androidTracking(undefined, true, 2)).toBeNull();
  });

  it('keeps a text\'s spacing as it grows smaller than designed, too', () => {
    // iOS does not shrink the spacing either; parity holds both ways.
    expect(androidTracking({ letterSpacing: 1.7 }, true, 0.85)).toEqual({ letterSpacing: 2 });
  });
});

describe('the wrapper around every <Text>', () => {
  const renderedWith = (os: 'ios' | 'android', fontScale: number, props: object) => {
    let seen: any;
    jest.isolateModules(() => {
      const RN = require('react-native');
      const was = { os: RN.Platform.OS, render: RN.Text.render };
      RN.Platform.OS = os;
      RN.Text.render = (p: unknown) => { seen = p; return null; };
      const scale = jest.spyOn(RN.PixelRatio, 'getFontScale').mockReturnValue(fontScale);
      try {
        require('../AccessibilityProvider');
        RN.Text.render(props, null);
      } finally {
        scale.mockRestore();
        RN.Platform.OS = was.os;
        RN.Text.render = was.render;
      }
    });
    return seen;
  };

  it('on Android at 2×, a spaced label is handed half its spacing', () => {
    const p = renderedWith('android', 2, { style: { letterSpacing: 2.2, fontSize: 10 } });
    expect(StyleSheet.flatten(p.style)).toEqual({ letterSpacing: 1.1, fontSize: 10 });
    // and the ceiling the wrapper exists for is still there
    expect(p.maxFontSizeMultiplier).toBe(1.35);
  });

  it('on iOS, nothing is touched', () => {
    const style = { letterSpacing: 2.2 };
    const p = renderedWith('ios', 2, { style });
    expect(p.style).toBe(style);
  });

  it('a frozen text on Android is left as written', () => {
    const style = { letterSpacing: 2 };
    const p = renderedWith('android', 2, { style, allowFontScaling: false });
    expect(p.style).toBe(style);
  });
});
