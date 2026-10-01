import { useQuery } from '@tanstack/react-query';
import { tmdb } from '@/src/lib/tmdb';
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
      /**
       * The house's verdict rides alongside — one more row by primary key, in
       * the same round trip, so the hero never has to choose between painting
       * late and painting a number it does not have.
       *
       * It NEVER rejects the film. A film reads perfectly well without knowing
       * what the house thought; it does not read at all if the page throws. A
       * verdict that could not be read is null, unknown, and the hero claims
       * nothing for it: never "the house has not spoken".
       */
      const verdictP = FilmService.getFilmVerdict(filmId).catch(() => null);

      // An unreachable catalogue throws (the page offers TRY AGAIN); a film the
      // catalogue does not have is an answer, null, and the page says so.
      const [detail, communityReviews, verdict] = await Promise.all([detailP, reviewsP, verdictP]);
      if (!detail) return null;
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
        verdict,
      };
    },
    // INSTANT HERO: if the film's detail is already warm in the tmdb LRU
    // (the feed prefetches details for every card you scroll past), paint the
    // hero immediately as placeholder data while the real query — same key,
    // same shape, untouched — completes underneath. The warm detail already
    // carries recommendations/similar, so the pool is populated instantly too.
    // A cold cache (deep link, cold start) returns undefined and the page
    // waits for the real answer. This can never make any path slower.
    placeholderData: () => {
      const cached = tmdb.peekDetail(filmId);
      if (!cached) return undefined;
      // The placeholder carries EVERY key the real result has. No verdict is
      // known yet, and unknown is null: "nobody has spoken" would be a claim
      // about a film the house may well have rated.
      return {
        detail: cached,
        reviews: [],
        reviewsError: null,
        similar: poolFromDetail(cached, filmId),
        verdict: null,
      };
    },
    staleTime: 30 * 60 * 1000,  // 30 min
    enabled: validFilmId,
  });
}
