import { supabase } from '@/src/lib/supabase';
import { tmdb } from '@/src/lib/tmdb';
import { logger } from '@/src/utils/logger';
import { useAuthStore } from '@/src/stores/auth';
import { useBlockStore } from '@/src/stores/blockStore';
import { buildSearchPattern } from '@/src/utils/searchPattern';
import { stripHtml } from '@/src/utils/html';
import { resolveTier } from '@/src/utils/tier';
import { withAbortSignal } from '@/src/utils/withAbortSignal';
import { cutWhole } from '@/src/utils/text';
import { memberPath } from '@/src/utils/memberPath';
import { buildCursor, keysetFilter, parseCursor } from '@/src/utils/keysetCursor';
import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

// ═══════════════════════════════════════════════════════════════
// RESULT TYPE
// ═══════════════════════════════════════════════════════════════
export interface SR {
  id: string;
  type: 'film' | 'actor' | 'director' | 'user' | 'log' | 'list';
  title: string;
  subtitle: string;
  image: string | null;
  extra?: string;
  rating?: number;
  role?: string;
  _nav: string; // navigation path
}

/** A member as search_members answers: closest first, and how close (the next page's cursor). */
interface MemberRow { id: string; username: string; avatar_url?: string | null; role?: string | null; closeness: number }
/** A record as search_logs answers, its author's handle and rank with it. */
interface LogRow {
  id: string;
  user_id?: string;
  film_title: string;
  review?: string | null;
  rating?: number | null;
  poster_path?: string | null;
  created_at: string;
  status?: string | null;
  abandoned_reason?: string | null;
  is_spoiler?: boolean | null;
  username?: string | null;
  role?: string | null;
}
interface ListRow {
  id: string;
  user_id?: string;
  title: string;
  description: string;
  is_private: boolean;
  is_ranked: boolean;
  created_at: string;
}

const TMDB_IMG = 'https://image.tmdb.org/t/p/w92';

/**
 * The four places a search asks: the catalogue (its films, actors and directors), the members,
 * the records and the stacks. Each is read on its own and pages on its own.
 */
export type SearchSource = 'films' | 'users' | 'logs' | 'lists';
export const SEARCH_SOURCES: readonly SearchSource[] = ['films', 'users', 'logs', 'lists'];

/** Which sources could not be asked: an empty tab is then unknown, not empty. */
export type SourcesDown = Record<SearchSource, boolean>;
/** Per source: a next page exists / is being read / could not be read. */
export type PerSource = Record<SearchSource, boolean>;

const NONE: PerSource = { films: false, users: false, logs: false, lists: false };

/** What a search has found so far, each source's pages laid end to end. */
export interface SearchResults {
  films: SR[]; actors: SR[]; directors: SR[];
  users: SR[]; logs: SR[]; lists: SR[];
  /** Some source could not be asked: what is shown is not all there is. */
  _partial: boolean;
  _down: SourcesDown;
}

const EMPTY_RESULTS: SearchResults = {
  films: [], actors: [], directors: [], users: [], logs: [], lists: [],
  _partial: false,
  _down: NONE,
};

/** Rows shown a page, for the house's three sources; one more is asked, to know there is a next. */
export const SEARCH_PAGE = 20;

/** What a record's excerpt says in place of a review its author marked as spoilers. */
export const SPOILER_MARK = '[CONTAINS SPOILERS]';

/** A review as one plain line: no markup, entities decoded, whitespace folded. */
function plainLine(review: string | null | undefined): string {
  return cutWhole(stripHtml(review ?? '').replace(/\s+/g, ' '), 200);
}

/**
 * A record's excerpt as a search row quotes it. A review its author marked as spoilers is never
 * quoted to another member (every other reader of a record veils it; the wall leaves it out): the
 * row says it holds spoilers, and the record's page veils it as it always does. The author's own
 * review is theirs to read.
 */
export function logExcerpt(log: Pick<LogRow, 'review' | 'status' | 'abandoned_reason' | 'is_spoiler' | 'user_id'>, me: string | undefined): string | undefined {
  const veiled = !!log.is_spoiler && (!me || log.user_id !== me);
  const line = plainLine(log.review);
  if (log.status === 'abandoned') {
    const why = log.abandoned_reason ? ` — ${log.abandoned_reason.toUpperCase()}` : '';
    const after = veiled ? SPOILER_MARK : line;
    return `[ABANDONED${why}]${after ? ` ${after}` : ''}`;
  }
  if (veiled) return SPOILER_MARK;
  return line ? `"${line}"` : undefined;
}

