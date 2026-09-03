/**
 * dispatchReads.test.ts — the page, the next page, and what is above it.
 * ─────────────────────────────────────────────────────────────────────────────
 * `fetch`, `loadMore`, `checkForNew` and the three index controls were 312 of
 * the store's never-executed statements. They decide what a member sees on the
 * tab they open the app on, and nothing had ever run one of them.
 *
 * The keyset cursor is the part worth the most care. Ordered by CERTIFIED the
 * page is ordered by TWO columns, so the cursor needs both — with only the
 * count, every row sharing a count with the last row of a page is skipped, and
 * a member never learns that the filings exist.
 */
import { useDispatch } from '../dispatch';
import { PAGE_SIZE } from '../dispatchTypes';

interface Ask {
  eq: Record<string, unknown>; is: Record<string, unknown>;
  order: string[]; or: string[]; limit?: number; in?: [string, unknown[]];
}
let mockAsks: Ask[] = [];
let mockPages: unknown[][] = [];
let mockCount: number | null = null;
let mockThrow: unknown = null;

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => {
      const ask: Ask = { eq: {}, is: {}, order: [], or: [] };
      mockAsks.push(ask);
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = (_c: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.head) {
          // `checkForNew` asks for a HEAD count. Its whole chain — eq, is, gt,
          // abortSignal — has to return the SAME object, because the store
          // hands the builder to `withAbortSignal` and awaits what comes back.
          // Returning the outer chain from `eq` broke it, and the count arrived
          // as zero, which is indistinguishable from "nothing new".
          const head: Record<string, unknown> = Promise.resolve({ count: mockCount, error: null }) as never;
          for (const m of ['eq', 'is', 'gt', 'abortSignal']) {
            head[m] = (k?: string, v?: unknown) => {
              if (m === 'gt' && k) ask.eq['gt:' + k] = v;
              if (m === 'eq' && k) ask.eq[k] = v;
              return head;
            };
          }
          ask.limit = -1; // marks this as the head count, not a page
          return head;
        }
        return self();
      };
      chain.eq = (k: string, v: unknown) => { ask.eq[k] = v; return self(); };
      chain.is = (k: string, v: unknown) => { ask.is[k] = v; return self(); };
      chain.gt = (k: string, v: unknown) => { ask.eq['gt:' + k] = v; return self(); };
      chain.in = (k: string, v: unknown[]) => { ask.in = [k, v]; return self(); };
      chain.or = (s: string) => { ask.or.push(s); return self(); };
      chain.order = (k: string) => { ask.order.push(k); return self(); };
      chain.limit = (n: number) => {
        ask.limit = n;
        // A BUILDER, even when it fails. The first draft returned a bare
        // `Promise.reject` here; `withAbortSignal` then threw on the missing
        // `.abortSignal`, nothing ever attached a handler to the rejected
        // promise, and Node killed the worker with an unhandled rejection that
        // looked like a bug in the store.
        const r = mockThrow
          ? Promise.reject(mockThrow)
          : Promise.resolve({ data: mockPages.shift() ?? [], error: null, count: mockCount });
        const builder = Object.assign(r, { abortSignal: () => builder });
        return builder;
      };
      chain.range = () => {
        const r = Promise.resolve({ data: [], error: null });
        return Object.assign(r, { abortSignal: () => r });
      };
      return chain;
    },
  },
}));

jest.mock('../auth', () => ({
  useAuthStore: { getState: jest.fn().mockReturnValue({ user: { id: 'u1', username: 'me' } }) },
}));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));
jest.mock('../../utils/offlineQueue', () => ({
  enqueueMutation: jest.fn(), flushOfflineQueue: jest.fn(), getOfflineQueue: () => [],
}));
jest.mock('../../utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() });
  return { __esModule: true, default: fn };
});
jest.mock('../../lib/sentry', () => ({ captureError: jest.fn() }));

const row = (n: number, over: Record<string, unknown> = {}) => ({
  id: 'f' + n, kind: 'take', user_id: 'u2', author_username: 'someone',
  body: 'A take, number ' + n, certify_count: 100 - n, comment_count: 0,
  created_at: new Date(2026, 7, 28, 12, 0, 0, 0).toISOString(),
  edited_at: null, profiles: null, ...over,
});
const fullPage = (from = 0) => Array.from({ length: PAGE_SIZE }, (_, i) => row(from + i));

