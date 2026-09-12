/**
 * theArchiveDoesNotRepeatItself.test.tsx — the behaviour, not the source.
 * ─────────────────────────────────────────────────────────────────────────────
 * `theArchivePagesOnWhatTheServerGave` pins the SOURCE of useDispatchArchive:
 * that it pages from `fetched.current` and counts raw rows. That catches the
 * fix being deleted, which the mutation check proved.
 *
 * It does not catch the fix being subtly wrong. This does: it drives the real
 * hook through a real second page, with a malformed row in the first, and
 * asserts the thing a member would actually see — no filing appearing twice.
 *
 * Written because the hook was the ONE place tonight where a behavioural test
 * was available and I pinned source text instead.
 */
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useDispatchArchive, ARCHIVE_PAGE } from '../useDispatchArchive';

const SUBJECT = 550;

/** What `.range(from, to)` was asked for, in order. */
const ranges: [number, number][] = [];
let pages: Record<string, unknown>[][] = [];

const chain = () => {
  const c: Record<string, unknown> = {};
  const self = () => c;
  for (const f of ['select', 'eq', 'is', 'ilike', 'order', 'limit'] as const) c[f] = () => self();
  c.range = (from: number, to: number) => {
    ranges.push([from, to]);
    const page = pages.shift() ?? [];
    return Promise.resolve({ data: page, error: null, count: 99 });
  };
  c.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res);
  return c;
};

jest.mock('@/src/lib/supabase', () => ({ supabase: { from: () => chain() } }));
jest.mock('@/src/stores/dispatch', () => ({
  useDispatch: { getState: () => ({ loadMarks: jest.fn() }) },
}));
jest.mock('@/src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

/**
 * A filing row the REAL parser accepts — every field FilingRowSchema requires
 * and no others. Written from the schema rather than guessed: the first draft
 * omitted `author_username` and `frozen_totals`, so every row was dropped and
 * the test failed with an empty archive rather than the thing it meant to test.
 */
const good = (id: string) => ({
  id,
  kind: 'take' as const,
  user_id: '33333333-3333-4333-8333-333333333333',
  author_username: 'testuser',
  body: 'A sentence about it.',
  frozen_totals: null,
  certify_count: 0,
  comment_count: 0,
  created_at: `2026-09-${String((Number(id.slice(1)) % 28) + 1).padStart(2, '0')}T10:00:00Z`,
  subject_kind: 'film' as const,
  subject_id: SUBJECT,
  subject_title: 'Tokyo Story',
});

/** A row the parser will DROP — the whole point of the test. */
const malformed = () => ({ id: null, kind: 'nonsense' });

const fullPage = (prefix: string, withMalformed: boolean) => {
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < ARCHIVE_PAGE - (withMalformed ? 1 : 0); i += 1) {
    rows.push(good(`${prefix}${i}`));
  }
  if (withMalformed) rows.push(malformed());
  return rows;
};

beforeEach(() => {
  ranges.length = 0;
  pages = [];
});

describe('a film archive never shows the same filing twice', () => {
  it('asks for the next page from where the SERVER stopped, not from what parsed', async () => {
    // Page one: a full page whose LAST row is unreadable, so one fewer filing
    // reaches the screen than the server actually sent.
    pages = [fullPage('a', true), fullPage('b', false)];

    const { result } = await renderHook(() => useDispatchArchive());

    await act(async () => {
      result.current.choose({
        subjectId: SUBJECT,
        film: { id: SUBJECT, title: 'Tokyo Story', sub: null, image: null },
        filings: 40,
      } as never);
    });
    await waitFor(() => expect(result.current.filings.length).toBeGreaterThan(0));

    // One row was dropped, so fewer filings than rows fetched.
    const shown = result.current.filings.length;
    expect(shown).toBe(ARCHIVE_PAGE - 1);

    await act(async () => { result.current.loadMore(); });
    await waitFor(() => expect(ranges.length).toBeGreaterThan(1));

    // THE CLAIM: the second page starts at what the server served (ARCHIVE_PAGE),
    // not at what survived parsing (ARCHIVE_PAGE - 1). Starting a row early is
    // what made the archive repeat itself.
    expect(ranges[1][0]).toBe(ARCHIVE_PAGE);
    expect(ranges[1][0]).not.toBe(shown);
  });

  it('shows no filing twice across the seam', async () => {
    pages = [fullPage('a', true), fullPage('b', false)];

    const { result } = await renderHook(() => useDispatchArchive());
    await act(async () => {
      result.current.choose({
        subjectId: SUBJECT,
        film: { id: SUBJECT, title: 'Tokyo Story', sub: null, image: null },
        filings: 40,
      } as never);
    });
    await waitFor(() => expect(result.current.filings.length).toBeGreaterThan(0));
    await act(async () => { result.current.loadMore(); });
    await waitFor(() => expect(result.current.filings.length).toBeGreaterThan(ARCHIVE_PAGE - 1));

    const ids = result.current.filings.map((f) => f.id);
    expect(ids).toHaveLength(new Set(ids).size);
  });

  /**
   * ── WHAT THIS ONE DOES *NOT* PROVE, STATED HONESTLY ────────────────────────
   * It was written as "the offset is reset when the film changes", and it is
   * not that. Mutation-checking it found the claim false: deleting
   * `fetched.current = 0` from `choose` leaves this green, because `choose`
   * calls `page(0)` and `page` sets the offset from the raw count on a first
   * page regardless. That reset is belt-and-braces for the case where the
   * fetch never completes, which this cannot reach.
   *
   * So the claim is narrowed to what it actually demonstrates: opening a second
   * film asks the server from the beginning. Leaving the wider wording on it
   * would have been a test that reads as proof of something it never checks.
   */
  it('opens a DIFFERENT film from the beginning of that film', async () => {
    pages = [fullPage('a', false), fullPage('c', false)];

    const { result } = await renderHook(() => useDispatchArchive());
    await act(async () => {
      result.current.choose({ subjectId: SUBJECT, film: { id: SUBJECT, title: 'A', sub: null, image: null }, filings: 40 } as never);
    });
    await waitFor(() => expect(ranges.length).toBe(1));

    await act(async () => {
      result.current.choose({ subjectId: 999, film: { id: 999, title: 'B', sub: null, image: null }, filings: 40 } as never);
    });
    await waitFor(() => expect(ranges.length).toBe(2));

    // The second film opens at 0. Carrying the first film's offset would skip
    // its opening filings entirely.
    expect(ranges[1][0]).toBe(0);
  });
});
