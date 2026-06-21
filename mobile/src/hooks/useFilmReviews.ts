import { useInfiniteQuery } from '@tanstack/react-query';
import { FilmService } from '@/src/services/FilmService';

export function useFilmReviews(filmId: string | undefined) {
  return useInfiniteQuery({
    queryKey: ['film_reviews', filmId],
    queryFn: async ({ pageParam, signal }) => {
      return FilmService.getFilmReviews(filmId!, 20, pageParam, signal);
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    initialPageParam: undefined as string | undefined,
    enabled: !!filmId,
    staleTime: 5 * 60 * 1000,
  });
}
