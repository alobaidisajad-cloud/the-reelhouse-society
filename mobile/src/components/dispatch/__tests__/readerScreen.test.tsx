/**
 * readerScreen.test.tsx — the one screen that reads all five kinds: the page a
 * notification opens, a share link lands on, and every feed card pushes to.
 * ─────────────────────────────────────────────────────────────────────────────
 * Its states are different pages, and these are what a member sees when
 * something has gone wrong, the ones nobody looks at:
 *
 *   missing    a link to something the house removed entirely
 *   ended      withdrawn, but the critiques under it survive
 *   withheld   under review, readable by its AUTHOR and nobody else
 *   signed out public to read, and no act offered
 *
 * The store is real; only the network and the session are mocked, so the
 * screen is tested against the store, not against an idea of it.
 */
import React, { act } from 'react';
import { Alert, ScrollView, Share } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';

import FilingReader from '@/app/dispatch/[id]';
import { useDispatch } from '@/src/stores/dispatch';
import { useOfflineQueueStore } from '@/src/stores/offlineQueueStore';
import { useBlockStore } from '@/src/stores/blockStore';
import { toFiling } from '@/src/stores/dispatchTypes';

let mockRow: Record<string, unknown> | null = null;
/** The filing's own read fails, as it does offline. */
let mockRowFails = false;
let mockCritiqueRows: unknown[] = [];
let mockNextRows: unknown[] = [];
let mockWriteFails = false;
/** No connection: the write throws as fetch does, and the store queues it. */
let mockWriteOffline = false;
const mockToastError = jest.fn();
const mockToastSuccess = jest.fn();
jest.mock('@/src/utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), {
    error: (...a: unknown[]) => mockToastError(...a),
    success: (...a: unknown[]) => mockToastSuccess(...a),
    info: jest.fn(),
  });
  return { __esModule: true, default: fn };
});
const mockPushed: string[] = [];

const mockBack = jest.fn();
/** What the block store wrote: a BLOCK or MUTE row that writes nothing is a dead control. */
const mockUpserts: { table: string; row: Record<string, unknown> }[] = [];
jest.mock('@/src/utils/typedRouter', () => ({
  nav: { push: (p: string) => { mockPushed.push(p); }, replace: jest.fn(), back: () => mockBack() },
}));
let mockUser: { id: string; username: string } | null = { id: 'u1', username: 'me' };

jest.mock('@/src/stores/auth', () => ({
  // Called both with a selector and bare, somewhere in this tree.
  useAuthStore: Object.assign(
    (sel?: (s: unknown) => unknown) =>
      (typeof sel === 'function' ? sel({ user: mockUser }) : { user: mockUser }),
    { getState: () => ({ user: mockUser }), setState: jest.fn(), subscribe: jest.fn() },
  ),
}));

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.upsert = (row: Record<string, unknown>) => { mockUpserts.push({ table, row }); return Promise.resolve({ data: null, error: null }); };
      /** Set by `update`, so `then` can answer with the row it changed. */
      let updated = false;
      chain.select = () => self();
      chain.eq = () => self();
      chain.is = () => self();
      // The next-part read's; missing, the screen's catch hides the throw.
      chain.gt = () => self();
      chain.in = () => Promise.resolve({ data: [], error: null });
      chain.order = () => self();
      // The critiques arrive HERE: the reader's own fetch replaces the store's.
      chain.range = () => {
        const r = Promise.resolve({ data: mockCritiqueRows, error: null });
        return Object.assign(r, { abortSignal: () => r });
      };
      // A BUILDER, not a bare result: every store read calls `.abortSignal()`
      // on it, and a throw there renders "could not be reached".
      const builder = (data: unknown, error: unknown = null) => {
        const r = Promise.resolve({ data, error });
        return Object.assign(r, { abortSignal: () => r });
      };
      chain.maybeSingle = () => (mockRowFails
        ? builder(null, { message: 'TypeError: Network request failed' })
        : builder(mockRow));
      chain.limit = () => builder(mockNextRows); // the next part (critiques use range)
      // Writes: missing, every act would roll back as if refused.
      chain.insert = () => (mockWriteOffline
        ? Promise.reject(Object.assign(new TypeError('Network request failed'), { name: 'TypeError' }))
        : mockWriteFails
        ? Promise.resolve({ data: null, error: { message: 'refused', code: '42501' } })
        : Promise.resolve({ data: [], error: null }));
      // An UPDATE or DELETE asks for its rows back (`.select('id')`): a row RLS
      // refuses matches nothing, with a 200. So a landed one answers a row.
      chain.update = () => { updated = true; return self(); };
      chain.delete = () => { updated = true; return self(); };
      chain.then = (res: (v: unknown) => unknown) =>
        Promise.resolve(updated ? { data: [{ id: 'row' }], error: null } : { data: [], error: null })
          .then(res);
      return chain;
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  },
}));

/** The action sheet (no native gesture root here), stubbed to record what it is handed. */
const mockSheetProps: Record<string, unknown>[] = [];
jest.mock('@/src/components/moderation/ContentActionSheet', () => ({
  ContentActionSheet: (props: Record<string, unknown>) => {
    if (props.visible) mockSheetProps.push(props);
    return null;
  },
}));

