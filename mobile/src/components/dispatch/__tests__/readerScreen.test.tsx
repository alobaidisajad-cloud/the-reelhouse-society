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
import { Alert } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';

import FilingReader from '@/app/dispatch/[id]';
import { useDispatch } from '@/src/stores/dispatch';
import type { Filing } from '@/src/stores/dispatchTypes';

let mockRow: Record<string, unknown> | null = null;
const mockPushed: string[] = [];

jest.mock('@/src/utils/typedRouter', () => ({
  nav: { push: (p: string) => { mockPushed.push(p); }, replace: jest.fn(), back: jest.fn() },
}));
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
      // The WRITES, which this mock did not have. Without them `.insert()` was
      // undefined, every act threw, `writeThrough` treated it as a refusal and
      // rolled back — so the marks looked as though they had never been made.
      chain.insert = () => Promise.resolve({ data: [], error: null });
      chain.update = () => self();
      chain.delete = () => self();
      chain.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res);
      return chain;
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  },
}));

/**
 * The moderation sheet is the app's own, shared with logs and lounge messages,
 * and it mounts a gesture-handler root that has no native module here. It is
 * replaced by a stub that records the props it was given — which is the actual
 * claim being tested: not what the sheet offers, but that the READER hands it
 * this filing and this author, and mounts it at all only when there is somebody
 * to act on.
 */
