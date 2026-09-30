/** Shared types for the Lobby's reads of the catalogue */

/** Lightweight TMDB film shape: what the trending list gives for each film */
export interface TMDBFilm {
  id: number;
  title?: string;
  name?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  vote_average?: number;
  vote_count?: number;
  overview?: string;
  media_type?: string;
  popularity?: number;
}
