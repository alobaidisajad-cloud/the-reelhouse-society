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

interface Ask { order: [string, unknown][]; range: [number, number] | null; eq: Record<string, unknown>; }
let mockAsks: Ask[] = [];
/** Each read's answer, in turn: rows, a failure, or a promise of either (an answer held back). */
let mockRows: (unknown[] | Error | Promise<unknown[] | Error>)[] = [];

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
      // A critique filed, and one withdrawn: both answered as landed.
      chain.insert = () => Promise.resolve({ error: null });
      chain.delete = () => {
        const del: Record<string, unknown> = {};
        del.eq = () => del;
        del.select = () => Promise.resolve({ data: [{ id: 'gone' }], error: null });
        return del;
      };
      chain.order = (k: string, o: unknown) => { ask.order.push([k, o]); return self(); };
      chain.range = (a: number, b: number) => {
        ask.range = [a, b];
        const result = Promise.resolve(mockRows.shift() ?? []).then((page) => (page instanceof Error ? { data: null, error: page } : { data: page, error: null }));
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
    critiquesHasMore: {}, critiquesRead: {}, critiquesOrder: {}, certifiedCritiqueIds: new Set(),
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

  it('a full page with a row it could not read is still a full page', async () => {
    // Measured on the parsed rows, one unreadable critique made the page
    // "short", and the rest of the thread was never offered.
    mockRows = [[...fullPage(0).slice(1), { id: null, body: 7 }]];
    await useDispatch.getState().fetchCritiques('p1', 'NEWEST');
    expect(useDispatch.getState().critiques.p1).toHaveLength(COMMENT_PAGE_SIZE - 1);
    expect(useDispatch.getState().critiquesHasMore.p1).toBe(true);
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

  it("a critique of the member's own, set at the top, does not move the next page past a row", async () => {
    // Under CERTIFIED the new critique (no certifications) sorts BELOW the rows read on the house;
    // the next page began at the rows HELD, one past the true next row, and skipped it.
    mockRows = [fullPage(0), fullPage(COMMENT_PAGE_SIZE)];
    await useDispatch.getState().fetchCritiques('p1', 'CERTIFIED');
    await useDispatch.getState().addCritique('p1', 'Mine, just now.');
    expect(useDispatch.getState().critiques.p1).toHaveLength(COMMENT_PAGE_SIZE + 1);
    await useDispatch.getState().loadMoreCritiques('p1');
    const ranges = mockAsks.filter((a) => a.range).map((a) => a.range);
    expect(ranges[1]).toEqual([COMMENT_PAGE_SIZE, COMMENT_PAGE_SIZE * 2 - 1]);
  });

  it('a row the house sent and the parser dropped still stands in the order: the next page follows it', async () => {
    mockRows = [[...fullPage(0).slice(1), { id: null, body: 7 }], fullPage(COMMENT_PAGE_SIZE)];
    await useDispatch.getState().fetchCritiques('p1', 'NEWEST');
    await useDispatch.getState().loadMoreCritiques('p1');
    const ranges = mockAsks.filter((a) => a.range).map((a) => a.range);
    expect(ranges[1]).toEqual([COMMENT_PAGE_SIZE, COMMENT_PAGE_SIZE * 2 - 1]);
  });

  it('a critique withdrawn from a page read moves the next page back one, so none is skipped', async () => {
    mockRows = [fullPage(0), fullPage(COMMENT_PAGE_SIZE - 1)];
    await useDispatch.getState().fetchCritiques('p1', 'NEWEST');
    await useDispatch.getState().removeCritique('c3', 'p1');
    await useDispatch.getState().loadMoreCritiques('p1');
    const ranges = mockAsks.filter((a) => a.range).map((a) => a.range);
    expect(ranges[1]).toEqual([COMMENT_PAGE_SIZE - 1, COMMENT_PAGE_SIZE * 2 - 2]);
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
  it('is the number of critiques the paging read actually asks for', async () => {
    // The whole defect in one assertion: these were 30 and 50, in two files,
    // and the footer described a page size nothing used. So the footer's number
    // is held to the read's own request, not to the constant it re-exports.
    const printed = require('@/src/components/dispatch/paper/paperMetrics').COMMENT_PAGE_SIZE;
    mockRows = [fullPage(0)];
    await useDispatch.getState().fetchCritiques('p1', 'NEWEST');
    const [from, to] = mockAsks.find((a) => a.range)!.range!;
    expect(printed).toBe(to - from + 1);
  });
});

/**
 * A first page that could not be read was drawn as no critiques under "N MORE", whose press did
 * nothing: no page had said there were more (review round 1, 2026-11-14).
 */
describe('a page of critiques that could not be read', () => {
  it('is said as failed, the first page or the next, and a read that lands clears it', async () => {
    mockRows = [new Error('Network request failed')];
    await useDispatch.getState().fetchCritiques('p1', 'NEWEST');
    expect(useDispatch.getState().critiquesFailed.p1).toBe(true);
    expect(useDispatch.getState().critiques.p1 ?? []).toHaveLength(0);

    mockRows = [fullPage(0), new Error('Network request failed')];
    await useDispatch.getState().fetchCritiques('p1', 'NEWEST');
    expect(useDispatch.getState().critiquesFailed.p1).toBe(false);
    await useDispatch.getState().loadMoreCritiques('p1');
    expect(useDispatch.getState().critiquesFailed.p1).toBe(true);
    // The rows already read stay, and the next page can be asked again.
    expect(useDispatch.getState().critiques.p1).toHaveLength(COMMENT_PAGE_SIZE);
    mockRows = [fullPage(COMMENT_PAGE_SIZE)];
    await useDispatch.getState().loadMoreCritiques('p1');
    expect(useDispatch.getState().critiquesFailed.p1).toBe(false);
    expect(useDispatch.getState().critiques.p1).toHaveLength(COMMENT_PAGE_SIZE * 2);
  });

  it('never draws an answer in an order the member has already left', async () => {
    // NEWEST asked, then CERTIFIED at once; NEWEST's answer comes last, under CERTIFIED, and is not drawn.
    let answerNewest: (rows: unknown[]) => void = () => {};
    mockRows = [new Promise<unknown[]>((res) => { answerNewest = res; }), [row(7, 9), row(8, 5)]];
    const first = useDispatch.getState().fetchCritiques('p1', 'NEWEST');
    await useDispatch.getState().fetchCritiques('p1', 'CERTIFIED');
    expect(useDispatch.getState().critiques.p1?.map((c) => c.id)).toEqual(['c7', 'c8']);
    answerNewest([row(1), row(2)]);
    await first;
    expect(useDispatch.getState().critiques.p1?.map((c) => c.id)).toEqual(['c7', 'c8']);
  });
});
