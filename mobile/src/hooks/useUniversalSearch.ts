import { supabase } from '@/src/lib/supabase';
import { tmdb } from '@/src/lib/tmdb';
import { logger } from '@/src/utils/logger';
import { useBlockStore } from '@/src/stores/blockStore';
import { buildSearchPattern } from '@/src/utils/searchPattern';
import { isArchivistPlusTier, isAuteurPlusTier, resolveTier } from '@/src/utils/tier';
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
/**
 * The author arrives EMBEDDED. `logs` has no `username` or `role` column of its
 * own — both were selected and filtered on for the life of the feature and both
 * return `42703`, which is why this tab could never return a single result.
 */
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

const EMPTY_RESULTS = {
  films: [] as SR[], actors: [] as SR[], directors: [] as SR[],
  users: [] as SR[], logs: [] as SR[], lists: [] as SR[],
  _partial: false,
};

/** Columns the LOGS tab needs, plus the author it could never fetch before. */
const LOG_SEARCH_COLUMNS =
  'id, user_id, film_title, review, rating, poster_path, status, abandoned_reason, created_at';

/** PostgREST returns an embedded to-one either as an object or a one-element array. */
function firstAuthor(embedded: LogRow['profiles']): LogAuthor | null {
  if (!embedded) return null;
  return Array.isArray(embedded) ? (embedded[0] ?? null) : embedded;
}

export function useUniversalSearch(query: string) {
  return useQuery({
    queryKey: ['universalSearch', query],
    queryFn: async ({ signal }) => {
      const text = query.trim();
      if (!text) return EMPTY_RESULTS;

      // `null` means the text carries nothing searchable — a term of only commas
      // would otherwise become pure wildcards and match every row.
      const pattern = buildSearchPattern(text);
      if (pattern === null) return EMPTY_RESULTS;

      const [tmdbRes, usersRes, logsTextRes, logsAuthorRes, listsRes] = await Promise.allSettled([
        tmdb.search(text),
        withAbortSignal(
          supabase
            .from('profiles')
            .select('id, username, avatar_url, role')
            .or(`username.ilike.*${pattern}*,display_name.ilike.*${pattern}*`)
            .limit(15),
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
        withAbortSignal(
          supabase
            .from('logs')
            .select(`${LOG_SEARCH_COLUMNS}, profiles!logs_user_id_fkey!inner(username, role)`)
            .ilike('profiles.username', `*${pattern}*`)
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
      const usersFailed = failed('profiles', usersRes);
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
              subtitle: item.release_date?.slice(0, 4) ?? 'FILM',
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
      if (usersRes.status === 'fulfilled' && !usersRes.value.error) {
        const { isHidden } = useBlockStore.getState();
        u = (usersRes.value.data ?? [])
          .filter((user: ProfileRow) => !isHidden(user.id))
          .map((user: ProfileRow) => ({
            id: `user-${user.id}`, type: 'user',
            title: `@${user.username ?? 'anonymous'}`,
            subtitle: isAuteurPlusTier(user) ? '★ AUTEUR' : isArchivistPlusTier(user) ? '✦ ARCHIVIST' : 'MEMBER',
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
              extra: log.status === 'abandoned'
                ? `[ABANDONED${log.abandoned_reason ? ` — ${log.abandoned_reason.toUpperCase()}` : ''}] ${log.review ? log.review.replace(/<[^>]+>/g, '').trim().slice(0, 50) + '…' : ''}`
                : (log.review ? `"${log.review.replace(/<[^>]+>/g, '').trim().slice(0, 80)}…"` : undefined),
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

      return {
        films: f, actors: a, directors: d, users: u, logs: l, lists: lst,
        _partial: usersFailed || logsTextFailed || logsAuthorFailed || listsFailed,
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
