/**
 * theRoomDoesNotRepeatItself.test.tsx — a member's room never draws a filing twice.
 *
 * The room paged from `filings.length`, the filings that PARSED. One row the
 * parser drops and the next page began a row early: the last filing of page one
 * came back as the first of page two, drawn twice, under one list key. The
 * archive was fixed for this (theArchiveDoesNotRepeatItself); the room, beside
 * it, was not. This drives the real hook through a real second page.
 *
 * Since review round 9 the next page starts after the last row the SERVER sent
 * (its time, then its id: a keyset `or()`), no longer at an offset, so the
 * claim is read from the filter the next page is asked with.
 */
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useMemberRoom, ROOM_PAGE } from '../useMemberRoom';

/** The keyset filter each page was asked with, in order (null: the first page). */
const asks: (string | null)[] = [];
let pages: Record<string, unknown>[][] = [];
/** When set, the next page read is refused with this. */
let refuseNext: { message: string } | null = null;
/** The filings the dispatch store holds gone (a read found the house no longer gives them). */
const mockGone = new Set<string>();

const chain = (table: string) => {
  const c: Record<string, unknown> = {};
  const self = () => c;
  let past: string | null = null;
  for (const f of ['select', 'eq', 'is', 'order'] as const) c[f] = () => self();
  c.or = (filter: string) => { past = filter; return self(); };
  c.maybeSingle = () => Promise.resolve(table === 'profiles'
    ? { data: { id: 'u1', username: 'ana', member_no: 17, tier: 'free', role: null, is_founding: false, avatar_url: null }, error: null }
    : { data: null, error: null });
  c.limit = () => {
    asks.push(past);
    if (refuseNext) { const error = refuseNext; refuseNext = null; return Promise.resolve({ data: null, error }); }
    return Promise.resolve({ data: pages.shift() ?? [], error: null });
  };
  return c;
};

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: (t: string) => chain(t),
    rpc: () => Promise.resolve({ data: [{ filed: 40, certified: 0 }], error: null }),
  },
}));
jest.mock('@/src/stores/dispatch', () => ({
  useDispatch: { getState: () => ({ loadMarks: jest.fn(), certifiedIds: new Set<string>(), critiqued: {}, givenAgain: jest.fn() }) },
  goneMoment: () => 0,
  // The filings the store holds gone, as asTheHouseNowHolds leaves them out (its own test is the store's).
  useAsTheHouseNowHolds: (filings: { id: string }[]) => filings.filter((f) => !mockGone.has(f.id)),
}));
jest.mock('@/src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

/** A filing row the real parser accepts (the archive test's, kept to the schema). */
const good = (id: string) => ({
  id,
  kind: 'take' as const,
  user_id: '33333333-3333-4333-8333-333333333333',
  author_username: 'ana',
  body: 'A sentence about it.',
  frozen_totals: null,
  certify_count: 0,
  comment_count: 0,
  created_at: '2026-09-12T10:00:00Z',
});
/** A row the house sent (its id and time) that the parser refuses. */
const malformed = (id: string) => ({ id, kind: 'nonsense', created_at: '2026-09-11T10:00:00Z' });
const page = (prefix: string, withMalformed: boolean) => {
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < ROOM_PAGE - (withMalformed ? 1 : 0); i += 1) rows.push(good(`${prefix}${i}`));
  if (withMalformed) rows.push(malformed(`${prefix}-unreadable`));
  return rows;
};

beforeEach(() => {
  asks.length = 0;
  pages = [];
  mockGone.clear();
});

describe('a member’s room', () => {
  it('asks for the next page from where the SERVER stopped, and draws no filing twice', async () => {
    pages = [page('a', true), [...page('b', false).slice(0, 5)]];
    const { result } = await renderHook(() => useMemberRoom('ana'));
    await waitFor(() => expect(result.current.filings.length).toBe(ROOM_PAGE - 1));
    expect(result.current.more).toBe(true);

    await act(async () => { result.current.loadMore(); });
    await waitFor(() => expect(asks.length).toBe(2));

    // After the last row the server sent (the unreadable one), not the last filing drawn.
    expect(asks).toEqual([null,
      'created_at.lt."2026-09-11T10:00:00Z",and(created_at.eq."2026-09-11T10:00:00Z",id.lt."a-unreadable")']);
    const ids = result.current.filings.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('a next page that could not be read', () => {
  it('says so at the foot — the list asks for more once per length, so scrolling would not', async () => {
    pages = [page('a', false), page('b', false)];
    const { result } = await renderHook(() => useMemberRoom('ana'));
    await waitFor(() => expect(result.current.filings.length).toBe(ROOM_PAGE));

    refuseNext = { message: 'connection reset' };
    await act(async () => { result.current.loadMore(); });
    await waitFor(() => expect(result.current.moreFailed).toBe(true));
    expect(result.current.failed).toBe(false);
    expect(result.current.filings.length).toBe(ROOM_PAGE);

    await act(async () => { result.current.loadMore(); });
    await waitFor(() => expect(result.current.filings.length).toBe(ROOM_PAGE * 2));
    expect(result.current.moreFailed).toBe(false);
  });
});

describe('a filing changed since the room was read', () => {
  it('found gone by the reader, leaves the room', async () => {
    pages = [[good('a0'), good('a1')]];
    const { result, rerender } = await renderHook(() => useMemberRoom('ana'));
    await waitFor(() => expect(result.current.filings.map((f) => f.id)).toEqual(['a0', 'a1']));
    mockGone.add('a0');
    await act(async () => { await rerender({}); });
    expect(result.current.filings.map((f) => f.id)).toEqual(['a1']);
  });
});
