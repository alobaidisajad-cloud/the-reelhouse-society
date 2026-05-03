export interface DispatchFilm {
  id: number;
  title?: string;
  name?: string;
  backdrop_path?: string | null;
  poster_path?: string | null;
  release_date?: string;
  vote_average?: number;
  overview?: string;
}

export interface WireStory {
  id: string;
  title: string;
  excerpt: string;
  category?: string;
  date?: string;
  time?: string;
  author?: string;
  image?: string;
  link?: string;
  body?: string;
  fullContent?: string;
  views?: number;
  certifyCount?: number;
  authorUsername?: string;
}
