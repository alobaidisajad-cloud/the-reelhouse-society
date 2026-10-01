/**
 * The Reel's filter chips and stack cards, as a finger and a screen reader meet
 * them: no tap between two chips belongs to both, the chosen chip says it is
 * chosen, and a stack card says which stack it opens.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { FilterChip, StackCard, FILTER_GAP } from '../ReelsCards';

jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));

describe('a filter chip', () => {
  it('reaches at most half the gap to its neighbour, so no tap is claimed twice', () => {
    const r = render(<FilterChip label="MAIN REEL" active={false} onPress={jest.fn()} />);
    const halo = r.getByRole('button').props.hitSlop as { left: number; right: number };
    expect(halo.left + halo.right).toBeLessThanOrEqual(FILTER_GAP);
  });

  it('says which filter is chosen', () => {
    const on = render(<FilterChip label="FOLLOWING" active onPress={jest.fn()} />);
    const off = render(<FilterChip label="MAIN REEL" active={false} onPress={jest.fn()} />);
    expect(on.getByRole('button').props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    expect(off.getByRole('button').props.accessibilityState).toEqual(expect.objectContaining({ selected: false }));
  });
});

describe('a stack card', () => {
  it('says the stack it opens: its name, its size and its curator, not its reference code', () => {
    const r = render(
      <StackCard
        stack={{ id: '1a2b3c4d', title: 'Noir at Night', description: '', curator: 'wren', curatorId: 'u1',
          createdAt: '2026-09-01T00:00:00Z', films: [], count: 7, certifyCount: 2, isRanked: false } as never}
        onPress={jest.fn()}
      />,
    );
    expect(r.getByLabelText('Noir at Night. 7 films, curated by @wren. Opens the stack.')).toBeTruthy();
  });
});

describe("a card's autopsy", () => {
  it('reads each score whole: its craft and its mark out of ten', () => {
    const { AutopsyBack } = jest.requireActual('@/src/components/feed/AutopsyView');
    const r = render(<AutopsyBack autopsy={{ _v: 2, story: 8, sound: 10 }} username="wren" onReturn={jest.fn()} />);
    expect(r.getByLabelText('story, 8.0 out of 10')).toBeTruthy();
    expect(r.getByLabelText('sound, 10 out of 10')).toBeTruthy();
  });
});
