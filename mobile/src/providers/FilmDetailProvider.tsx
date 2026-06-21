import React, { createContext, useContext } from 'react';
import { DomainLog } from '@/src/types';
import type { TMDBMovieDetail } from '@/src/lib/tmdb';
import { User } from '@/src/schemas/user';

/** Shape of a community review as returned by useFilmDetail's Supabase join. */
export interface FilmReviewItem {
  id: string;
  rating: number;
  review?: string | null;
  status: string;
  abandoned_reason?: string | null;
  created_at: string;
  user_id?: string | null;
  username?: string;
  role?: string;
  isLocal?: boolean;
  pull_quote?: string | null;
  drop_cap?: boolean | null;
}

export interface FilmDetailContextValue {
  film: TMDBMovieDetail | null;
  reviews: FilmReviewItem[];
  reviewsError?: any;
  similarFilms: { id: number; title?: string; name?: string; poster_path?: string | null }[];
  directors: { id: number; name: string; profile_path?: string | null; job: string }[];
  cast: { id: number; name: string; profile_path?: string | null; character: string }[];
  videos: { key: string; name?: string; site: string; type: string; id: string }[];
  trailer: { key: string; name?: string; site: string; type: string; id: string } | null | undefined;
  score: number;
  providers: Record<string, unknown>;
  studios: any[];
  existingLog: DomainLog | null;
  isAuthenticated: boolean;
  isArchivist: boolean;
  currentUsername: string;
  user: User | null;
  validFilmId: boolean;
  loading: boolean;
  isError: boolean;
  isFocused: boolean;
  goBack: () => void;
  handleLog: () => void;
  handleRewatch: () => void;
  handleOpenTrailer: () => void;
  handleOpenShare: () => void;
  handleOpenLounge: () => void;
  handleReadFullLog: () => void;
  setTrailerModalVisible: (v: boolean) => void;
  setActiveTrailerKey: (k: string | null) => void;
}

const FilmDetailContext = createContext<FilmDetailContextValue | null>(null);

export const FilmDetailProvider = ({ children, value }: { children: React.ReactNode; value: FilmDetailContextValue }) => {
  return <FilmDetailContext.Provider value={value}>{children}</FilmDetailContext.Provider>;
};

export const useFilmDetailContext = () => {
  const ctx = useContext(FilmDetailContext);
  if (!ctx) throw new Error('useFilmDetailContext must be used within a FilmDetailProvider');
  return ctx;
};
