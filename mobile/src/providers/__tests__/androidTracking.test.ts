/**
 * A tracked label is as wide on Android as on iOS (see androidTracking.ts).
 *
 * The arithmetic. That the app's Text really applies it — on Android, live,
 * and never on iOS — is proven where the Text is: src/components/text.
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
