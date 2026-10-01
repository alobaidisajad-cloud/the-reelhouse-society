import TactileEngine from '@/src/utils/TactileEngine';
import { useIsFocused } from '@react-navigation/native';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useFilmDetail } from '@/src/hooks/useFilmDetail';
import { filterUnseenFilms } from '@/src/utils/recommendations';
import { obscurityScore } from '@/src/lib/tmdb';
import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import { isArchivistPlusTier } from '@/src/utils/tier';

import { FilmDetailLayout } from '@/src/components/film/FilmDetailLayout';
import { ShareCardModal } from '@/src/components/film/ShareCardModal';
import { TrailerModal, footageLabel, type Footage } from '@/src/components/film/TrailerModal';
import { FilmDetailContextValue, FilmDetailProvider } from '@/src/providers/FilmDetailProvider';
import { useScreenReady } from '@/src/hooks/useScreenReady';
import { nav } from '@/src/utils/typedRouter';

const EMPTY_ARRAY = [] as never[];
const EMPTY_OBJECT = {} as Record<string, never>;

export default function FilmDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const idString = Array.isArray(id) ? id[0] : id;
  const filmId = parseInt(idString || '0', 10);
  const validFilmId = !isNaN(filmId) && filmId > 0;

  const { data, isLoading: loading, isError, refetch } = useFilmDetail(filmId, validFilmId);
  const retry = useCallback(() => { void refetch(); }, [refetch]);
  const readyMark = useScreenReady('film', !loading);
  const { user } = useAuthStore();
  const isAuthenticated = !!user;
  const isArchivist = isArchivistPlusTier(user);
  const currentUsername = user?.username ?? 'you';

  const existingLog = useFilmStore(state => validFilmId ? (state._loggedIndex[filmId] ?? null) : null);
  // Subscribe to the whole logged index so "YOU MAY ALSO LIKE" drops a film
  // the instant it's logged (render-time filter, never baked into the cache).
  const loggedIndex = useFilmStore(state => state._loggedIndex);

  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [trailerModalVisible, setTrailerModalVisible] = useState(false);
  const [activeVideo, setActiveVideo] = useState<{ key: string; label: string } | null>(null);
  
  const isFocused = useIsFocused();

  const goBack = useCallback(() => nav.back(), []);

  const filmParams = useMemo(() => ({
    filmId: String(filmId),
    filmTitle: data?.detail?.title ?? '',
    filmPoster: data?.detail?.poster_path ?? '',
  }), [filmId, data?.detail?.title, data?.detail?.poster_path]);

  const handleLog = useCallback(() => {
    if (!isAuthenticated) { nav.push('/login'); return; }
    TactileEngine.mutate();
    nav.push('/log-modal', existingLog ? { editLogId: existingLog.id, ...filmParams } : filmParams);
  }, [isAuthenticated, existingLog, filmParams]);

  const handleRewatch = useCallback(() => {
    if (!isAuthenticated) { nav.push('/login'); return; }
    TactileEngine.rigid();
    nav.push('/log-modal', filmParams);
  }, [isAuthenticated, filmParams]);

  const handleReadFullLog = useCallback(() => {
    if (existingLog?.id) {
      TactileEngine.selection();
      nav.push(`/log/${existingLog.id}`);
    }
  }, [existingLog]);

  /**
   * ── A ROW THAT SAYS TRAILER MUST OPEN A TRAILER ────────────────────────────
   * Never `videos[0]`, ANY video of any kind: a film with nothing but press
   * featurettes would read PLAY THE TRAILER and play an interview. The fallback
   * stops at a teaser, which is still a trailer to a member. Past that `trailer`
   * is null, and the row is simply ABSENT — the honest answer.
   */
  const trailer = useMemo(() => {
    const rawVideos = data?.detail?.videos?.results ?? [];
    const videos = rawVideos.filter((v: any) => v.site === 'YouTube');
    const official = videos.find((v: any) => v.type === 'Trailer' && v.name?.toLowerCase().includes('official'));
    const anyTrailer = videos.find((v: any) => v.type === 'Trailer');
    const teaser = videos.find((v: any) => v.type === 'Teaser');
    return official || anyTrailer || teaser || null;
  }, [data?.detail?.videos?.results]);

  const playVideo = useCallback((video: Footage) => {
    setActiveVideo({ key: video.key, label: footageLabel(video) });
    setTrailerModalVisible(true);
  }, []);

  const handleOpenTrailer = useCallback(() => {
    if (trailer?.key) {
      playVideo(trailer);
      TactileEngine.selection();
    }
  }, [trailer, playVideo]);

  const handleOpenShare = useCallback(() => {
    setShareModalVisible(true);
    TactileEngine.selection();
  }, []);

  const handleOpenLounge = useCallback(() => {
    if (!isAuthenticated) { nav.push('/login'); return; }
    TactileEngine.selection();
    // The Lounge is not film-scoped: the corridor, which every member may walk
    // into and read; the rope waits at the seat inside each room. (A film id is
    // never a salon's.)
    nav.push('/lounge');
  }, [isAuthenticated]);

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
    // Render-time personal filter: hide films already logged. Falls back to
    // EMPTY_ARRAY (stable ref) when nothing remains so the section self-hides.
    const filtered = filterUnseenFilms(data?.similar as any[] | undefined, loggedIndex);
    const similarFilms = filtered.length > 0 ? filtered : EMPTY_ARRAY;

    // What the HOUSE made of it. Never derived from `reviews` — that is a
    // page of WRITTEN critiques, capped at ten, and using its length as a log
    // count is how a film with four hundred logs comes to claim it has two.
    const verdict = data?.verdict ?? null;

    // Unknown, not empty: a page of critiques that could not be read.
    const reviewsFailed = !!data?.reviewsError;

    return { film, videos, directors, cast, score, providers, studios, reviews, reviewsFailed, similarFilms, verdict };
  }, [data, loggedIndex]);

  const providerValue = useMemo<FilmDetailContextValue>(() => {
    return {
      film: derivedData.film,
      reviews: derivedData.reviews,
      reviewsFailed: derivedData.reviewsFailed,
      similarFilms: derivedData.similarFilms,
      directors: derivedData.directors,
      cast: derivedData.cast,
      videos: derivedData.videos,
      score: derivedData.score,
      providers: derivedData.providers,
      studios: derivedData.studios,
      verdict: derivedData.verdict,
      trailer,
      existingLog,
      isAuthenticated,
      isArchivist,
      currentUsername,
      user: user ?? null,
      validFilmId,
      loading,
      isError,
      retry,
      isFocused,
      goBack,
      handleLog,
      handleRewatch,
      handleOpenTrailer,
      handleOpenShare,
      handleOpenLounge,
      handleReadFullLog,
      playVideo,
    };
  }, [
    derivedData, existingLog, isAuthenticated, isArchivist, currentUsername, user, validFilmId, loading, isError, retry,
    isFocused, goBack, handleLog, handleRewatch, handleOpenTrailer, handleOpenShare, handleOpenLounge, handleReadFullLog, trailer,
    playVideo,
  ]);

  return (
    <View style={StyleSheet.absoluteFill}>
      {readyMark}
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
          username={user?.username}
          memberNo={user?.member_no}
        />
      )}
      {activeVideo && (
        <TrailerModal
          visible={trailerModalVisible}
          videoId={activeVideo.key}
          label={activeVideo.label}
          onClose={handleCloseTrailer}
        />
      )}
    </View>
  );
}

// Expo Router per-route crash net — see src/components/RouteErrorBoundary.tsx
export { RouteErrorBoundary as ErrorBoundary } from '@/src/components/RouteErrorBoundary';
