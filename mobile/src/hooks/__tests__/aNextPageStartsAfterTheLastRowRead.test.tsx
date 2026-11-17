/**
 * aNextPageStartsAfterTheLastRowRead.test.tsx — review round 9 (B2)
 * ─────────────────────────────────────────────────────────────────────────────
 * A member's room and a film's Dispatch archive asked for their next page by offset (`.range`). A
 * filing withdrawn, ended or hidden while the member read moved every row after it up, and the next
 * page skipped one the member never saw; one filed meanwhile moved them down, and the next page drew
 * a filing already on screen a second time. Each next page now starts after the last row read (its
 * time, then its id), and a filing already held is not laid down twice.
 * Against the house as strict as it is (test-utils/supabaseFake), changed between the two pages.
 */
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { supabaseFake, type Ask } from '@/test-utils/supabaseFake';
import { useMemberRoom, ROOM_PAGE } from '../useMemberRoom';
import { useDispatchArchive, ARCHIVE_PAGE } from '../useDispatchArchive';

const ANA = '33333333-3333-4333-8333-333333333333';
const SUBJECT = 550;

type Row = Record<string, unknown> & { id: string; created_at: string };
/** The nth filing, newest first (n = 0 the newest); a negative n is one filed later. */
const idOf = (n: number) => `00000000-0000-4000-9000-${String(n + 100).padStart(12, '0')}`;
const filing = (n: number): Row => ({
  id: idOf(n), kind: 'take', user_id: ANA, author_username: 'ana', title: null, body: `Filing ${n}.`,
  is_published: true, withheld_at: null, ended_at: null, certify_count: 0, comment_count: 0,
  subject_kind: 'film', subject_id: SUBJECT, subject_title: 'Tokyo Story',
  created_at: `2026-11-${String(20 - Math.floor((n + 10) / 24)).padStart(2, '0')}T${String(23 - ((n + 10) % 24)).padStart(2, '0')}:00:00Z`,
});

/** What the house holds now: the test changes it between pages. */
let mockFilings: Row[] = [];

/** Every row strictly after the keyset cursor an `or()` names (created_at, then id, newest first). */
const pastTheCursor = (ask: Ask, rows: Row[]) => {
  const or = ask.ors?.[0];
  if (!or) return rows;
  const m = /^created_at\.lt\."([^"]+)",and\(created_at\.eq\."[^"]+",id\.lt\."([^"]+)"\)$/.exec(or);
  expect(m).not.toBeNull();
  const [, at = '', id = ''] = m ?? [];
  return rows.filter((r) => r.created_at < at || (r.created_at === at && r.id < id));
};

const mockHouse = supabaseFake({
  // Answered from what it holds now; the fake orders and cuts it (an offset or a limit) as PostgREST does.
  answer: { dispatch_posts: (ask) => pastTheCursor(ask, mockFilings) },
  rows: { profiles: [{ id: ANA, username: 'ana', avatar_url: null, member_no: 17, tier: 'free', role: null, is_founding: false }] },
  rpc: { dispatch_room_totals: [{ filed: 25, certified: 0 }] },
});
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('@/src/stores/dispatch', () => ({
  useDispatch: { getState: () => ({ loadMarks: jest.fn(), certifiedIds: new Set<string>(), critiqued: {} }) },
}));
jest.mock('@/src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

/** Filings first to last: [from, to). */
const filings = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => filing(from + i));
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

beforeEach(() => {
  mockFilings = filings(0, 25);
});

describe('a member’s room', () => {
  const open = async () => {
    const { result } = await renderHook(() => useMemberRoom('ana'));
    await waitFor(() => expect(result.current.filings).toHaveLength(ROOM_PAGE));
    expect(result.current.more).toBe(true);
    return result;
  };
  const scrollToTheFoot = async (result: Awaited<ReturnType<typeof open>>) => {
    const asked = mockHouse.asked.length;
    await act(async () => { result.current.loadMore(); });
    await waitFor(() => expect(mockHouse.asked.length).toBeGreaterThan(asked));
    await waitFor(() => expect(result.current.loadingMore).toBe(false));
  };

  it('a filing withdrawn while the member reads does not make the next page skip the one after the page', async () => {
    const result = await open();
    // Since page one was read, the sixth filing was withdrawn.
    mockFilings = mockFilings.filter((r) => r.id !== idOf(5));
    await scrollToTheFoot(result);
    // Every filing the member had not yet seen is drawn: the twenty-first first.
    expect(ids(result.current.filings)).toEqual(ids(filings(0, 25)));
  });

  it('a filing filed while the member reads does not draw one already on screen a second time', async () => {
    const result = await open();
    // Since page one was read, a new filing came in above it.
    mockFilings = [filing(-1), ...mockFilings];
    await scrollToTheFoot(result);
    expect(ids(result.current.filings)).toEqual(ids(filings(0, 25)));
  });
});

describe('a film’s Dispatch archive', () => {
  const open = async () => {
    const { result } = await renderHook(() => useDispatchArchive());
    await act(async () => {
      result.current.choose({ subjectId: SUBJECT, film: { title: 'Tokyo Story', director: null, posterPath: null }, filings: 25 });
    });
    await waitFor(() => expect(result.current.filings).toHaveLength(ARCHIVE_PAGE));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.more).toBe(true);
    return result;
  };
  const scrollToTheFoot = async (result: Awaited<ReturnType<typeof open>>) => {
    const asked = mockHouse.asked.length;
    await act(async () => { result.current.loadMore(); });
    await waitFor(() => expect(mockHouse.asked.length).toBeGreaterThan(asked));
    await waitFor(() => expect(result.current.loading).toBe(false));
  };

  it('a filing withdrawn while the member reads does not make the next page skip the one after the page', async () => {
    const result = await open();
    mockFilings = mockFilings.filter((r) => r.id !== idOf(5));
    await scrollToTheFoot(result);
    expect(ids(result.current.filings)).toEqual(ids(filings(0, 25)));
  });

  it('a filing filed while the member reads does not draw one already on screen a second time', async () => {
    const result = await open();
    mockFilings = [filing(-1), ...mockFilings];
    await scrollToTheFoot(result);
    expect(ids(result.current.filings)).toEqual(ids(filings(0, 25)));
  });
});
