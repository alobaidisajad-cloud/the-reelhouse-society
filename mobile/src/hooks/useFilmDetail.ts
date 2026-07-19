import { useQuery } from '@tanstack/react-query';
import { tmdb } from '@/src/lib/tmdb';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { supabase } from '@/src/lib/supabase';
import { FilmService } from '@/src/services/FilmService';
import { buildRecommendationPool } from '@/src/utils/recommendations';

// The recommendation pool rides the appended detail payload (no extra call):
// recommendations = TMDB's real engine, similar = fallback for obscure titles.
function poolFromDetail(detail: unknown, filmId: number) {
  const d = detail as { recommendations?: { results?: unknown }; similar?: { results?: unknown } } | null;
  return buildRecommendationPool(d?.recommendations?.results, d?.similar?.results, filmId);
}

export function useFilmDetail(filmId: number, validFilmId: boolean) {
  return useQuery({
    queryKey: ['film', filmId],
    queryFn: async () => {
      const detailP = tmdb.detail(filmId);
      const reviewsP = FilmService.getFilmReviews(String(filmId), 10)
        .then(res => ({ data: res.items, error: null }))
        .catch((err: any) => ({ error: err, data: null }));

      const [detail, communityReviews] = await Promise.all([detailP, reviewsP]);
      if (!detail) throw new Error('Film not found');
      if (communityReviews.error && __DEV__) {
        console.warn('[useFilmDetail] Failed to fetch community reviews:', communityReviews.error);
      }

      const reviews = communityReviews.data ?? [];
      // Raw pool only — the "already-seen" filter runs at render (live), never
      // baked into this 30-min cache.
      const similar = poolFromDetail(detail, filmId);

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
    // same shape, untouched — completes underneath. The warm detail already
    // carries recommendations/similar, so the pool is populated instantly too.
    // Cold cache (deep link, cold start) returns undefined → identical
    // behavior to before. This can never make any path slower.
    placeholderData: () => {
      const cached = tmdb.peekDetail(filmId);
      if (!cached) return undefined;
      return { detail: cached, reviews: [], reviewsError: null, similar: poolFromDetail(cached, filmId) };
    },
    staleTime: 30 * 60 * 1000,  // 30 min
    enabled: validFilmId,
  });
}
