/**
 * theCalendarDrawsToday.test.tsx — the viewing calendar, against the days it
 * claims.
 *
 * Its 364 cells ran from 364 days ago to YESTERDAY, so a film logged today was
 * counted in the heading and drawn nowhere. The heading counted every row read
 * (the read carries a week of slack), said "1 FILMS", and called 52 weeks
 * "THIS YEAR".
 */
import React, { act } from 'react';
import { render } from '@testing-library/react-native';
import NitrateCalendarGrid from '../NitrateCalendarGrid';
import { calendarDateString } from '@/src/utils/timeAgo';

jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), notificationAsync: jest.fn(), selectionAsync: jest.fn() }));

const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return calendarDateString(d)!; };

const mount = async (logs: { watchedDate: string }[]) => {
  const r = render(<NitrateCalendarGrid logs={logs} isSelf={false} />);
  await act(async () => { await Promise.resolve(); });
  return r;
};
type Node = { type?: string; props?: Record<string, unknown>; children?: (Node | string)[] | null };
/**
 * The days drawn with a film: every cell (RNSVGRect) whose fill differs from the
 * empty day's, which is the commonest. The fill is compared as rendered, so the
 * walk does not depend on how the renderer encodes a colour.
 */
const filled = (r: Awaited<ReturnType<typeof mount>>) => {
  const cells: string[] = [];
  const walk = (n: Node | Node[] | string | null) => {
    if (!n || typeof n === 'string') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.type === 'RNSVGRect') cells.push(JSON.stringify(n.props?.fill));
    (n.children ?? []).forEach(walk);
  };
  walk(r.toJSON() as Node | Node[] | null);
  expect(cells).toHaveLength(364);   // a walk that finds no cells proves nothing
  const tally = new Map<string, number>();
  for (const c of cells) tally.set(c, (tally.get(c) ?? 0) + 1);
  const empty = [...tally.entries()].sort((a, z) => z[1] - a[1])[0][0];
  return cells.map((c, i) => (c === empty ? -1 : i)).filter((i) => i >= 0);
};

it('draws a film logged today, and counts it once', async () => {
  const r = await mount([{ watchedDate: daysAgo(0) }]);
  expect(r.getByText('1 FILM IN THE PAST YEAR')).toBeTruthy();
  // The last cell is today.
  expect(filled(r)).toEqual([363]);
});

it('counts only the days it draws, not the week of slack the read carries', async () => {
  const r = await mount([{ watchedDate: daysAgo(3) }, { watchedDate: daysAgo(363) }, { watchedDate: daysAgo(366) }]);
  expect(r.getByText('2 FILMS IN THE PAST YEAR')).toBeTruthy();
  expect(filled(r)).toEqual([0, 360]);
});
