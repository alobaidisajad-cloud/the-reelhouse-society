/**
 * editorialDesk.test.tsx — the instrument that did not draw.
 *
 * This is the feature the report was about: it works on the web and appears
 * blank in the app. The cause was a horizontal FlashList nested in a vertical
 * ScrollView — no bounded height to measure against, and the documented failure
 * is that it renders NOTHING. It is a plain scroller now, and nothing proved
 * that until this file: the composer's own render test only ever opened the
 * desk LOCKED, where the gate is what you look at.
 */
import React, { act } from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import EditorialDesk from '../EditorialDesk';
import LogForm from '../LogForm';
import { useLogFlow } from '@/src/hooks/useLogFlow';
import { useLocalSearchParams } from 'expo-router';

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

const BACKDROPS = [
  { file_path: '/one.jpg' }, { file_path: '/two.jpg' }, { file_path: '/three.jpg' },
];

type R = ReturnType<typeof render>;
type Node = { type: string; props: Record<string, any>; children: (Node | string)[] | null };
function walk(r: R): Node[] {
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
const stills = (r: R) => walk(r).filter(n => n.type === 'ExpoImage');

const desk = (over: Partial<React.ComponentProps<typeof EditorialDesk>> = {}) =>
  render(
    <EditorialDesk
      dropCap={false}
      setDropCap={jest.fn()}
      pullQuote=""
      setPullQuote={jest.fn()}
      editorialHeader={null}
      setEditorialHeader={jest.fn()}
      availableBackdrops={BACKDROPS}
      {...over}
    />,
  );

describe('the stills actually draw', () => {
  it('paints one still per backdrop, which is the whole bug report', () => {
    expect(stills(desk())).toHaveLength(BACKDROPS.length);
  });

  it('lays them along a row, not down the page', () => {
    // Lose `horizontal` and ten stills become ten stacked rows — 450pt of
    // panel inside a form that is already long. It draws, so no test would
    // notice; the page would just be wrong.
    expect(walk(desk()).some(n => n.props?.horizontal === true)).toBe(true);
  });

  it('offers NONE first, so a header can be taken back off', () => {
    expect(desk().getByText('NONE')).toBeTruthy();
  });

  it('says so plainly when a film has no stills at all', () => {
    const r = desk({ availableBackdrops: [] });
    expect(r.getByText('No stills found.')).toBeTruthy();
    expect(stills(r)).toHaveLength(0);
    // And does not offer a NONE chip with nothing to choose between.
    expect(r.queryByText('NONE')).toBeNull();
  });

  it('marks the chosen still, and quiets the rest', () => {
    const chosen = stills(desk({ editorialHeader: '/two.jpg' }));
    const flat = (s: unknown) => (Array.isArray(s) ? s : [s]).filter(Boolean) as Record<string, unknown>[];
    const faded = chosen.filter(n => flat(n.props.style).some(x => x.opacity === 0.4));
    const marked = chosen.filter(n => flat(n.props.style).some(x => x.borderWidth === 2));
    expect(marked).toHaveLength(1);
    expect(faded).toHaveLength(BACKDROPS.length - 1);
  });
});

describe('each still answers for itself', () => {
  it('no still claims more than half the gap to its neighbour', () => {
    // PressableScale's default is 15pt on every side. The stills sit 8pt apart,
    // so two defaults overlap by 22pt — and in an overlap the LATER sibling
    // wins, on both platforms. Every still's right edge would have selected the
    // NEXT one. A side may claim at most half the real gap.
    const GAP = 8;
    const under = (n: Node): Node[] => [n, ...(n.children ?? []).flatMap(c => typeof c === 'string' ? [] : under(c))];
    // The stills alone — the drop-cap toggle is a lone control in its row and
    // is entitled to the full default.
    const isStill = (n: Node) => under(n).some(d => d.type === 'ExpoImage' || (d.children ?? []).includes('NONE'));
    const touchables = walk(desk())
      .filter(n => typeof n.props?.onStartShouldSetResponder === 'function')
      .filter(isStill);
    expect(touchables).toHaveLength(BACKDROPS.length + 1);
    const slops = touchables.map(n => n.props.hitSlop as Record<string, number> | undefined);
    for (const s of slops) {
      expect(s).toBeDefined();
      if (!s) continue;
      expect(s.left).toBeLessThanOrEqual(GAP / 2);
      expect(s.right).toBeLessThanOrEqual(GAP / 2);
    }
  });
});

describe('the desk names itself once', () => {
  beforeEach(() => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      filmId: '603', filmTitle: 'The Matrix', filmPoster: '/poster.jpg', filmYear: '1999',
    });
  });

  function Harness() {
    const flow = useLogFlow();
    return <LogForm flow={{ ...flow, isPremium: true, isAuteur: true }} user={{ username: 'sajjadobaidi' } as never} />;
  }

  it('does not print its own name under the name of the section it sits in', async () => {
    // The manuscript had this exact defect and it was fixed there. The desk is
    // attached to the manuscript's foot, under a heading that already says
    // THE EDITORIAL DESK — a second title inside the panel is the heading said
    // twice, four points apart, in two different faces.
    const r = render(<Harness />);
    await act(async () => { fireEvent.press(r.getByText('THE EDITORIAL DESK')); });
    expect(r.queryAllByText(/^The Editorial Desk$/)).toHaveLength(0);
    expect(r.getAllByText('THE EDITORIAL DESK')).toHaveLength(1);
  });
});
