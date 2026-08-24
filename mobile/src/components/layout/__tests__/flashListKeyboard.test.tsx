/**
 * flashListKeyboard.test.tsx — the double tap.
 *
 * `keyboardShouldPersistTaps` defaults to 'never': a tap outside the focused
 * input dismisses the keyboard and is then SWALLOWED. In every room with a
 * search box that means type a title, see the film, tap it — the keyboard
 * closes and nothing opens. Tap again and it works. It reads as the app
 * ignoring you, and it is invisible in code review because the absence of a
 * prop looks like every other absence.
 *
 * Eight other places in this app already set 'handled'. The five profile rooms
 * never did, and they all reach their list through CinematicFlashList — so the
 * default lives there and this guards it.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { CinematicFlashList } from '../CinematicFlashList';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
}));

const rows = [{ id: '1' }, { id: '2' }];
const renderItem = ({ item }: { item: { id: string } }) => <Text>{item.id}</Text>;

/** The props the underlying list actually received. */
function listProps(tree: ReturnType<typeof render>) {
  const json = JSON.stringify(tree.toJSON());
  return json;
}

describe('a list never eats the first tap after a search', () => {
  it('passes taps through to its rows while the keyboard is open', () => {
    const t = render(
      <CinematicFlashList data={rows} renderItem={renderItem} keyExtractor={(i: { id: string }) => i.id} />,
    );
    expect(listProps(t)).toContain('handled');
  });

  it('puts the keyboard away when the member scrolls the results', () => {
    const t = render(
      <CinematicFlashList data={rows} renderItem={renderItem} keyExtractor={(i: { id: string }) => i.id} />,
    );
    expect(listProps(t)).toContain('on-drag');
  });

  it('a caller can still override the default', () => {
    // Set BEFORE {...rest} precisely so this stays possible.
    const t = render(
      <CinematicFlashList
        data={rows}
        renderItem={renderItem}
        keyExtractor={(i: { id: string }) => i.id}
        keyboardShouldPersistTaps="always"
      />,
    );
    expect(listProps(t)).toContain('always');
  });

  it('applies to horizontal lists too, where the chips live', () => {
    const t = render(
      <CinematicFlashList horizontal data={rows} renderItem={renderItem} keyExtractor={(i: { id: string }) => i.id} />,
    );
    expect(listProps(t)).toContain('handled');
  });
});
