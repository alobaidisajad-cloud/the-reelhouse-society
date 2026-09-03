/**
 * feedScreen.test.tsx — the page the tab opens on.
 * ─────────────────────────────────────────────────────────────────────────────
 * 97 statements, none of which had ever run, on the screen every member sees
 * first. What is checked here is the logic the screen ADDS on top of components
 * that are already covered — the day dividers, the margin's ordering value, the
 * empty states, and the row typing that lets FlashList recycle.
 *
 * The day divider is the interesting one. It is drawn only under LATEST: ordered
 * by certifications the list is not chronological, so a divider would announce a
 * boundary that is not there — three filings from Tuesday, one from June, two
 * more from Tuesday. And the FIRST day is deliberately not drawn, because the
 * running head above already names it.
 */
import React, { act } from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import FeedScreen from '@/app/(tabs)/dispatch';
import { useDispatch } from '@/src/stores/dispatch';
import type { Filing } from '@/src/stores/dispatchTypes';

let mockUser: { id: string; username: string } | null = { id: 'u1', username: 'me' };

jest.mock('@/src/stores/auth', () => ({
  useAuthStore: Object.assign(
    (sel?: (s: unknown) => unknown) =>
      (typeof sel === 'function' ? sel({ user: mockUser }) : { user: mockUser }),
    { getState: () => ({ user: mockUser }), setState: jest.fn(), subscribe: jest.fn() },
  ),
}));
// `useScrollToTop` reaches for a route object, which only exists inside a real
// navigator. It is the tab-bar double-tap behaviour, not anything this screen
// decides, so it is stubbed rather than staged.
// Not `requireActual` — pulling the real navigation library in here took the
// suite past five minutes. Nothing else in this tree imports from it, so the one
// hook the screen uses is all that needs to exist.
jest.mock('@react-navigation/native', () => ({ useScrollToTop: jest.fn() }));

const mockPushed: string[] = [];
jest.mock('@/src/utils/typedRouter', () => ({
  nav: { push: (p: string) => { mockPushed.push(p); }, replace: jest.fn(), back: jest.fn() },
}));

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: () => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = () => self();
      chain.eq = () => self(); chain.is = () => self(); chain.order = () => self();
      chain.in = () => Promise.resolve({ data: [], error: null });
      chain.limit = () => { const r = Promise.resolve({ data: [], error: null }); return Object.assign(r, { abortSignal: () => r }); };
      // The writes. Without them `.insert()` was undefined, every mark threw,
      // and `writeThrough` rolled it back — so a certify looked as though it had
      // never happened.
      chain.insert = () => Promise.resolve({ data: [], error: null });
      chain.update = () => self();
      chain.delete = () => self();
      chain.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res);
      return chain;
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  },
}));
jest.mock('@/src/utils/offlineQueue', () => ({
  enqueueMutation: jest.fn(), flushOfflineQueue: jest.fn(), getOfflineQueue: () => [],
}));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn() }));

/** A local date, so the day boundary means the same in every timezone. */
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();

const filing = (over: Partial<Filing> = {}): Filing => ({
  id: 'f1', kind: 'take', authorId: 'u2',
  author: { name: 'tomasreyes', memberNo: 147, tier: 'free' },
  film: null, subjectId: null, subjectKind: null,
  title: null, body: 'A take about a film.', fullContent: null,
  source: null, sourceUrl: null,
  options: null, closesAt: null, frozenTotals: null, answerId: null,
  seriesId: null, seriesTitle: null, partNumber: null,
  spoilerLabel: null, withheldAt: null, endedAt: null, endedBy: null,
  certifyCount: 3, commentCount: 1,
  createdAt: at(2026, 8, 28, 21), editedAt: null,
  ...over,
});

