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
 *   · the first read asks for exactly COMMENT_PAGE_SIZE, from the top
 *   · the second begins after the last row the first was sent, by its place, never by a count
 *   · a full page means "maybe more"; a short one means the end
 *   · CERTIFIED is ordered by the SERVER, with a tiebreaker, not on the device
 *   · changing the order starts again from the first page
 *   · a critique already held is not added twice
 */
import { useDispatch } from '../dispatch';
import { COMMENT_PAGE_SIZE } from '../dispatchTypes';
import { keysetAfter } from '../../utils/keysetCursor';

/** One read of a page: its order, the row it begins after (`or`), and how many it asks for. */
interface Ask { order: [string, unknown][]; or: string | null; limit: number | null; eq: Record<string, unknown>; }
let mockAsks: Ask[] = [];
/** Each read's answer, in turn: rows, a failure, or a promise of either (an answer held back). */
let mockRows: (unknown[] | Error | Promise<unknown[] | Error>)[] = [];

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => {
      const ask: Ask = { order: [], or: null, limit: null, eq: {} };
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
      chain.or = (f: string) => { ask.or = f; return self(); };
      chain.limit = (n: number) => {
        ask.limit = n;
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
    critiquesHasMore: {}, critiquesAfter: {}, critiquesOrder: {}, certifiedCritiqueIds: new Set(),
  });
});

const reads = () => mockAsks.filter((a) => a.limit !== null);
/** The filter a page after row `n` carries, in each order. */
const afterNewest = (n: number) => keysetAfter([
  { column: 'created_at', direction: 'desc', value: row(n).created_at },
  { column: 'id', direction: 'desc', value: row(n).id },
]);
const afterCertified = (n: number, certs = 0) => keysetAfter([
  { column: 'certify_count', direction: 'desc', value: certs },
  { column: 'created_at', direction: 'desc', value: row(n).created_at },
  { column: 'id', direction: 'desc', value: row(n).id },
]);

