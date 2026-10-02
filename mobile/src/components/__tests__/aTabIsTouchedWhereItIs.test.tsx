/**
 * aTabIsTouchedWhereItIs.test.tsx — a tab answers touches on itself only.
 *
 * Each tab reached 10pt past its edges. The tabs sit edge to edge, so the
 * right edge of one belonged to the next (and a tab opens on the touch DOWN),
 * and the bar took 10pt of the screen above it. A tab is already a fifth of
 * the screen and the bar's full height: it needs no reach at all.
 */
import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { HapticTab } from '../HapticTab';

it('a tab reaches no further than its own edges', () => {
  const r = render(
    <HapticTab {...({ onPress: jest.fn(), testID: 'tab' } as unknown as React.ComponentProps<typeof HapticTab>)}>
      <Text>Lobby</Text>
    </HapticTab>,
  );
  const slop = r.getByTestId('tab').props.hitSlop;
  expect(slop == null || Object.values(slop).every((v) => v === 0)).toBe(true);
});
