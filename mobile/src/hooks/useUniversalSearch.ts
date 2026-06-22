import { supabase } from '@/src/lib/supabase';
import { tmdb } from '@/src/lib/tmdb';
import { useBlockStore } from '@/src/stores/blockStore';
import { escapeSearchPattern } from '@/src/utils/escapeSearchPattern';
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
interface LogRow { id: string; user_id?: string; film_title: string; review?: string; rating?: number; username?: string; role?: string; poster_path?: string; created_at?: string; status?: string; abandoned_reason?: string | null }
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

export function useUniversalSearch(query: string) {
  return useQuery({
    queryKey: ['universalSearch', query],
    queryFn: async ({ signal }) => {
      const text = query.trim();
      if (!text) {
        return { films: [], actors: [], directors: [], users: [], logs: [], lists: [] };
      }

      const safeText = escapeSearchPattern(text);

      const [tmdbRes, usersRes, logsRes, listsRes] = await Promise.allSettled([
        tmdb.search(text),
        withAbortSignal(
          supabase
            .from('profiles')
            .select('id, username, avatar_url, role')
            .or(`username.ilike."%${safeText}%",display_name.ilike."%${safeText}%"`)
            .limit(15),
          signal
        ),
        withAbortSignal(
          supabase
            .from('logs')
            .select('id, user_id, film_title, review, rating, username, role, poster_path, status, abandoned_reason, created_at')
            .or(`film_title.ilike."%${safeText}%",review.ilike."%${safeText}%",username.ilike."%${safeText}%"`)
            .not('review', 'is', null)
            .order('created_at', { ascending: false })
            .limit(20),
          signal
        ),
        withAbortSignal(
          supabase
            .from('lists')
            .select('id, user_id, title, description, is_private, is_ranked, created_at')
            .or(`title.ilike."%${safeText}%",description.ilike."%${safeText}%"`)
            .eq('is_private', false)
            .order('created_at', { ascending: false })
            .limit(12),
          signal
        ),
      ]);

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

      // ── Parse logs (filter blocked/muted) ──
      if (logsRes.status === 'fulfilled' && !logsRes.value.error) {
        const { isHidden } = useBlockStore.getState();
        l = (logsRes.value.data ?? [])
          .filter((log: LogRow) => !log.user_id || !isHidden(log.user_id))
          .map((log: LogRow) => ({
            id: `log-${log.id}`, type: 'log',
            title: log.film_title ?? 'Untitled',
            subtitle: `@${(log.username ?? 'anon').toUpperCase()}`,
            image: log.poster_path ? `${TMDB_IMG}${log.poster_path}` : null,
            rating: log.rating,
            role: log.role,
            extra: log.status === 'abandoned' 
              ? `[ABANDONED${log.abandoned_reason ? ` — ${log.abandoned_reason.toUpperCase()}` : ''}] ${log.review ? log.review.replace(/<[^>]+>/g, '').trim().slice(0, 50) + '…' : ''}`
              : (log.review ? `"${log.review.replace(/<[^>]+>/g, '').trim().slice(0, 80)}…"` : undefined),
            _nav: `/log/${log.id}`,
          }));
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

      return { films: f, actors: a, directors: d, users: u, logs: l, lists: lst };
    },
    enabled: query.trim().length > 0,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
