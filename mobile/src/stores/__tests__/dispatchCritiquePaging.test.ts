/**
 * dispatchCritiquePaging.test.ts — the critiques past the first page.
 * ─────────────────────────────────────────────────────────────────────────────
 * `fetchCritiques` asked for fifty rows, once, and there was no second call
 * anywhere in the app. `CritiqueFooter` then printed `162 MORE · 30 AT A TIME`
 * under the last of them — a Text, not a control. So a filing with more than
 * fifty critiques counted them on the page, offered the rest, and had no way to
 * reach a single one.
 *
 * Two numbers were wrong at once, which is how it survived review: the store
 * fetched 50 and the footer promised 30. Both now come from COMMENT_PAGE_SIZE.
 *
 * What is held here:
 *   · the first read asks for exactly COMMENT_PAGE_SIZE, from zero
 *   · the second continues from where the first stopped, and does not repeat it
 *   · a full page means "maybe more"; a short one means the end
 *   · CERTIFIED is ordered by the SERVER, with a tiebreaker, not on the device
 *   · changing the order starts again from the first page
 *   · a critique already held is not added twice
 */
import { useDispatch } from '../dispatch';
import { COMMENT_PAGE_SIZE } from '../dispatchTypes';

interface Ask { order: Array<[string, unknown]>; range: [number, number] | null; eq: Record<string, unknown>; }
let mockAsks: Ask[] = [];
let mockRows: unknown[][] = [];

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => {
      const ask: Ask = { order: [], range: null, eq: {} };
      mockAsks.push(ask);
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = () => self();
      chain.eq = (k: string, v: unknown) => { ask.eq[k] = v; return self(); };
      chain.in = () => Promise.resolve({ data: [], error: null });
      chain.order = (k: string, o: unknown) => { ask.order.push([k, o]); return self(); };
      chain.range = (a: number, b: number) => {
        ask.range = [a, b];
        const page = mockRows.shift() ?? [];
        const result = Promise.resolve({ data: page, error: null });
        // The store wraps every read in `withAbortSignal`, which calls
        // `.abortSignal(signal)` on the builder. A mock that returns a bare
        // Promise throws there, the store swallows it, and the test sees an
        // empty store — which two of these tests then "passed" against, because
        // undefined is falsy and no-more-pages looks the same as never-read.
        // The mock has to be a builder, not a result.
        return Object.assign(result, { abortSignal: () => result });
      };
      return chain;
    },
  },
}));

jest.mock('../auth', () => ({
  useAuthStore: {
    getState: jest.fn().mockReturnValue({ user: { id: 'u1', username: 'me' } }),
  },
}));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));
jest.mock('../../utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() });
  return { __esModule: true, default: fn };
});

/** One critique row in the shape PostgREST returns. */
const row = (n: number, certs = 0) => ({
  id: 'c' + n, post_id: 'p1', user_id: 'u' + n, author_username: 'member' + n,
  body: 'A critique, number ' + n, certify_count: certs,
  created_at: new Date(2026, 0, 1, 0, 0, n).toISOString(), edited_at: null,
  profiles: { username: 'member' + n, member_no: n, tier: 'cinephile', role: null, is_founding: false },
});

const fullPage = (offset: number) =>
  Array.from({ length: COMMENT_PAGE_SIZE }, (_, i) => row(offset + i));

beforeEach(() => {
  mockAsks = [];
  mockRows = [];
  useDispatch.setState({
    critiques: {}, critiquesLoading: {}, critiquesLoadingMore: {},
    critiquesHasMore: {}, critiquesOrder: {}, certifiedCritiqueIds: new Set(),
  });
});

