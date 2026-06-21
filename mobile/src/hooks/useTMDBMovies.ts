import { useQueries, UseQueryResult } from '@tanstack/react-query';
import { tmdb, TMDBMovieDetail } from '../lib/tmdb';

/**
 * useTMDBMovies.ts
 * ────────────────────────────────────────────────────────
 * data fetching hook. Automatically deduplicates,
 * caches, and persists TMDB movie details. Completely 
 * replaces the legacy manual setInterval batching and 
 * GLOBAL_TMDB_CACHE map.
 */
export function useTMDBMovies(ids: number[]): UseQueryResult<TMDBMovieDetail, Error>[] {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: ['tmdb_hook', 'detail', id],
      queryFn: async () => {
        const res = await tmdb.detail(id);
        if (!res) throw new Error(`TMDB Movie ${id} not found`);
        return res;
      },
      staleTime: 24 * 60 * 60 * 1000, // 24 hours
    })),
  });
}
