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
  // To a macrotask, so FlashList's own load callback settles inside the act
  // scope rather than after it.
  await act(async () => { await new Promise((res) => setTimeout(res, 0)); });
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

  it('lets the index scroll, so no department is unreachable at large type', async () => {
    // The file's own note has always said "the index scrolls", the fade at its
    // trailing edge says "there is more this way", and `chromeIndex` clips with
    // `overflow: hidden` — and the row was a plain View. At normal type all six
    // fit, so nothing showed; measured at 1.35 the row overflows by 5.2pt and
    // DOSSIER is cut against the tools, unreachable for exactly the members most
    // likely to need larger type.
    put({ filings: [filing()] });
    const { getByLabelText } = await mount();
    for (const s of ['ALL', 'TAKES', 'SEEKING', 'WIRE', 'BALLOTS', 'DOSSIER']) {
      expect(getByLabelText(`${s} section`)).toBeTruthy();
    }

    // And the row they sit in scrolls. Read from source rather than from
    // `toJSON()`, which cannot be serialised on this screen — FlashList's
    // internals carry a circular fiber reference.
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'paper', 'PaperFrame.tsx'), 'utf8',
    );
    expect(src).toMatch(/<ScrollView\s+horizontal/);
    // Not bouncing, so a row that DOES fit never implies there is more past it.
    expect(src).toMatch(/alwaysBounceHorizontal=\{false\}/);
  });

  it('gives a member the live marks', async () => {
    put({ filings: [filing()] });
    const { getByLabelText } = await mount();
    expect(getByLabelText('Certify this').props.accessibilityState.disabled).toBe(false);
    expect(getByLabelText('Save this').props.accessibilityState.disabled).toBe(false);
  });
});

/**
 * ── THE EMPTY PAGES, AND THE CONTROLS ON THEM ───────────────────────────────
 * Every one of these was dark. Not one statement in the `ListEmptyComponent`
 * chain had ever run, so the five different empty pages the feed can show — and
 * the four controls on them — were unproven, on the screen a member who has
 * just joined sees FIRST.
 *
 * This mounts each one and PRESSES the control, checking where it goes. A
 * control that renders is not a control that works: the blank ballot card
 * rendered perfectly for months.
 */
describe('an empty page, in every shape it takes', () => {
  const pressIt = async (el: unknown) => {
    await act(async () => { fireEvent.press(el as never); });
  };

  it('what you kept, when you have kept nothing — and the way back out', async () => {
    put({ filings: [], savedOnly: true });
    const { getByText, getByLabelText } = await mount();
    expect(getByText('You have kept nothing yet.')).toBeTruthy();

    // The way out of a filter that is hiding everything. Without it a member is
    // looking at an empty page with no visible cause.
    await pressIt(getByLabelText('TAP THE BOOKMARK ABOVE TO GO BACK'));
    expect(useDispatch.getState().savedOnly).toBe(false);
  });

  it('signed out — the house is open to read, and joining is the one act', async () => {
    mockUser = null;
    put({ filings: [] });
    const { getByText, getByLabelText } = await mount();
    expect(getByText('The house is open to read.')).toBeTruthy();
    await pressIt(getByLabelText('JOIN THE SOCIETY'));
    expect(mockPushed).toEqual(['/(modals)/membership']);
  });

  for (const [section, title, action] of [
    ['ALL', 'Nothing has been filed yet.', 'FILE THE FIRST'],
    ['TAKES', 'No one has said anything yet.', 'SAY IT'],
    ['SEEKING', 'No one is asking.', 'ASK THE HOUSE'],
    ['WIRE', 'The wire is quiet.', 'BRING THE NEWS'],
  ] as const) {
    it(`${section} — invites the first filing, and opens the desk`, async () => {
      put({ filings: [], section });
      const { getByText, getByLabelText } = await mount();
      expect(getByText(title)).toBeTruthy();
      await pressIt(getByLabelText(action));
      expect(mockPushed).toEqual(['/dispatch/compose']);
    });
  }

  for (const [section, title] of [
    ['BALLOTS', 'No ballot is open.'],
    ['DOSSIER', 'No essays yet.'],
  ] as const) {
    it(`${section} — offers no act the door would refuse, and explains instead`, async () => {
      // These two are AUTEURS-only to file. A button that exists to say no is
      // worse than a sentence, so the quiet line is a LINK to what an auteur can
      // do — and it has to actually go there.
      put({ filings: [], section });
      const { getByText, queryByLabelText, getByLabelText } = await mount();
      expect(getByText(title)).toBeTruthy();
      expect(queryByLabelText('FILE THE FIRST')).toBeNull();
      await pressIt(getByLabelText('WHAT AN AUTEUR CAN DO →'));
      expect(mockPushed).toEqual(['/(modals)/membership']);
    });
  }

  it('draws the skeletons while it is still loading, and no empty page', async () => {
    /**
     * "Nothing here" and "not here yet" are different sentences, and showing
     * the first while the second is true is how a member decides the house is
     * dead on their first morning.
     *
     * ⚠️ Asserted BEFORE the flush, on purpose. The screen fetches itself when
     * it opens with no filings, and against this mock that fetch resolves
     * immediately and clears `loading` — so the shared `mount()`, which drains a
     * macrotask, always arrives after the loading state is over. The first
     * version of this test put `loading: true`, flushed, and reported the empty
     * page as a bug in the screen. It was a bug in the test.
     */
    put({ filings: [], loading: true });
    const { queryByText, queryByLabelText } = render(<FeedScreen />);
    expect(queryByText('Nothing has been filed yet.')).toBeNull();
    // And the skeletons stand in its place, rather than a blank screen — which
    // is the other way to get this wrong. Found by its own label, not by
    // stringifying the tree: before the flush `toJSON()` still carries fibers
    // and JSON.stringify throws on the cycle.
    expect(queryByLabelText('Loading filings')).toBeTruthy();

    // Then, once it has landed with nothing, the empty page is correct.
    await act(async () => { await new Promise((res) => setTimeout(res, 0)); });
    expect(queryByText('Nothing has been filed yet.')).toBeTruthy();
  });
});