/** The page query is the LAST read with a limit — viewer state reads come after. */
const pageAsk = () => [...mockAsks].reverse().find((a) => a.limit === PAGE_SIZE);

const reset = (over: Record<string, unknown> = {}) => {
  useDispatch.setState({
    filings: [], loading: false, loadingMore: false, hasMore: true, droppedRows: 0,
    section: 'ALL', sort: 'LATEST', savedOnly: false, newCount: 0,
    certifiedIds: new Set(), savedIds: new Set(), myVotes: {},
    critiques: {}, critiquesLoading: {}, critiquesLoadingMore: {},
    critiquesHasMore: {}, critiquesOrder: {}, certifiedCritiqueIds: new Set(),
    ...over,
  } as never);
};

beforeEach(() => {
  mockAsks = []; mockPages = []; mockCount = null; mockThrow = null;
  reset();
});

describe('the first page', () => {
  it('asks only for published, un-withheld filings', async () => {
    mockPages = [fullPage()];
    await useDispatch.getState().fetch();
    const q = pageAsk()!;
    expect(q.eq.is_published).toBe(true);
    expect(q.is.withheld_at).toBeNull();
    expect(q.limit).toBe(PAGE_SIZE);
    expect(useDispatch.getState().filings).toHaveLength(PAGE_SIZE);
    expect(useDispatch.getState().loading).toBe(false);
  });

  it('a full page means there may be more; a short one is the end', async () => {
    mockPages = [fullPage()];
    await useDispatch.getState().fetch();
    expect(useDispatch.getState().hasMore).toBe(true);

    reset();
    mockPages = [[row(1)]];
    await useDispatch.getState().fetch();
    expect(useDispatch.getState().hasMore).toBe(false);
  });

  it('counts the rows it had to drop instead of hiding them', async () => {
    // A row that fails the boundary schema is dropped rather than rendered
    // blank — and the count is surfaced, so a column rename is visible.
    mockPages = [[row(1), { id: 'bad', kind: 'not-a-kind' }, row(2)]];
    await useDispatch.getState().fetch();
    expect(useDispatch.getState().filings).toHaveLength(2);
    expect(useDispatch.getState().droppedRows).toBe(1);
  });

  it('clears loading even when the read fails', async () => {
    mockThrow = new Error('refused');
    // try/catch rather than `.rejects`: the store assigns this promise to its
    // in-flight slot before anything attaches a handler, so Node reports an
    // unhandled rejection and kills the worker before the matcher runs.
    let threw = false;
    try { await useDispatch.getState().fetch(); } catch { threw = true; }
    expect(threw).toBe(true);
    // A spinner that never stops is how an app tells somebody their tap did
    // nothing, and this is the path where it would happen.
    expect(useDispatch.getState().loading).toBe(false);
  });

  it('shares one in-flight request rather than starting two', async () => {
    mockPages = [fullPage(), fullPage(PAGE_SIZE)];
    const a = useDispatch.getState().fetch();
    const b = useDispatch.getState().fetch();
    await Promise.all([a, b]);
    // Not `expect(a).toBe(b)` — `fetch` is itself async, so each call returns
    // its own promise adopting the shared one, and identity was never the
    // claim. The claim is that the second call did not hit the network.
    expect(mockAsks.filter((q) => q.limit === PAGE_SIZE)).toHaveLength(1);
    expect(useDispatch.getState().filings).toHaveLength(PAGE_SIZE);
  });
});

