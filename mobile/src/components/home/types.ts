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

/** Utility: human-readable relative time */
export function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  if (isNaN(diff)) return '';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'MOMENTS AGO';
  if (mins < 60) return mins === 1 ? '1 MIN. AGO' : `${mins} MIN. AGO`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs === 1 ? '1 HR. AGO' : `${hrs} HRS. AGO`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return days === 1 ? '1 DAY AGO' : `${days} DAYS AGO`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
}
