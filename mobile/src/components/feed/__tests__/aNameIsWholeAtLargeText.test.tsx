/**
 * A member's name in a byline keeps its whole width at a larger text size.
 *
 * On one line the name has what the rank and the time leave it, and at Android's largest text
 * "@E2E_WRITER", eleven letters, lost its end on the film page (112.7pt of name for 110.1pt); a
 * fourteen-letter name beside a rank lost 5pt already at 1.04 on the narrowest phone. Above the
 * designed size (STACK_ABOVE) the rank and the time step down a line, under the name; at it and
 * below, the byline stays the one line it was designed as.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { UserAttributionRow, STACK_ABOVE } from '../UserAttributionRow';

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
  const r = render(<UserAttributionRow username="e2e_writer" avatarUrl={null} role="auteur" timeAgo="2 HRS. AGO" onUserPress={() => {}} />);
  return { name: r.getByText('@E2E_WRITER'), rank: r.getByText('★ AUTEUR'), time: r.getByText('2 HRS. AGO') };
}

it('stacks the moment its text is drawn larger than designed', () => {
  expect(STACK_ABOVE).toBe(1);
});

it.each([0.85, 1])('keeps the name, the rank and the time on one line at %s', (scale) => {
  const { name, rank, time } = byline(scale);
  expect([sameLine(name, rank), sameLine(name, time), sameLine(rank, time)]).toEqual([true, true, true]);
});

it.each([1.04, 1.12, 1.24, 1.35, 2, 3.1])('gives the name a line of its own at %s, the rank and the time together beneath it', (scale) => {
  const { name, rank, time } = byline(scale);
  expect([sameLine(name, rank), sameLine(name, time), sameLine(rank, time)]).toEqual([false, false, true]);
});