describe('the index and the tools', () => {
  it('re-reads for a department rather than filtering what is loaded', async () => {
    mockPages = [[row(1, { kind: 'wire', source: 'Sight & Sound' })]];
    useDispatch.getState().setSection('WIRE');
    await Promise.resolve(); await Promise.resolve();
    expect(useDispatch.getState().section).toBe('WIRE');
    expect(pageAsk()?.eq.kind).toBe('wire');
  });

  it('does nothing at all when the section has not changed', async () => {
    mockPages = [fullPage()];
    useDispatch.getState().setSection('ALL');
    expect(mockAsks).toHaveLength(0);
  });

  it('orders by the column the page says it is ordered by', async () => {
    mockPages = [fullPage()];
    useDispatch.getState().setSort('CERTIFIED');
    await Promise.resolve(); await Promise.resolve();
    expect(pageAsk()?.order).toEqual(['certify_count', 'id']);
  });

  it('asks for nothing at all when the saved page is empty', async () => {
    // An empty `in.()` is a request PostgREST refuses, so the empty case is
    // answered without a round trip rather than by asking a broken question.
    reset({ savedOnly: false, savedIds: new Set() });
    useDispatch.getState().setSavedOnly(true);
    await Promise.resolve(); await Promise.resolve();
    expect(useDispatch.getState().filings).toEqual([]);
    expect(mockAsks.every((a) => !a.in)).toBe(true);
  });

  it('asks for exactly the saved ids when there are some', async () => {
    reset({ savedIds: new Set(['f1', 'f2']) });
    mockPages = [[row(1)]];
    useDispatch.getState().setSavedOnly(true);
    await Promise.resolve(); await Promise.resolve();
    expect(pageAsk()?.in?.[0]).toBe('id');
    expect((pageAsk()?.in?.[1] as string[]).sort()).toEqual(['f1', 'f2']);
  });
});

describe('the next page', () => {
  it('carries a TWO-column cursor under CERTIFIED', async () => {
    // One column is not enough: every row sharing a certify count with the last
    // row of the previous page would be stepped over and never seen.
    mockPages = [fullPage(), fullPage(PAGE_SIZE)];
    reset({ sort: 'CERTIFIED' });
    await useDispatch.getState().fetch();
    await useDispatch.getState().loadMore();

    const cursor = pageAsk()!.or[0];
    expect(cursor).toContain('certify_count.lt.');
    expect(cursor).toContain('and(certify_count.eq.');
    expect(cursor).toContain('id.lt.');
  });

  it('carries a two-column cursor under LATEST too', async () => {
    mockPages = [fullPage(), fullPage(PAGE_SIZE)];
    await useDispatch.getState().fetch();
    await useDispatch.getState().loadMore();
    const cursor = pageAsk()!.or[0];
    expect(cursor).toContain('created_at.lt.');
    expect(cursor).toContain('and(created_at.eq.');
  });

  it('does not add a filing it is already holding', async () => {
    // A filing posted between the two requests shifts the window; without the
    // de-duplication the same row arrives twice and FlashList gets a duplicate
    // key.
    mockPages = [fullPage(), [row(0), row(1), row(999)]];
    await useDispatch.getState().fetch();
    await useDispatch.getState().loadMore();
    const ids = useDispatch.getState().filings.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('f999');
  });

  it('refuses when there is nothing loaded, nothing more, or a read running', async () => {
    for (const state of [
      { filings: [], hasMore: true },
      { filings: [{ id: 'f1' }], hasMore: false },
      { filings: [{ id: 'f1' }], hasMore: true, loading: true },
      { filings: [{ id: 'f1' }], hasMore: true, loadingMore: true },
    ]) {
      mockAsks = [];
      reset(state as never);
      await useDispatch.getState().loadMore();
      expect(mockAsks).toHaveLength(0);
    }
  });
});

describe('is there new paper above the page?', () => {
  it('counts what has arrived since the newest filing on screen', async () => {
    mockPages = [fullPage()];
    await useDispatch.getState().fetch();
    mockCount = 3;
    await useDispatch.getState().checkForNew();
    expect(useDispatch.getState().newCount).toBe(3);
  });

  it('does not ask under CERTIFIED, on the saved page, or with nothing loaded', async () => {
    for (const state of [
      { filings: [{ id: 'f1', createdAt: 'x' }], sort: 'CERTIFIED' },
      { filings: [{ id: 'f1', createdAt: 'x' }], savedOnly: true },
      { filings: [] },
    ]) {
      mockAsks = [];
      reset(state as never);
      await useDispatch.getState().checkForNew();
      // "New above you" names a position that does not exist when the page is
      // not chronological, and nothing arrives on the saved page that the
      // member did not put there.
      expect(mockAsks).toHaveLength(0);
    }
  });
});
