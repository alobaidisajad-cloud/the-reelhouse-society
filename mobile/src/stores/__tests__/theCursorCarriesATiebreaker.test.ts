/**
 * theCursorCarriesATiebreaker.test.ts — the follows a page boundary swallowed.
 * ─────────────────────────────────────────────────────────────────────────────
 * hydrateFollowing paged with `gt('created_at', cursor)` and nothing else. A
 * bare timestamp cursor skips every row sharing the boundary row's timestamp,
 * and the skip is PERMANENT, because the next page starts strictly above them.
 *
 * Latent rather than live when it was found: every write to `interactions` is a
 * single-row insert, so two follows would have to land in the same microsecond,
 * and the tie would then have to straddle a 1000-row page boundary. Production
 * was checked and holds zero ties.
 *
 * It is fixed anyway, because Postgres freezes now() for a whole transaction:
 * the day anything writes follows in a batch — an import, a migration, a
 * "follow everyone you followed elsewhere" — every one of them shares a
 * timestamp, and this loses all but the boundary row with no error anywhere.
 * Every other paginated read in the app already carried the second key.
 */
import { hydrateFollowing } from '../domain/socialSlice';

const ME = '55555555-5555-4555-8555-555555555555';
const TIE = '2026-09-11T10:00:00.000Z';

/** Every `.or(...)` filter the store sent, in order. */
const filters: string[] = [];
let pages: Record<string, unknown>[][] = [];
let pageIndex = 0;

const chain = () => {
  const c: Record<string, unknown> = {};
  const self = () => c;
  for (const f of ['select', 'eq', 'in', 'order', 'limit', 'gt'] as const) c[f] = () => self();
  c.or = (expr: string) => { filters.push(expr); return self(); };
  c.then = (res: (v: unknown) => unknown) => {
    const page = pages[pageIndex] ?? [];
    pageIndex += 1;
    return Promise.resolve({ data: page, error: null }).then(res);
  };
  return c;
};

jest.mock('../../lib/supabase', () => ({ supabase: { from: () => chain() } }));
jest.mock('../auth', () => ({
  useAuthStore: { getState: () => ({ user: { id: ME, username: 'me' } }) },
}));
// The export is `useSocialStore`, and commitHydratedGraph calls three things on
// it. The first draft of this mock named it `useFollowStore` and listed two —
// which the mock-gap trap caught immediately, exactly as it is meant to.
jest.mock('../followStore', () => ({
  useSocialStore: {
    getState: () => ({
      setFollowing: jest.fn(),
      setRequested: jest.fn(),
      persistFollowing: jest.fn(),
    }),
    setState: jest.fn(),
  },
}));
jest.mock('../../lib/sentry', () => ({ captureError: jest.fn() }));
jest.mock('../../lib/queryClient', () => ({ queryClient: { invalidateQueries: jest.fn() } }));

const row = (id: string, created_at: string, username: string) => ({
  id, target_user_id: `t-${id}`, created_at, type: 'follow',
  profiles: { username },
});

beforeEach(() => {
  filters.length = 0;
  pageIndex = 0;
  pages = [];
});

/**
 * A page only leads to another when it comes back FULL — `hasMore` is
 * `data.length === HYDRATE_PAGE_SIZE`. So the cursor is only exercised by a
 * genuinely full page; a three-row fixture ends the loop and tests nothing,
 * which is what the first draft of this file did.
 */
const PAGE = 1000;
const fullPageEndingInATie = () => {
  const out = [];
  for (let i = 0; i < PAGE - 3; i += 1) {
    out.push(row(`r${i}`, `2026-09-10T00:00:${String(i % 60).padStart(2, '0')}.000Z`, `u${i}`));
  }
  // The last three share one timestamp — exactly the shape a batched follow
  // write produces, because Postgres freezes now() for a whole transaction.
  out.push(row('x', TIE, 'tied-one'));
  out.push(row('y', TIE, 'tied-two'));
  out.push(row('z', TIE, 'tied-three'));
  return out;
};

describe('the hydrate cursor', () => {
  it('asks for the ROW AFTER the boundary, not merely a later timestamp', async () => {
    pages = [fullPageEndingInATie(), []];

    await hydrateFollowing();

    // Without the id half, every further row sharing TIE is skipped for ever:
    // the next page would start strictly above the timestamp they all carry.
    expect(filters.length).toBeGreaterThan(0);
    expect(filters[0]).toBe(
      `created_at.gt.${TIE},and(created_at.eq.${TIE},id.gt.z)`,
    );
  });

  it('never sends a bare timestamp comparison on its own', async () => {
    pages = [fullPageEndingInATie(), []];

    await hydrateFollowing();

    const bare = filters.filter((f) => f.includes('created_at') && !f.includes('id.gt.'));
    expect(bare).toEqual([]);
  });
});