const mockSheetProps: Array<Record<string, unknown>> = [];
jest.mock('@/src/components/moderation/ContentActionSheet', () => ({
  ContentActionSheet: (props: Record<string, unknown>) => {
    if (props.visible) mockSheetProps.push(props);
    return null;
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
  mockPushed.length = 0;
  mockSheetProps.length = 0;
  at({ id: 'f1' });
  useDispatch.setState({
    filings: [], opened: {}, critiques: {}, critiquesLoading: {}, critiquesLoadingMore: {},
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

  it('draws a ballot with its options, and marks one', async () => {
    mockRow = row({
      kind: 'ballot', title: 'What tonight?', body: 'What tonight?',
      options: [
        { film_id: 1, title: 'Tokyo Story', poster_path: null },
        { film_id: 2, title: 'Late Spring', poster_path: null },
      ],
      closes_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const { getByLabelText } = await mount();
    expect(getByLabelText(/Option 1 of 2. Tokyo Story/)).toBeTruthy();

    await act(async () => { fireEvent.press(getByLabelText(/Option 2 of 2/)); });
    // A vote is cast once and never changed, so it is recorded the moment it is
    // marked rather than after a round trip.
    expect(useDispatch.getState().myVotes.f1).toBe(1);
  });

  it('moves the marks from the docked bar', async () => {
    const { getByLabelText } = await mount();
    await act(async () => { fireEvent.press(getByLabelText('Certify')); });
    expect(useDispatch.getState().certifiedIds.has('f1')).toBe(true);

    await act(async () => { fireEvent.press(getByLabelText('Save')); });
    expect(useDispatch.getState().savedIds.has('f1')).toBe(true);
  });

  it('replaces the bar with the composer, and never stacks the two', async () => {
    // The action bar and the composer occupy the same place. Two docked rows
    // would take a third of a small phone and leave the writing in a slot.
    const { getByLabelText, queryByLabelText } = await mount();
    await act(async () => { fireEvent.press(getByLabelText('Write a critique')); });

    expect(getByLabelText('Your critique')).toBeTruthy();
    expect(queryByLabelText('Certify')).toBeNull();
  });

  it('sends a critique, and puts it on the page', async () => {
    const { getByLabelText } = await mount();
    await act(async () => { fireEvent.press(getByLabelText('Write a critique')); });
    await act(async () => {
      fireEvent.changeText(getByLabelText('Your critique'), 'That is the argument.');
    });
    await act(async () => { fireEvent.press(getByLabelText('File this critique')); });
    await act(async () => { await Promise.resolve(); });

    expect(useDispatch.getState().critiques.f1?.[0]?.body).toBe('That is the argument.');
  });

  it('re-reads the critiques when the order is changed, and not when it is not', async () => {
    const { getByLabelText } = await mount();
    expect(useDispatch.getState().critiquesOrder.f1).toBe('CERTIFIED');

    await act(async () => { fireEvent.press(getByLabelText('Order by newest')); });
    expect(useDispatch.getState().critiquesOrder.f1).toBe('NEWEST');

    // Pressing the one already chosen must not re-read: the rows are already
    // in that order, and the round trip would only make the list flash.
    useDispatch.setState({ critiquesOrder: { f1: 'MARKER' } } as never);
    await act(async () => { fireEvent.press(getByLabelText('Order by newest')); });
    expect(useDispatch.getState().critiquesOrder.f1).toBe('MARKER');
  });

  it('opens the series from the head of a dossier that is part of one', async () => {
    mockRow = row({ series_id: 's1', series_title: 'Ozu, in four parts', part_number: 2 });
    const { getByLabelText } = await mount();
    await act(async () => { fireEvent.press(getByLabelText(/Open the series/)); });
    expect(mockPushed.some((p) => p.startsWith('/dispatch/series/s1'))).toBe(true);
  });

  it('opens the app’s own action sheet on somebody else’s filing', async () => {
    // The same sheet a log and a stack open, so what a member learns once works
    // everywhere — rather than a third menu invented for this page.
    const { getByLabelText } = await mount();
    await act(async () => { fireEvent.press(getByLabelText('More, for this filing')); });

    expect(mockSheetProps).toHaveLength(1);
    expect(mockSheetProps[0].targetUserId).toBe('u2');
    expect(mockSheetProps[0].targetUsername).toBe('tomasreyes');
    expect(mockSheetProps[0].contentType).toBe('dispatch_post');
    expect(mockSheetProps[0].contentId).toBe('f1');
  });

  it('offers the AUTHOR one act instead, and never the sheet', async () => {
    // MORE is two different things. On your own filing there is one act —
    // withdraw it — and offering yourself "report" and "block" would be the
    // page not knowing who is reading it.
    const alerts: Array<[string, string, Array<{ text: string; onPress?: () => void }>]> = [];
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(
      ((t: string, m: string, b: never) => { alerts.push([t, m, b]); }) as never,
    );
    mockUser = { id: 'u2', username: 'tomasreyes' };

    const { getByLabelText } = await mount();
    await act(async () => { fireEvent.press(getByLabelText('More, for this filing')); });

    expect(mockSheetProps).toHaveLength(0);
    expect(alerts[0][0]).toBe('Withdraw this filing?');
    // The confirmation says what actually happens. "Delete?" would be a lie
    // about a row that is not deleted.
    expect(alerts[0][1]).toMatch(/critiques underneath it stay/);

    await act(async () => { alerts[0][2].find((b) => b.text === 'Withdraw')?.onPress?.(); });
    // Asserted on `opened`, not `filings` — this reader was reached by the
    // filing's own ADDRESS, so the feed does not hold it, and that is precisely
    // the case in which withdrawing used to do nothing at all.
    expect(useDispatch.getState().opened.f1?.endedBy).toBe('author');
    expect(useDispatch.getState().filings).toHaveLength(0);
    spy.mockRestore();
  });

  it('withdraws a filing reached by its own address, and shows the tombstone', async () => {
    // The whole failure in one test: no feed loaded, so `end` found nothing to
    // act on and returned — silently, with the page unchanged and no error.
    const alerts: Array<[string, string, Array<{ text: string; onPress?: () => void }>]> = [];
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(
      ((t: string, m: string, b: never) => { alerts.push([t, m, b]); }) as never,
    );
    mockUser = { id: 'u2', username: 'tomasreyes' };

    const { getByLabelText, queryByText, getByText } = await mount();
    expect(getByText('The Empty Room')).toBeTruthy();

    await act(async () => { fireEvent.press(getByLabelText('More, for this filing')); });
    await act(async () => { alerts[0][2].find((b) => b.text === 'Withdraw')?.onPress?.(); });

    // The words are gone from the page the member is standing on, not only from
    // a feed they are not looking at.
    expect(queryByText('The Empty Room')).toBeNull();
    spy.mockRestore();
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
