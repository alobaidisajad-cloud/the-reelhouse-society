/**
 * theArchiveSearchIsCountedByTheHouse.test.tsx — review round 9 (B6)
 * ─────────────────────────────────────────────────────────────────────────────
 * The Dispatch archive's search counted each film's filings from the newest 120 rows that matched:
 * a film's count fell short of the count on its own page, held the filings of members the reader
 * has hidden, and a film past those 120 rows was not found at all. The house counts them now, film
 * by film (dispatch_archive_films), the most-filed first. A house without the function yet
 * (PGRST202) is searched as before; any other refusal says the search failed.
 * Against the house as strict as it is (test-utils/supabaseFake).
 */
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useDispatchArchive } from '../useDispatchArchive';

const ANA = '33333333-3333-4333-8333-333333333333';
type Film = { subject_id: number; subject_title: string; subject_sub: string | null; subject_image: string | null; filings: number | string };

/** What the house's count answers, as each case says: its films, or its refusal. */
let mockCounted: Film[] | { error: { code: string; message: string } } = [];
/** The pattern each count was asked with. */
const mockCountAsked: unknown[] = [];

const filing = (n: number, subjectId: number, title: string) => ({
  id: `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`, kind: 'take', user_id: ANA, author_username: 'ana',
  body: 'A take.', is_published: true, withheld_at: null, ended_at: null, certify_count: 0, comment_count: 0,
  subject_kind: 'film', subject_id: subjectId, subject_title: title, subject_sub: 'Ozu', subject_image: null,
  created_at: `2026-11-1${n}T10:00:00Z`,
});

const mockHouse = supabaseFake({
  // The newest rows the old search read: two of Tokyo Story, one of Tokyo Twilight.
  rows: { dispatch_posts: [filing(1, 10, 'Tokyo Story'), filing(2, 10, 'Tokyo Story'), filing(3, 20, 'Tokyo Twilight')] },
  rpc: { dispatch_archive_films: (args: { p_pattern: string }) => { mockCountAsked.push(args.p_pattern); return mockCounted; } },
});
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('@/src/stores/dispatch', () => ({
  useDispatch: { getState: () => ({ loadMarks: jest.fn(), certifiedIds: new Set<string>(), critiqued: {}, givenAgain: jest.fn() }) },
  goneMoment: () => 0,
  useAsTheHouseNowHolds: (filings: unknown[]) => filings,
}));
jest.mock('@/src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const rowsRead = () => mockHouse.asked.filter((a) => a.table === 'dispatch_posts').length;
const found = (r: { current: ReturnType<typeof useDispatchArchive> }) =>
  r.current.matches.map((m) => [m.subjectId, m.film.title, m.filings]);

/** The member types into the archive's search, and its answer lands. */
const search = async (words: string) => {
  const { result } = await renderHook(() => useDispatchArchive());
  await act(async () => { result.current.setQuery(words); });
  await waitFor(() => expect(result.current.settled || result.current.searchFailed).toBe(true));
  await waitFor(() => expect(result.current.searching).toBe(false));
  return result;
};

beforeEach(() => {
  mockCountAsked.length = 0;
  mockHouse.asked.length = 0;
});

it('each film found carries the house’s count of its filings, the most-filed first, and a film past the newest rows is found', async () => {
  mockCounted = [
    { subject_id: 10, subject_title: 'Tokyo Story', subject_sub: 'Ozu', subject_image: null, filings: '30' },
    { subject_id: 30, subject_title: 'Tokyo Drifter', subject_sub: 'Suzuki', subject_image: null, filings: 50 },
  ];
  const result = await search('tokyo');
  expect(mockCountAsked).toEqual(['tokyo']);
  expect(found(result)).toEqual([[30, 'Tokyo Drifter', 50], [10, 'Tokyo Story', 30]]);
  expect(result.current.searchFailed).toBe(false);
  // Counted by the house alone: no rows are read to count them here.
  expect(rowsRead()).toBe(0);
});

it('a house without the count yet is searched as before, from its newest filings', async () => {
  mockCounted = { error: { code: 'PGRST202', message: 'Could not find the function public.dispatch_archive_films(p_pattern) in the schema cache' } };
  const result = await search('tokyo');
  expect(mockCountAsked).toEqual(['tokyo']);
  expect(rowsRead()).toBe(1);
  expect(found(result)).toEqual([[10, 'Tokyo Story', 2], [20, 'Tokyo Twilight', 1]]);
  expect(result.current.searchFailed).toBe(false);
});

it('a count the house refused for another reason says the search failed, and finds nothing', async () => {
  mockCounted = { error: { code: '57014', message: 'canceling statement due to statement timeout' } };
  const result = await search('tokyo');
  expect(result.current.searchFailed).toBe(true);
  expect(found(result)).toEqual([]);
  expect(rowsRead()).toBe(0);
});
