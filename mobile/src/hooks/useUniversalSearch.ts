import { supabase } from '@/src/lib/supabase';
import { tmdb } from '@/src/lib/tmdb';
import { logger } from '@/src/utils/logger';
import { useBlockStore } from '@/src/stores/blockStore';
import { buildSearchPattern } from '@/src/utils/searchPattern';
import { stripHtml } from '@/src/utils/html';
import { resolveTier } from '@/src/utils/tier';
import { withAbortSignal } from '@/src/utils/withAbortSignal';
import { useQuery } from '@tanstack/react-query';

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

interface ProfileRow { id: string; username: string; avatar_url?: string; role?: string }
/** A log's author arrives embedded: `logs` has no username or role of its own. */
interface LogAuthor { username?: string; role?: string }
interface LogRow {
  id: string;
  user_id?: string;
  film_title: string;
  review?: string;
  rating?: number;
  poster_path?: string;
  created_at?: string;
  status?: string;
  abandoned_reason?: string | null;
  profiles?: LogAuthor | LogAuthor[] | null;
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

/** Which sources could not be asked: an empty tab is then unknown, not empty. */
export interface SourcesDown { films: boolean; users: boolean; logs: boolean; lists: boolean }

const NONE_DOWN: SourcesDown = { films: false, users: false, logs: false, lists: false };

const EMPTY_RESULTS = {
  films: [] as SR[], actors: [] as SR[], directors: [] as SR[],
  users: [] as SR[], logs: [] as SR[], lists: [] as SR[],
  _partial: false,
  _down: NONE_DOWN,
};

/** Columns the LOGS tab needs, plus the author it could never fetch before. */
const LOG_SEARCH_COLUMNS =
  'id, user_id, film_title, review, rating, poster_path, status, abandoned_reason, created_at';

/** How many members a search shows, and how many it reads to choose them from. */
const MEMBERS_SHOWN = 15;
const MEMBERS_READ = 30;

/** A source that is not asked: the search had nothing to ask it. */
const NOT_ASKED = Promise.resolve({ data: [] as never[], error: null });

/** The exact handle first, then handles that begin with the search, then the rest. */
function closeness(handle: string) {
  const h = handle.toLowerCase();
  return (row: ProfileRow) => {
    const u = (row.username ?? '').toLowerCase();
    return u === h ? 0 : u.startsWith(h) ? 1 : 2;
  };
}

/** A review as one plain line: no markup, entities decoded, whitespace folded. */
function plainLine(review: string | null | undefined): string {
  return stripHtml(review ?? '').replace(/\s+/g, ' ').slice(0, 200);
}

/** PostgREST returns an embedded to-one either as an object or a one-element array. */
function firstAuthor(embedded: LogRow['profiles']): LogAuthor | null {
  if (!embedded) return null;
  return Array.isArray(embedded) ? (embedded[0] ?? null) : embedded;
}

export function useUniversalSearch(query: string) {
  return useQuery({
    queryKey: ['universalSearch', query.trim()],
    queryFn: async ({ signal }) => {
      const text = query.trim();
      if (!text) return EMPTY_RESULTS;

      // `null` means the text carries nothing searchable — a term of only commas
      // would otherwise become pure wildcards and match every row.
      const pattern = buildSearchPattern(text);
      if (pattern === null) return EMPTY_RESULTS;

      // "@kane" asks for a handle: the @ is how members write one, and no
      // username holds it. Such a search reads usernames only.
      const asHandle = text.startsWith('@');
      const handleText = text.replace(/^@+/, '').trim();
      const handle = buildSearchPattern(handleText);

      const [tmdbRes, usersRes, exactRes, logsTextRes, logsAuthorRes, listsRes] = await Promise.allSettled([
        tmdb.search(text),
        handle === null ? NOT_ASKED : withAbortSignal(
          supabase
            .from('profiles')
            .select('id, username, avatar_url, role')
            .or(asHandle
              ? `username.ilike.*${handle}*`
              : `username.ilike.*${handle}*,display_name.ilike.*${handle}*`)
            .order('username')
            .limit(MEMBERS_READ),
          signal
        ),
        // The exact handle, asked for on its own: among many near matches the
        // read above can leave it out, and it is the one being looked for.
        handle === null ? NOT_ASKED : withAbortSignal(
          supabase
            .from('profiles')
            .select('id, username, avatar_url, role')
            .ilike('username', handle)
            .limit(1),
          signal
        ),
        // Logs matching the film or the writing.
        withAbortSignal(
          supabase
            .from('logs')
            .select(`${LOG_SEARCH_COLUMNS}, profiles!logs_user_id_fkey(username, role)`)
            .or(`film_title.ilike.*${pattern}*,review.ilike.*${pattern}*`)
            .not('review', 'is', null)
            .neq('review', '')
            .order('created_at', { ascending: false })
            .limit(20),
          signal
        ),
        // Logs matching the WRITER's name. This cannot be folded into the query
        // above: PostgREST refuses to reference an embedded column inside a
        // top-level `or()` — the dotted path fails to parse. A separate query is
        // the only way, and it is safe to merge because this tab is not paged.
        handle === null ? NOT_ASKED : withAbortSignal(
          supabase
            .from('logs')
            .select(`${LOG_SEARCH_COLUMNS}, profiles!logs_user_id_fkey!inner(username, role)`)
            .ilike('profiles.username', `*${handle}*`)
            .not('review', 'is', null)
            .neq('review', '')
            .order('created_at', { ascending: false })
            .limit(20),
          signal
        ),
        withAbortSignal(
          supabase
            .from('lists')
            .select('id, user_id, title, description, is_private, is_ranked, created_at')
            .or(`title.ilike.*${pattern}*,description.ilike.*${pattern}*`)
            .eq('is_private', false)
            .order('created_at', { ascending: false })
            .limit(12),
          signal
        ),
      ]);

      // ── Failures are recorded, never swallowed ──
      // Each source degrades on its own: a broken section returns nothing while
      // the rest of the screen still works. Throwing here would replace a
      // perfectly good search with a full-screen error whenever one source
      // hiccups. Only a total failure is reported as one — see below.
      const failed = (label: string, res: PromiseSettledResult<{ error?: unknown } | unknown>) => {
        if (res.status === 'rejected') {
          logger.error(`[useUniversalSearch] ${label} rejected:`, res.reason);
          return true;
        }
        const err = (res.value as { error?: unknown } | null)?.error;
        if (err) {
          logger.error(`[useUniversalSearch] ${label} failed:`, err);
          return true;
        }
        return false;
      };

      const tmdbFailed = tmdbRes.status === 'rejected';
      if (tmdbFailed) logger.error('[useUniversalSearch] tmdb rejected:', tmdbRes.reason);
      const usersFailed = failed('profiles', usersRes) || failed('profiles (exact)', exactRes);
      const logsTextFailed = failed('logs (text)', logsTextRes);
      const logsAuthorFailed = failed('logs (author)', logsAuthorRes);
      const listsFailed = failed('lists', listsRes);

      const allFailed =
        tmdbFailed && usersFailed && logsTextFailed && logsAuthorFailed && listsFailed;
      if (allFailed) {
        // Every source is down — the screen's "the telegraph is down" state is
        // then the truthful one.
        throw new Error('universal search: every source failed');
      }

      const f: SR[] = [];
      const a: SR[] = [];
      const d: SR[] = [];
      let u: SR[] = [];
      let l: SR[] = [];
      let lst: SR[] = [];

      // ── Parse TMDB ──
      if (tmdbRes.status === 'fulfilled') {
        const raw = (tmdbRes.value?.results || []).slice(0, 25);
        for (const item of raw) {
          if (item.media_type === 'movie' || (!item.media_type && item.title)) {
            f.push({
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
            if (isDir) d.push(entry); else a.push(entry);
          }
        }
      }

      // ── Parse users (filter blocked/muted) ──
      {
        const { isHidden } = useBlockStore.getState();
        const rows: ProfileRow[] = [];
        if (exactRes.status === 'fulfilled' && !exactRes.value.error) rows.push(...((exactRes.value.data ?? []) as ProfileRow[]));
        if (usersRes.status === 'fulfilled' && !usersRes.value.error) rows.push(...((usersRes.value.data ?? []) as ProfileRow[]));
        const seen = new Set<string>();
        const rank = closeness(handleText);
        u = rows
          .filter((user) => {
            if (seen.has(user.id)) return false;
            seen.add(user.id);
            return !isHidden(user.id);
          })
          .sort((x, y) => rank(x) - rank(y))
          .slice(0, MEMBERS_SHOWN)
          .map((user: ProfileRow) => ({
            id: `user-${user.id}`, type: 'user',
            title: `@${user.username ?? 'anonymous'}`,
            // Empty: the rank is the row's badge, drawn from `role`.
            subtitle: '',
            image: user.avatar_url || null,
            role: resolveTier(user),
            _nav: `/user/${user.username}`,
          }));
      }

      // ── Parse logs (merge both matches, filter blocked/muted) ──
      // Blocked members are removed BEFORE the cut to 20, so they cannot consume
      // result slots and leave the tab looking emptier than it is.
      {
        const { isHidden } = useBlockStore.getState();
        const rows: LogRow[] = [];
        if (logsTextRes.status === 'fulfilled' && !logsTextRes.value.error) {
          rows.push(...((logsTextRes.value.data ?? []) as LogRow[]));
        }
        if (logsAuthorRes.status === 'fulfilled' && !logsAuthorRes.value.error) {
          rows.push(...((logsAuthorRes.value.data ?? []) as LogRow[]));
        }

        const seen = new Set<string>();
        l = rows
          .filter(log => {
            if (seen.has(log.id)) return false;      // a log can match both queries
            seen.add(log.id);
            return !log.user_id || !isHidden(log.user_id);
          })
          .sort((x, y) => (y.created_at ?? '').localeCompare(x.created_at ?? ''))
          .slice(0, 20)
          .map((log: LogRow) => {
            const author = firstAuthor(log.profiles);
            return {
              id: `log-${log.id}`, type: 'log' as const,
              title: log.film_title ?? 'Untitled',
              subtitle: `@${(author?.username ?? 'anon').toUpperCase()}`,
              image: log.poster_path ? `${TMDB_IMG}${log.poster_path}` : null,
              rating: log.rating,
              role: author?.role,
              // One line; the row ellipsizes it where it runs out of room.
              extra: log.status === 'abandoned'
                ? `[ABANDONED${log.abandoned_reason ? ` — ${log.abandoned_reason.toUpperCase()}` : ''}]${plainLine(log.review) ? ` ${plainLine(log.review)}` : ''}`
                : (plainLine(log.review) ? `"${plainLine(log.review)}"` : undefined),
              _nav: `/log/${log.id}`,
            };
          });
      }

      // ── Parse lists (filter blocked/muted) ──
      if (listsRes.status === 'fulfilled' && !listsRes.value.error) {
        const { isHidden } = useBlockStore.getState();
        lst = (listsRes.value.data ?? [])
          .filter((p: ListRow) => !p.user_id || !isHidden(p.user_id))
          .map((p: ListRow) => ({
          id: `list-${p.id}`, type: 'list',
          title: p.title ?? 'Untitled Stack',
          subtitle: p.description
              ? (p.is_ranked ? `✦ RANKED · ${p.description.slice(0, 50)}` : p.description.slice(0, 60))
              : (p.is_ranked ? '✦ RANKED STACK' : 'PUBLIC STACK'),
          image: null,
          _nav: `/stacks/${p.id}`,
        }));
      }

      // The catalogue counts too: left out, a search made while it was down was
      // kept five minutes as "no films", and the Films tab said so throughout.
      return {
        films: f, actors: a, directors: d, users: u, logs: l, lists: lst,
        _partial: tmdbFailed || usersFailed || logsTextFailed || logsAuthorFailed || listsFailed,
        _down: {
          films: tmdbFailed,
          users: usersFailed,
          logs: logsTextFailed || logsAuthorFailed,
          lists: listsFailed,
        },
      };
    },
    enabled: query.trim().length > 0,
    // A clean result is worth keeping for five minutes. A result assembled while
    // one source was failing must NOT be — otherwise a momentary blip is
    // remembered as "no results" long after the backend has recovered, and
    // nothing retries.
    staleTime: (q) => ((q.state.data as { _partial?: boolean } | undefined)?._partial ? 0 : 1000 * 60 * 5),
  });
}
