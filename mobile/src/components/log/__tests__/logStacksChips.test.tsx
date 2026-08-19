/**
 * logStacksChips.test.tsx — THE STACKS entry, actually mounted.
 *
 * The chip strip only appears when the member HAS stacks, and no test had ever
 * supplied any — so the whole entry, and every chip in it, had never rendered.
 * It became urgent when the chip's structure changed: the pressable now carries
 * a 48pt box and the chip sits inside it as a plain View, so that the chip stays
 * chip-sized while the target clears the floor. That is a restructure with a
 * failure mode nothing was watching — a stretched chip looks exactly like a
 * button, and no source-reading test can see it.
 */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import LogForm from '../LogForm';
import { useLogFlow } from '@/src/hooks/useLogFlow';

jest.mock('lucide-react-native', () => {
  const React = require('react');
  return new Proxy({}, { get: () => (props: any) => React.createElement('Icon', props) });
});
jest.mock('@/src/components/NitrateCalendar', () => () => null);
jest.mock('@/src/components/AutopsyGauge', () => () => null);
jest.mock('@/src/components/Decorative', () => ({
  ReelRating: () => null,
  SectionDivider: (props: any) => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, null, props.label);
  },
}));

const FILM_ID = 603;
const LISTS = [
  { id: 'l1', title: 'Noir Essentials', films: [{ id: FILM_ID }], isPrivate: false, isRanked: false },
  { id: 'l2', title: 'Rewatch Pile', films: [], isPrivate: true, isRanked: false },
  { id: 'l3', title: 'Seen With Yusuf', films: [], isPrivate: false, isRanked: true },
];

const toggleList = jest.fn();

function Harness() {
  const flow = useLogFlow();
  return (
    <LogForm
      flow={{ ...flow, isPremium: true, isAuteur: true, lists: LISTS as never, toggleList }}
      user={{ username: 'sajjadobaidi' } as never}
    />
  );
}

beforeEach(() => {
  toggleList.mockClear();
  (useLocalSearchParams as jest.Mock).mockReturnValue({
    filmId: String(FILM_ID), filmTitle: 'The Matrix', filmPoster: '/poster.jpg', filmYear: '1999',
  });
});

/** Open THE STACKS and hand back the render result. */
async function openStacks() {
  const r = render(<Harness />);
  await fireEvent.press(r.getByText('STACKS'));
  await waitFor(() => expect(r.getByText('Noir Essentials')).toBeTruthy());
  return r;
}

type Node = { type: string; props: Record<string, any>; children: (Node | string)[] | null };
function walk(r: ReturnType<typeof render>): Node[] {
  const out: Node[] = [];
  const visit = (n: unknown) => {
    if (!n || typeof n !== 'object') return;
    const node = n as Node;
    out.push(node);
    (node.children ?? []).forEach(visit);
  };
  visit(r.toJSON());
  return out;
}

describe('the stacks entry', () => {
  it('names every stack the member keeps', async () => {
    const r = await openStacks();
    for (const l of LISTS) expect(r.getByText(l.title)).toBeTruthy();
  });

  it('counts the ones this film is already in', async () => {
    const r = render(<Harness />);
    // Stated on the closed entry, so the index reads without opening anything.
    expect(r.getByText('1 SELECTED')).toBeTruthy();
  });

  it('adds the film to the stack that was pressed', async () => {
    const r = await openStacks();
    await fireEvent.press(r.getByText('Seen With Yusuf'));
    expect(toggleList).toHaveBeenCalledWith('l3');
  });
});

describe('the chip keeps its own size inside a 48pt target', () => {
  it('the pressable reaches the floor', async () => {
    const r = await openStacks();
    const boxes = walk(r).filter(n => typeof n.props?.onStartShouldSetResponder === 'function'
      && StyleSheet.flatten(n.props.style)?.minHeight === 48);
    expect(boxes.length).toBeGreaterThanOrEqual(LISTS.length);
  });

  it('and the chip inside it is NOT stretched to fill it', async () => {
    // The whole point of the box. A chip grown to 48 reads as a button, which
    // is why Material ships a 32dp chip and reaches the floor another way.
    const r = await openStacks();
    const chips = walk(r).filter(n => {
      const s = StyleSheet.flatten(n.props?.style) as { borderRadius?: number; paddingVertical?: number } | undefined;
      return s?.borderRadius === 3 && s?.paddingVertical === 8;
    });
    expect(chips.length).toBe(LISTS.length);
    for (const c of chips) {
      const s = StyleSheet.flatten(c.props.style) as { height?: number; minHeight?: number; flex?: number };
      expect(s.height).toBeUndefined();
      expect(s.minHeight).toBeUndefined();
      expect(s.flex).toBeUndefined();
    }
  });

  it('claims no halo, because the box already reaches the floor', async () => {
    // Scoped to the chips: an earlier version of this matched EVERY 48pt
    // pressable on the page and caught the status row still carrying a halo it
    // no longer needed — a real finding, and the wrong test to find it in.
    const r = await openStacks();
    const isChip = (n: Node): boolean => {
      const s = StyleSheet.flatten(n.props?.style) as { borderRadius?: number; paddingVertical?: number } | undefined;
      if (s?.borderRadius === 3 && s?.paddingVertical === 8) return true;
      return (n.children ?? []).some(c => typeof c !== 'string' && isChip(c));
    };
    const boxes = walk(r).filter(n => typeof n.props?.onStartShouldSetResponder === 'function' && isChip(n));
    expect(boxes).toHaveLength(LISTS.length);
    for (const b of boxes) expect(b.props.hitSlop).toBeNull();
  });
});