describe('paging a filing’s critiques', () => {
  it('asks for exactly one page, from the beginning', async () => {
    mockRows = [fullPage(0)];
    await useDispatch.getState().fetchCritiques('p1', 'NEWEST');

    const read = reads()[0];
    expect(read?.limit).toBe(COMMENT_PAGE_SIZE);
    expect(read?.or).toBeNull();
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

  it('continues after the last row it was sent, and keeps both pages', async () => {
    mockRows = [fullPage(0), fullPage(COMMENT_PAGE_SIZE)];
    await useDispatch.getState().fetchCritiques('p1', 'NEWEST');
    await useDispatch.getState().loadMoreCritiques('p1');

    expect(reads().map((a) => [a.or, a.limit])).toEqual([
      [null, COMMENT_PAGE_SIZE],
      [afterNewest(COMMENT_PAGE_SIZE - 1), COMMENT_PAGE_SIZE],
    ]);
    expect(useDispatch.getState().critiques.p1).toHaveLength(COMMENT_PAGE_SIZE * 2);
  });

  it('under CERTIFIED, the next page begins after the last row on all three of its places: its count, when, its id', async () => {
    mockRows = [Array.from({ length: COMMENT_PAGE_SIZE }, (_, i) => row(i, 3)), fullPage(COMMENT_PAGE_SIZE)];
    await useDispatch.getState().fetchCritiques('p1', 'CERTIFIED');
    await useDispatch.getState().loadMoreCritiques('p1');
    expect(reads()[1]?.or).toBe(afterCertified(COMMENT_PAGE_SIZE - 1, 3));
  });

  it("a critique of the member's own, set at the top, does not move the next page past a row", async () => {
    // Under CERTIFIED the new critique (no certifications) sorts BELOW the rows read on the house;
    // the next page began at the rows HELD, one past the true next row, and skipped it.
    mockRows = [fullPage(0), fullPage(COMMENT_PAGE_SIZE)];
    await useDispatch.getState().fetchCritiques('p1', 'CERTIFIED');
    await useDispatch.getState().addCritique('p1', 'Mine, just now.');
    expect(useDispatch.getState().critiques.p1).toHaveLength(COMMENT_PAGE_SIZE + 1);
    await useDispatch.getState().loadMoreCritiques('p1');
    expect(reads()[1]?.or).toBe(afterCertified(COMMENT_PAGE_SIZE - 1));
  });

  it('a row the house sent and the parser dropped still stands in the order: the next page follows it', async () => {
    const page = fullPage(0);
    mockRows = [[...page.slice(0, -1), { ...page[page.length - 1], body: 7 }], fullPage(COMMENT_PAGE_SIZE)];
    await useDispatch.getState().fetchCritiques('p1', 'NEWEST');
    expect(useDispatch.getState().critiques.p1).toHaveLength(COMMENT_PAGE_SIZE - 1);
    await useDispatch.getState().loadMoreCritiques('p1');
    expect(reads()[1]?.or).toBe(afterNewest(COMMENT_PAGE_SIZE - 1));
  });

  it('a critique withdrawn from a page read leaves the next page beginning after the same last row', async () => {
    mockRows = [fullPage(0), fullPage(COMMENT_PAGE_SIZE)];
    await useDispatch.getState().fetchCritiques('p1', 'NEWEST');
    await useDispatch.getState().removeCritique('c3', 'p1');
    await useDispatch.getState().loadMoreCritiques('p1');
    expect(reads()[1]?.or).toBe(afterNewest(COMMENT_PAGE_SIZE - 1));
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
    const before = reads().length;

    await useDispatch.getState().loadMoreCritiques('p1');
    expect(reads().length).toBe(before);
  });

  it('orders CERTIFIED on the server, with a tiebreaker', async () => {
    mockRows = [fullPage(0)];
    await useDispatch.getState().fetchCritiques('p1', 'CERTIFIED');

    const read = reads()[0]!;
    expect(read.order.map(([k]) => k)).toEqual(['certify_count', 'created_at', 'id']);
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
    expect(reads()[reads().length - 1]?.or).toBeNull();
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
    expect(printed).toBe(reads()[0]!.limit);
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

  it('a first page asked again in the same order: the older answer, landing last, is not drawn', async () => {
    // A notice read the filing again while its first read was still out.
    let answerOlder: (rows: unknown[]) => void = () => {};
    mockRows = [new Promise<unknown[]>((res) => { answerOlder = res; }), [row(7), row(8)]];
    const first = useDispatch.getState().fetchCritiques('p1', 'NEWEST');
    await useDispatch.getState().fetchCritiques('p1', 'NEWEST');
    answerOlder([row(1)]);
    await first;
    expect(useDispatch.getState().critiques.p1?.map((c) => c.id)).toEqual(['c7', 'c8']);
    expect(useDispatch.getState().critiquesLoading.p1).toBe(false);
  });

  it('a next page of a read since asked again is not joined to the new first page, and its spinner is let down', async () => {
    let answerMore: (rows: unknown[]) => void = () => {};
    mockRows = [fullPage(0), new Promise<unknown[]>((res) => { answerMore = res; }), [row(900), row(901)]];
    await useDispatch.getState().fetchCritiques('p1', 'NEWEST');
    const more = useDispatch.getState().loadMoreCritiques('p1');
    expect(useDispatch.getState().critiquesLoadingMore.p1).toBe(true);
    await useDispatch.getState().fetchCritiques('p1', 'NEWEST');
    expect(useDispatch.getState().critiquesLoadingMore.p1).toBe(false);
    answerMore(fullPage(COMMENT_PAGE_SIZE));
    await more;
    expect(useDispatch.getState().critiques.p1?.map((c) => c.id)).toEqual(['c900', 'c901']);
  });
});

describe('a filing’s critiques read again, with the member’s own still queued', () => {
  afterEach(() => {
    const { useOfflineQueueStore } = require('../offlineQueueStore');
    useOfflineQueueStore.setState({ queued: [] });
  });

  it('a critique filed offline leads the page, and one taken off offline stays off, until the queue sends them', async () => {
    const { useOfflineQueueStore } = require('../offlineQueueStore');
    useOfflineQueueStore.setState({ queued: [
      { id: 'q1', type: 'add_critique', timestamp: Date.parse('2026-11-20T10:00:00Z'), owner: 'u1',
        payload: { _tempId: 'mine-1', id: 'mine-1', post_id: 'p1', user_id: 'u1', author_username: 'me', body: 'Filed from a tunnel.' } },
      { id: 'q2', type: 'remove_critique', timestamp: 2, owner: 'u1', payload: { id: 'c2', user_id: 'u1', post_id: 'p1' } },
      // Another filing's, and another member's left on this phone: neither laid here.
      { id: 'q3', type: 'add_critique', timestamp: 3, owner: 'u1', payload: { _tempId: 'x', post_id: 'p9', body: 'Elsewhere.' } },
      { id: 'q4', type: 'add_critique', timestamp: 4, owner: 'u7', payload: { _tempId: 'y', post_id: 'p1', body: 'Not mine.' } },
    ] });
    mockRows = [[row(1), row(2), row(3)]];
    await useDispatch.getState().fetchCritiques('p1', 'NEWEST');
    const drawn = useDispatch.getState().critiques.p1 ?? [];
    expect(drawn.map((c) => c.id)).toEqual(['mine-1', 'c1', 'c3']);
    expect(drawn[0]).toMatchObject({ body: 'Filed from a tunnel.', authorId: 'u1', certifyCount: 0 });
  });
});
