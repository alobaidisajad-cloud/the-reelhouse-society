/**
 * useDispatchArchive — everything the house has ever said about one film.
 *
 * ── IT SEARCHES THE ARCHIVE, NOT THE WORLD ──────────────────────────────────
 * The obvious build is to search TMDB, because the writing room already does
 * and the code is there to copy. It would be wrong here: TMDB knows about a
 * million films and this house has written about a few hundred, so nine times
 * in ten an Archivist would type a title, tap the film they meant, and arrive
 * at an empty page. An archive lists what is IN it.
 *
 * So the search runs over `dispatch_posts.subject_title` — the title as the
 * member who filed it captured it — and every film that comes back has at least
 * one filing by construction.
 *
 * ── THE TWO NUMBERS ON THE PLATE ────────────────────────────────────────────
 * `count` is asked for EXACTLY, not counted from the page: a film with sixty
 * filings shows twenty and the plate must still say sixty. `span` is the years
 * of the first and the last, which needs the OLDEST row — one extra query
 * ordered the other way, bounded to a single row, over the same index. Deriving
 * it from the page in hand would print `2026–2026` under a film the house has
 * been arguing about since 2019.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '@/src/lib/supabase';
import type { PaperFilm } from '@/src/components/dispatch/paper/PaperPost';
import { FILING_CARD_COLUMNS, parseFilingRows, type Filing } from '@/src/stores/dispatchTypes';
import { useDispatch } from '@/src/stores/dispatch';
import { logger } from '@/src/utils/logger';
import { buildSearchPattern } from '@/src/utils/searchPattern';

/** One page of a film's filings. */
export const ARCHIVE_PAGE = 20;

/** How many rows the title search reads before grouping them into films. */
const SEARCH_ROWS = 120;

/** A film the house has written about, and how often. */
export interface ArchiveMatch {
  subjectId: number;
  film: PaperFilm;
  filings: number;
}

export interface DispatchArchive {
  /**
   * The typed query lives here rather than in the screen, so choosing a film
   * does not wipe the words that found it — an Archivist comparing two films
   * goes back to the same search rather than typing it again.
   */
  query: string;
  setQuery: (q: string) => void;
  matches: ArchiveMatch[];
  searching: boolean;
  /** The chosen film, its filings, and the two numbers on its plate. */
  film: PaperFilm | null;
  filings: Filing[];
  count: number;
  span: string;
  loading: boolean;
  more: boolean;
  choose: (m: ArchiveMatch) => void;
  clear: () => void;
  loadMore: () => void;
}

/** `2019–2026`, or a single year when the house said it all in one. */
const spanOf = (firstISO: string, lastISO: string): string => {
  const a = new Date(firstISO).getFullYear();
  const b = new Date(lastISO).getFullYear();
  if (Number.isNaN(a) || Number.isNaN(b)) return '';
  // An en dash, which is what a range takes — not a hyphen.
  return a === b ? String(a) : `${a}–${b}`;
};

/**
 * ── THE SEARCH GOES THROUGH THE HOUSE'S OWN FUNNEL ──────────────────────────
 * A hand-rolled escaper stood here — `%`, `_` and a backslash — and it was
 * wrong in a way that is invisible from reading it: PostgREST treats `*` as its
 * OWN alias for `%` inside an ilike value, so a member typing `*` in the
 * archive would have matched every filing in the house. `buildSearchPattern`
 * escapes that third wildcard too, and turns the three characters PostgREST's
 * filter parser owns into `_` rather than letting them rewrite the filter.
 *
 * Every claim in that file was measured against the live database. This one was
 * reasoned about, which is the difference — and `searchWiring.guard.test.ts`
 * refused the new search until it came through here, which is what a guard is
 * for.
 */
