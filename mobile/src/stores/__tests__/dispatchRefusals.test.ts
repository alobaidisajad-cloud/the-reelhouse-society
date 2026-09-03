/**
 * dispatchRefusals.test.ts — every line where the store declines to act.
 * ─────────────────────────────────────────────────────────────────────────────
 * What was left of the store's dark after the reads, the writes and the guards:
 * forty-seven statements, and every one of them a REFUSAL — no member, already
 * in that state, the member changed, the request is stale, the read failed.
 *
 * These are the least interesting lines to write and the most expensive ones to
 * get wrong, because each is the thing standing between a normal moment and a
 * bug with no visible symptom: a stale page overwriting a fresh one, a signed
 * out member's counts written back into somebody else's store, a second request
 * for a page already arriving.
 *
 * A guard that has never executed is a guard nobody has seen work.
 */
import { useDispatch } from '../dispatch';
import { PAGE_SIZE } from '../dispatchTypes';
import type { Filing } from '../dispatchTypes';

type Outcome = 'ok' | 'refused' | 'offline' | 'throw';
let mockOutcome: Outcome = 'ok';
let mockReadFails = false;
let mockUser: { id: string; username: string } | null = { id: 'u1', username: 'me' };
let mockPages: unknown[][] = [];
let mockCount: number | null = 0;
/** Called between the read being issued and its result being applied. */
let mockMidFlight: (() => void) | null = null;
const mockAsks: string[] = [];

/**
 * The store calls `registerStoreReset` at IMPORT time, which is before any
 * `const` in this file has been initialised — so a plain array here is still
 * undefined when the callback arrives, and the whole suite fails to load. It
 * lives on globalThis, created on first use by whichever runs first.
 */
const resets = (): Array<() => void> => {
  const g = globalThis as { __dispatchResets?: Array<() => void> };
  return (g.__dispatchResets ??= []);
};

const REFUSED = { data: null, error: { message: 'refused', code: '42501' } };
const netErr = () => Object.assign(new TypeError('Network request failed'), { name: 'TypeError' });
const answer = () => {
  if (mockOutcome === 'offline') return Promise.reject(netErr());
  if (mockOutcome === 'throw') return Promise.reject(new Error('boom'));
  if (mockOutcome === 'refused') return Promise.resolve(REFUSED);
  return Promise.resolve({ data: [], error: null });
};

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      mockAsks.push(table);
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      const settle = (data: unknown) => {
        const r = mockReadFails
          ? Promise.resolve({ data: null, error: { message: 'read refused' } })
          : Promise.resolve({ data, error: null, count: mockCount })
            .then((v) => { mockMidFlight?.(); return v; });
        const b = Object.assign(r, { abortSignal: () => b });
        return b;
      };
      chain.select = (_c: string, opts?: { head?: boolean }) => {
        if (opts?.head) {
          const head: Record<string, unknown> = (mockReadFails
            ? Promise.resolve({ count: null, error: { message: 'refused' } })
            : Promise.resolve({ count: mockCount, error: null })
              .then((v) => { mockMidFlight?.(); return v; })) as never;
          for (const m of ['eq', 'is', 'gt', 'abortSignal']) head[m] = () => head;
          return head;
        }
        return self();
      };
      chain.eq = () => self(); chain.is = () => self(); chain.gt = () => self();
      chain.order = () => self(); chain.or = () => self();
      chain.in = () => (mockReadFails
        ? Promise.reject(new Error('viewer read failed'))
        : Promise.resolve({ data: [], error: null }));
      chain.limit = () => settle(mockPages.shift() ?? []);
      chain.range = () => settle(mockPages.shift() ?? []);
      chain.maybeSingle = () => settle(null);
      chain.insert = () => answer();
      chain.update = () => self();
      chain.delete = () => self();
      chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => answer().then(res, rej);
      return chain;
    },
    rpc: () => answer(),
  },
}));

jest.mock('../auth', () => ({ useAuthStore: { getState: () => ({ user: mockUser }) } }));
jest.mock('../resetAllStores', () => ({
  registerStoreReset: (fn: () => void) => {
    const g = globalThis as { __dispatchResets?: Array<() => void> };
    (g.__dispatchResets ??= []).push(fn);
  },
}));
jest.mock('../../utils/offlineQueue', () => ({
  enqueueMutation: jest.fn(), flushOfflineQueue: jest.fn(), getOfflineQueue: () => [],
}));
jest.mock('../../utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() });
  return { __esModule: true, default: fn };
});
const mockCapture = jest.fn();
jest.mock('../../lib/sentry', () => ({ captureError: (...a: unknown[]) => mockCapture(...a) }));

