import TactileEngine from '@/src/utils/TactileEngine';
import { useIsFocused } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useFilmDetail } from '@/src/hooks/useFilmDetail';
import { obscurityScore } from '@/src/lib/tmdb';
import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import { isArchivistPlusTier } from '@/src/utils/tier';

import { FilmDetailLayout } from '@/src/components/film/FilmDetailLayout';
import { ShareCardModal } from '@/src/components/film/ShareCardModal';
import { TrailerModal } from '@/src/components/film/TrailerModal';
import { FilmDetailContextValue, FilmDetailProvider } from '@/src/providers/FilmDetailProvider';

const EMPTY_ARRAY = [] as never[];
const EMPTY_OBJECT = {} as Record<string, never>;

export default function FilmDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const router = useRouter();
  const idString = Array.isArray(id) ? id[0] : id;
  const filmId = parseInt(idString || '0', 10);
  const validFilmId = !isNaN(filmId) && filmId > 0;

  const { data, isLoading: loading, isError } = useFilmDetail(filmId, validFilmId);
  const { user } = useAuthStore();
  const isAuthenticated = !!user;
  const isArchivist = isArchivistPlusTier(user);
  const currentUsername = user?.username ?? 'you';

  const existingLog = useFilmStore(state => validFilmId ? (state._loggedIndex[filmId] ?? null) : null);

  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [trailerModalVisible, setTrailerModalVisible] = useState(false);
  const [activeTrailerKey, setActiveTrailerKey] = useState<string | null>(null);
  
  const isFocused = useIsFocused();

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else (router.replace as any)('/' as any);
  }, [router]);

  const handleLog = useCallback(() => {
    if (!isAuthenticated) return (router.push as any)('/login' as any);
    TactileEngine.mutate();
    if (existingLog) {
      router.push({
        pathname: '/log-modal',
        params: {
          editLogId: existingLog.id,
          filmId: String(filmId),
          filmTitle: data?.detail?.title ?? '',
          filmPoster: data?.detail?.poster_path ?? '',
        },
      } as any);
    } else {
      router.push({
        pathname: '/log-modal',
        params: {
          filmId: String(filmId),
          filmTitle: data?.detail?.title ?? '',
          filmPoster: data?.detail?.poster_path ?? '',
        },
      } as any);
    }
  }, [isAuthenticated, router, existingLog, filmId, data?.detail]);

  const handleRewatch = useCallback(() => {
    if (!isAuthenticated) return (router.push as any)('/login' as any);
    TactileEngine.rigid();
    router.push({
      pathname: '/log-modal',
      params: {
        filmId: String(filmId),
        filmTitle: data?.detail?.title ?? '',
        filmPoster: data?.detail?.poster_path ?? '',
      },
    } as any);
  }, [isAuthenticated, router, filmId, data?.detail]);

  const handleReadFullLog = useCallback(() => {
    if (existingLog?.id) {
      TactileEngine.selection();
      (router.push as any)(`/log/${existingLog.id}`);
    }
  }, [existingLog, router]);

  const trailer = useMemo(() => {
    const rawVideos = data?.detail?.videos?.results ?? [];
    const videos = rawVideos.filter((v: any) => v.site === 'YouTube');
    const official = videos.find((v: any) => v.type === 'Trailer' && v.name?.toLowerCase().includes('official'));
    const anyTrailer = videos.find((v: any) => v.type === 'Trailer');
    const teaser = videos.find((v: any) => v.type === 'Teaser');
    return official || anyTrailer || teaser || videos[0] || null;
  }, [data?.detail?.videos?.results]);

  const handleOpenTrailer = useCallback(() => {
    if (trailer?.key) {
      setActiveTrailerKey(trailer.key);
      setTrailerModalVisible(true);
      TactileEngine.selection();
    }
  }, [trailer]);

  const handleOpenShare = useCallback(() => {
    setShareModalVisible(true);
    TactileEngine.selection();
  }, []);

  const handleOpenLounge = useCallback(() => {
    if (!isAuthenticated) return (router.push as any)('/login' as any);
    TactileEngine.selection();
    (router.push as any)(`/lounge/${filmId}` as any);
  }, [isAuthenticated, router, filmId]);

  const handleCloseShare = useCallback(() => setShareModalVisible(false), []);
  const handleCloseTrailer = useCallback(() => setTrailerModalVisible(false), []);

  const derivedData = useMemo(() => {
    const film = data?.detail ?? null;
    const rawVideos = film?.videos?.results ?? EMPTY_ARRAY;
    const videos = rawVideos.length > 0 ? rawVideos.filter((v: any) => v.site === 'YouTube').slice(0, 6) : EMPTY_ARRAY;
    const crew = film?.credits?.crew ?? EMPTY_ARRAY;
    const directors = crew.filter((c: any) => c.job === 'Director').slice(0, 4);
    const cast = film?.credits?.cast ? film.credits.cast.slice(0, 15) : EMPTY_ARRAY;
    const score = film ? obscurityScore(film) : 0;
    const providers = film?.['watch/providers']?.results ? (film['watch/providers'].results as Record<string, unknown>) : EMPTY_OBJECT;
    const studios = film?.production_companies ?? EMPTY_ARRAY;
    const reviews = data?.reviews ?? EMPTY_ARRAY;
    const similarFilms = data?.similar ? (data.similar as any[]) : EMPTY_ARRAY;

    return { film, videos, directors, cast, score, providers, studios, reviews, similarFilms };
  }, [data]);

  const providerValue = useMemo<FilmDetailContextValue>(() => {
    return {
      film: derivedData.film,
      reviews: derivedData.reviews,
      similarFilms: derivedData.similarFilms,
      directors: derivedData.directors,
      cast: derivedData.cast,
      videos: derivedData.videos,
      score: derivedData.score,
      providers: derivedData.providers,
      studios: derivedData.studios,
      trailer,
      existingLog,
      isAuthenticated,
      isArchivist,
      currentUsername,
      user: user ?? null,
      validFilmId,
      loading,
      isError,
      isFocused,
      goBack,
      handleLog,
      handleRewatch,
      handleOpenTrailer,
      handleOpenShare,
      handleOpenLounge,
      handleReadFullLog,
      setTrailerModalVisible,
      setActiveTrailerKey,
    };
  }, [
    derivedData, existingLog, isAuthenticated, isArchivist, currentUsername, user, validFilmId, loading, isError,
    isFocused, goBack, handleLog, handleRewatch, handleOpenTrailer, handleOpenShare, handleOpenLounge, handleReadFullLog, trailer
  ]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <FilmDetailProvider value={providerValue}>
        <FilmDetailLayout />
      </FilmDetailProvider>

      {/* ── Modals ── */}
      {data?.detail && (
        <ShareCardModal
          visible={shareModalVisible}
          onClose={handleCloseShare}
          film={data.detail as any}
          log={existingLog as any}
        />
      )}
      {activeTrailerKey && (
        <TrailerModal
          visible={trailerModalVisible}
          videoId={activeTrailerKey}
          onClose={handleCloseTrailer}
        />
      )}
    </View>
  );
}