export function useDispatchArchive(): DispatchArchive {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<ArchiveMatch[]>([]);
  const [searching, setSearching] = useState(false);

  const [film, setFilm] = useState<PaperFilm | null>(null);
  const [filings, setFilings] = useState<Filing[]>([]);
  const [count, setCount] = useState(0);
  const [span, setSpan] = useState('');
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);

  const subjectId = useRef<number | null>(null);
  const seq = useRef(0);
  /**
   * How many rows the SERVER has handed over for this film, which is not the
   * same as how many are on screen.
   *
   * `parseFilingRows` drops a row it cannot read, so `filings.length` runs
   * BEHIND the offset actually consumed. Paging from `filings.length` therefore
   * asked for rows already fetched, and the archive repeated filings — one
   * unreadable row is all it takes. notificationStore carries the same warning
   * about building a cursor from the salvaged rows rather than the raw ones;
   * this is the offset-shaped version of it.
   */
  const fetched = useRef(0);

  // ── THE SEARCH ────────────────────────────────────────────────────────────
  const search = useCallback(async (q: string) => {
    const term = q.trim();
    if (term.length < 2) { setMatches([]); setSearching(false); return; }
    // Null when the term is nothing but the characters the parser owns — a
    // search that would match everything is refused rather than run.
    const pattern = buildSearchPattern(term);
    if (!pattern) { setMatches([]); setSearching(false); return; }
    const mine = ++seq.current;
    setSearching(true);
    try {
      const { data, error } = await supabase
        .from('dispatch_posts')
        // Only what a film row needs. The whole card would be twenty times the
        // bytes for a list that draws a title and a count.
        .select('subject_id, subject_title, subject_sub, subject_image, created_at')
        .eq('subject_kind', 'film')
        .eq('is_published', true)
        .is('withheld_at', null)
        .is('ended_at', null)
        .ilike('subject_title', `%${pattern}%`)
        .order('created_at', { ascending: false })
        .limit(SEARCH_ROWS);
      if (mine !== seq.current) return;
      if (error) { logger.warn(`[archive] search: ${error.message}`); setMatches([]); return; }

      /**
       * Grouped by subject_id, and the NEWEST row wins for the poster and the
       * subtitle. Both are captured at filing time, so an older filing can be
       * carrying a poster path TMDB has since replaced; the most recent one a
       * member saw is the one to show.
       */
      const byFilm = new Map<number, ArchiveMatch>();
      for (const r of (data ?? []) as Record<string, unknown>[]) {
        const id = r.subject_id as number | null;
        const title = r.subject_title as string | null;
        if (id == null || !title) continue;
        const had = byFilm.get(id);
        if (had) { had.filings += 1; continue; }
        byFilm.set(id, {
          subjectId: id,
          film: {
            title,
            director: (r.subject_sub as string) ?? null,
            posterPath: (r.subject_image as string) ?? null,
          },
          filings: 1,
        });
      }
      setMatches([...byFilm.values()].sort((a, b) => b.filings - a.filings));
    } catch (e) {
      if (mine === seq.current) logger.warn(`[archive] ${String(e)}`);
    } finally {
      if (mine === seq.current) setSearching(false);
    }
  }, []);

  useEffect(() => {
    // Debounced. "the godfather" is thirteen keystrokes and would otherwise be
    // thirteen requests, the same reason the writing room's finder waits.
    const t = setTimeout(() => { void search(query); }, 300);
    return () => clearTimeout(t);
  }, [query, search]);

  // ── ONE FILM'S FILINGS ────────────────────────────────────────────────────
  const page = useCallback(async (from: number) => {
    const id = subjectId.current;
    if (id == null) return;
    const mine = seq.current;
    setLoading(true);
    try {
      const rows = await supabase
        .from('dispatch_posts')
        .select(FILING_CARD_COLUMNS, from === 0 ? { count: 'exact' } : undefined)
        .eq('subject_kind', 'film')
        .eq('subject_id', id)
        .eq('is_published', true)
        .is('withheld_at', null)
        .is('ended_at', null)
        .order('created_at', { ascending: false })
        // The id is the tiebreaker, so two filings made in the same instant
        // keep one order across pages instead of swapping between requests and
        // handing the reader a duplicate at the seam. Every other paginated
        // read in the app carries this second key.
        .order('id', { ascending: false })
        .range(from, from + ARCHIVE_PAGE - 1);
      if (mine !== seq.current) return;
      if (rows.error) { logger.warn(`[archive] filings: ${rows.error.message}`); return; }

      const raw = rows.data?.length ?? 0;
      const { filings: got, dropped } = parseFilingRows(rows.data ?? []);
      if (dropped > 0) logger.warn(`[archive] ${dropped} filing(s) failed to parse`);
      // Count what the SERVER gave, not what survived parsing — see `fetched`.
      fetched.current = from === 0 ? raw : fetched.current + raw;
      setFilings((prev) => (from === 0 ? got : [...prev, ...got]));
      setMore(raw === ARCHIVE_PAGE);

      if (from === 0) {
        setCount(rows.count ?? got.length);
        // The oldest, for the other end of the span. One row, same index.
        const { data: first } = await supabase
          .from('dispatch_posts')
          .select('created_at')
          .eq('subject_kind', 'film')
          .eq('subject_id', id)
          .eq('is_published', true)
          .is('withheld_at', null)
          .is('ended_at', null)
          .order('created_at', { ascending: true })
          .limit(1);
        if (mine !== seq.current) return;
        const oldest = (first?.[0]?.created_at as string) ?? got[0]?.createdAt;
        const newest = got[0]?.createdAt;
        setSpan(oldest && newest ? spanOf(oldest, newest) : '');
      }

      // The member's own marks, for the rows this page brought — the same call
      // a member's room makes, for the same reason.
      await useDispatch.getState().loadMarks(got);
    } catch (e) {
      if (mine === seq.current) logger.warn(`[archive] ${String(e)}`);
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, []);

  const choose = useCallback((m: ArchiveMatch) => {
    seq.current += 1;
    subjectId.current = m.subjectId;
    // Belt and braces: `page(0)` below sets this from the raw row count anyway.
    // It matters only when that fetch never completes — a stale generation, or
    // a failure — because then a later loadMore would page from the PREVIOUS
    // film's offset and skip this one's opening filings.
    fetched.current = 0;
    setFilm(m.film);
    setFilings([]); setCount(0); setSpan(''); setMore(false);
    void page(0);
  }, [page]);

  const clear = useCallback(() => {
    seq.current += 1;
    subjectId.current = null;
    fetched.current = 0;
    setFilm(null); setFilings([]); setCount(0); setSpan(''); setMore(false);
  }, []);

  const loadMore = useCallback(() => {
    if (loading || !more) return;
    // The offset the SERVER is at, not the number of rows on screen. Paging
    // from `filings.length` re-requested everything that failed to parse, so
    // one unreadable filing made the archive repeat rows at every seam after it.
    void page(fetched.current);
  }, [loading, more, page]);

  return {
    query, setQuery,
    matches, searching, film, filings, count, span, loading, more,
    choose, clear, loadMore,
  };
}
