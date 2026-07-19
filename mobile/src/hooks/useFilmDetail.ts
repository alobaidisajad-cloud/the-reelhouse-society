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
    // INSTANT HERO: if the film's detail is already warm in the tmdb LRU
    // (the feed prefetches details for every card you scroll past), paint the
    // hero immediately as placeholder data while the real query — same key,
    // same shape, untouched — completes underneath. Reviews/similar sections
    // render conditionally, so they simply appear when the query settles.
    // Cold cache (deep link, cold start) returns undefined → identical
    // behavior to before. This can never make any path slower.
    placeholderData: () => {
      const cached = tmdb.peekDetail(filmId);
      if (!cached) return undefined;
      return { detail: cached, reviews: [], reviewsError: null, similar: [] };
    },
    staleTime: 30 * 60 * 1000,  // 30 min
    enabled: validFilmId,
  });
}
