/**
 * theArchiveKeepsTheMembersPlace.test.tsx — review round 9 (B3)
 * ─────────────────────────────────────────────────────────────────────────────
 * A film's Log Archive is read again when the member comes back to it after a record was filed or
 * amended (round 8). That read was page one alone: a member forty critiques down came back to the
 * first twenty, their place lost; and a next page asked before it and landing after laid the deep
 * critiques under the new page one. The read now reaches as far as the member had read (the rows
 * held, at most 500), and a next page asked before it is dropped when it lands.
 * Against the house as strict as it is (test-utils/supabaseFake), each answer held until let go.
 */
import React from 'react';
import { act, render } from '@testing-library/react-native';
import { supabaseFake, type Ask } from '@/test-utils/supabaseFake';
import { heldClient } from '@/test-utils/heldClient';
import { reelMayHaveChanged } from '@/src/components/feed/reelRead';

const ANA = '11111111-1111-4111-8111-111111111111';

type Row = Record<string, unknown> & { id: string; created_at: string };
/** The nth critique, newest first. */
const idOf = (n: number) => `00000000-0000-4000-8000-${String(n + 1).padStart(12, '0')}`;
const critique = (n: number): Row => ({
  id: idOf(n), user_id: ANA, film_id: 603, film_title: 'The Matrix', poster_path: null, rating: 4,
  review: `Critique ${n}.`, drop_cap: false, status: 'watched', year: 1999,
  created_at: `2026-11-15T${String(23 - Math.floor(n / 60)).padStart(2, '0')}:${String(59 - (n % 60)).padStart(2, '0')}:00.000Z`,
});
const LOGS = Array.from({ length: 45 }, (_, n) => critique(n));

/** Every row strictly after the cursor an `or()` names (created_at, then id, newest first). */
const pastTheCursor = (ask: Ask) => {
  const or = ask.ors?.[0];
  if (!or) return LOGS;
  const m = /^created_at\.lt\."([^"]+)",and\(created_at\.eq\."[^"]+",id\.lt\."([^"]+)"\)$/.exec(or);
  expect(m).not.toBeNull();
  const [, at = '', id = ''] = m ?? [];
  return LOGS.filter((r) => r.created_at < at || (r.created_at === at && r.id < id));
};
const mockHouse = supabaseFake({
  // Answered whole: the archive asks for the film by its id as text (PostgREST casts it), which the
  // fake's strict filter would not match against the integer column. The fake orders and cuts it.
  answer: { logs: pastTheCursor },
  rows: { profiles: [{ id: ANA, username: 'ana', avatar_url: null, role: 'cinephile' }] },
});
const mockHeld = heldClient(mockHouse.client);
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHeld.client; } }));

/** The screen's focus effects, run again as the member comes back to it. */
const mockFocused = new Set<() => void>();
jest.mock('expo-router', () => {
  const R = require('react') as typeof React;
  return {
    ...require('@/test-utils/expoRouterMock').expoRouterMock(),
    useLocalSearchParams: () => ({ id: '603', title: 'The Matrix' }),
    Stack: { Screen: () => null },
    useFocusEffect: (cb: () => void | (() => void)) => R.useEffect(() => {
      mockFocused.add(cb);
      const undo = cb();
      return () => { mockFocused.delete(cb); if (typeof undo === 'function') undo(); };
    }, [cb]),
  };
});
jest.mock('expo-router/react-navigation', () => ({ ...require('@/test-utils/navigationMock').navigationMock(), useIsFocused: () => true }));
/** The list's own "reached the end", as the last render handed it over. */
let mockEndReached: (() => void) | null = null;
jest.mock('@/src/components/layout/CinematicFlashList', () => {
  const List = require('@/mockups/tabs/flashListMock').makeFlashListMock().FlashList;
  const R = require('react');
  return {
    CinematicFlashList: (p: { onEndReached?: () => void }) => {
      mockEndReached = p.onEndReached ?? null;
      return R.createElement(List, p);
    },
  };
});
jest.mock('@/src/components/feed/ActivityCard', () => ({
  ActivityCard: ({ item }: { item: { review: string } }) => {
    const { Text } = require('react-native');
    return require('react').createElement(Text, null, item.review);
  },
}));

// eslint-disable-next-line import/first
import FilmReviewsScreen from '../[id]';

/** The critiques drawn, first to last, by their number. */
const drawn = (r: ReturnType<typeof render>) =>
  r.queryAllByText(/^Critique \d+\.$/).map((t) => Number(/\d+/.exec(String(t.props.children))?.[0]));
const upTo = (n: number) => Array.from({ length: n }, (_, i) => i);
const logReads = () => mockHouse.asked.filter((a) => a.table === 'logs');

const letGo = async () => { await act(async () => { await mockHeld.release('logs'); }); };
const mount = async () => {
  let r!: ReturnType<typeof render>;
  await act(async () => { r = render(<FilmReviewsScreen />); });
  await letGo();
  expect(drawn(r)).toEqual(upTo(20));
  return r;
};
const askTheNextPage = async () => { await act(async () => { mockEndReached!(); }); };
/** A record filed or amended from its sheet, and the member back on the archive. */
const comeBackAfterAnAmendment = async () => {
  await act(async () => {
    reelMayHaveChanged();
    for (const focus of [...mockFocused]) focus();
  });
};

beforeEach(() => {
  mockFocused.clear();
  mockHouse.asked.length = 0;
});

it('back on the archive after amending a record, the member’s place is kept: it is read again as far as they had read', async () => {
  const r = await mount();
  await askTheNextPage();
  await letGo();
  expect(drawn(r)).toEqual(upTo(40));

  await comeBackAfterAnAmendment();
  await letGo();

  // One read from the top, as long as the forty held: the deep critiques are still there.
  const again = logReads()[logReads().length - 1];
  expect(again).toBeDefined();
  expect(again!.ors ?? []).toEqual([]);
  expect(again!.limit).toBe(40);
  expect(drawn(r)).toEqual(upTo(40));
  r.unmount();
});

it('a next page asked before the archive was read again is dropped when it lands, and the next page can be asked again', async () => {
  const r = await mount();
  // The member reaches the foot: the next page is on its way.
  await askTheNextPage();
  // A record amended, and the member back: the archive is read again, answered first.
  await comeBackAfterAnAmendment();
  await act(async () => { await mockHeld.release('logs', 1); });
  expect(drawn(r)).toEqual(upTo(20));

  // The next page of the list that read replaced lands: no deep critiques laid under page one.
  await letGo();
  expect(drawn(r)).toEqual(upTo(20));

  // Its spinner is down: the foot asks the next page again, from the page now held.
  const asked = logReads().length;
  await askTheNextPage();
  expect(logReads()).toHaveLength(asked + 1);
  await letGo();
  expect(drawn(r)).toEqual(upTo(40));
  r.unmount();
});