/** One page of the catalogue: its films and people, and the catalogue's next page. */
interface CataloguePage { films: SR[]; actors: SR[]; directors: SR[]; next: number | undefined }
/** One page of a house source: its rows, and where the next page begins. */
interface RowsPage<C> { rows: SR[]; next: C | undefined }

type MemberCursor = { closeness: number; username: string };

/**
 * The house-wide search. Each source is its own paged read: the catalogue by its pages, the
 * members, records and stacks each by a keyset cursor. `data` is what has been found once every
 * source asked has answered its first page (the screen draws them together); `more` says which
 * sources hold a next page, and `loadMore` reads it.
 */
export function useUniversalSearch(query: string) {
  const text = query.trim();
  const me = useAuthStore((s) => s.user?.id);

  // `null` means the text carries nothing searchable — a term of only commas
  // would otherwise become pure wildcards and match every row.
  const pattern = buildSearchPattern(text);
  // "@kane" asks for a handle: the @ is how members write one, and no
  // username holds it. Such a search reads handles only.
  const asHandle = text.startsWith('@');
  const handle = buildSearchPattern(text.replace(/^@+/, '').trim());

  const nothingToSearch = !text || pattern === null;
  const searchable = !nothingToSearch;
  const membersAsked = searchable && !(handle === null);

  const catalogue = useInfiniteQuery({
    queryKey: ['universalSearch', 'films', text],
    queryFn: async ({ pageParam }): Promise<CataloguePage> => {
      // A catalogue that cannot be reached throws (TmdbUnreachable): its tabs are then unknown.
      const res = await tmdb.search(text, pageParam).catch((e: unknown) => {
        logger.error('[useUniversalSearch] a source was rejected', 'tmdb', e);
        throw e;
      });
      const page: CataloguePage = { films: [], actors: [], directors: [], next: undefined };
      for (const item of res?.results ?? []) {
        if (item.media_type === 'movie' || (!item.media_type && item.title)) {
          page.films.push({
            id: `film-${item.id}`, type: 'film',
            title: item.title ?? item.name ?? '',
            subtitle: item.release_date?.slice(0, 4) || 'FILM',
            image: item.poster_path ? `${TMDB_IMG}${item.poster_path}` : null,
            extra: item.vote_average ? `★ ${item.vote_average.toFixed(1)}` : undefined,
            _nav: `/film/${item.id}`,
          });
        } else if (item.media_type === 'person') {
          const dept = (item.known_for_department || 'Acting').toUpperCase();
          const isDir = dept.includes('DIRECT') || dept.includes('PRODUC') || dept.includes('WRIT');
          const entry: SR = {
            id: `person-${item.id}`, type: isDir ? 'director' : 'actor',
            title: item.name ?? '',
            subtitle: dept,
            image: item.profile_path ? `${TMDB_IMG}${item.profile_path}` : null,
            _nav: `/person/${item.id}`,
          };
          if (isDir) page.directors.push(entry); else page.actors.push(entry);
        }
      }
      // The catalogue's own page count: a search answered by a fallback is one page.
      const at = res?.page ?? pageParam;
      page.next = res?.total_pages && at < res.total_pages ? at + 1 : undefined;
      return page;
    },
    initialPageParam: 1,
    getNextPageParam: (last) => last.next,
    enabled: searchable,
    staleTime: 1000 * 60 * 5,
  });

  const members = useInfiniteQuery({
    queryKey: ['universalSearch', 'users', text],
    queryFn: async ({ pageParam, signal }): Promise<RowsPage<MemberCursor>> => {
      // Chosen by the house, closest first (search_members): the handle that is the words, the
      // handles that begin with them, the names that begin with them, the rest; never a member
      // the reader has hidden.
      const { data, error } = await withAbortSignal(supabase.rpc('search_members', {
        p_pattern: handle,
        p_handles_only: asHandle,
        p_cursor_closeness: pageParam?.closeness ?? null,
        p_cursor_username: pageParam?.username ?? null,
        p_limit: SEARCH_PAGE + 1,
      }), signal);
      if (error) {
        logger.error('[useUniversalSearch] a source failed', 'members', error);
        throw error;
      }
      const all = (data ?? []) as MemberRow[];
      const shown = all.slice(0, SEARCH_PAGE);
      const last = shown[shown.length - 1];
      const { isHidden } = useBlockStore.getState();
      return {
        rows: shown.filter((m) => !isHidden(m.id)).map((m): SR => ({
          id: `user-${m.id}`, type: 'user',
          title: `@${m.username ?? 'anonymous'}`,
          // Empty: the rank is the row's badge, drawn from `role`.
          subtitle: '',
          image: m.avatar_url || null,
          role: resolveTier({ role: m.role ?? undefined }),
          _nav: memberPath(String(m.username), m.id),
        })),
        next: all.length > SEARCH_PAGE && last ? { closeness: last.closeness, username: last.username } : undefined,
      };
    },
    initialPageParam: null as MemberCursor | null,
    getNextPageParam: (last) => last.next,
    enabled: membersAsked,
    staleTime: 1000 * 60 * 5,
  });

  const logs = useInfiniteQuery({
    // The reader is in the key: their own spoiler is quoted to them, and to no one else.
    queryKey: ['universalSearch', 'logs', text, me ?? null],
    queryFn: async ({ pageParam, signal }): Promise<RowsPage<string>> => {
      const cursor = parseCursor(pageParam);
      // One read in the house (search_logs): the film, the writing, or the writer's handle;
      // newest first, by pages; never a record of a member the reader has hidden.
      const { data, error } = await withAbortSignal(supabase.rpc('search_logs', {
        p_pattern: pattern,
        p_handle: handle,
        p_cursor_at: cursor?.primary ?? null,
        p_cursor_id: cursor?.id ?? null,
        p_limit: SEARCH_PAGE + 1,
      }), signal);
      if (error) {
        logger.error('[useUniversalSearch] a source failed', 'logs', error);
        throw error;
      }
      const all = (data ?? []) as LogRow[];
      const shown = all.slice(0, SEARCH_PAGE);
      const last = shown[shown.length - 1];
      const { isHidden } = useBlockStore.getState();
      return {
        rows: shown.filter((log) => !log.user_id || !isHidden(log.user_id)).map((log): SR => ({
          id: `log-${log.id}`, type: 'log',
          title: log.film_title ?? 'Untitled',
          subtitle: `@${(log.username ?? 'anon').toUpperCase()}`,
          image: log.poster_path ? `${TMDB_IMG}${log.poster_path}` : null,
          rating: log.rating ?? undefined,
          role: log.role ?? undefined,
          // One line; the row ellipsizes it where it runs out of room.
          extra: logExcerpt(log, me),
          _nav: `/log/${log.id}`,
        })),
        next: all.length > SEARCH_PAGE && last ? buildCursor(last.created_at, last.id) : undefined,
      };
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next,
    enabled: searchable,
    staleTime: 1000 * 60 * 5,
  });

  const lists = useInfiniteQuery({
    queryKey: ['universalSearch', 'lists', text],
    queryFn: async ({ pageParam, signal }): Promise<RowsPage<string>> => {
      let read = supabase
        .from('lists')
        .select('id, user_id, title, description, is_private, is_ranked, created_at')
        .or(`title.ilike.*${pattern}*,description.ilike.*${pattern}*`)
        .eq('is_private', false)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(SEARCH_PAGE + 1);
      // Newest first, by pages: everything after the last stack shown, the id breaking a tie.
      const past = keysetFilter('created_at', parseCursor(pageParam), 'desc');
      if (past) read = read.or(past);
      const { data, error } = await withAbortSignal(read, signal);
      if (error) {
        logger.error('[useUniversalSearch] a source failed', 'lists', error);
        throw error;
      }
      const all = (data ?? []) as ListRow[];
      const shown = all.slice(0, SEARCH_PAGE);
      const last = shown[shown.length - 1];
      const { isHidden } = useBlockStore.getState();
      return {
        rows: shown.filter((p) => !p.user_id || !isHidden(p.user_id)).map((p): SR => ({
          id: `list-${p.id}`, type: 'list',
          title: p.title ?? 'Untitled Stack',
          subtitle: p.description
            ? (p.is_ranked ? `✦ RANKED · ${cutWhole(p.description, 50)}` : cutWhole(p.description, 60))
            : (p.is_ranked ? '✦ RANKED STACK' : 'PUBLIC STACK'),
          image: null,
          _nav: `/stacks/${p.id}`,
        })),
        next: all.length > SEARCH_PAGE && last ? buildCursor(last.created_at, last.id) : undefined,
      };
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next,
    enabled: searchable,
    staleTime: 1000 * 60 * 5,
  });

  const reads = useMemo(() => ({ films: catalogue, users: members, logs, lists }), [catalogue, members, logs, lists]);
  const asked: PerSource = { films: searchable, users: membersAsked, logs: searchable, lists: searchable };

  /** A source's first page could not be read: its tab is unknown, not empty. */
  const downOf = (s: SearchSource) => asked[s] && reads[s].isError && reads[s].data === undefined;
  const down: SourcesDown = usePerSource(downOf('films'), downOf('users'), downOf('logs'), downOf('lists'));
  // Every source asked has answered its first page, or failed it; one not asked (nothing it could
  // search) is settled too.
  const settled = (!asked.films || !catalogue.isPending) && (!asked.users || !members.isPending)
    && (!asked.logs || !logs.isPending) && (!asked.lists || !lists.isPending);
  const everyAskedDown = searchable && SEARCH_SOURCES.every((s) => !asked[s] || down[s]);

  const catalogueData = catalogue.data;
  const membersData = members.data;
  const logsData = logs.data;
  const listsData = lists.data;
  const partial = down.films || down.users || down.logs || down.lists;
  const data: SearchResults | undefined = useMemo(() => {
    if (!text) return undefined;
    if (!searchable) return EMPTY_RESULTS;
    if (!settled || everyAskedDown) return undefined;
    return {
      films: once(pagesOf(catalogueData).flatMap((p) => p.films)),
      actors: once(pagesOf(catalogueData).flatMap((p) => p.actors)),
      directors: once(pagesOf(catalogueData).flatMap((p) => p.directors)),
      users: once(pagesOf(membersData).flatMap((p) => p.rows)),
      logs: once(pagesOf(logsData).flatMap((p) => p.rows)),
      lists: once(pagesOf(listsData).flatMap((p) => p.rows)),
      _partial: partial,
      _down: down,
    };
  }, [text, searchable, settled, everyAskedDown, catalogueData, membersData, logsData, listsData, partial, down]);

  // Each kept as one object while its four flags hold, so a screen's memos do not run every render.
  const more = usePerSource(
    asked.films && !!catalogue.hasNextPage, asked.users && !!members.hasNextPage,
    asked.logs && !!logs.hasNextPage, asked.lists && !!lists.hasNextPage,
  );
  const readingMore = usePerSource(
    catalogue.isFetchingNextPage, members.isFetchingNextPage, logs.isFetchingNextPage, lists.isFetchingNextPage,
  );
  const moreFailed = usePerSource(
    catalogue.isFetchNextPageError, members.isFetchNextPageError, logs.isFetchNextPageError, lists.isFetchNextPageError,
  );

  /** The next page of one source; asked twice, or with none left, it does nothing. */
  const loadMore = useCallback((source: SearchSource) => {
    const read = reads[source];
    if (!read.hasNextPage || read.isFetchingNextPage) return;
    void read.fetchNextPage();
  }, [reads]);

  /** Ask again: the sources that could not be asked, or all of them when none failed. */
  const refetch = useCallback(() => {
    const failed = SEARCH_SOURCES.filter((s) => reads[s].isError);
    for (const s of failed.length ? failed : SEARCH_SOURCES) void reads[s].refetch();
  }, [reads]);

  // Searching: a first page is out (a next page is the foot's own reading, never the whole search's).
  const isFetching = SEARCH_SOURCES.some((s) => asked[s] && reads[s].isFetching && !reads[s].isFetchingNextPage);

  return {
    data,
    isFetching,
    // Every source asked could not be: the screen's "the telegraph is down" is then the truthful one.
    isError: everyAskedDown,
    refetch,
    more,
    readingMore,
    moreFailed,
    loadMore,
  };
}

/** One flag a source, as one object for as long as the four hold. */
function usePerSource(films: boolean, users: boolean, logs: boolean, lists: boolean): PerSource {
  return useMemo(() => ({ films, users, logs, lists }), [films, users, logs, lists]);
}

/** A paged read's pages, none before its first answer. */
function pagesOf<P>(d: InfiniteData<P, unknown> | undefined): P[] {
  return d?.pages ?? [];
}

/** Each row once, the first time it came: a catalogue page may repeat a film another page held. */
function once(rows: SR[]): SR[] {
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
}