describe('the page keeps itself current', () => {
  it('asks for new filings on focus, and every ninety seconds after', async () => {
    // The poll was entirely dark. If it never runs, the held-filings pill never
    // appears and the feed silently goes stale while a member reads it.
    //
    // ⚠️ The shared `mount()` cannot be used here. It flushes with a REAL
    // `setTimeout(0)`, and under fake timers that callback is never delivered —
    // the suite simply hangs until the runner kills it, which is exactly what
    // the first version of this test did. So the mount is done here and the
    // clock is advanced deliberately instead.
    const spy = jest.spyOn(useDispatch.getState(), 'checkForNew')
      .mockImplementation(async () => {});
    jest.useFakeTimers({ doNotFake: ['nextTick'] });
    put({ filings: [filing()] });

    render(<FeedScreen />);
    await act(async () => { jest.advanceTimersByTime(0); });
    // Once on focus — a member returning to the tab wants the page current
    // before they have to wait a minute and a half for it.
    expect(spy).toHaveBeenCalledTimes(1);

    await act(async () => { jest.advanceTimersByTime(90_000); });
    expect(spy).toHaveBeenCalledTimes(2);

    await act(async () => { jest.advanceTimersByTime(180_000); });
    expect(spy).toHaveBeenCalledTimes(4);

    jest.useRealTimers();
    spy.mockRestore();
  });
});



/**
 * ── THE REST OF WHAT THE PAGE DOES ──────────────────────────────────────────
 * The last dark statements on this screen that a test can actually reach.
 *
 * ⚠️ THREE THAT CANNOT BE REACHED HERE, SAID RATHER THAN FAKED:
 *
 *   THE SCROLL HANDLER is four reanimated worklets. They run on the UI thread
 *   and do not execute in this environment at all.
 *
 *   THE INTERVAL'S CLEANUP is returned from `useFocusEffect`, which needs a real
 *   navigator to decide when a screen loses focus. There is none here, so
 *   unmounting does not run it. A test asserting the poll stops was written; it
 *   reported the poll still firing afterwards, and that was the harness rather
 *   than a leak, so it is gone rather than left as a false alarm.
 *
 *   PULL TO REFRESH. `RCTRefreshControl` renders, but no node in the tree
 *   carries `onRefresh` — the prop does not survive to the host element — and
 *   the control has no label or text to find it by. What it calls, `fetch`, is
 *   covered directly elsewhere.
 */
describe('the page, in the rest of its states', () => {
  /** Every element type in the tree. Walked, never stringified — before the
   *  flush `toJSON()` still carries fibers and JSON.stringify throws on the
   *  cycle, which has now cost two tests in this file. */
  const typesIn = (node: any, out = new Set<string>()): Set<string> => {
    if (node == null || typeof node === 'string') return out;
    if (Array.isArray(node)) { for (const n of node) typesIn(n, out); return out; }
    if (node.type) out.add(String(node.type));
    typesIn(node.children, out);
    return out;
  };

  it('flips the ordering from the running head', async () => {
    put({ filings: [filing()], sort: 'LATEST' });
    const { getByLabelText } = await mount();
    await act(async () => { fireEvent.press(getByLabelText(/order|LATEST|CERTIFIED/i)); });
    expect(useDispatch.getState().sort).toBe('CERTIFIED');
  });

  it('shows a filing whose author has gone, without a room to open', async () => {
    put({ filings: [filing({ author: null, authorId: null })] });
    const { getByText, queryByLabelText } = await mount();
    expect(getByText('A MEMBER, DEPARTED')).toBeTruthy();
    expect(queryByLabelText(/Open their room/i)).toBeNull();
  });

  it('names the series a filing belongs to', async () => {
    put({
      filings: [filing({
        kind: 'dossier', body: 'The Empty Room',
        seriesTitle: 'Ozu, in four parts', partNumber: 2,
      })],
    });
    const { getByText } = await mount();
    expect(getByText(/PART 2 OF OZU, IN FOUR PARTS/i)).toBeTruthy();
  });

  it('says it is fetching more rather than looking finished', async () => {
    put({ filings: [filing()], loadingMore: true });
    const { toJSON } = await mount();
    expect(typesIn(toJSON()).has('ActivityIndicator')).toBe(true);
  });

  it('and shows no spinner when it is not', async () => {
    put({ filings: [filing()], loadingMore: false });
    const { toJSON } = await mount();
    expect(typesIn(toJSON()).has('ActivityIndicator')).toBe(false);
  });
});
