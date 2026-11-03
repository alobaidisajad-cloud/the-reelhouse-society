/**
 * A member's name in a byline has a line of its own, at every text size.
 *
 * On one line the name had what the rank and the time left it: at Android's largest text
 * "@E2E_WRITER", eleven letters, lost its end on the film page (112.7pt of name for 110.1pt), and
 * a fifteen-letter name beside a rank lost 42 to 78pt at the designed size on a 320pt phone. So
 * the rank and the time stand on a line beneath the name, together, at every size: one layout,
 * never chosen by the size (the line would be lost at whichever size the choice was wrong).
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { UserAttributionRow } from '../UserAttributionRow';

let mockFontScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 360, height: 780, scale: 3, fontScale: mockFontScale }),
}));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), notificationAsync: jest.fn(), selectionAsync: jest.fn() }));

type Node = ReturnType<ReturnType<typeof render>['getByText']>;

/** The views laid out as a row that hold this one, nearest first. */
function rowsAround(node: Node): Node[] {
  const rows: Node[] = [];
  for (let n: Node | null = node.parent; n; n = n.parent) {
    if (typeof n.type === 'string' && StyleSheet.flatten(n.props.style)?.flexDirection === 'row') rows.push(n);
  }
  return rows;
}

/** Whether two things are set on one line: a row holds them both. */
const sameLine = (a: Node, b: Node) => rowsAround(a).some((r) => rowsAround(b).includes(r));

function byline(scale: number) {
  mockFontScale = scale;
  const r = render(<UserAttributionRow username="marguerite_moss" avatarUrl={null} role="auteur" timeAgo="2 HRS. AGO" onUserPress={() => {}} />);
  return { name: r.getByText('@MARGUERITE_MOSS'), rank: r.getByText('★ AUTEUR'), time: r.getByText('2 HRS. AGO') };
}

it.each([0.85, 1, 1.04, 1.35, 2, 3.1])('gives the name a line of its own at %s, the rank and the time together beneath it', (scale) => {
  const { name, rank, time } = byline(scale);
  expect([sameLine(name, rank), sameLine(name, time), sameLine(rank, time)]).toEqual([false, false, true]);
});
