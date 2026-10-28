/**
 * theObscurityWord.test.tsx — the word a film's obscurity is shown as, and said as.
 *
 * The badge draws the word and the card's name says it: one rule for both, so a
 * card cannot say INDIE where it draws DEEP CUT.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { ObscurityBadge, obscurityWord } from '../PersonOrnaments';

it('gives each band its word, and none at all for no score', () => {
  expect([0, -3, 1, 20, 21, 40, 41, 60, 61, 80, 81, 99].map(obscurityWord)).toEqual([
    null, null, 'MAINSTREAM', 'MAINSTREAM', 'KNOWN', 'KNOWN', 'INDIE', 'INDIE', 'DEEP CUT', 'DEEP CUT', 'GHOST REEL', 'GHOST REEL',
  ]);
});

it('the badge draws that word, and nothing where there is none', () => {
  expect(render(<ObscurityBadge score={70} />).getByText('DEEP CUT')).toBeTruthy();
  expect(render(<ObscurityBadge score={0} />).toJSON()).toBeNull();
});
