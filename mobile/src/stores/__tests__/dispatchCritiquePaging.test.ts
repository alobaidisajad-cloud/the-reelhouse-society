/**
 * dispatchCritiquePaging.test.ts — the critiques past the first page.
 * ─────────────────────────────────────────────────────────────────────────────
 * A filing with more critiques than one page offers the rest, a page at a time, and every page
 * begins after the last row read, never at a count of rows: a critique filed or withdrawn between
 * two pages, or a count of certifications that moved, shifted the next page past a row (skipped for
 * good) or back onto one (drawn twice).
 *
 * What is held here, against the house as strict as it is (test-utils/supabaseFake):
 *   · the first read asks for exactly COMMENT_PAGE_SIZE, newest first by moment and then id
 *   · NEWEST continues after the last row read, whatever was filed or withdrawn meanwhile
 *   · CERTIFIED reads its order once, beside its first page, and walks it: counts that move while
 *     the member reads skip and repeat no row of that order; past it, no row is drawn twice
 *   · a full page means "maybe more"; a short one means the end; a row the parser drops still counts
 *   · changing the order starts again from the first page; a failed page is said and asked again
 */
import { heldClient } from '@/test-utils/heldClient';
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useDispatch } from '../dispatch';
import { COMMENT_PAGE_SIZE } from '../dispatchTypes';

const POST = '00000000-0000-4000-9000-000000000001';
const AUTHOR = '55555555-5555-4555-8555-555555555555';
const profile = { id: AUTHOR, username: 'mara', avatar_url: null, member_no: 7, tier: 'auteur', role: null, is_founding: false };
const PAGE = COMMENT_PAGE_SIZE;
/** How many critiques' order the first page of CERTIFIED holds. */
const HELD = 1000;

const idOf = (n: number) => `0000000c-0000-4000-9000-${String(n).padStart(12, '0')}`;
const atOf = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * 1000).toISOString();
/** Critique n, filed n seconds into the year, with its certifications. */
const critique = (n: number, certs = 0) => ({
  id: idOf(n), post_id: POST, user_id: AUTHOR, author_username: 'mara', body: `Critique ${n}.`, certify_count: certs, created_at: atOf(n),
});

const houseOf = (rows: Record<string, unknown>[], fail = false) => supabaseFake({
  rows: { dispatch_comments: rows, profiles: [profile], dispatch_certifications: [] },
  ...(fail ? { fail: { dispatch_comments: { code: '08006', message: 'Network request failed' } } } : {}),
});
let mockHouse = houseOf([]);
let mockHeld: ReturnType<typeof heldClient> | null = null;
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHeld?.client ?? mockHouse.client; } }));
jest.mock('@/src/stores/auth', () => ({ useAuthStore: { getState: () => ({ user: { id: '33333333-3333-4333-8333-333333333333', username: 'kane' } }) } }));
jest.mock('@/src/stores/blockStore', () => ({ useBlockStore: { getState: () => ({ isHidden: () => false }) } }));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn() }));

const shown = () => useDispatch.getState().critiques[POST]?.map((c) => c.id) ?? [];
const reads = () => mockHouse.asked.filter((a) => a.table === 'dispatch_comments' && a.op === 'select');
const held = () => mockHouse.rows('dispatch_comments') as { id: string; certify_count: number }[];
const more = () => useDispatch.getState().loadMoreCritiques(POST);
/** Each page read, until the house says there are no more. */
const readToTheEnd = async () => { for (let i = 0; i < 100 && useDispatch.getState().critiquesHasMore[POST]; i++) await more(); };

beforeEach(() => {
  mockHeld = null;
  useDispatch.setState({
    critiques: {}, critiquesLoading: {}, critiquesLoadingMore: {}, critiquesFailed: {},
    critiquesHasMore: {}, critiquesNext: {}, critiquesOrder: {}, certifiedCritiqueIds: new Set(),
  } as never);
});