const filing = (over: Partial<Filing> = {}): Filing => ({
  id: 'f1', kind: 'take', authorId: 'u1',
  author: { name: 'me', memberNo: 1, tier: 'free' },
  film: null, subjectId: null, subjectKind: null,
  title: null, body: 'A take.', fullContent: null,
  source: null, sourceUrl: null,
  options: null, closesAt: null, frozenTotals: null, answerId: null,
  seriesId: null, seriesTitle: null, partNumber: null,
  spoilerLabel: null, withheldAt: null, endedAt: null, endedBy: null,
  certifyCount: 4, commentCount: 1,
  createdAt: '2026-08-28T21:00:00Z', editedAt: null,
  ...over,
});
const rowOf = (n: number) => ({
  id: 'f' + n, kind: 'take', user_id: 'u2', author_username: 'x', body: 'b',
  certify_count: 1, comment_count: 0, created_at: '2026-08-28T21:00:00Z',
  edited_at: null, profiles: null,
});
const fullPage = () => Array.from({ length: PAGE_SIZE }, (_, i) => rowOf(i));

const reset = (over: Record<string, unknown> = {}) => {
  useDispatch.setState({
    filings: [], section: 'ALL', sort: 'LATEST', savedOnly: false,
    loading: false, loadingMore: false, hasMore: false, newCount: 0, droppedRows: 0,
    certifiedIds: new Set(), savedIds: new Set(), myVotes: {},
    critiques: {}, critiquesLoading: {}, critiquesLoadingMore: {},
    critiquesHasMore: {}, critiquesOrder: {}, certifiedCritiqueIds: new Set(),
    ...over,
  } as never);
};
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  mockOutcome = 'ok'; mockReadFails = false; mockMidFlight = null;
  mockUser = { id: 'u1', username: 'me' };
  mockPages = []; mockCount = 0;
  mockAsks.length = 0; mockCapture.mockClear();
  reset();
});

describe('it does not act for nobody', () => {
  it('refuses every act when there is no member', async () => {
    mockUser = null;
    reset({ filings: [filing()], critiques: { f1: [{ id: 'c1', postId: 'f1', authorId: 'u9', author: null, body: 'x', certifyCount: 0, createdAt: 'x', editedAt: null }] } });

    useDispatch.getState().certify('f1', true);
    useDispatch.getState().save('f1', true);
    useDispatch.getState().vote('f1', 1);
    useDispatch.getState().takeAnswer('f1', 'c1');
    useDispatch.getState().certifyCritique('c1', 'f1', true);
    expect(await useDispatch.getState().amend('f1', { body: 'x' })).toBeUndefined();
    expect(await useDispatch.getState().end('f1')).toBeUndefined();
    await useDispatch.getState().addCritique('f1', 'x');
    await useDispatch.getState().amendCritique('c1', 'f1', 'x');
    await useDispatch.getState().removeCritique('c1', 'f1');
    await settle();

    // Not one of them reached the network, and nothing on the page moved.
    expect(mockAsks).toHaveLength(0);
    expect(useDispatch.getState().filings[0].certifyCount).toBe(4);
    expect(useDispatch.getState().filings[0].commentCount).toBe(1);
  });

  it('refuses to act on a filing or critique it does not hold', async () => {
    reset({ filings: [] });
    expect(await useDispatch.getState().amend('nope', { body: 'x' })).toBeUndefined();
    expect(await useDispatch.getState().end('nope')).toBeUndefined();
    useDispatch.getState().takeAnswer('nope', 'c1');
    await useDispatch.getState().amendCritique('nope', 'nope', 'x');
    await useDispatch.getState().removeCritique('nope', 'nope');
    await settle();
    expect(mockAsks).toHaveLength(0);
  });

  it('refuses an empty amendment to a critique', async () => {
    const c = { id: 'c1', postId: 'f1', authorId: 'u1', author: null, body: 'First.', certifyCount: 0, createdAt: 'x', editedAt: null };
    reset({ filings: [filing()], critiques: { f1: [c] } });
    await useDispatch.getState().amendCritique('c1', 'f1', '   ');
    expect(useDispatch.getState().critiques.f1[0].body).toBe('First.');
    expect(mockAsks).toHaveLength(0);
  });
});

describe('it does not repeat itself', () => {
  it('ignores a sort or a saved-page toggle that changes nothing', async () => {
    reset({ sort: 'LATEST', savedOnly: false });
    useDispatch.getState().setSort('LATEST');
    useDispatch.getState().setSavedOnly(false);
    await settle();
    expect(mockAsks).toHaveLength(0);
  });

  it('ignores a mark that is already where it is being put', async () => {
    reset({ filings: [filing()], savedIds: new Set(['f1']), certifiedCritiqueIds: new Set(['c1']) });
    useDispatch.getState().save('f1', true);
    useDispatch.getState().certifyCritique('c1', 'f1', true);
    await settle();
    expect(mockAsks).toHaveLength(0);
  });

  it('will not fetch a second page of critiques while one is arriving', async () => {
    reset({ critiquesHasMore: { f1: true }, critiquesLoadingMore: { f1: true }, critiques: { f1: [] } });
    await useDispatch.getState().loadMoreCritiques('f1');
    expect(mockAsks).toHaveLength(0);
  });
});

