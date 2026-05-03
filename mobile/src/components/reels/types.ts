export interface RawFeedRow {
  id: string | number;
  username?: string;
  avatar_url?: string;
  film_title?: string;
  film_id?: number;
  poster_path?: string | null;
  rating?: number;
  review?: string | null;
  drop_cap?: boolean;
  status?: string;
  abandoned_reason?: string | null;
  created_at: string;
  year?: number | null;
  editorial_header?: string | null;
  pull_quote?: string | null;
  watched_with?: string | null;
  role?: string;
  is_autopsied?: boolean;
  autopsy?: any;
  profiles?: { username?: string; avatar_url?: string; role?: string } | { username?: string; avatar_url?: string; role?: string }[] | null;
}

export interface StackFilm {
  id: number;
  title: string;
  poster_path: string | null;
}

export interface StackData {
  id: string;
  title: string;
  description: string;
  curator: string;
  curatorId: string;
  createdAt: string;
  films: StackFilm[];
  count: number;
  certifyCount: number;
  isRanked: boolean;
}

export interface ListRow {
  id: string;
  title: string;
  description?: string;
  created_at: string;
  user_id: string;
  is_private: boolean;
  is_ranked: boolean;
}

export interface ListItemRow {
  list_id: string;
  film_id: number;
  film_title: string;
  poster_path: string | null;
}

export interface EndorseRow {
  target_list_id: string;
}

export type ReelSection = 'logs' | 'stacks';
export type FeedFilter = 'all' | 'following';