describe('NEWEST: each page after the last row read', () => {
  it('asks for exactly one page, newest first by moment and then id', async () => {
    mockHouse = houseOf(Array.from({ length: PAGE * 2 }, (_, n) => critique(n)));
    await useDispatch.getState().fetchCritiques(POST, 'NEWEST');
    const [read] = reads();
    expect(reads()).toHaveLength(1);
    expect(read?.limit).toBe(PAGE);
    expect(read?.filters).toContainEqual(['eq', 'post_id', POST]);
    expect(read?.order).toEqual([['created_at', false], ['id', false]]);
    expect(shown()).toEqual(Array.from({ length: PAGE }, (_, i) => idOf(PAGE * 2 - 1 - i)));
  });

  it('a full page means there may be more; a short one is the end, and asks nothing again', async () => {
    mockHouse = houseOf(Array.from({ length: PAGE }, (_, n) => critique(n)));
    await useDispatch.getState().fetchCritiques(POST, 'NEWEST');
    expect(useDispatch.getState().critiquesHasMore[POST]).toBe(true);
    await more();
    expect(useDispatch.getState().critiquesHasMore[POST]).toBe(false);
    const asked = reads().length;
    await more();
    expect(reads()).toHaveLength(asked);
    expect(shown()).toHaveLength(PAGE);
  });

  it('a critique filed, and one withdrawn, between two pages move no row past the next page', async () => {
    mockHouse = houseOf(Array.from({ length: PAGE * 2 }, (_, n) => critique(n)));
    await useDispatch.getState().fetchCritiques(POST, 'NEWEST');
    // Two filed above every row read, and one of the page read withdrawn.
    held().push(critique(10_000), critique(10_001));
    held().splice(held().findIndex((r) => r.id === idOf(PAGE * 2 - 3)), 1);
    await more();
    expect(shown()).toEqual(Array.from({ length: PAGE * 2 }, (_, i) => idOf(PAGE * 2 - 1 - i)));
    expect(new Set(shown()).size).toBe(shown().length);
  });

  it('a row the house sent and the parser dropped still stands in the order: the next page follows it', async () => {
    // The last row of the first page is one the parser cannot read.
    const last = PAGE;
    mockHouse = houseOf(Array.from({ length: PAGE * 2 }, (_, n) => (n === last ? { ...critique(n), body: 7 } : critique(n))));
    await useDispatch.getState().fetchCritiques(POST, 'NEWEST');
    expect(shown()).toHaveLength(PAGE - 1);
    expect(useDispatch.getState().critiquesHasMore[POST]).toBe(true);
    await more();
    expect(shown()).toEqual(Array.from({ length: PAGE * 2 }, (_, i) => idOf(PAGE * 2 - 1 - i)).filter((id) => id !== idOf(last)));
  });
});

describe('CERTIFIED: the order held as the first page was read', () => {
  it('is asked on the server, by count, then moment, then id, each highest first, beside the first page', async () => {
    mockHouse = houseOf(Array.from({ length: PAGE * 2 }, (_, n) => critique(n, n % 3)));
    await useDispatch.getState().fetchCritiques(POST, 'CERTIFIED');
    const [order, page] = reads();
    expect(reads()).toHaveLength(2);
    expect(order?.columns).toEqual(['id', 'certify_count', 'created_at']);
    expect(order?.limit).toBe(HELD);
    for (const read of [order, page]) expect(read?.order).toEqual([['certify_count', false], ['created_at', false], ['id', false]]);
    expect(page?.limit).toBe(PAGE);
  });

  it('counts that move while the member reads skip and repeat no row of the order held', async () => {
    // Three pages, each critique's count its place from the bottom: the order is 0, 1, 2 … by n.
    const N = PAGE * 3;
    mockHouse = houseOf(Array.from({ length: N }, (_, n) => critique(n, N - n)));
    await useDispatch.getState().fetchCritiques(POST, 'CERTIFIED');
    // Read while the member reads the first page: the last rows certified to the top, the first
    // page's own taken down to nothing.
    for (const r of held()) {
      const n = Number(r.id.slice(-12));
      r.certify_count = n >= N - 10 ? 10_000 + n : n < PAGE ? 0 : r.certify_count;
    }
    await more();
    await more();
    expect(useDispatch.getState().critiquesHasMore[POST]).toBe(false);
    // Every row of the order held, once each, in the order the member began reading.
    expect(shown()).toEqual(Array.from({ length: N }, (_, n) => idOf(n)));
    // Each next page was read by id, its rows as they stand now.
    expect(reads().slice(2).every((a) => a.filters.some(([op, col]) => op === 'in' && col === 'id'))).toBe(true);
    expect(useDispatch.getState().critiques[POST]?.find((c) => c.id === idOf(N - 1))?.certifyCount).toBe(10_000 + N - 1);
  });

  it('a critique of the member\'s own, set at the top, is not read again and moves no row past the next page', async () => {
    mockHouse = houseOf(Array.from({ length: PAGE * 2 }, (_, n) => critique(n, PAGE * 2 - n)));
    await useDispatch.getState().fetchCritiques(POST, 'CERTIFIED');
    await useDispatch.getState().addCritique(POST, 'Mine, just now.');
    await more();
    const mine = shown()[0];
    expect(shown().slice(1)).toEqual(Array.from({ length: PAGE * 2 }, (_, n) => idOf(n)));
    expect(shown().filter((id) => id === mine)).toHaveLength(1);
  });

  it('past the order held, by the last row read as it was read: no row is drawn twice', async () => {
    const N = HELD + PAGE * 2;
    mockHouse = houseOf(Array.from({ length: N }, (_, n) => critique(n, N - n)));
    await useDispatch.getState().fetchCritiques(POST, 'CERTIFIED');
    // Walked to the end of the order held, and one page past it.
    while (shown().length < HELD) await more();
    expect(shown()).toEqual(Array.from({ length: HELD }, (_, n) => idOf(n)));
    await more();
    expect(shown()).toHaveLength(HELD + PAGE);
    // Counts moved since: a row read past the order held, and a row of it, now fall below the rest.
    for (const r of held()) if (r.id === idOf(HELD + 3) || r.id === idOf(10)) r.certify_count = 0;
    await readToTheEnd();
    expect(new Set(shown()).size).toBe(shown().length);
    expect([...shown()].sort()).toEqual(Array.from({ length: N }, (_, n) => idOf(n)).sort());
  }, 20_000);

  it('starts again from the first page when the order changes, the old rows gone', async () => {
    mockHouse = houseOf(Array.from({ length: PAGE * 2 }, (_, n) => critique(n, n)));
    await useDispatch.getState().fetchCritiques(POST, 'NEWEST');
    await more();
    expect(shown()).toHaveLength(PAGE * 2);
    await useDispatch.getState().fetchCritiques(POST, 'CERTIFIED');
    expect(shown()).toHaveLength(PAGE);
    expect(useDispatch.getState().critiquesOrder[POST]).toBe('CERTIFIED');
    expect(useDispatch.getState().critiquesNext[POST]?.order).toBe('CERTIFIED');
  });
});

