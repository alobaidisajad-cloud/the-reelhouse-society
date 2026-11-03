/**
 * The Reel's title card, its selector and its cans, as a finger and a screen reader meet them:
 * no tap between two words belongs to both, the chosen one says it is chosen, and a can says
 * which stack it opens.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { SharedReelHeader, ReelSelector } from '../ReelsHeader';
import { StackCan } from '../StackCan';
import { Breakdown } from '@/src/components/feed/frame/Breakdown';

jest.mock('expo-router/react-navigation', () => ({ ...require('@/test-utils/navigationMock').navigationMock(), useIsFocused: () => true }));

describe("the title card's switch", () => {
  it('says which reel is shown, and neither half reaches into the other', () => {
    const r = render(<SharedReelHeader section="stacks" onTabSwitch={jest.fn()} />);
    const logs = r.getByLabelText('Logs');
    const stacks = r.getByLabelText('Stacks');
    expect(logs.props.accessibilityState).toEqual(expect.objectContaining({ selected: false }));
    expect(stacks.props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    // Flush halves: a halo on either would take the other's touches.
    expect(logs.props.hitSlop ?? null).toBeNull();
    expect(stacks.props.hitSlop ?? null).toBeNull();
  });
});

describe('the selector', () => {
  it('says which reel the frames are cut from, and neither word reaches into the other', () => {
    const r = render(<ReelSelector first="MAIN REEL" value="following" onChange={jest.fn()} />);
    const main = r.getByLabelText('Main reel');
    const following = r.getByLabelText('Following');
    expect(main.props.accessibilityState).toEqual(expect.objectContaining({ selected: false }));
    expect(following.props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    expect(main.props.hitSlop ?? null).toBeNull();
    expect(following.props.hitSlop ?? null).toBeNull();
  });
});

describe("a stack's can", () => {
  it('says the stack it opens: its name, its size and its curator, not its reference code', () => {
    const r = render(
      <StackCan
        stack={{ id: '1a2b3c4d', title: 'Noir at Night', description: '', curator: 'wren', curatorId: 'u1',
          createdAt: '2026-09-01T00:00:00Z', films: [], count: 7, certifyCount: 2, isRanked: false } as never}
        width={175}
        height={240}
        onPress={jest.fn()}
      />,
    );
    expect(r.getByLabelText('Noir at Night. 7 reels, curated by @wren, 2 certifications. Opens the stack.')).toBeTruthy();
  });
});

describe("a frame's breakdown", () => {
  it('reads each score whole: its craft and its mark out of ten', () => {
    const r = render(<Breakdown autopsy={{ _v: 2, story: 8, sound: 10 }} width={300} scale={1} accent="#B8891A" />);
    expect(r.getByLabelText('Breakdown, 9 out of 10. story, 8 out of 10. sound, 10 out of 10.')).toBeTruthy();
  });
});
