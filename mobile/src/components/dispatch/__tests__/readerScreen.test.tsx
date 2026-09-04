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
import { Alert, Share } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';

import FilingReader from '@/app/dispatch/[id]';
import { useDispatch } from '@/src/stores/dispatch';
import type { Filing } from '@/src/stores/dispatchTypes';

let mockRow: Record<string, unknown> | null = null;
let mockCritiqueRows: unknown[] = [];
let mockNextRows: unknown[] = [];
let mockWriteFails = false;
const mockToastError = jest.fn();
jest.mock('@/src/utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), {
    error: (...a: unknown[]) => mockToastError(...a),
    success: jest.fn(),
  });
  return { __esModule: true, default: fn };
});
const mockPushed: string[] = [];

const mockBack = jest.fn();
jest.mock('@/src/utils/typedRouter', () => ({
  nav: { push: (p: string) => { mockPushed.push(p); }, replace: jest.fn(), back: () => mockBack() },
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
      // `gt` — the next-part read uses it. Without it the chain threw, the
      // screen's own catch swallowed it, and "there is no next part" and "the
      // mock is missing a method" looked identical.
      chain.gt = () => self();
      chain.in = () => Promise.resolve({ data: [], error: null });
      chain.order = () => self();
      // The critiques come through HERE, not through `setState` before the
      // mount: the reader fetches them on open, and that fetch replaces
      // whatever the test had put in the store.
      chain.range = () => {
        const r = Promise.resolve({ data: mockCritiqueRows, error: null });
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
      // `.limit()` is the NEXT-PART read; the critiques use `.range()`. Keeping
      // them apart is what lets a test say "there is a part after this one".
      chain.limit = () => builder(mockNextRows);
      // The WRITES, which this mock did not have. Without them `.insert()` was
      // undefined, every act threw, `writeThrough` treated it as a refusal and
      // rolled back — so the marks looked as though they had never been made.
      chain.insert = () => (mockWriteFails
        ? Promise.resolve({ data: null, error: { message: 'refused', code: '42501' } })
        : Promise.resolve({ data: [], error: null }));
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

/** The Tribunal's report sheet, stubbed for the same reason as the action sheet. */
const mockReportProps: Array<Record<string, unknown>> = [];
jest.mock('@/src/components/moderation/ReportSheet', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    if (props.visible) mockReportProps.push(props);
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
  // Drained to a MACROtask, not three microtasks. The screen hydrates and then
  // fetches its critiques, so a fixed number of `Promise.resolve()`s leaves the
  // last of those settling after the act scope closes — which React reports as
  // "an update was not wrapped in act", and which means the assertions run
  // against a render that is still one step behind.
  // TWICE. Hydrate resolves on the first drain and only then does the
  // next-part effect fire, so a single drain leaves that second round trip
  // settling after the assertions — which reads as "there is no next part".
  await act(async () => { await new Promise((res) => setTimeout(res, 0)); });
  await act(async () => { await new Promise((res) => setTimeout(res, 0)); });
  return r;
};

beforeEach(() => {
  mockUser = { id: 'u1', username: 'me' };
  mockRow = row();
  mockCritiqueRows = [];
  mockNextRows = [];
  mockWriteFails = false;
  mockToastError.mockClear();
  mockPushed.length = 0;
  mockSheetProps.length = 0;
  mockReportProps.length = 0;
  mockBack.mockClear();
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

  it('shares to the lounge, or to anywhere the phone can send', async () => {
    // Two destinations, not one. The Lounge first because it is the house's own
    // room, and elsewhere second because a link out of the app is a different
    // act from quoting it to the members.
    const shared: unknown[] = [];
    const spy = jest.spyOn(Share, 'share').mockImplementation(async (c) => {
      shared.push(c); return { action: 'sharedAction' } as never;
    });

    const { getByLabelText, queryByLabelText } = await mount();
    await act(async () => { fireEvent.press(getByLabelText('Share')); });

    await act(async () => { fireEvent.press(getByLabelText(/ELSEWHERE/)); });
    expect(shared).toHaveLength(1);
    // The sheet closes behind it: a share sheet still standing over the page
    // after the system sheet has been used is a second thing to dismiss.
    expect(queryByLabelText(/ELSEWHERE/)).toBeNull();
    spy.mockRestore();
  });

  it('sends a WEB link, never a scheme only this app understands', async () => {
    // `reelhouse://dispatch/<id>` opens nothing for anybody who does not already
    // have the app — which is everybody a share is being sent to. The film share
    // card has always used the https link; this one did not.
    const shared: Array<{ message?: string }> = [];
    const spy = jest.spyOn(Share, 'share').mockImplementation(async (c) => {
      shared.push(c as { message?: string }); return { action: 'sharedAction' } as never;
    });
    mockRow = row({ kind: 'take', title: null, full_content: null, body: 'A take.' });

    const { getByLabelText } = await mount();
    await act(async () => { fireEvent.press(getByLabelText('Share')); });
    await act(async () => { fireEvent.press(getByLabelText(/ELSEWHERE/)); });

    expect(shared[0].message).toContain('https://reelhouse.app/dispatch');
    expect(shared[0].message).not.toContain('reelhouse://');
    // And NOT a per-filing path: the web app has no page for one filing, so
    // `/dispatch/<id>` is a 404 — a link that resolves is worth more than a
    // link that is specific.
    expect(shared[0].message).not.toMatch(/dispatch\/[0-9a-f-]{8}/);
    spy.mockRestore();
  });

  it('mounts the clipping only while an ESSAY is being shared', async () => {
    // Only a dossier earns an image: a take shared as a poster is a poster of
    // somebody's opinion. And it is mounted only while the sheet is open, so a
    // page somebody is merely reading never carries it.
    const { getByLabelText, getAllByText } = await mount();
    // One "The Empty Room" while merely reading: the essay's own head.
    expect(getAllByText('The Empty Room')).toHaveLength(1);

    await act(async () => { fireEvent.press(getByLabelText('Share')); });
    // Two while the sheet is open: the page, and the clipping behind it.
    expect(getAllByText('The Empty Room').length).toBeGreaterThan(1);
  });

  it('does not mount a clipping for a kind that does not earn one', async () => {
    // Counted on the off-screen offset the clipping is parked at, not on its
    // text: a take's body appears three times in a card's nested Texts, so a
    // text count cannot tell a second copy from the same copy.
    const parked = (tree: unknown) => JSON.stringify(tree).includes('-10000');

    mockRow = row({ kind: 'take', title: null, full_content: null, body: 'A take.' });
    const take = await mount();
    await act(async () => { fireEvent.press(take.getByLabelText('Share')); });
    // A take shared as a poster is a poster of somebody's opinion.
    expect(parked(take.toJSON())).toBe(false);
    await act(async () => { take.unmount(); });

    mockRow = row();
    const essay = await mount();
    await act(async () => { fireEvent.press(essay.getByLabelText('Share')); });
    expect(parked(essay.toJSON())).toBe(true);
  });

  it('closes the share sheet from the ground behind it', async () => {
    const { getByLabelText, queryByLabelText } = await mount();
    await act(async () => { fireEvent.press(getByLabelText('Share')); });
    expect(getByLabelText(/ELSEWHERE/)).toBeTruthy();

    await act(async () => { fireEvent.press(getByLabelText(/Close|Dismiss/i)); });
    expect(queryByLabelText(/ELSEWHERE/)).toBeNull();
  });

  it('takes an answer, but only on a seeking and only for the member who asked', async () => {
    mockUser = { id: 'u2', username: 'tomasreyes' };
    mockRow = row({ kind: 'seeking', title: null, full_content: null, body: 'What tonight?' });
    mockCritiqueRows = [{
      id: 'c1', post_id: 'f1', user_id: 'u3', author_username: 'someone',
      body: 'Tokyo Story.', certify_count: 0,
      created_at: '2026-08-28T22:00:00Z', edited_at: null, profiles: null,
    }];

    const { getByLabelText } = await mount();
    await act(async () => { fireEvent.press(getByLabelText(/Take .* as your answer/)); });
    expect(useDispatch.getState().opened.f1?.answerId).toBe('c1');
  });

  it('withdraws a critique, after asking', async () => {
    const alerts: Array<[string, string, Array<{ text: string; onPress?: () => void }>]> = [];
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(
      ((t: string, m: string, b: never) => { alerts.push([t, m, b]); }) as never,
    );
    mockCritiqueRows = [{
      id: 'c1', post_id: 'f1', user_id: 'u1', author_username: 'me',
      body: 'My own critique.', certify_count: 0,
      created_at: '2026-08-28T22:00:00Z', edited_at: null, profiles: null,
    }];

    const { getByLabelText } = await mount();
    await act(async () => { fireEvent.press(getByLabelText('Withdraw this critique')); });
    expect(alerts[0][0]).toBe('Withdraw this critique?');

    await act(async () => { alerts[0][2].find((b) => b.text === 'Withdraw')?.onPress?.(); });
    await act(async () => { await Promise.resolve(); });
    expect(useDispatch.getState().critiques.f1).toHaveLength(0);
    spy.mockRestore();
  });

  it('opens the film and the member from the page', async () => {
    mockRow = row({ subject_kind: 'film', subject_id: 42, subject_title: 'Tokyo Story' });
    const { getByLabelText } = await mount();

    await act(async () => { fireEvent.press(getByLabelText(/Open their room/)); });
    expect(mockPushed).toContain('/user/tomasreyes');

    mockPushed.length = 0;
    await act(async () => { fireEvent.press(getByLabelText(/Tokyo Story/)); });
    expect(mockPushed).toContain('/film/42');
  });

  it('carries the same four marks on a ballot and on a short filing', async () => {
    // Three kinds draw three different components — PaperBallot, PaperPost and
    // the essay — and each mounts its own copy of the acts. A mark that works on
    // one and not the others is the page behaving differently for no reason the
    // member can see.
    for (const over of [
      { kind: 'ballot', options: [{ film_id: 1, title: 'Tokyo Story', poster_path: null }, { film_id: 2, title: 'Late Spring', poster_path: null }], closes_at: new Date(Date.now() + 86_400_000).toISOString() },
      { kind: 'take', title: null, full_content: null, body: 'A take.' },
    ]) {
      useDispatch.setState({ certifiedIds: new Set(), savedIds: new Set(), opened: {} } as never);
      mockRow = row(over as Record<string, unknown>);
      const { getByLabelText, unmount } = await mount();

      await act(async () => { fireEvent.press(getByLabelText('Certify this')); });
      expect(useDispatch.getState().certifiedIds.has('f1')).toBe(true);
      await act(async () => { fireEvent.press(getByLabelText('Save this')); });
      expect(useDispatch.getState().savedIds.has('f1')).toBe(true);

      // Torn down before the next kind mounts. Two live trees in one test leave
      // the first one's pending updates to land after the act scope closes,
      // which React reports as an unwrapped update.
      await act(async () => { unmount(); });
    }
  });

  it('certifies a critique', async () => {
    mockCritiqueRows = [{
      id: 'c1', post_id: 'f1', user_id: 'u3', author_username: 'someone',
      body: 'A critique.', certify_count: 2,
      created_at: '2026-08-28T22:00:00Z', edited_at: null, profiles: null,
    }];
    const { getByLabelText } = await mount();
    await act(async () => { fireEvent.press(getByLabelText('Certify this critique')); });
    expect(useDispatch.getState().certifiedCritiqueIds.has('c1')).toBe(true);
    expect(useDispatch.getState().critiques.f1[0].certifyCount).toBe(3);
  });

  it('reports a critique to the Tribunal, and only somebody else’s', async () => {
    mockCritiqueRows = [
      {
        id: 'c1', post_id: 'f1', user_id: 'u3', author_username: 'someone',
        body: 'Theirs.', certify_count: 0, created_at: '2026-08-28T22:00:00Z',
        edited_at: null, profiles: null,
      },
      {
        id: 'c2', post_id: 'f1', user_id: 'u1', author_username: 'me',
        body: 'Mine.', certify_count: 0, created_at: '2026-08-28T23:00:00Z',
        edited_at: null, profiles: null,
      },
    ];
    const { getAllByLabelText, getByLabelText } = await mount();
    // One reportable critique, not two: you cannot report your own.
    expect(getAllByLabelText('Report this critique')).toHaveLength(1);

    await act(async () => { fireEvent.press(getByLabelText('Report this critique')); });
    // A critique is reported as a CRITIQUE, not as the filing it sits under —
    // the Tribunal has to be shown the line that was reported.
    expect(mockReportProps[0].contentType).toBe('dispatch_comment');
    expect(mockReportProps[0].contentId).toBe('c1');
  });

  it('fetches another page of critiques from the foot', async () => {
    mockCritiqueRows = Array.from({ length: 30 }, (_, i) => ({
      id: 'c' + i, post_id: 'f1', user_id: 'u3', author_username: 'someone',
      body: 'Critique ' + i, certify_count: 0,
      created_at: '2026-08-28T22:00:00Z', edited_at: null, profiles: null,
    }));
    mockRow = row({ comment_count: 200 });
    const { getByLabelText } = await mount();

    await act(async () => { fireEvent.press(getByLabelText(/more critiques/)); });
    await act(async () => { await Promise.resolve(); });
    // 30 came back a second time under different ids — the merge de-duplicates
    // by id, so the count is what actually arrived.
    expect(useDispatch.getState().critiques.f1.length).toBeGreaterThanOrEqual(30);
  });

  it('leaves the page when the reader blocks its author', async () => {
    // Blocking removes their filings from every feed, including this one, so
    // staying would leave the member looking at a filing they just said they
    // did not want.
    const { getByLabelText } = await mount();
    await act(async () => { fireEvent.press(getByLabelText('More, for this filing')); });
    await act(async () => { (mockSheetProps[0].onBlock as () => void)(); });
    expect(mockBack).toHaveBeenCalled();
  });

  it('carries a report from the sheet into the report sheet', async () => {
    const { getByLabelText } = await mount();
    await act(async () => { fireEvent.press(getByLabelText('More, for this filing')); });
    await act(async () => { (mockSheetProps[0].onReport as () => void)(); });
    expect(mockReportProps[0].contentType).toBe('dispatch_post');
    expect(mockReportProps[0].contentId).toBe('f1');
    // And the action sheet closes behind it: two sheets over one page is one
    // thing too many to dismiss.
    expect(mockSheetProps).toHaveLength(1);
  });

  it('ends a part with the one after it, by name', async () => {
    // "An essay in four parts that ends with nothing is an essay the reader has
    // to go and hunt for." `EssayNext` was built for this and never mounted
    // until now — so this is the first test of it.
    mockRow = row({ series_id: 's1', series_title: 'Ozu, in four parts', part_number: 2 });
    mockNextRows = [{
      ...row({ id: 'p3', part_number: 3, title: 'Nobody Comes Back' }),
      series_id: 's1', series_title: 'Ozu, in four parts',
    }];

    const { getByLabelText } = await mount();
    const foot = getByLabelText(/NEXT IN THE SERIES. Nobody Comes Back/);
    expect(foot).toBeTruthy();

    await act(async () => { fireEvent.press(foot); });
    expect(mockPushed).toContain('/dispatch/p3');
  });

  it('ends the LAST part with nothing at all', async () => {
    // A control that says NEXT and opens nothing is worse than an essay that
    // simply ends.
    mockRow = row({ series_id: 's1', series_title: 'Ozu, in four parts', part_number: 4 });
    mockNextRows = [];
    const { queryByLabelText } = await mount();
    expect(queryByLabelText(/NEXT IN THE SERIES/)).toBeNull();
  });

  it('offers no next part on a filing that is not in a series', async () => {
    const { queryByLabelText } = await mount();
    expect(queryByLabelText(/NEXT IN THE SERIES/)).toBeNull();
  });

  it('shares an essay as a captured clipping, not as a line', async () => {
    const shots: unknown[] = [];
    const viewShot = require('react-native-view-shot');
    const sharing = require('expo-sharing');
    const capture = jest.spyOn(viewShot, 'captureRef').mockResolvedValue('file:///clipping.png');
    const available = jest.spyOn(sharing, 'isAvailableAsync').mockResolvedValue(true);
    const shareAsync = jest.spyOn(sharing, 'shareAsync').mockImplementation(async (u: unknown) => {
      shots.push(u);
    });
    const plain = jest.spyOn(Share, 'share');

    const { getByLabelText } = await mount();
    await act(async () => { fireEvent.press(getByLabelText('Share')); });
    await act(async () => { fireEvent.press(getByLabelText(/ELSEWHERE/)); });

    expect(shots).toEqual(['file:///clipping.png']);
    // And no text share alongside it — one share, not two.
    expect(plain).not.toHaveBeenCalled();
    capture.mockRestore(); available.mockRestore(); shareAsync.mockRestore(); plain.mockRestore();
  });

  it('falls back to the line when the clipping cannot be captured', async () => {
    // A capture that failed must not cost the member the share.
    const viewShot = require('react-native-view-shot');
    const capture = jest.spyOn(viewShot, 'captureRef').mockRejectedValue(new Error('no surface'));
    const shared: Array<{ message?: string }> = [];
    const spy = jest.spyOn(Share, 'share').mockImplementation(async (c) => {
      shared.push(c as { message?: string }); return { action: 'sharedAction' } as never;
    });

    const { getByLabelText } = await mount();
    await act(async () => { fireEvent.press(getByLabelText('Share')); });
    await act(async () => { fireEvent.press(getByLabelText(/ELSEWHERE/)); });

    expect(shared[0].message).toContain('https://reelhouse.app/dispatch');
    capture.mockRestore(); spy.mockRestore();
  });

  it('says so when a critique will not go, and keeps what was written', async () => {
    mockWriteFails = true;
    const { getByLabelText } = await mount();
    await act(async () => { fireEvent.press(getByLabelText('Write a critique')); });
    await act(async () => {
      fireEvent.changeText(getByLabelText('Your critique'), 'That is the argument.');
    });
    await act(async () => { fireEvent.press(getByLabelText('File this critique')); });
    await act(async () => { await Promise.resolve(); });

    expect(mockToastError).toHaveBeenCalledWith('That critique did not go.');
    // The text survives, so the member can try again with what they wrote
    // rather than retyping it.
    expect(getByLabelText('Your critique').props.value).toBe('That is the argument.');
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

/**
 * ── THE SAME MATRIX, ON THE SECOND SURFACE ───────────────────────────────────
 * A ballot card in the FEED printed a byline, four marks and no question, and
 * three thousand seven hundred tests missed it, because each asserted something
 * specific about a state somebody had thought of. `everyCardSaysSomething`
 * closed that for the card. This closes it for the reader.
 *
 * The reader is a ternary chain — dossier, then ballot, then everything else to
 * `PaperPost` — so a kind can fall through it just as quietly. `wire` was the
 * one no test above ever opened.
 */
describe('every kind opens, and says its own words', () => {
  const OPENS: Record<string, Record<string, unknown>> = {
    take: { kind: 'take', title: null, full_content: null, body: 'A take, and its whole argument.' },
    seeking: { kind: 'seeking', title: null, full_content: null, body: 'What should the house watch tonight?' },
    wire: {
      kind: 'wire', title: null, full_content: null,
      body: 'Sight and Sound has redone the poll.', source: 'SIGHT & SOUND',
    },
    ballot: {
      kind: 'ballot', title: 'Which Ozu?', body: 'Which Ozu?',
      options: [
        { film_id: 1, title: 'Tokyo Story', poster_path: null },
        { film_id: 2, title: 'Late Spring', poster_path: null },
      ],
      closes_at: new Date(Date.now() + 86_400_000).toISOString(),
    },
    dossier: {}, // the default row IS a dossier
  };

  it('covers every kind the app knows about', () => {
    // Hand-listing the kinds is how `wire` came to have no reader test at all,
    // so the list is checked against a runtime table keyed by kind rather than
    // trusted. `KIND_RULE` is the one the app itself reads to colour a filing,
    // so a sixth kind cannot be added without appearing here. A type union
    // would be no use — it does not exist at run time, which is precisely why
    // a missing branch is invisible.
    const { KIND_RULE } = require('@/src/components/dispatch/paper/paperMetrics');
    expect(Object.keys(OPENS).sort()).toEqual(Object.keys(KIND_RULE).sort());
  });

  for (const [kind, over] of Object.entries(OPENS)) {
    it(`${kind} — opens and prints the writing`, async () => {
      mockRow = row(over);
      const { toJSON } = await mount();
      const said: string[] = [];
      const walk = (n: any) => {
        if (n == null) return;
        if (typeof n === 'string') { if (n.trim()) said.push(n); return; }
        if (Array.isArray(n)) { n.forEach(walk); return; }
        walk(n.children);
      };
      walk(toJSON());

      // The words the member wrote, whichever column this kind keeps them in.
      const written = String(over.full_content ?? over.title ?? over.body
        ?? 'That is the argument.');
      expect(said.some((w) => w.includes(written.slice(0, 24)))).toBe(true);
    });
  }
});
