import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { PulseActivity, timeAgo, FeaturedLog } from '../components/home/types';



export function useSocialPulse() {
  return useQuery({
    queryKey: ['socialPulse'],
    queryFn: async (): Promise<PulseActivity[]> => {
      const { data, error } = await supabase
        .from('logs')
        .select('id, film_id, film_title, poster_path, rating, review, status, abandoned_reason, watched_with, pull_quote, drop_cap, editorial_header, is_autopsied, autopsy, created_at, user_id, profiles!logs_user_id_fkey(username, role)')
        .neq('review', '')
        .not('review', 'is', null)
        .order('created_at', { ascending: false })
        .limit(6);

      if (error) throw error;
      if (!data) return [];

      return data.map((log: FeaturedLog) => {
        const profs = log.profiles as { username?: string; role?: string } | { username?: string; role?: string }[] | null;
        return {
          id: log.id,
          user_id: log.user_id,
          user: Array.isArray(profs) ? (profs[0]?.username ?? 'cinephile') : (profs?.username ?? 'cinephile'),
          userRole: Array.isArray(profs) ? (profs[0]?.role ?? 'cinephile') : (profs?.role ?? 'cinephile'),
          film: { id: log.film_id, title: log.film_title, poster_path: log.poster_path },
          rating: log.rating,
          text: log.review ?? '',
          dropCap: !!log.drop_cap,
          pullQuote: log.pull_quote ?? '',
          status: log.status,
          abandoned_reason: log.abandoned_reason,
          watchedWith: log.watched_with,
          is_autopsied: log.is_autopsied,
          autopsy: log.autopsy,
          editorialHeader: log.editorial_header ?? null,
          time: timeAgo(log.created_at),
        };
      });
    },
    staleTime: 1000 * 30, // 30 seconds for local cache
    retry: 1,
  });
}