describe('paging a filing’s critiques', () => {
  it('asks for exactly one page, from the beginning', async () => {
    mockRows = [fullPage(0)];
    await useDispatch.getState().fetchCritiques('p1', 'NEWEST');

    const read = mockAsks.find((a) => a.range);
    expect(read?.range).toEqual([0, COMMENT_PAGE_SIZE - 1]);
    expect(read?.eq.post_id).toBe('p1');
    expect(useDispatch.getState().critiques.p1).toHaveLength(COMMENT_PAGE_SIZE);
  });

  it('a full page means there may be more; a short one is the end', async () => {
    mockRows = [fullPage(0)];
    await useDispatch.getState().fetchCritiques('p1', 'NEWEST');
    expect(useDispatch.getState().critiquesHasMore.p1).toBe(true);

    mockAsks = [];
    mockRows = [[row(99)]];
    await useDispatch.getState().fetchCritiques('p2', 'NEWEST');
    expect(useDispatch.getState().critiquesHasMore.p2).toBe(false);
  });

  it('continues from where it stopped, and keeps both pages', async () => {
    mockRows = [fullPage(0), fullPage(COMMENT_PAGE_SIZE)];
    await useDispatch.getState().fetchCritiques('p1', 'NEWEST');
    await useDispatch.getState().loadMoreCritiques('p1');

    const ranges = mockAsks.filter((a) => a.range).map((a) => a.range);
    expect(ranges).toEqual([
      [0, COMMENT_PAGE_SIZE - 1],
      [COMMENT_PAGE_SIZE, COMMENT_PAGE_SIZE * 2 - 1],
    ]);
    expect(useDispatch.getState().critiques.p1).toHaveLength(COMMENT_PAGE_SIZE * 2);
  });

  it('does not add a critique it is already holding', async () => {
    // The server hands back a row the device already has — which is exactly what
    // happens to an optimistic critique the member has just written.
    mockRows = [fullPage(0), [row(0), row(1), row(500)]];
    await useDispatch.getState().fetchCritiques('p1', 'NEWEST');
    await useDispatch.getState().loadMoreCritiques('p1');

    const list = useDispatch.getState().critiques.p1;
    expect(list).toHaveLength(COMMENT_PAGE_SIZE + 1);
    expect(new Set(list.map((c) => c.id)).size).toBe(list.length);
  });

  it('will not ask again when the server has said there is no more', async () => {
    mockRows = [[row(1)]];
    await useDispatch.getState().fetchCritiques('p1', 'NEWEST');
    const before = mockAsks.filter((a) => a.range).length;

    await useDispatch.getState().loadMoreCritiques('p1');
    expect(mockAsks.filter((a) => a.range).length).toBe(before);
  });

  it('orders CERTIFIED on the server, with a tiebreaker', async () => {
    mockRows = [fullPage(0)];
    await useDispatch.getState().fetchCritiques('p1', 'CERTIFIED');

    const read = mockAsks.find((a) => a.range)!;
    expect(read.order.map(([k]) => k)).toEqual(['certify_count', 'created_at']);
    // Without the second key, two critiques on the same count could swap between
    // pages — which shows one twice and hides another entirely.
    expect(read.order.every(([, o]) => (o as { ascending: boolean }).ascending === false)).toBe(true);
  });

  it('starts again from the first page when the order changes', async () => {
    mockRows = [fullPage(0), fullPage(COMMENT_PAGE_SIZE), fullPage(0)];
    await useDispatch.getState().fetchCritiques('p1', 'NEWEST');
    await useDispatch.getState().loadMoreCritiques('p1');
    expect(useDispatch.getState().critiques.p1).toHaveLength(COMMENT_PAGE_SIZE * 2);

    await useDispatch.getState().fetchCritiques('p1', 'CERTIFIED');
    const ranges = mockAsks.filter((a) => a.range).map((a) => a.range);
    expect(ranges[ranges.length - 1]).toEqual([0, COMMENT_PAGE_SIZE - 1]);
    // The old order's rows are gone, not merged underneath the new label.
    expect(useDispatch.getState().critiques.p1).toHaveLength(COMMENT_PAGE_SIZE);
    expect(useDispatch.getState().critiquesOrder.p1).toBe('CERTIFIED');
  });
});

describe('the number the footer prints', () => {
  it('is the number the store actually asks for', () => {
    // The whole defect in one assertion: these were 30 and 50, in two files,
    // and the footer described a page size nothing used.
    const metrics = require('@/src/components/dispatch/paper/paperMetrics');
    expect(metrics.COMMENT_PAGE_SIZE).toBe(COMMENT_PAGE_SIZE);
    expect(metrics.PAGE_SIZE).toBe(require('../dispatchTypes').PAGE_SIZE);
  });
});
