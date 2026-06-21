import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { PulseActivity, timeAgo, FeaturedLog } from '../components/home/types';

export function useFeaturedCritique() {
  return useQuery({
    queryKey: ['featuredCritique'],
    queryFn: async (): Promise<PulseActivity | null> => {
      const { data: featuredLog, error } = await supabase
        .rpc('get_featured_critique')
        .select('id, film_id, film_title, poster_path, rating, review, status, abandoned_reason, watched_with, pull_quote, drop_cap, editorial_header, is_autopsied, autopsy, created_at, user_id, profiles!logs_user_id_fkey(username, role, avatar_url)')
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!featuredLog) return null;

      const log = featuredLog as FeaturedLog;
      const username = (Array.isArray(log.profiles) ? log.profiles[0]?.username : log.profiles?.username) ?? 'SOCIETY';
      const role = (Array.isArray(log.profiles) ? log.profiles[0]?.role : log.profiles?.role) ?? 'cinephile';

      return {
        id: log.id,
        user_id: log.user_id,
        user: username,
        userRole: role,
        film: { id: log.film_id, title: log.film_title, poster_path: log.poster_path },
        rating: log.rating,
        text: log.review,
        dropCap: log.drop_cap,
        pullQuote: log.pull_quote ?? '',
        status: log.status,
        abandoned_reason: log.abandoned_reason,
        watchedWith: log.watched_with,
        is_autopsied: log.is_autopsied,
        autopsy: log.autopsy,
        editorialHeader: log.editorial_header ?? null,
        time: timeAgo(log.created_at)
      };
    },
    staleTime: 1000 * 60 * 15, // 15 minutes
    retry: 2,
  });
}
