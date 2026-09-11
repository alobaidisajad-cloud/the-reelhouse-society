/**
 * archiveScreen.test.tsx — the one thing search does that scrolling cannot.
 * ─────────────────────────────────────────────────────────────────────────────
 * Twenty members arguing about Stalker over seven years are twenty entries
 * scattered through an endless feed. The archive is that argument as one page.
 *
 * Four of these exist because the obvious build gets them wrong, and every
 * wrong version renders perfectly:
 *
 *   IT SEARCHES THE ARCHIVE, NOT THE WORLD. The writing room searches TMDB and
 *   the code is right there to copy. TMDB knows a million films and this house
 *   has written about a few hundred, so nine times in ten an Archivist would
 *   type a title, tap the film they meant, and arrive at an empty page.
 *
 *   THE COUNT IS ASKED FOR EXACTLY. Counted from the page, a film with sixty
 *   filings shows twenty and calls it sixty — or calls it twenty, which is
 *   worse, because it is the number a member would quote.
 *
 *   THE SPAN NEEDS THE OLDEST ROW. Derived from the page in hand it prints
 *   `2026–2026` under a film the house has argued about since 2019.
 *
 *   THE WILDCARDS ARE ESCAPED. `%` and `_` are wildcards in a LIKE pattern and
 *   legal in a film title — `8_½` would otherwise match half the archive.
 */
import React, { act } from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import ArchiveScreen from '@/app/dispatch/archive';
import { useDispatch } from '@/src/stores/dispatch';

let mockUser: Record<string, unknown> | null = { id: 'u1', username: 'me', tier: 'archivist' };
jest.mock('@/src/stores/auth', () => ({
  useAuthStore: Object.assign(
    (sel?: (s: unknown) => unknown) =>
      (typeof sel === 'function' ? sel({ user: mockUser }) : { user: mockUser }),
    { getState: () => ({ user: mockUser }), setState: jest.fn(), subscribe: jest.fn() },
  ),
}));

const mockPushed: string[] = [];
const mockBack = jest.fn();
jest.mock('@/src/utils/typedRouter', () => ({
  nav: {
    push: (path: string) => { mockPushed.push(path); },
    replace: jest.fn(),
    back: () => mockBack(),
  },
}));

interface Asked {
  columns: string;
  opts: unknown;
  eq: Record<string, unknown>;
  is: Record<string, unknown>;
  ilike: Record<string, unknown>;
  order?: [string, unknown];
  range?: [number, number];
  limit?: number;
}
let mockAsked: Asked[] = [];
let mockSearchRows: unknown[] = [];
let mockFilingRows: unknown[] = [];
let mockOldest: string | null = null;
let mockCount: number | null = null;

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: () => {
      const asked: Asked = { columns: '', opts: undefined, eq: {}, is: {}, ilike: {} };
      mockAsked.push(asked);
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = (c: string, o?: unknown) => { asked.columns = c; asked.opts = o; return self(); };
      chain.eq = (k: string, v: unknown) => { asked.eq[k] = v; return self(); };
      chain.is = (k: string, v: unknown) => { asked.is[k] = v; return self(); };
      chain.ilike = (k: string, v: unknown) => { asked.ilike[k] = v; return self(); };
      chain.order = (k: string, o: unknown) => { asked.order = [k, o]; return self(); };
      chain.in = () => Promise.resolve({ data: [], error: null });
      chain.range = (a: number, b: number) => {
        asked.range = [a, b];
        return Promise.resolve({
          data: mockFilingRows, error: null,
          count: mockCount ?? mockFilingRows.length,
        });
      };
      chain.limit = (n: number) => {
        asked.limit = n;
        // Two different reads end in `.limit`: the title search, and the single
        // oldest row the span needs. They are told apart by what was ordered.
        const ascending = (asked.order?.[1] as { ascending?: boolean })?.ascending === true;
        return Promise.resolve({
          data: ascending ? (mockOldest ? [{ created_at: mockOldest }] : []) : mockSearchRows,
          error: null,
        });
      };
      chain.then = (res: (v: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(res);
      return chain;
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  },
}));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn() }));
jest.mock('@/src/utils/offlineQueue', () => ({
  enqueueMutation: jest.fn(), flushOfflineQueue: jest.fn(), getOfflineQueue: () => [],
}));

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).toISOString();

/** A row as the title search reads it — five columns, not a whole card. */
const hit = (over: Record<string, unknown> = {}) => ({
  subject_id: 42, subject_title: 'Stalker', subject_sub: '1979 · TARKOVSKY',
  subject_image: null, created_at: at(2026, 8, 28), ...over,
});

const filing = (over: Record<string, unknown> = {}) => ({
  id: 'f1', kind: 'take', user_id: 'u2', author_username: 'tomasreyes',
  subject_kind: 'film', subject_id: 42, subject_title: 'Stalker',
  subject_sub: '1979 · TARKOVSKY', subject_image: null,
  title: null, body: 'Stalker is not slow, it is patient.',
  source: null, source_url: null, options: null, closes_at: null,
  frozen_totals: null, answer_id: null,
  series_id: null, series_title: null, part_number: null,
  spoiler_label: null, withheld_at: null, ended_at: null, ended_by: null,
  certify_count: 5, comment_count: 1,
  created_at: at(2026, 8, 28), edited_at: null,
  profiles: { username: 'tomasreyes', member_no: 147, tier: 'free', role: null, is_founding: false },
  ...over,
});