describe('the number the footer prints', () => {
  it('is the number of critiques the paging read actually asks for', async () => {
    const printed = require('@/src/components/dispatch/paper/paperMetrics').COMMENT_PAGE_SIZE;
    mockHouse = houseOf([critique(1)]);
    await useDispatch.getState().fetchCritiques(POST, 'NEWEST');
    expect(printed).toBe(reads()[0]?.limit);
  });
});

/**
 * A first page that could not be read was drawn as no critiques under "N MORE", whose press did
 * nothing: no page had said there were more.
 */
describe('a page of critiques that could not be read', () => {
  it('is said as failed, the first page or the next, and a read that lands clears it', async () => {
    const rows = Array.from({ length: PAGE * 2 }, (_, n) => critique(n));
    mockHouse = houseOf(rows, true);
    await useDispatch.getState().fetchCritiques(POST, 'NEWEST');
    expect(useDispatch.getState().critiquesFailed[POST]).toBe(true);
    expect(shown()).toHaveLength(0);

    mockHouse = houseOf(rows);
    await useDispatch.getState().fetchCritiques(POST, 'NEWEST');
    expect(useDispatch.getState().critiquesFailed[POST]).toBe(false);
    mockHouse = houseOf(rows, true);
    await more();
    expect(useDispatch.getState().critiquesFailed[POST]).toBe(true);
    // The rows already read stay, and the next page can be asked again.
    expect(shown()).toHaveLength(PAGE);
    mockHouse = houseOf(rows);
    await more();
    expect(useDispatch.getState().critiquesFailed[POST]).toBe(false);
    expect(shown()).toHaveLength(PAGE * 2);
  });

  it('never draws an answer in an order the member has already left', async () => {
    mockHouse = houseOf([critique(1, 1), critique(2, 9), critique(3, 5)]);
    mockHeld = heldClient(mockHouse.client);
    const first = useDispatch.getState().fetchCritiques(POST, 'NEWEST');
    const second = useDispatch.getState().fetchCritiques(POST, 'CERTIFIED');
    // CERTIFIED's two reads land, then NEWEST's, last.
    await mockHeld.release('dispatch_comments', 1);
    await mockHeld.release('dispatch_comments', 1);
    await mockHeld.release('dispatch_certifications');
    await second;
    expect(shown()).toEqual([idOf(2), idOf(3), idOf(1)]);
    await mockHeld.release('dispatch_comments', 0);
    await first;
    expect(shown()).toEqual([idOf(2), idOf(3), idOf(1)]);
  });
});
