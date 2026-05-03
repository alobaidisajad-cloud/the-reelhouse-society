import { Image } from 'expo-image';
import { tmdb } from '../lib/tmdb';


/**
 * ImagePrefetcher — Aggressive Image Preloading.
 * 
 * Preloads essential imagery (posters, backdrops) into the Expo Image
 * memory cache before the user navigates, eliminating pop-in and layout
 * shift to ensure a world-class, instantaneous aesthetic.
 */
export const ImagePrefetcher = {
    /**
     * Prefetch a single TMDB poster path
     */
    preloadPoster: async (posterPath: string | null | undefined, size = 'w500') => {
        if (!posterPath) return;
        const url = tmdb.poster(posterPath, size);
        if (url) {
            await Image.prefetch(url);
        }
    },

    /**
     * Prefetch a batch of films (useful for grids, lists, watchlists)
     */
    preloadFilmBatch: async (films: { poster_path?: string | null }[], size = 'w342') => {
        const urlsToPrefetch = films
            .map(f => f.poster_path ? tmdb.poster(f.poster_path, size) : null)
            .filter((url): url is string => !!url);
        
        // Use Promise.allSettled to ensure one bad URL doesn't stop the rest
        await Promise.allSettled(urlsToPrefetch.map(url => Image.prefetch(url)));
    },

    /**
     * Prefetch backdrop for cinematic headers (e.g. Profile, Film Detail)
     */
    preloadBackdrop: async (backdropPath: string | null | undefined, size = 'w1280') => {
        if (!backdropPath) return;
        const url = tmdb.backdrop(backdropPath, size);
        if (url) {
            await Image.prefetch(url);
        }
    }
};