const store = () => useDispatch.setState({
  filings: [], loading: false, loadingMore: false, hasMore: false, droppedRows: 0,
  section: 'ALL', sort: 'LATEST', savedOnly: false, newCount: 0,
  certifiedIds: new Set(), savedIds: new Set(), myVotes: {},
  critiques: {}, critiquesLoading: {}, critiquesLoadingMore: {},
  critiquesHasMore: {}, critiquesOrder: {}, certifiedCritiqueIds: new Set(),
} as never);

/**
 * Type into the archive's own search row and let the debounce fire.
 *
 * `fireEvent` awaits an `act` of its OWN (`fire-event.js:92`), so wrapping it in
 * another one nests them and React says "overlapping act() calls". Awaited on
 * its own here; the separate act is only for driving the debounce clock.
 */
const type = async (r: ReturnType<typeof render>, text: string) => {
  await fireEvent.changeText(r.getByLabelText('Search the archive for a film'), text);
  await act(async () => {
    jest.advanceTimersByTime(400);
    await Promise.resolve(); await Promise.resolve();
  });
};

beforeEach(() => {
  jest.useFakeTimers();
  mockAsked = [];
  mockSearchRows = [];
  mockFilingRows = [];
  mockOldest = null;
  mockCount = null;
  mockPushed.length = 0;
  mockBack.mockClear();
  mockUser = { id: 'u1', username: 'me', tier: 'archivist' };
  store();
});
afterEach(() => { jest.useRealTimers(); });

const search = () => mockAsked.find((a) => a.ilike.subject_title !== undefined);