const put = (over: Record<string, unknown>) => {
  useDispatch.setState({
    filings: [], loading: false, loadingMore: false, hasMore: false, droppedRows: 0,
    section: 'ALL', sort: 'LATEST', savedOnly: false, newCount: 0,
    certifiedIds: new Set(), savedIds: new Set(), myVotes: {},
    critiques: {}, critiquesLoading: {}, critiquesLoadingMore: {},
    critiquesHasMore: {}, critiquesOrder: {}, certifiedCritiqueIds: new Set(),
    ...over,
  } as never);
};

const mount = async () => {
  const r = render(<FeedScreen />);
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return r;
};

beforeEach(() => { mockUser = { id: 'u1', username: 'me' }; mockPushed.length = 0; put({}); });

describe('the Dispatch feed', () => {
  it('prints a filing, with the hour in the margin under LATEST', async () => {
    put({ filings: [filing()] });
    const { getByText } = await mount();
    // A regex, not the exact string: the kind names itself INSIDE the same Text
    // as the body — `TAKE — A take about a film.` — so the composed text of the
    // host element is never the body alone.
    expect(getByText(/A take about a film/)).toBeTruthy();
    expect(getByText('21:00')).toBeTruthy();
  });

  it('prints the certify count in the margin under CERTIFIED', async () => {
    // The margin always shows the number the page is actually ORDERED by, so
    // the column is never a fact the ordering does not use.
    put({ filings: [filing({ certifyCount: 3 })], sort: 'CERTIFIED' });
    const { getByText, queryByText } = await mount();
    expect(getByText('3')).toBeTruthy();
    expect(queryByText('21:00')).toBeNull();
  });

  it('divides the days — but never before the first one', async () => {
    put({
      filings: [
        filing({ id: 'a', createdAt: at(2026, 8, 28, 21), body: 'Friday, late.' }),
        filing({ id: 'b', createdAt: at(2026, 8, 28, 9), body: 'Friday, early.' }),
        filing({ id: 'c', createdAt: at(2026, 8, 27, 9), body: 'Thursday.' }),
      ],
    });
    const { getByText, queryByText } = await mount();
    // The running head already names today, so printing it again ten points
    // below would be the same sentence twice.
    expect(queryByText('FRIDAY, AUGUST 28')).toBeNull();
    expect(getByText('THURSDAY, AUGUST 27')).toBeTruthy();
  });

  it('draws no day dividers at all under CERTIFIED', async () => {
    // Ordered by certifications the list is not chronological, so a divider
    // would announce a boundary that is not there.
    put({
      sort: 'CERTIFIED',
      filings: [
        filing({ id: 'a', createdAt: at(2026, 8, 28), certifyCount: 9 }),
        filing({ id: 'c', createdAt: at(2026, 8, 27), certifyCount: 2 }),
      ],
    });
    const { queryByText } = await mount();
    expect(queryByText(/AUGUST 27/)).toBeNull();
  });

  it('shows the nameplate on a page with nothing on it yet', async () => {
    put({ filings: [], loading: false });
    const { getByText } = await mount();
    expect(getByText(/THE DISPATCH/i)).toBeTruthy();
  });

  it('says something different when it is YOUR kept page that is empty', async () => {
    put({ filings: [], savedOnly: true, loading: false });
    const { getByText } = await mount();
    expect(getByText('You have kept nothing yet.')).toBeTruthy();
  });

  it('does not offer a signed-out reader a mark that would do nothing', async () => {
    // The feed passes no handler when there is no member, and the press was
    // `() => onCertify?.(next)` — so the control rendered enabled and answered a
    // tap with silence. It also passed the dead-control audit, which requires an
    // onPress to exist; this one existed and did nothing.
    mockUser = null;
    put({ filings: [filing()] });
    const { getByLabelText, getByText } = await mount();

    expect(getByText(/A take about a film/)).toBeTruthy();

    const certify = getByLabelText('Certify this. Members only');
    expect(certify.props.accessibilityState.disabled).toBe(true);
    const keep = getByLabelText('Save this. Members only');
    expect(keep.props.accessibilityState.disabled).toBe(true);

    // CRITIQUE and SHARE stay live for everyone: both just open the filing, and
    // the filing is public to read.
    expect(getByLabelText(/^Critique\./).props.accessibilityState?.disabled).toBeFalsy();
    expect(getByLabelText('Share this filing').props.accessibilityState?.disabled).toBeFalsy();
  });

  it('opens a filing from its writing, its marks and its share', async () => {
    put({ filings: [filing()] });
    const { getByLabelText } = await mount();
    for (const label of ['Open this filing', /^Critique\./, 'Share this filing']) {
      mockPushed.length = 0;
      await act(async () => { fireEvent.press(getByLabelText(label as never)); });
      // Share and the film both open from the READER, where the sheet and the
      // film page have room. On a card the four marks are already the row's
      // full width; a fifth destination would be a target nobody can hit.
      expect(mockPushed).toEqual(['/dispatch/f1']);
    }
  });

  it('opens the film and the member from a card', async () => {
    put({ filings: [filing({ subjectId: 42, film: { title: 'Tokyo Story', posterPath: null } })] });
    const { getByLabelText } = await mount();

    await act(async () => { fireEvent.press(getByLabelText(/Tokyo Story/)); });
    expect(mockPushed).toContain('/film/42');

    mockPushed.length = 0;
    await act(async () => { fireEvent.press(getByLabelText(/Open their room/)); });
    expect(mockPushed).toEqual(['/user/tomasreyes']);
  });

  it('moves the marks from a card', async () => {
    put({ filings: [filing()] });
    const { getByLabelText } = await mount();
    await act(async () => { fireEvent.press(getByLabelText('Certify this')); });
    expect(useDispatch.getState().certifiedIds.has('f1')).toBe(true);
    await act(async () => { fireEvent.press(getByLabelText('Save this')); });
    expect(useDispatch.getState().savedIds.has('f1')).toBe(true);
  });

  it('changes department, order and the kept page from the chrome', async () => {
    put({ filings: [filing()] });
    const { getByLabelText } = await mount();

    await act(async () => { fireEvent.press(getByLabelText(/WIRE section/i)); });
    expect(useDispatch.getState().section).toBe('WIRE');

    await act(async () => { fireEvent.press(getByLabelText(/Sorted by latest/i)); });
    expect(useDispatch.getState().sort).toBe('CERTIFIED');

    await act(async () => { fireEvent.press(getByLabelText(/Your saved filings/i)); });
    expect(useDispatch.getState().savedOnly).toBe(true);
  });

  it('opens the writing room from an empty department', async () => {
    // The only place this screen offers the act: an empty TAKES page invites
    // one. The Concierge carries it everywhere else.
    put({ filings: [], loading: false, section: 'TAKES' });
    const { getByLabelText } = await mount();
    await act(async () => { fireEvent.press(getByLabelText('SAY IT')); });
    expect(mockPushed).toContain('/dispatch/compose');
  });

  it('offers the new paper, and takes the reader to it', async () => {
    // A HEAD count, not a socket — the pill's whole job is "there is new paper",
    // and pressing it goes to the top and re-reads rather than splicing rows in
    // above whatever somebody is reading.
    put({ filings: [filing()], newCount: 3 });
    const { getByLabelText } = await mount();
    await act(async () => { fireEvent.press(getByLabelText('3 new filings. Go to the top.')); });
    await act(async () => { await Promise.resolve(); });
    expect(useDispatch.getState().newCount).toBe(0);
  });

  it('shows no pill when nothing has arrived', async () => {
    put({ filings: [filing()], newCount: 0 });
    const { queryByLabelText } = await mount();
    expect(queryByLabelText(/new filings/)).toBeNull();
  });

  it('gives a member the live marks', async () => {
    put({ filings: [filing()] });
    const { getByLabelText } = await mount();
    expect(getByLabelText('Certify this').props.accessibilityState.disabled).toBe(false);
    expect(getByLabelText('Save this').props.accessibilityState.disabled).toBe(false);
  });
});
