/** Shared types for home screen components */

/** Lightweight TMDB film shape used across the home screen */
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

/** Shape of a featured log row from supabase */
export interface FeaturedLog {
  id: string;
  film_id: number;
  film_title: string;
  poster_path: string | null;
  rating: number;
  review: string;
  status: string;
  abandoned_reason?: string | null;
  watched_with: string | null;
  pull_quote: string | null;
  drop_cap: boolean;
  editorial_header: string | null;
  is_autopsied: boolean;
  autopsy: string | null;
  is_spoiler?: boolean | null;
  created_at: string;
  user_id: string;
  profiles: { username: string; role: string; avatar_url?: string | null } | { username: string; role: string; avatar_url?: string | null }[] | null;
}

export interface PulseActivity {
  id: string;
  user_id?: string;
  user: string;
  userRole: string;
  /** Member's portrait; Buster remains the fallback when absent. */
  userAvatar?: string | null;
  film: { id: number; title: string; poster_path: string | null };
  rating: number;
  text: string;
  dropCap: boolean;
  pullQuote: string;
  status?: string;
  abandoned_reason?: string | null;
  watchedWith: string | null;
  is_autopsied: boolean;
  autopsy: string | null;
  is_spoiler?: boolean | null;
  editorialHeader?: string | null;
  time: string;
}

/**
 * Utility: human-readable relative time.
 *
 * #75 — this was one of FOUR near-copies of the same function. Its wording is the one
 * that survived and became canonical ("MOMENTS AGO", "5 MIN. AGO"), because it is the
 * house voice; what it lacked was a weeks bucket, year disambiguation on old entries,
 * and safety against a date-only value shifting a day west of UTC.
 *
 * Re-exported rather than deleted so FeaturedCritique and SocialPulse keep importing
 * from here unchanged — one implementation, no call-site churn.
 */
export { timeAgo } from '@/src/utils/timeAgo';