describe('the archive', () => {
  it('searches what the house has written, not what TMDB knows', async () => {
    mockSearchRows = [hit(), hit({ created_at: at(2025, 1, 4) })];
    const r = render(<ArchiveScreen />);
    await act(async () => { await Promise.resolve(); });
    await type(r, 'stalker');

    const q = search();
    expect(q).toBeDefined();
    // The house's own rows, under the same three gates the feed uses.
    expect(q!.eq.subject_kind).toBe('film');
    expect(q!.eq.is_published).toBe(true);
    expect(q!.is.withheld_at).toBeNull();
    expect(q!.is.ended_at).toBeNull();
    // Two rows, one film — grouped, with the count of what it found.
    expect(r.getByText('Stalker')).toBeTruthy();
    expect(r.getByText('2 FILINGS')).toBeTruthy();
  });

  it('escapes the wildcards a film title may legally contain', async () => {
    const r = render(<ArchiveScreen />);
    await act(async () => { await Promise.resolve(); });
    await type(r, '8_½');
    // Unescaped, `_` matches any character and `8_½` would find `8½` variants
    // and anything else three characters long that starts with 8.
    expect(search()!.ilike.subject_title).toBe('%8\\_½%');
  });

  it('escapes the wildcard that is NOT a SQL one', async () => {
    /**
     * `*` is PostgREST's own alias for `%` inside an ilike value. A hand-rolled
     * escaper covering `%` and `_` — which is what this hook shipped with for
     * an hour — leaves it live, and a member typing `*` matches every filing
     * the house has. `searchWiring.guard.test.ts` is what refused it, and
     * `buildSearchPattern` is what covers it.
     */
    const r = render(<ArchiveScreen />);
    await act(async () => { await Promise.resolve(); });
    await type(r, 'sta*ker');
    expect(search()!.ilike.subject_title).toBe('%sta\\*ker%');
  });

  it('refuses a term that would match everything', async () => {
    // A term of nothing but the characters PostgREST's filter parser owns
    // becomes nothing but wildcards. `buildSearchPattern` returns null and the
    // query is not run at all.
    const r = render(<ArchiveScreen />);
    await act(async () => { await Promise.resolve(); });
    await type(r, '(),');
    expect(search()).toBeUndefined();
  });

  it('waits for the typing to stop', async () => {
    const r = render(<ArchiveScreen />);
    await act(async () => { await Promise.resolve(); });
    // Each awaited on its own — fireEvent brings its own act.
    await fireEvent.changeText(r.getByLabelText('Search the archive for a film'), 'sta');
    await fireEvent.changeText(r.getByLabelText('Search the archive for a film'), 'stal');
    await fireEvent.changeText(r.getByLabelText('Search the archive for a film'), 'stalk');
    // Nothing yet: three keystrokes are not three requests.
    expect(search()).toBeUndefined();
    await act(async () => { jest.advanceTimersByTime(400); await Promise.resolve(); });
    expect(search()).toBeDefined();
  });

  it('asks nothing for one letter', async () => {
    const r = render(<ArchiveScreen />);
    await act(async () => { await Promise.resolve(); });
    await type(r, 's');
    expect(search()).toBeUndefined();
    expect(r.getByText(/Name a film/)).toBeTruthy();
  });

  it('prints the house’s count and the real span, not the page’s', async () => {
    mockSearchRows = [hit()];
    mockFilingRows = [filing()];
    mockCount = 60;           // the house has sixty
    mockOldest = at(2019, 4, 2);
    const r = render(<ArchiveScreen />);
    await act(async () => { await Promise.resolve(); });
    await type(r, 'stalker');

    await act(async () => {
      fireEvent.press(r.getByLabelText(/Stalker\. 1 filing/));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });

    // Sixty, from `count: 'exact'` — the page holds one.
    expect(r.getByText(/60 FILINGS/)).toBeTruthy();
    // And 2019–2026, which needs the OLDEST row: the page in hand is all 2026.
    expect(r.getByText(/2019–2026/)).toBeTruthy();
    const filings = mockAsked.find((a) => a.range !== undefined);
    expect(filings?.opts).toEqual({ count: 'exact' });
    expect(filings?.eq.subject_id).toBe(42);
  });

  it('goes back to the search first, and out of the archive second', async () => {
    mockSearchRows = [hit()];
    mockFilingRows = [filing()];
    const r = render(<ArchiveScreen />);
    await act(async () => { await Promise.resolve(); });
    await type(r, 'stalker');
    await act(async () => {
      fireEvent.press(r.getByLabelText(/Stalker\. 1 filing/));
      await Promise.resolve(); await Promise.resolve();
    });
    expect(r.getByText(/Stalker is not slow/)).toBeTruthy();

    // First press: back to the candidates, with the words still typed.
    await act(async () => { fireEvent.press(r.getByLabelText('Back')); });
    expect(mockBack).not.toHaveBeenCalled();
    expect(r.getByLabelText('Search the archive for a film').props.value).toBe('stalker');
    // Really back: the film's filings are gone and the candidates are there.
    expect(r.queryByText(/Stalker is not slow/)).toBeNull();
    expect(r.getByLabelText(/Stalker\. 1 filing/)).toBeTruthy();

    /**
     * Second press: out.
     *
     * The clock has to move first. `PressableScale` debounces on `Date.now()`,
     * and under fake timers Date.now is FROZEN — so two presses in one test are
     * simultaneous as far as the button is concerned and the second is
     * swallowed. It fails exactly as though the handler were stale, which is
     * where twenty minutes went before the debounce turned up.
     */
    await act(async () => { jest.advanceTimersByTime(1000); });
    await act(async () => { fireEvent.press(r.getByLabelText('Back')); });
    expect(mockBack).toHaveBeenCalled();
  });

  it('tells a member below the rank what it is, and shows them no dead search', async () => {
    mockUser = { id: 'u1', username: 'me', tier: 'free' };
    const r = render(<ArchiveScreen />);
    await act(async () => { await Promise.resolve(); });
    expect(r.getByText(/The archive is an Archivist’s room/)).toBeTruthy();
    // A search box that refuses to search is worse than no search box.
    expect(r.queryByLabelText('Search the archive for a film')).toBeNull();
    // And it is honest about what the rank buys: nothing here is secret.
    expect(r.getByText(/already on the page/)).toBeTruthy();
  });

  it('is reachable — the index row carries the door, and the head does not', async () => {
    /**
     * WHERE the door is, pinned, because it was in the wrong place first and
     * MEASURED out of it.
     *
     * The running head has half a point of slack: its issue line needs 207
     * points and is given 206.5. A magnifier there costs 25 of them, and
     * `WEDNESDAY, AUGUST 28` becomes `WEDNESDAY, AUGUST 2` — not a shortened
     * date, a wrong one. The index row is a horizontal scroll, so a mark beside
     * it takes nothing: the departments scroll a little sooner.
     */
    const { PaperChrome, RunningHead } = require('@/src/components/dispatch/paper/PaperFrame');
    const onArchive = jest.fn();

    const chrome = render(<PaperChrome section="ALL" onArchive={onArchive} />);
    await act(async () => {
      fireEvent.press(chrome.getByLabelText(/The archive\./));
    });
    expect(onArchive).toHaveBeenCalled();

    // And the running head does not take one, at all.
    const head = render(
      <RunningHead date={new Date(2026, 7, 28)} dayLabel="WEDNESDAY, AUGUST 28" sort="CERTIFIED" />,
    );
    expect(head.queryByLabelText(/The archive\./)).toBeNull();
  });

  it('says the three empty pages apart', async () => {
    const r = render(<ArchiveScreen />);
    await act(async () => { await Promise.resolve(); });
    // Nothing typed.
    expect(r.getByText(/Name a film/)).toBeTruthy();

    // Typed, nothing found — which is a different fact from the house being
    // empty, and a single "no results" would tell a member the first thing.
    mockSearchRows = [];
    await type(r, 'zzzz');
    expect(r.getByText(/Nobody has filed about that film/)).toBeTruthy();
  });
});
