/**
 * aRecordChangedElsewhereLeavesTheLogArchive.test.tsx — review round 8, a film's Log Archive.
 * ─────────────────────────────────────────────────────────────────────────────
 * The archive holds its records in its own state, read as it opened. A record withdrawn from its
 * sheet stood on it still (opening "No Such Record"), and one amended kept its old rating and
 * words, beside the film's page that had them. It hears now what the Reel hears
 * (reelMayHaveChanged): a record withdrawn leaves it at once; one amended or filed is read again
 * when the member is back on the archive, never before; and with nothing changed, coming back
 * reads nothing.
 */
import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { testQueryClient } from '@/test-utils/testQueryClient';
import { supabaseFake } from '@/test-utils/supabaseFake';
import { reelMayHaveChanged } from '@/src/components/feed/reelRead';

const ANA = '11111111-1111-4111-8111-111111111111';
const BEN = '22222222-2222-4222-8222-222222222222';
const ANAS = '00000000-0000-4000-8000-000000000001';
const BENS = '00000000-0000-4000-8000-000000000002';

const log = (id: string, user: string, review: string) => ({
  id, user_id: user, film_id: 603, film_title: 'The Matrix', poster_path: null, rating: 4, review,
  drop_cap: false, status: 'watched', created_at: '2026-11-15T09:00:00.000Z', year: 1999,
});
/** The house's records of the film, as each case changes them. */
let mockLogs = [log(ANAS, ANA, 'Ana wrote.'), log(BENS, BEN, 'Ben wrote.')];
const mockHouse = supabaseFake({
  // Answered whole: the archive asks for the film by its id as text, which the fake's strict
  // filter would not match against the integer column (as aMemberHiddenLeavesTheFilmsPages does).
  answer: { logs: () => mockLogs },
  rows: {
    profiles: [{ id: ANA, username: 'ana', avatar_url: null, role: 'cinephile' }, { id: BEN, username: 'ben', avatar_url: null, role: 'cinephile' }],
  },
});
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('@/src/lib/tmdb', () => ({
  tmdb: { detail: jest.fn(async () => ({ id: 603, title: 'The Matrix' })), peekDetail: () => undefined },
  obscurityScore: () => 0,
}));
jest.mock('@/src/utils/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() } }));
jest.mock('@/src/components/feed/ActivityCard', () => ({
  ActivityCard: ({ item }: { item: { review: string } }) => require('react').createElement(require('react-native').Text, null, item.review),
}));

/** Each focus effect the screen holds: run as it is focused, its cleanup run as it is left. */
type Focus = { effect: () => void | (() => void); blur: void | (() => void) };
const mockFocus = new Set<Focus>();
jest.mock('expo-router', () => ({
  ...require('@/test-utils/expoRouterMock').expoRouterMock(),
  useLocalSearchParams: () => ({ id: '603', title: 'The Matrix' }),
  Stack: { Screen: () => null },
  useFocusEffect: (effect: () => void | (() => void)) => {
    const R = require('react');
    const held: { current: Focus } = R.useRef({ effect, blur: undefined });
    held.current.effect = effect;
    R.useEffect(() => {
      const f = held.current;
      mockFocus.add(f);
      f.blur = f.effect();
      return () => { mockFocus.delete(f); if (typeof f.blur === 'function') f.blur(); };
    }, []);
  },
}));

/** The member back on the archive (a sheet over it closed, a page above it left). */
const focusAgain = async () => {
  await act(async () => {
    for (const f of [...mockFocus]) {
      if (typeof f.blur === 'function') f.blur();
      f.blur = f.effect();
    }
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
};
const reads = () => mockHouse.asked.filter((a) => a.table === 'logs').length;

function Wrapper({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(testQueryClient);
  return React.createElement(QueryClientProvider, { client }, children);
}

// The archive's code is loaded once before the cases, so no case pays for the load.
beforeAll(() => { require('@/app/film-reviews/[id]'); }, 30_000);
beforeEach(() => {
  mockLogs = [log(ANAS, ANA, 'Ana wrote.'), log(BENS, BEN, 'Ben wrote.')];
});

const open = async () => {
  const Archive = require('@/app/film-reviews/[id]').default as React.ComponentType;
  const r = render(<Wrapper><Archive /></Wrapper>);
  await waitFor(() => expect(r.queryByText('Ben wrote.')).not.toBeNull(), { timeout: 5000 });
  return r;
};

it('a record withdrawn leaves the archive at once, before any read', async () => {
  const r = await open();
  const before = reads();
  await act(async () => { reelMayHaveChanged(BENS); });
  expect(r.queryByText('Ben wrote.')).toBeNull();
  expect(r.getByText('Ana wrote.')).toBeTruthy();
  expect(reads()).toBe(before);
  r.unmount();
}, 15_000);

it('a record amended is read again when the member is back on the archive, never before, and once', async () => {
  const r = await open();
  const before = reads();
  // Back with nothing changed: nothing is read.
  await focusAgain();
  expect(reads()).toBe(before);

  // Amended from its sheet over the archive: the archive waits for the member to be back.
  mockLogs = [log(ANAS, ANA, 'Ana wrote again.'), log(BENS, BEN, 'Ben wrote.')];
  await act(async () => { reelMayHaveChanged(); });
  expect(reads()).toBe(before);
  expect(r.getByText('Ana wrote.')).toBeTruthy();

  await focusAgain();
  await waitFor(() => expect(r.queryByText('Ana wrote again.')).not.toBeNull());
  expect(r.queryByText('Ana wrote.')).toBeNull();
  expect(reads()).toBe(before + 1);

  // Read, it is the house's word again: the next return reads nothing.
  await focusAgain();
  expect(reads()).toBe(before + 1);
  r.unmount();
}, 15_000);

it('a record filed elsewhere is on the archive when the member is back', async () => {
  const r = await open();
  mockLogs = [log('00000000-0000-4000-8000-000000000003', ANA, 'Ana filed a new one.'), ...mockLogs];
  await act(async () => { reelMayHaveChanged(); });
  expect(r.queryByText('Ana filed a new one.')).toBeNull();
  await focusAgain();
  await waitFor(() => expect(r.queryByText('Ana filed a new one.')).not.toBeNull());
  r.unmount();
}, 15_000);
