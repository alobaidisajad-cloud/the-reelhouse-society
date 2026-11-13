/**
 * aGlowHasRoomToFall.test.tsx — on iOS a Text's glow is given room, its layout kept.
 *
 * iOS draws a Text's shadow inside the Text's own box: the sign-in title's "The House" glowed in a
 * hard rectangle on the iPhone (ios-launch 43371370114), its box hugging its longest line. The house
 * Text gives a shadowed Text padding of the shadow's reach and the same negative margin, so the
 * glow falls into room the words never had, and the words, their wrapping and their place stand
 * where they stood.
 */
import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';

import { Text, glowRoom } from '..';

const was = Platform.OS;
afterEach(() => { Platform.OS = was; });

describe('glowRoom', () => {
  it('gives nothing to a Text with no shadow', () => {
    expect(glowRoom({ fontSize: 20 })).toBeNull();
    expect(glowRoom({ textShadowColor: 'red', textShadowRadius: 0 })).toBeNull();
  });

  it('gives the shadow’s reach, its radius and its offset, as padding, and takes it back as margin', () => {
    expect(glowRoom({ textShadowRadius: 4, textShadowOffset: { width: 0, height: 2 } })).toEqual({
      paddingTop: 6, paddingBottom: 6, paddingLeft: 6, paddingRight: 6,
      marginTop: -6, marginBottom: -6, marginLeft: -6, marginRight: -6,
    });
  });

  it('adds to the spacing a Text already has, each side by its own name', () => {
    expect(glowRoom({ textShadowRadius: 10, paddingHorizontal: 4, marginTop: 12, margin: 2 })).toEqual({
      paddingTop: 10, paddingBottom: 10, paddingLeft: 14, paddingRight: 14,
      marginTop: 2, marginBottom: -8, marginLeft: -8, marginRight: -8,
    });
  });

  it('makes room for the widest glow any of its styles asks, so a breathing glow has room at its peak', () => {
    // The sign-in title: its theme shadow (4, offset 2), its stated peak (10), its breath now (4).
    const styles = [{ textShadowRadius: 4, textShadowOffset: { width: 0, height: 2 } }, { textShadowRadius: 10 }, { textShadowRadius: 4, textShadowOffset: { width: 0, height: 0 } }];
    expect(glowRoom(styles)?.paddingTop).toBe(10);
  });

  it('keeps the box of a Text with a ground or a border, and of one whose spacing is not a number', () => {
    expect(glowRoom({ textShadowRadius: 8, backgroundColor: '#000' })).toBeNull();
    expect(glowRoom({ textShadowRadius: 8, borderWidth: 1 })).toBeNull();
    expect(glowRoom({ textShadowRadius: 8, paddingLeft: '10%' } as never)).toBeNull();
    expect(glowRoom({ textShadowRadius: 8, marginLeft: 'auto' })).toBeNull();
  });
});

describe('the house Text', () => {
  const drawn = (os: 'ios' | 'android') => {
    Platform.OS = os;
    const r = render(<Text style={{ fontSize: 34, textShadowRadius: 10, textShadowColor: 'gold', textShadowOffset: { width: 0, height: 0 } }}>Enter The House</Text>);
    return StyleSheet.flatten(r.getByText('Enter The House').props.style);
  };

  it('gives a glowing Text room on iOS, where its glow is drawn inside its box', () => {
    const s = drawn('ios');
    expect([s.paddingLeft, s.paddingRight, s.paddingTop, s.paddingBottom]).toEqual([10, 10, 10, 10]);
    expect([s.marginLeft, s.marginRight, s.marginTop, s.marginBottom]).toEqual([-10, -10, -10, -10]);
  });

  it('leaves it as it is on Android, which draws a glow past its box', () => {
    const s = drawn('android');
    expect(s.paddingLeft ?? 0).toBe(0);
    expect(s.marginLeft ?? 0).toBe(0);
  });
});
