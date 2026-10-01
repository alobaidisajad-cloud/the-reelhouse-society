/**
 * theRoomDoesNotRepeatItself.test.tsx — a member's room never draws a filing twice.
 *
 * The room paged from `filings.length`, the filings that PARSED. One row the
 * parser drops and the next page began a row early: the last filing of page one
 * came back as the first of page two, drawn twice, under one list key. The
 * archive was fixed for this (theArchiveDoesNotRepeatItself); the room, beside
 * it, was not. This drives the real hook through a real second page.
 */
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useMemberRoom, ROOM_PAGE } from '../useMemberRoom';

const ranges: [number, number][] = [];
let pages: Record<string, unknown>[][] = [];

const chain = (table: string) => {
  const c: Record<string, unknown> = {};
  const self = () => c;
  for (const f of ['select', 'eq', 'is', 'order'] as const) c[f] = () => self();
  c.maybeSingle = () => Promise.resolve(table === 'profiles'
    ? { data: { id: 'u1', username: 'ana', member_no: 17, tier: 'free', role: null, is_founding: false, avatar_url: null }, error: null }
    : { data: null, error: null });
  c.range = (from: number, to: number) => {
    ranges.push([from, to]);
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
  useDispatch: { getState: () => ({ loadMarks: jest.fn(), certifiedIds: new Set<string>() }) },
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
const malformed = () => ({ id: null, kind: 'nonsense' });
const page = (prefix: string, withMalformed: boolean) => {
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < ROOM_PAGE - (withMalformed ? 1 : 0); i += 1) rows.push(good(`${prefix}${i}`));
  if (withMalformed) rows.push(malformed());
  return rows;
};

beforeEach(() => {
  ranges.length = 0;
  pages = [];
});

describe('a member’s room', () => {
  it('asks for the next page from where the SERVER stopped, and draws no filing twice', async () => {
    pages = [page('a', true), [...page('b', false).slice(0, 5)]];
    const { result } = await renderHook(() => useMemberRoom('ana'));
    await waitFor(() => expect(result.current.filings.length).toBe(ROOM_PAGE - 1));
    expect(result.current.more).toBe(true);

    await act(async () => { result.current.loadMore(); });
    await waitFor(() => expect(ranges.length).toBe(2));

    expect(ranges[1][0]).toBe(ROOM_PAGE);
    const ids = result.current.filings.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