describe('a request that arrives after the world moved on', () => {
  it('does not let a stale page overwrite a fresh one', async () => {
    // The member changes department while a page is in flight. Its rows belong
    // to the department they left, and writing them now would put takes on a
    // page of wires.
    mockPages = [fullPage(), [rowOf(99)]];
    const stale = useDispatch.getState().fetch();
    useDispatch.getState().setSection('WIRE');
    await stale;
    await settle();
    expect(useDispatch.getState().section).toBe('WIRE');
    expect(useDispatch.getState().filings.map((f) => f.id)).toEqual(['f99']);
  });

  it('does not let a page land in a different member’s store', async () => {
    mockPages = [fullPage()];
    mockMidFlight = () => { mockUser = { id: 'u2', username: 'someone-else' }; };
    await useDispatch.getState().fetch();
    expect(useDispatch.getState().filings).toHaveLength(0);
  });

  it('does not count new paper for a member who has left', async () => {
    reset({ filings: [filing()], sort: 'LATEST' });
    mockCount = 5;
    mockMidFlight = () => { mockUser = null; };
    await useDispatch.getState().checkForNew();
    expect(useDispatch.getState().newCount).toBe(0);
  });

  it('does not count new paper onto a page that is no longer chronological', async () => {
    // The check begins under LATEST and lands after the member switched to
    // CERTIFIED, where "new above you" names a position that does not exist.
    reset({ filings: [filing()], sort: 'LATEST' });
    mockCount = 5;
    mockMidFlight = () => { useDispatch.setState({ sort: 'CERTIFIED' } as never); };
    await useDispatch.getState().checkForNew();
    expect(useDispatch.getState().newCount).toBe(0);
  });

  it('does not check while a page is already being read', async () => {
    reset({ filings: [filing()], loading: true });
    await useDispatch.getState().checkForNew();
    expect(mockAsks).toHaveLength(0);
  });

  it('asks for the department it is in', async () => {
    reset({ filings: [filing()], section: 'WIRE' });
    mockCount = 2;
    await useDispatch.getState().checkForNew();
    expect(useDispatch.getState().newCount).toBe(2);
  });
});

describe('a read that fails', () => {
  it('leaves the pill alone rather than failing the feed over an ornament', async () => {
    reset({ filings: [filing()], newCount: 0 });
    mockReadFails = true;
    await useDispatch.getState().checkForNew();
    expect(useDispatch.getState().newCount).toBe(0);
    expect(mockCapture).toHaveBeenCalled();
  });

  it('leaves the page alone when the next page cannot be read', async () => {
    mockPages = [fullPage()];
    await useDispatch.getState().fetch();
    const before = useDispatch.getState().filings.length;
    mockReadFails = true;
    await useDispatch.getState().loadMore();
    expect(useDispatch.getState().filings).toHaveLength(before);
    expect(useDispatch.getState().loadingMore).toBe(false);
  });

  it('returns null from hydrate rather than throwing at the screen', async () => {
    mockReadFails = true;
    expect(await useDispatch.getState().hydrate('f1')).toBeNull();
    expect(mockCapture).toHaveBeenCalled();
  });

  it('leaves the marks alone when the viewer’s own state cannot be read', async () => {
    mockPages = [[rowOf(1)]];
    mockReadFails = true;
    await useDispatch.getState().fetch().catch(() => {});
    // Nothing is invented: no mark is set from a read that did not happen.
    expect(useDispatch.getState().certifiedIds.size).toBe(0);
    expect(useDispatch.getState().savedIds.size).toBe(0);
  });

  it('keeps the critique footer pressable when a page of them fails', async () => {
    // Marking it "no more" would turn one bad request into a permanent dead
    // end, so a failed page leaves `hasMore` exactly as it was.
    reset({ critiques: { f1: [] }, critiquesHasMore: { f1: true } });
    mockReadFails = true;
    await useDispatch.getState().fetchCritiques('f1', 'NEWEST');
    expect(useDispatch.getState().critiquesHasMore.f1).toBe(true);
    expect(useDispatch.getState().critiquesLoading.f1).toBe(false);
  });
});

describe('the logout reset', () => {
  it('empties the whole store', () => {
    reset({
      filings: [filing()], newCount: 4,
      certifiedIds: new Set(['f1']), savedIds: new Set(['f1']),
      myVotes: { f1: 1 }, critiques: { f1: [] },
    });
    expect(resets().length).toBeGreaterThan(0);
    resets().forEach((fn) => fn());

    const s = useDispatch.getState();
    expect(s.filings).toEqual([]);
    expect(s.newCount).toBe(0);
    expect(s.certifiedIds.size).toBe(0);
    expect(s.savedIds.size).toBe(0);
    expect(s.myVotes).toEqual({});
    expect(s.critiques).toEqual({});
  });
});
