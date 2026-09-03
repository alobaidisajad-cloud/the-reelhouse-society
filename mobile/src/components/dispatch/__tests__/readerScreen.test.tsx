/**
 * readerScreen.test.tsx — the one screen that reads all five kinds.
 * ─────────────────────────────────────────────────────────────────────────────
 * 145 statements, none of which had ever run. It is the page a notification
 * opens, a share link lands on, and every card in the feed pushes to — and the
 * only proof that any of its states worked was that the code looked right.
 *
 * The states it can be in are not variations on a theme; they are different
 * pages, and three of them are what a member sees when something has gone
 * wrong. Those are the ones nobody looks at:
 *
 *   missing    a link to something the house removed entirely
 *   ended      withdrawn, but the critiques under it survive
 *   withheld   under review, readable by its AUTHOR and nobody else
 *   signed out public to read, and no act offered
 *
 * The store is real here; only the network and the session are mocked. Mocking
 * the store instead would test the screen against my idea of the store rather
 * than the store.
 */
import React, { act } from 'react';
import { render } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';

import FilingReader from '@/app/dispatch/[id]';
import { useDispatch } from '@/src/stores/dispatch';
import type { Filing } from '@/src/stores/dispatchTypes';

let mockRow: Record<string, unknown> | null = null;
let mockUser: { id: string; username: string } | null = { id: 'u1', username: 'me' };

jest.mock('@/src/stores/auth', () => ({
  // Called both ways in this tree: with a selector, and bare for the whole
  // state. A mock that only handles the selector form throws `sel is not a
  // function` from somewhere three components down.
  useAuthStore: Object.assign(
    (sel?: (s: unknown) => unknown) =>
      (typeof sel === 'function' ? sel({ user: mockUser }) : { user: mockUser }),
    { getState: () => ({ user: mockUser }), setState: jest.fn(), subscribe: jest.fn() },
  ),
}));

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: () => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = () => self();
      chain.eq = () => self();
      chain.is = () => self();
      chain.in = () => Promise.resolve({ data: [], error: null });
      chain.order = () => self();
      chain.range = () => {
        const r = Promise.resolve({ data: [], error: null });
        return Object.assign(r, { abortSignal: () => r });
      };
      // Every read in the store goes through `withAbortSignal`, which calls
      // `.abortSignal(signal)` on the BUILDER. A mock that returns a bare
      // Promise throws there, the store swallows it, and the screen renders its
      // "no longer here" page — which reads exactly like a correctly-handled
      // missing filing. The mock has to be a builder, not a result.
      const builder = (data: unknown) => {
        const r = Promise.resolve({ data, error: null });
        return Object.assign(r, { abortSignal: () => r });
      };
      chain.maybeSingle = () => builder(mockRow);
      chain.limit = () => builder([]);
      return chain;
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  },
}));

jest.mock('@/src/utils/offlineQueue', () => ({
  enqueueMutation: jest.fn(), flushOfflineQueue: jest.fn(), getOfflineQueue: () => [],
}));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn() }));

/** A row as PostgREST returns it, so `hydrate` parses it for real. */
const row = (over: Record<string, unknown> = {}) => ({
  id: 'f1', kind: 'dossier', user_id: 'u2', author_username: 'tomasreyes',
  title: 'The Empty Room',
  body: 'An excerpt.',
  full_content: 'Ozu frames a room and then leaves it. The camera stays low.\n\nThat is the argument.',
  subject_kind: null, subject_id: null, subject_title: null,
  options: null, closes_at: null, frozen_totals: null, answer_id: null,
  series_id: null, series_title: null, part_number: null,
  spoiler_label: null, withheld_at: null, ended_at: null, ended_by: null,
  certify_count: 9, comment_count: 0,
  created_at: '2026-08-28T21:00:00Z', edited_at: null,
  profiles: { username: 'tomasreyes', member_no: 147, tier: 'auteur', role: null, is_founding: false },
  ...over,
});

const at = (params: Record<string, string>) =>
  (useLocalSearchParams as unknown as jest.Mock).mockReturnValue(params);

const mount = async () => {
  const r = render(<FilingReader />);
  await act(async () => {
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  });
  return r;
};

beforeEach(() => {
  mockUser = { id: 'u1', username: 'me' };
  mockRow = row();
  at({ id: 'f1' });
  useDispatch.setState({
    filings: [], critiques: {}, critiquesLoading: {}, critiquesLoadingMore: {},
    critiquesHasMore: {}, critiquesOrder: {},
    certifiedIds: new Set(), savedIds: new Set(), certifiedCritiqueIds: new Set(),
    myVotes: {},
  } as never);
});

describe('the reader', () => {
  it('draws a dossier: its headline, its byline, and the essay', async () => {
    const { getByText } = await mount();
    expect(getByText('The Empty Room')).toBeTruthy();
    expect(getByText(/TOMASREYES/)).toBeTruthy();
    expect(getByText(/That is the argument/)).toBeTruthy();
  });

  it('says so plainly when the filing is gone', async () => {
    mockRow = null;
    const { getByText } = await mount();
    // Not a spinner that never stops, which is how an app tells somebody their
    // tap did nothing.
    expect(getByText('This filing is no longer here.')).toBeTruthy();
  });

  it('keeps an ENDED filing’s room, and names who ended it', async () => {
    // The row keeps its place so the critiques written underneath it survive —
    // which is the entire reason ending is not deleting. The tombstone has to
    // name the right party: the house is not the author.
    mockRow = row({
      ended_at: '2026-08-29T10:00:00Z', ended_by: 'house',
      title: null, body: '', full_content: null, comment_count: 4,
    });
    const { getByText, queryByText } = await mount();
    expect(queryByText('The Empty Room')).toBeNull();
    expect(getByText(/house/i)).toBeTruthy();
  });

  it('tells a WITHHELD filing’s author the truth about it', async () => {
    // RLS lets the author read their own while it is under review. A page that
    // said "no longer here" to the one person entitled to know would be the app
    // lying to them.
    mockUser = { id: 'u2', username: 'tomasreyes' };
    mockRow = row({ withheld_at: '2026-08-29T10:00:00Z' });
    const { queryByText } = await mount();
    expect(queryByText('This filing is no longer here.')).toBeNull();
  });

  it('offers a signed-out reader nothing to do, and still lets them read', async () => {
    mockUser = null;
    const { getByText, queryByLabelText } = await mount();
    expect(getByText('The Empty Room')).toBeTruthy();
    // No dock, and no More: every act behind them needs an account, and a
    // control that bounces you to a sign-in you did not ask for is worse than
    // no control.
    expect(queryByLabelText(/More, for this filing/)).toBeNull();
    expect(queryByLabelText(/^Critique$/)).toBeNull();
  });

  it('asks for the critiques in the order its own header shows', async () => {
    // These were written separately and disagreed: the header lit CERTIFIED and
    // the fetch defaulted to NEWEST, so the first thing anyone saw was a
    // date-ordered list under a CERTIFIED label — and pressing CERTIFIED did
    // nothing, because it was already selected.
    await mount();
    expect(useDispatch.getState().critiquesOrder.f1).toBe('CERTIFIED');
  });
});
