/**
 * theDoorCursorCarriesATiebreaker.test.ts — the people left standing at the door.
 * ─────────────────────────────────────────────────────────────────────────────
 * `FollowRequestService.fetchPage` paged with `lt('created_at', cursor)` and
 * nothing else. A bare timestamp cursor skips every row sharing the boundary
 * row's timestamp, and the skip is PERMANENT: the next page starts strictly
 * below them, so those requests never load and the door shows fewer people than
 * are actually waiting — with no error anywhere.
 *
 * Latent rather than live when found: every follow request is a single-row
 * insert, so two would have to land in the same microsecond and the tie would
 * then have to straddle a page boundary. Production holds zero ties. But
 * Postgres freezes now() for a whole transaction, so anything that ever writes
 * requests in a batch makes this live at once.
 *
 * Same class and same repair as socialSlice's hydrate. This was the second
 * instance, found by sweeping the class across the whole app rather than by
 * reading files one at a time.
 */
import { FollowRequestService } from '../FollowRequestService';

const ME = '55555555-5555-4555-8555-555555555555';
const TIE = '2026-09-11T10:00:00.000Z';

const filters: string[] = [];
let page: Record<string, unknown>[] = [];

const chain = () => {
  const c: Record<string, unknown> = {};
  const self = () => c;
  for (const f of ['select', 'eq', 'order', 'limit', 'ilike', 'in'] as const) c[f] = () => self();
  c.lt = (col: string, val: unknown) => { filters.push(`BARE lt ${col} ${String(val)}`); return self(); };
  c.or = (expr: string) => { filters.push(expr); return self(); };
  c.then = (res: (v: unknown) => unknown) =>
    Promise.resolve({ data: page, error: null }).then(res);
  return c;
};

jest.mock('../../lib/supabase', () => ({ supabase: { from: () => chain() } }));
jest.mock('../../utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const row = (id: string, created_at: string, username: string) => ({
  id, user_id: `u-${id}`, created_at,
  profiles: { username, avatar_url: null },
});

beforeEach(() => {
  filters.length = 0;
  page = [];
});

describe('the door’s cursor', () => {
  /**
   * A page only yields a cursor when it comes back FULL — `hasMore` is
   * `page.length > PAGE_SIZE`. A short fixture returns nextCursor null and
   * tests nothing, which is the trap the essay-cursor guard fell into first.
   */
  const fullPageEndingInATie = (n: number) => {
    const out = [];
    for (let i = 0; i < n - 2; i += 1) {
      out.push(row(`r${i}`, `2026-09-10T00:00:${String(i % 60).padStart(2, '0')}.000Z`, `u${i}`));
    }
    out.push(row('yy', TIE, 'tied-one'));
    out.push(row('zz', TIE, 'tied-two'));
    return out;
  };

  it('hands back a cursor carrying BOTH halves', async () => {
    page = fullPageEndingInATie(60);
    const { nextCursor } = await FollowRequestService.fetchPage({ myId: ME });

    // PAGE_SIZE + 1 rows are requested, so a full page yields a cursor. The
    // last row KEPT is what the next page must resume after.
    expect(nextCursor).toMatch(/\|/);
    expect(nextCursor!.split('|')).toHaveLength(2);
  });

  it('asks for the ROW AFTER the boundary, not merely an earlier timestamp', async () => {
    page = fullPageEndingInATie(60);
    await FollowRequestService.fetchPage({ myId: ME, cursor: `${TIE}|zz` });

    expect(filters.some((f) => f === `created_at.lt.${TIE},and(created_at.eq.${TIE},id.lt.zz)`)).toBe(true);
  });

  it('never sends a bare timestamp comparison for a compound cursor', async () => {
    page = fullPageEndingInATie(60);
    await FollowRequestService.fetchPage({ myId: ME, cursor: `${TIE}|zz` });

    expect(filters.filter((f) => f.startsWith('BARE lt'))).toEqual([]);
  });

  it('still accepts an OLD cursor with no id half', async () => {
    // A request already in flight when this shipped carries the old shape.
    // Falling back keeps that page working rather than throwing.
    page = fullPageEndingInATie(60);
    await FollowRequestService.fetchPage({ myId: ME, cursor: TIE });

    expect(filters.some((f) => f.startsWith('BARE lt created_at'))).toBe(true);
  });
});
