import { Heart, Skull, Sparkles, Sun, Flame, Laugh } from 'lucide-react-native';

export const GENRES = [
  { id: 28, name: 'Action' }, { id: 27, name: 'Horror' }, { id: 878, name: 'Sci-Fi' },
  { id: 18, name: 'Drama' }, { id: 35, name: 'Comedy' }, { id: 80, name: 'Crime' },
  { id: 14, name: 'Fantasy' }, { id: 9648, name: 'Mystery' }, { id: 37, name: 'Western' },
  { id: 16, name: 'Animation' }, { id: 99, name: 'Doc' }, { id: 10749, name: 'Romance' },
  { id: 53, name: 'Thriller' }, { id: 10751, name: 'Family' }, { id: 36, name: 'History' },
];

export const DECADES = [
  { label: '2020s', from: '2020-01-01', to: '2029-12-31' },
  { label: '2010s', from: '2010-01-01', to: '2019-12-31' },
  { label: '2000s', from: '2000-01-01', to: '2009-12-31' },
  { label: '1990s', from: '1990-01-01', to: '1999-12-31' },
  { label: '1980s', from: '1980-01-01', to: '1989-12-31' },
  { label: '70s/Older', from: '1900-01-01', to: '1979-12-31' },
];

export const LANGUAGES = [
  { iso: 'en', name: 'English' }, { iso: 'fr', name: 'French' }, { iso: 'es', name: 'Spanish' },
  { iso: 'ja', name: 'Japanese' }, { iso: 'ko', name: 'Korean' }, { iso: 'it', name: 'Italian' },
  { iso: 'de', name: 'German' }, { iso: 'zh', name: 'Chinese' }, { iso: 'ar', name: 'Arabic' },
  { iso: 'hi', name: 'Hindi' },
];

export const SORT_OPTIONS = [
  { value: 'popularity.desc', label: 'Most Popular' },
  { value: 'vote_average.desc', label: 'Highest Rated' },
  { value: 'release_date.desc', label: 'Newest First' },
  { value: 'release_date.asc', label: 'Oldest First' },
  { value: 'revenue.desc', label: 'Box Office' },
  { value: 'vote_count.desc', label: 'Most Voted' },
];

export const MIN_RATINGS = [0, 6, 7, 7.5, 8, 8.5];

// Year boundaries: 1888 = Roundhay Garden Scene (first film), +5 for future releases
export const YEAR_MIN = 1888;
export const YEAR_MAX = new Date().getFullYear() + 5;

export const MOODS = [
  { label: 'Emotional', sub: 'Heavy, profound stories.', icon: 'Heart', genre: 18, sort: 'vote_average.desc', color: '#4A1A3A', accent: '#C06080' },
  { label: 'Terrifying', sub: 'Dark nightmares.', icon: 'Skull', genre: 27, sort: 'vote_average.desc', color: '#1A1A0A', accent: '#8B3A1A' },
  { label: 'Awe-Inspiring', sub: 'Epic magical worlds.', icon: 'Sparkles', genre: 14, sort: 'vote_average.desc', color: '#0A1A2A', accent: '#3A7A8B' },
  { label: 'Heartwarming', sub: 'Love & connection.', icon: 'Sun', genre: 10749, sort: 'release_date.asc', voteGte: 500, color: '#1C1208', accent: '#8B6914' },
  { label: 'Thrilling', sub: 'High-octane cinema.', icon: 'Flame', genre: 28, sort: 'popularity.desc', color: '#2A0A0A', accent: '#8B1A1A' },
  { label: 'Hilarious', sub: 'Pure joy & laughter.', icon: 'Laugh', genre: 35, sort: 'vote_average.desc', voteGte: 200, color: '#0A1A0A', accent: '#4A8B3A' },
];

export const MOOD_ICONS: Record<string, typeof Heart> = { Heart, Skull, Sparkles, Sun, Flame, Laugh };