/** The Tribunal's report sheet, stubbed for the same reason as the action sheet. */
const mockReportProps: Record<string, unknown>[] = [];
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
  // Two MACROtask drains: hydrate lands on the first, and only then does the
  // next-part read start. Fewer, and the assertions run a step behind.
  await act(async () => { await new Promise((res) => setTimeout(res, 0)); });
  await act(async () => { await new Promise((res) => setTimeout(res, 0)); });
  return r;
};

beforeEach(() => {
  mockUser = { id: 'u1', username: 'me' };
  mockRow = row();
  mockRowFails = false;
  mockCritiqueRows = [];
  mockNextRows = [];
  mockWriteFails = false;
  mockWriteOffline = false;
  mockToastSuccess.mockClear();
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
    expect(getByText('This filing is no longer here.')).toBeTruthy(); // not a spinner
  });

  it('says a filing it could not reach was not reached, and TRY AGAIN reads it again', async () => {
    // Opened from a notice with no signal: "withdrawn by its author" would be
    // a claim about the filing that the failed read cannot make.
    mockRowFails = true;
    const { getByText, queryByText, getByLabelText } = await mount();
    expect(queryByText('This filing is no longer here.')).toBeNull();
    expect(getByText('This filing could not be reached.')).toBeTruthy();

    mockRowFails = false;
    await act(async () => { fireEvent.press(getByLabelText('TRY AGAIN')); });
    await act(async () => { await new Promise((res) => setTimeout(res, 0)); });
    await act(async () => { await new Promise((res) => setTimeout(res, 0)); });
    expect(getByText('The Empty Room')).toBeTruthy();
  });

  it('an essay opened from the feed whose whole could not be read says so — never ends at its opening', async () => {
    // The feed carries only the 500-character opening. With the full read
    // failed, the reader drew that opening as though the essay ended there.
    useDispatch.setState({ filings: [toFiling(row({ full_content: null, body: 'Ozu frames a room.' }) as never)] } as never);
    mockRowFails = true;
    const { getByText, queryByText, getByLabelText } = await mount();
    expect(getByText(/Ozu frames a room\./)).toBeTruthy();
    expect(getByText('The rest of this essay could not be reached.')).toBeTruthy();

    mockRowFails = false;
    await act(async () => { fireEvent.press(getByLabelText('Read the whole essay again')); });
    await act(async () => { await new Promise((res) => setTimeout(res, 0)); });
    await act(async () => { await new Promise((res) => setTimeout(res, 0)); });
    expect(queryByText('The rest of this essay could not be reached.')).toBeNull();
    expect(getByText(/That is the argument\./)).toBeTruthy();
  });

  it('keeps an ENDED filing’s room, and names who ended it', async () => {
    // Its critiques survive; the tombstone names the house, not the author.
    mockRow = row({
      ended_at: '2026-08-29T10:00:00Z', ended_by: 'house',
      title: null, body: '', full_content: null, comment_count: 4,
    });
    const { getByText, queryByText } = await mount();
    expect(queryByText('The Empty Room')).toBeNull();
    expect(getByText(/house/i)).toBeTruthy();
  });

  it.each([
    ['an essay', {}],
    ['a take', { kind: 'take', title: null, full_content: null, body: 'A take, held.' }],
  ])('tells the author of %s held WITHHELD the truth about it', async (_kind, over) => {
    // RLS lets its author read it; "no longer here" would be a lie to them. It
    // only said what it was not: the essay, drawn by its own head and body,
    // carried no word of being withheld and read as though it were published.
    mockUser = { id: 'u2', username: 'tomasreyes' };
    mockRow = row({ withheld_at: '2026-08-29T10:00:00Z', ...over });
    const { queryByText, getByText } = await mount();
    expect(queryByText('This filing is no longer here.')).toBeNull();
    expect(getByText('Only you can see this while the house reads it.')).toBeTruthy();
  });

  it('offers a signed-out reader nothing to do, and still lets them read', async () => {
    mockUser = null;
    const { getByText, queryByLabelText } = await mount();
    expect(getByText('The Empty Room')).toBeTruthy();
    // No dock and no More: every act behind them needs an account.
    expect(queryByLabelText(/More, for this filing/)).toBeNull();
    expect(queryByLabelText(/^Critique$/)).toBeNull();
    // The dock by its own controls' names — CRITIQUE there is "Write a critique",
    // so the line above alone could never have seen a dock drawn for a stranger.
    expect(queryByLabelText(/^Write a critique/)).toBeNull();
    expect(queryByLabelText(/^Certify this filing/)).toBeNull();
    expect(queryByLabelText(/^(Save|Saved)$/)).toBeNull();
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
    // Cast once, never changed: recorded on the mark, not after a round trip.
    expect(useDispatch.getState().myVotes.f1).toBe(1);
  });

  it('an open ballot says when it closes — ahead, never "moments ago"', async () => {
    // timeAgo clamps the future to now, so every open ballot read
    // "CLOSES MOMENTS AGO" until the day it closed.
    mockRow = row({
      kind: 'ballot', title: 'What tonight?', body: 'What tonight?',
      options: [
        { film_id: 1, title: 'Tokyo Story', poster_path: null },
        { film_id: 2, title: 'Late Spring', poster_path: null },
      ],
      closes_at: new Date(Date.now() + 3 * 86_400_000 + 60_000).toISOString(),
    });
    const { getByText, queryByText } = await mount();
    expect(getByText('CLOSES IN 3 DAYS')).toBeTruthy();
    expect(queryByText(/MOMENTS AGO/)).toBeNull();
  });

  it('moves the marks from the docked bar', async () => {
    const { getByLabelText } = await mount();
    // The dock names what it certifies — the page above has its own control.
    await act(async () => { fireEvent.press(getByLabelText(/^Certify this filing/)); });
    expect(useDispatch.getState().certifiedIds.has('f1')).toBe(true);

    await act(async () => { fireEvent.press(getByLabelText('Save')); });
    expect(useDispatch.getState().savedIds.has('f1')).toBe(true);
  });

  it('replaces the bar with the composer, and never stacks the two', async () => {
    const { getByLabelText, queryByLabelText } = await mount();
    await act(async () => { fireEvent.press(getByLabelText('Write a critique')); });

    expect(getByLabelText('Your critique')).toBeTruthy();
    expect(queryByLabelText(/^Certify this filing/)).toBeNull();
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

    // The order already chosen does not re-read (the list would only flash).
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

  it('prints the part in numerals and says it as a number', async () => {
    // The design and the writing room's preview set `PART II`; the reader set
    // `PART 2`. A screen reader is handed the number, which it cannot misread.
    mockRow = row({ series_id: 's1', series_title: 'Ozu, in four parts', part_number: 2 });
    const { getByText, getByLabelText } = await mount();
    expect(getByText('PART II OF OZU, IN FOUR PARTS')).toBeTruthy();
    expect(getByLabelText('Part 2 of Ozu, in four parts. Open the series.')).toBeTruthy();
  });

  it('opens the app’s own action sheet on somebody else’s filing', async () => {
    // The same sheet a log and a stack open.
    const { getByLabelText } = await mount();
    await act(async () => { fireEvent.press(getByLabelText('More, for this filing')); });

    expect(mockSheetProps).toHaveLength(1);
    expect(mockSheetProps[0].targetUserId).toBe('u2');
    expect(mockSheetProps[0].targetUsername).toBe('tomasreyes');
    expect(mockSheetProps[0].contentType).toBe('dispatch_post');
    expect(mockSheetProps[0].contentId).toBe('f1');
  });

  it('offers the AUTHOR their own two acts, and never the sheet', async () => {
    // On your own filing, More is amend or withdraw (never "report" yourself);
    // withdrawing asks again, as one tap must never reach it.
    const alerts: [string, string, { text: string; onPress?: () => void }[]][] = [];
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(
      ((t: string, m: string, b: never) => { alerts.push([t, m, b]); }) as never,
    );
    mockUser = { id: 'u2', username: 'tomasreyes' };

    const { getByLabelText } = await mount();
    await act(async () => { fireEvent.press(getByLabelText('More, for this filing')); });

    expect(mockSheetProps).toHaveLength(0);
    expect(alerts[0][0]).toBe('This filing');
    expect(alerts[0][2].map((b) => b.text))
      .toEqual(['Amend it', 'Withdraw it', 'Keep it as it is']);

    // Withdrawing asks again, in the words that say what actually happens.
    await act(async () => { alerts[0][2].find((b) => b.text === 'Withdraw it')?.onPress?.(); });
    expect(alerts[1][0]).toBe('Withdraw this filing?');
    // "Delete?" would be a lie about a row that is not deleted.
    expect(alerts[1][1]).toMatch(/critiques underneath it stay/);

    await act(async () => { alerts[1][2].find((b) => b.text === 'Withdraw')?.onPress?.(); });
    // On `opened`: reached by its address, the filing is not in the feed.
    expect(useDispatch.getState().opened.f1?.endedBy).toBe('author');
    expect(useDispatch.getState().filings).toHaveLength(0);
    spy.mockRestore();
  });

  it('opens the desk the filing was written at, on the filing itself', async () => {
    const alerts: [string, string, { text: string; onPress?: () => void }[]][] = [];
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(
      ((t: string, m: string, b: never) => { alerts.push([t, m, b]); }) as never,
    );
    mockUser = { id: 'u2', username: 'tomasreyes' };
    mockPushed.length = 0;

    const { getByLabelText } = await mount();
    await act(async () => { fireEvent.press(getByLabelText('More, for this filing')); });
    await act(async () => { alerts[0][2].find((b) => b.text === 'Amend it')?.onPress?.(); });

    // The essay desk, with the id that makes it AMEND IT.
    expect(mockPushed).toEqual(['/dispatch/compose?kind=dossier&edit=f1']);
    spy.mockRestore();
  });

  it('offers no amendment on a ballot, or on one the house is holding', async () => {
    // A ballot's votes answer its question as asked; the database refuses
    // amending a withheld or ended filing, and the app offers nothing to bounce.
    const alerts: [string, string, { text: string }[]][] = [];
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(
      ((t: string, m: string, b: never) => { alerts.push([t, m, b]); }) as never,
    );
    mockUser = { id: 'u2', username: 'tomasreyes' };

    for (const over of [
      { kind: 'ballot', title: 'Which?', body: 'Which?', options: [{ film_id: 1, title: 'A' }, { film_id: 2, title: 'B' }], closes_at: new Date(Date.now() + 86_400_000).toISOString() },
      { withheld_at: new Date().toISOString() },
    ]) {
      alerts.length = 0;
      mockRow = row(over);
      const { getByLabelText } = await mount();
      await act(async () => { fireEvent.press(getByLabelText('More, for this filing')); });
      // Straight to the withdrawal, with no first sheet offering an amendment.
      expect(alerts[0][0]).toBe('Withdraw this filing?');
    }
    spy.mockRestore();
  });

  it('a withdrawn filing is over: nothing to amend, withdraw again, or act on', async () => {
    // It offered its author "Withdraw this filing?" a second time, and every
    // reader a docked CERTIFY and CRITIQUE the house refuses on words that are
    // gone (certs_open_post, critiques_open_post).
    mockUser = { id: 'u2', username: 'tomasreyes' };
    mockRow = row({ ended_at: new Date().toISOString(), ended_by: 'author' });
    const { queryByLabelText, queryAllByText, getByText } = await mount();
    getByText('This filing was withdrawn by its author.');
    expect(queryByLabelText('More, for this filing')).toBeNull();
    expect(queryAllByText('CERTIFY')).toHaveLength(0);
    expect(queryAllByText('SAVE')).toHaveLength(0);
    expect(queryAllByText('SHARE')).toHaveLength(0);
  });

  it('a filing not sent yet says so, and offers no act until the house has it', async () => {
    mockUser = { id: 'u2', username: 'tomasreyes' };
    mockRow = row({ kind: 'take', title: null, body: 'Written on a train.' });
    useOfflineQueueStore.setState({ queued: [{ id: 'q1', type: 'add_filing', payload: { _tempId: 'f1' }, timestamp: 0 }] });
    try {
      const { getByText, getAllByText, getByLabelText } = await mount();
      getByText('NOT SENT YET · THE HOUSE HAS NOT SEEN THIS');
      getByLabelText(/^Certify this\. Not sent yet/);
      // The card's bar, waiting; the docked one is not drawn at all.
      expect(getAllByText('CERTIFY')).toHaveLength(1);
    } finally {
      useOfflineQueueStore.setState({ queued: [] });
    }
  });

  it('an essay not sent yet says so too, under its head', async () => {
    // The short kinds said it on their card and the ballot at its foot; the
    // essay, drawn by its own head and body, read as though it were published.
    mockUser = { id: 'u2', username: 'tomasreyes' };
    useOfflineQueueStore.setState({ queued: [{ id: 'q1', type: 'add_filing', payload: { _tempId: 'f1' }, timestamp: 0 }] });
    try {
      const { getByText } = await mount();
      expect(getByText('The Empty Room')).toBeTruthy();
      expect(getByText('NOT SENT YET · THE HOUSE HAS NOT SEEN THIS')).toBeTruthy();
    } finally {
      useOfflineQueueStore.setState({ queued: [] });
    }
  });

  it('the critiques under a tombstone are reached from its mark, and no composer opens', async () => {
    mockUser = { id: 'u9', username: 'someone' };
    mockRow = row({ ended_at: new Date().toISOString(), ended_by: 'house', comment_count: 3 });
    const { getByLabelText, queryByLabelText } = await mount();
    const scrolled = jest.spyOn(ScrollView.prototype, 'scrollTo');
    scrolled.mockClear();
    await act(async () => { fireEvent.press(getByLabelText(/^Critique\. 3 critiques remain/)); });
    // REACHED: the mark carries the page down to the critiques that survive.
    // The control has no disabled state, so without this a mark with no
    // handler would pass as one that leads somewhere.
    expect(scrolled).toHaveBeenCalledWith(expect.objectContaining({ animated: true }));
    scrolled.mockRestore();
    expect(queryByLabelText('File this critique. Write something first.')).toBeNull();
    expect(queryByLabelText('File this critique')).toBeNull();
  });

  it('withdraws a filing reached by its own address, and shows the tombstone', async () => {
    // The whole failure in one test: no feed loaded, so `end` found nothing to
    // act on and returned — silently, with the page unchanged and no error.
    const alerts: [string, string, { text: string; onPress?: () => void }[]][] = [];
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(
      ((t: string, m: string, b: never) => { alerts.push([t, m, b]); }) as never,
    );
    mockUser = { id: 'u2', username: 'tomasreyes' };

    const { getByLabelText, queryByText, getByText } = await mount();
    expect(getByText('The Empty Room')).toBeTruthy();

    await act(async () => { fireEvent.press(getByLabelText('More, for this filing')); });
    // Through both sheets: which act, then the confirmation.
    await act(async () => { alerts[0][2].find((b) => b.text === 'Withdraw it')?.onPress?.(); });
    await act(async () => { alerts[1][2].find((b) => b.text === 'Withdraw')?.onPress?.(); });

    // Gone from the page the member is on, not only from the feed: the tombstone stands.
    expect(queryByText('The Empty Room')).toBeNull();
    expect(getByText('This filing was withdrawn by its author.')).toBeTruthy();
    spy.mockRestore();
  });

  it('shares to the lounge, or to anywhere the phone can send', async () => {
    const shared: unknown[] = [];
    const spy = jest.spyOn(Share, 'share').mockImplementation(async (c) => {
      shared.push(c); return { action: 'sharedAction' } as never;
    });

    const { getByLabelText, queryByLabelText } = await mount();
    await act(async () => { fireEvent.press(getByLabelText('Share')); });

    await act(async () => { fireEvent.press(getByLabelText(/ELSEWHERE/)); });
    expect(shared).toHaveLength(1);
    // The house's sheet closes behind the system's.
    expect(queryByLabelText(/ELSEWHERE/)).toBeNull();
    spy.mockRestore();
  });

  it('sends a WEB link, never a scheme only this app understands', async () => {
    // `reelhouse://` opens nothing for whoever lacks the app: everyone it is sent to.
    const shared: { message?: string }[] = [];
    const spy = jest.spyOn(Share, 'share').mockImplementation(async (c) => {
      shared.push(c as { message?: string }); return { action: 'sharedAction' } as never;
    });
    mockRow = row({ kind: 'take', title: null, full_content: null, body: 'A take.' });

    const { getByLabelText } = await mount();
    await act(async () => { fireEvent.press(getByLabelText('Share')); });
    await act(async () => { fireEvent.press(getByLabelText(/ELSEWHERE/)); });

    expect(shared[0].message).toContain('https://www.thereelhousesociety.com/dispatch');
    expect(shared[0].message).not.toContain('reelhouse://');
    // Not `/dispatch/<id>`: the web has no page for one filing yet (a 404).
    expect(shared[0].message).not.toMatch(/dispatch\/[0-9a-f-]{8}/);
    spy.mockRestore();
  });

  it('mounts the clipping only while an ESSAY is being shared', async () => {
    // Mounted only while the sheet is open, never on a page merely being read.
    const { getByLabelText, getAllByText } = await mount();
    // One "The Empty Room" while merely reading: the essay's own head.
    expect(getAllByText('The Empty Room')).toHaveLength(1);

    await act(async () => { fireEvent.press(getByLabelText('Share')); });
    // Two while the sheet is open: the page, and the clipping behind it.
    expect(getAllByText('The Empty Room').length).toBeGreaterThan(1);
  });

  it('does not mount a clipping for a kind that does not earn one', async () => {
    // Found by its parking offset: a take's text repeats in nested Texts anyway.
    const parked = (tree: unknown) => JSON.stringify(tree).includes('-10000');

    mockRow = row({ kind: 'take', title: null, full_content: null, body: 'A take.' });
    const take = await mount();
    await act(async () => { fireEvent.press(take.getByLabelText('Share')); });
    expect(parked(take.toJSON())).toBe(false); // only an essay leaves as a picture
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
    const alerts: [string, string, { text: string; onPress?: () => void }[]][] = [];
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
    expect(mockPushed).toContain('/dispatch/room/tomasreyes');

    mockPushed.length = 0;
    await act(async () => { fireEvent.press(getByLabelText(/Tokyo Story/)); });
    expect(mockPushed).toContain('/film/42');
  });

  it('carries the same four marks on a ballot and on a short filing', async () => {
    // Each kind's component mounts its own copy of the marks; all must work.
    for (const over of [
      { kind: 'ballot', options: [{ film_id: 1, title: 'Tokyo Story', poster_path: null }, { film_id: 2, title: 'Late Spring', poster_path: null }], closes_at: new Date(Date.now() + 86_400_000).toISOString() },
      { kind: 'take', title: null, full_content: null, body: 'A take.' },
    ]) {
      useDispatch.setState({ certifiedIds: new Set(), savedIds: new Set(), opened: {} } as never);
      mockRow = row(over as Record<string, unknown>);
      const { getByLabelText, unmount } = await mount();

      // The page's own control (the dock's says "this filing").
      await act(async () => { fireEvent.press(getByLabelText(/^Certify this($|\. \d)/)); });
      expect(useDispatch.getState().certifiedIds.has('f1')).toBe(true);
      await act(async () => { fireEvent.press(getByLabelText('Save this')); });
      expect(useDispatch.getState().savedIds.has('f1')).toBe(true);

      await act(async () => { unmount(); }); // before the next tree mounts
    }
  });

  it('certifies a critique', async () => {
    mockCritiqueRows = [{
      id: 'c1', post_id: 'f1', user_id: 'u3', author_username: 'someone',
      body: 'A critique.', certify_count: 2,
      created_at: '2026-08-28T22:00:00Z', edited_at: null, profiles: null,
    }];
    const { getByLabelText } = await mount();
    await act(async () => { fireEvent.press(getByLabelText('Certify this critique. 2 members have certified this critique')); });
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
    // As a CRITIQUE, so the Tribunal sees the line that was reported.
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
    expect(useDispatch.getState().critiques.f1).toHaveLength(30);

    // The next page is thirty others: it said `>= 30`, which the first page met alone.
    mockCritiqueRows = Array.from({ length: 30 }, (_, i) => ({
      id: 'c' + (i + 30), post_id: 'f1', user_id: 'u3', author_username: 'someone',
      body: 'Critique ' + (i + 30), certify_count: 0,
      created_at: '2026-08-28T21:00:00Z', edited_at: null, profiles: null,
    }));
    await act(async () => { fireEvent.press(getByLabelText(/more critiques/)); });
    await act(async () => { await Promise.resolve(); });
    expect(useDispatch.getState().critiques.f1).toHaveLength(60);
  }, 10000);   // sixty critiques drawn: ~2.5 s alone, past 5 s under a full run

  it('blocks the author, then leaves the page', async () => {
    mockUpserts.length = 0;
    const { getByLabelText } = await mount();
    await act(async () => { fireEvent.press(getByLabelText('More, for this filing')); });
    const author = mockSheetProps[0].targetUserId;
    await act(async () => { (mockSheetProps[0].onBlock as () => void)(); });
    expect(mockUpserts).toEqual([{ table: 'user_blocks', row: expect.objectContaining({ blocked_id: author, type: 'block' }) }]);
    expect(mockBack).toHaveBeenCalled();
  });

  it('mutes the author from the same sheet', async () => {
    mockUpserts.length = 0;
    // The test before blocked this author, and a block outranks a mute: start clean.
    useBlockStore.setState({ blocked: [], muted: [], _blockedIndex: new Set(), _mutedIndex: new Set() });
    const { getByLabelText } = await mount();
    await act(async () => { fireEvent.press(getByLabelText('More, for this filing')); });
    const author = mockSheetProps[0].targetUserId;
    expect(typeof mockSheetProps[0].onMute).toBe('function');
    await act(async () => { (mockSheetProps[0].onMute as () => void)(); });
    expect(mockUpserts).toEqual([{ table: 'user_blocks', row: expect.objectContaining({ blocked_id: author, type: 'mute' }) }]);
  });

  it('carries a report from the sheet into the report sheet', async () => {
    const { getByLabelText } = await mount();
    await act(async () => { fireEvent.press(getByLabelText('More, for this filing')); });
    await act(async () => { (mockSheetProps[0].onReport as () => void)(); });
    expect(mockReportProps[0].contentType).toBe('dispatch_post');
    expect(mockReportProps[0].contentId).toBe('f1');
    expect(mockSheetProps).toHaveLength(1); // the action sheet closed behind it
  });

  it('ends a part with the one after it, by name', async () => {
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
    mockRow = row({ series_id: 's1', series_title: 'Ozu, in four parts', part_number: 4 });
    mockNextRows = [];
    const { queryByLabelText, getByText } = await mount();
    expect(queryByLabelText(/NEXT IN THE SERIES/)).toBeNull();
    expect(getByText(/That is the argument/)).toBeTruthy();
  });

  it('offers no next part on a filing that is not in a series', async () => {
    const { queryByLabelText, getByText } = await mount();
    expect(queryByLabelText(/NEXT IN THE SERIES/)).toBeNull();
    expect(getByText(/That is the argument/)).toBeTruthy();
  });

  it('shares an essay as a clipping AND the link, in one share', async () => {
    // iOS: `Share.share` carries the picture AND the link. `shareAsync` would
    // send the file alone, and a stranger would have no way to the house.
    const viewShot = require('react-native-view-shot');
    const sharing = require('expo-sharing');
    const capture = jest.spyOn(viewShot, 'captureRef').mockResolvedValue('file:///clipping.png');
    const available = jest.spyOn(sharing, 'isAvailableAsync').mockResolvedValue(true);
    const shareAsync = jest.spyOn(sharing, 'shareAsync').mockResolvedValue(undefined as never);
    const shared: { url?: string; message?: string }[] = [];
    const plain = jest.spyOn(Share, 'share').mockImplementation(async (c) => {
      shared.push(c as { url?: string; message?: string });
      return { action: 'sharedAction' } as never;
    });

    const { getByLabelText } = await mount();
    await act(async () => { fireEvent.press(getByLabelText('Share')); });
    await act(async () => { fireEvent.press(getByLabelText(/ELSEWHERE/)); });

    expect(shared).toHaveLength(1);
    expect(shared[0].url).toBe('file:///clipping.png');
    expect(shared[0].message).toContain('https://www.thereelhousesociety.com/dispatch');
    // One share, not two: the file-only path is not also taken.
    expect(shareAsync).not.toHaveBeenCalled();

    capture.mockRestore(); available.mockRestore(); shareAsync.mockRestore(); plain.mockRestore();
  });

  it('sends the clipping on Android, where a file and a message cannot travel together', async () => {
    // Android's `Share` ignores `url`, so the file goes alone. `Platform.OS` is
    // a plain property here (no getter to spy on), so it is set and restored.
    const RN = require('react-native');
    const realOS = RN.Platform.OS;
    Object.defineProperty(RN.Platform, 'OS', { value: 'android', configurable: true });
    const os = { mockRestore: () => Object.defineProperty(RN.Platform, 'OS', { value: realOS, configurable: true }) };
    const viewShot = require('react-native-view-shot');
    const sharing = require('expo-sharing');
    const capture = jest.spyOn(viewShot, 'captureRef').mockResolvedValue('file:///clipping.png');
    const available = jest.spyOn(sharing, 'isAvailableAsync').mockResolvedValue(true);
    const shots: unknown[] = [];
    const shareAsync = jest.spyOn(sharing, 'shareAsync').mockImplementation(async (u: unknown) => {
      shots.push(u);
    });
    const plain = jest.spyOn(Share, 'share');

    const { getByLabelText } = await mount();
    await act(async () => { fireEvent.press(getByLabelText('Share')); });
    await act(async () => { fireEvent.press(getByLabelText(/ELSEWHERE/)); });

    expect(shots).toEqual(['file:///clipping.png']);
    expect(plain).not.toHaveBeenCalled();

    os.mockRestore();
    capture.mockRestore(); available.mockRestore(); shareAsync.mockRestore(); plain.mockRestore();
  });

  it('opens the lounge from the sheet, rather than the world', async () => {
    // TO THE LOUNGE opens the salon picker, never the OS sheet.
    const plain = jest.spyOn(Share, 'share');
    const { getByLabelText, queryByLabelText, getByText } = await mount();
    await act(async () => { fireEvent.press(getByLabelText('Share')); });
    await act(async () => { fireEvent.press(getByLabelText(/TO THE LOUNGE/)); });

    // The share sheet closes and nothing is handed to the operating system.
    expect(queryByLabelText(/ELSEWHERE/)).toBeNull();
    expect(plain).not.toHaveBeenCalled();
    // …and the salon picker OPENS, carrying this filing. A sheet that only
    // closed would satisfy both lines above.
    expect(getByText('Share to Lounge')).toBeTruthy();
    expect(getByText('SHARING ESSAY: THE EMPTY ROOM')).toBeTruthy();
    plain.mockRestore();
  });

  it('offers no SAVE THE CARD row, because nothing can save one', async () => {
    // Pinned, as a decision: see ShareSheet's `card`.
    const { getByLabelText, queryByLabelText } = await mount();
    await act(async () => { fireEvent.press(getByLabelText('Share')); });
    expect(queryByLabelText(/SAVE THE CARD/)).toBeNull();
  });

  it('falls back to the line when the clipping cannot be captured', async () => {
    // A capture that failed must not cost the member the share.
    const viewShot = require('react-native-view-shot');
    const capture = jest.spyOn(viewShot, 'captureRef').mockRejectedValue(new Error('no surface'));
    const shared: { message?: string }[] = [];
    const spy = jest.spyOn(Share, 'share').mockImplementation(async (c) => {
      shared.push(c as { message?: string }); return { action: 'sharedAction' } as never;
    });

    const { getByLabelText } = await mount();
    await act(async () => { fireEvent.press(getByLabelText('Share')); });
    await act(async () => { fireEvent.press(getByLabelText(/ELSEWHERE/)); });

    expect(shared[0].message).toContain('https://www.thereelhousesociety.com/dispatch');
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
    // The words survive for another try.
    expect(getByLabelText('Your critique').props.value).toBe('That is the argument.');
  });

  it('a critique written without a connection says it goes out when the wire is back', async () => {
    // It was queued and drawn as though it had gone, with nothing said.
    mockWriteOffline = true;
    const { getByLabelText } = await mount();
    await act(async () => { fireEvent.press(getByLabelText('Write a critique')); });
    await act(async () => {
      fireEvent.changeText(getByLabelText('Your critique'), 'That is the argument.');
    });
    await act(async () => { fireEvent.press(getByLabelText('File this critique')); });
    await act(async () => { await Promise.resolve(); });

    expect(mockToastSuccess).toHaveBeenCalledWith('Filed. It goes out when the wire is back.');
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it('asks for the critiques in the order its own header shows', async () => {
    await mount();
    expect(useDispatch.getState().critiquesOrder.f1).toBe('CERTIFIED');
  });
});

/**
 * Every kind, opened: the reader is a chain (essay, ballot, then PaperPost),
 * and a kind can fall through it quietly, as the feed's ballot card once
 * printed no question (see everyCardSaysSomething, the feed's twin of this).
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
    // Checked against the app's own runtime table, so a sixth kind appears here.
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

/**
 * The reader, read aloud, as the feed is: judged on the rendered tree, which is
 * what reaches the ear, across the options, the composer and the essay.
 */
describe('the reader, read aloud', () => {
  /** Hiding is INHERITED — the flag travels down, it is not read per node. */
  const spokenStrings = (node: any, off = false, out: string[] = []): string[] => {
    if (node == null || typeof node === 'string') return out;
    if (Array.isArray(node)) { for (const n of node) spokenStrings(n, off, out); return out; }
    const p = node.props ?? {};
    const hidden = off
      || p.accessibilityElementsHidden === true
      || p.importantForAccessibility === 'no-hide-descendants'
      || p.accessible === false;
    const own = (node.children ?? []).filter((c: any) => typeof c === 'string').join('').trim();
    if (own && !hidden) out.push(own);
    spokenStrings(node.children, hidden, out);
    return out;
  };

  /** A repeat has to land on word boundaries: CRITIQUE sits inside CRITIQUES
   *  and is a different word — the dock button above the section heading. */
  const echoes = (a: string, b: string): boolean => {
    const at = b.indexOf(a);
    if (at === -1) return false;
    const wordish = /[A-Za-z0-9؀-ۿ]/;
    const before = b[at - 1]; const after = b[at + a.length];
    return !(before && wordish.test(before)) && !(after && wordish.test(after));
  };

  const controls = (node: any, out: { role?: string; label?: string; text: string }[] = []) => {
    if (node == null || typeof node === 'string') return out;
    if (Array.isArray(node)) { for (const n of node) controls(n, out); return out; }
    const p = node.props ?? {};
    const pressable = typeof p.onStartShouldSetResponder === 'function';
    if (pressable || p.accessibilityRole) {
      const text: string[] = [];
      const walk = (n: any) => {
        if (n == null) return;
        if (typeof n === 'string') { if (n.trim()) text.push(n.trim()); return; }
        if (Array.isArray(n)) { n.forEach(walk); return; }
        walk(n.children);
      };
      walk(node);
      out.push({ role: p.accessibilityRole, label: p.accessibilityLabel, text: text.join(' ') });
    }
    controls(node.children, out);
    return out;
  };

  const SCENES: Record<string, Record<string, unknown>> = {
    'a dossier': {},
    'a take': { kind: 'take', title: null, full_content: null, body: 'A take.' },
    'an open ballot': {
      kind: 'ballot', title: 'Which Ozu?', body: 'Which Ozu?',
      options: [
        { film_id: 1, title: 'Tokyo Story', poster_path: null },
        { film_id: 2, title: 'Late Spring', poster_path: null },
      ],
      closes_at: new Date(Date.now() + 86_400_000).toISOString(),
    },
    'a veiled filing': { kind: 'take', title: null, full_content: null, body: 'A take.', spoiler_label: 'SPOILERS' },
    'a struck filing': { kind: 'take', title: null, full_content: null, body: '', ended_at: new Date().toISOString(), ended_by: 'house' },
  };

  for (const [name, over] of Object.entries(SCENES)) {
    describe(name, () => {
      let tree: unknown = null;
      beforeEach(async () => { mockRow = row(over); tree = (await mount()).toJSON(); });

      it('has controls at all — or this proves nothing', () => {
        expect(controls(tree).length).toBeGreaterThan(0);
      });

      it('names every control', () => {
        const nameless = controls(tree)
          .filter((c) => !(c.label ?? '').trim() && !c.text.trim())
          .map((c) => c.role ?? '(no role)');
        expect(nameless).toEqual([]);
      });

      it('reads out no ornament, separator or rule', () => {
        const ornamental = spokenStrings(tree).filter((s) => !/[A-Za-z0-9؀-ۿ]/.test(s));
        expect(ornamental).toEqual([]);
      });

      it('never says the same thing twice in a row', () => {
        const said = spokenStrings(tree);
        const echoed: string[] = [];
        for (let i = 0; i + 1 < said.length; i++) {
          const a = said[i]; const b = said[i + 1];
          if (a.length >= 2 && a !== b && echoes(a, b)) echoed.push(`"${a}" then "${b}"`);
        }
        expect(echoed).toEqual([]);
      });
    });
  }
});

/** The ways out (every back control, the byline) and the ways a withdrawal fails. */
describe('the ways out, and the ways it fails', () => {
  it('goes back from EVERY back control on the page, not just the first', async () => {
    // Matched EXACTLY: "Back to the top of the …" scrolls, it does not leave.
    for (const over of [{}, { kind: 'take', title: null, full_content: null, body: 'A take.' }]) {
      mockRow = row(over);
      const { getAllByLabelText } = await mount();
      const backs = getAllByLabelText('Back');
      expect(backs.length).toBeGreaterThan(0);
      for (const b of backs) {
        mockBack.mockClear();
        await act(async () => { fireEvent.press(b); });
        expect(mockBack).toHaveBeenCalled();
      }
    }
  });

  it('opens the author’s room from the byline', async () => {
    mockPushed.length = 0;
    const { getAllByLabelText } = await mount();
    await act(async () => {
      fireEvent.press(getAllByLabelText(/Open their room/i)[0]);
    });
    expect(mockPushed).toContain('/dispatch/room/tomasreyes');
  });

  it('offers no room to open for a member who has gone', async () => {
    // As the database leaves it (dispatch_scrub_departed, ON DELETE SET NULL): the
    // filing stays, its author's id is gone and its handle reads [deleted]. A null
    // handle, which the database never writes, failed to parse, so this checked
    // "no longer here" for a byline it never drew. Drawn, the essay's head offered
    // "[deleted]. Open their room." — a door to a room that is not there.
    mockRow = row({ user_id: null, profiles: null, author_username: '[deleted]' });
    const { queryAllByLabelText, getByText, queryByText } = await mount();
    // Labels compared, not elements: a failed match on elements cannot be reported.
    expect(queryAllByLabelText(/Open their room/i).map((n) => n.props.accessibilityLabel)).toEqual([]);
    // Named as every card names them, and their words stay.
    expect(getByText('A MEMBER, DEPARTED')).toBeTruthy();
    expect(queryByText(/\[deleted\]/i)).toBeNull();
    expect(getByText(/That is the argument/)).toBeTruthy();
  });

  it('does not re-read the critiques when the order is already that', async () => {
    const { getByLabelText } = await mount();
    expect(useDispatch.getState().critiquesOrder.f1).toBe('CERTIFIED');
    // A re-read would write CERTIFIED again, the value already there, so a marker
    // stands in the store: only a re-read could replace it.
    useDispatch.setState({ critiquesOrder: { f1: 'MARKER' } } as never);
    // By its own label: the certify controls say "certified" too now.
    await act(async () => { fireEvent.press(getByLabelText('Order by certified')); });
    expect(useDispatch.getState().critiquesOrder.f1).toBe('MARKER');
  });

  it('says so when a filing will not withdraw', async () => {
    mockUser = { id: 'u2', username: 'tomasreyes' };
    // Presses the withdrawal on whichever of the two sheets it is handed.
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      const withdraw = (buttons ?? []).find((b) => b.text === 'Withdraw it' || b.text === 'Withdraw');
      void withdraw?.onPress?.();
    });
    const end = jest.spyOn(useDispatch.getState(), 'end')
      .mockRejectedValue(new Error('refused'));

    const { getByLabelText } = await mount();
    await act(async () => { fireEvent.press(getByLabelText(/More/i)); });
    await act(async () => { await Promise.resolve(); });

    expect(mockToastError).toHaveBeenCalledWith('It could not be withdrawn.');
    alert.mockRestore(); end.mockRestore();
  });
});
