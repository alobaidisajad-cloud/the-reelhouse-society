import { useQuery } from '@tanstack/react-query';
import { tmdb } from '@/src/lib/tmdb';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { supabase } from '@/src/lib/supabase';
import { FilmService } from '@/src/services/FilmService';

export function useFilmDetail(filmId: number, validFilmId: boolean) {
  return useQuery({
    queryKey: ['film', filmId],
    queryFn: async () => {
      const detailP = tmdb.detail(filmId);
      const reviewsP = FilmService.getFilmReviews(String(filmId), 10)
        .then(res => ({ data: res.items, error: null }))
        .catch((err: any) => ({ error: err, data: null }));
        
      const similarP = tmdb.similar(filmId).catch(() => []);

      const [detail, communityReviews, simRes] = await Promise.all([detailP, reviewsP, similarP]);
      if (!detail) throw new Error('Film not found');
      if (communityReviews.error && __DEV__) {
        console.warn('[useFilmDetail] Failed to fetch community reviews:', communityReviews.error);
      }

      const reviews = communityReviews.data ?? [];

      const similar = Array.isArray(simRes)
        ? simRes.filter((f: any) => f && f.poster_path).slice(0, 12)
        : [];

      return { 
        detail, 
        reviews, 
        reviewsError: communityReviews.error,
        similar, 
      };
    },
    staleTime: 30 * 60 * 1000,  // 30 min
    enabled: validFilmId,
  });
}
