import React, { memo, useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, useWindowDimensions, InteractionManager } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedScrollHandler, withSequence, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { ArrowLeft, AlertTriangle, Film as FilmIcon, RotateCcw, Check, XCircle, ArrowUpRight } from 'lucide-react-native';

import { colors, fonts, SEPIA_HASH, metrics } from '@/src/theme/theme';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { tmdb, getYear, formatRuntime } from '@/src/lib/tmdb';
import { formatDate } from '@/src/utils/timeAgo';
import { stripHtml } from '@/src/utils/html';



import PressableScale from '@/src/components/PressableScale';
import { ReelRating } from '@/src/components/Decorative';
import { FilmSectionHeader } from '@/src/components/film/FilmSectionHeader';
import { WatchProviders } from '@/src/components/film/WatchProviders';
import { CastCarousel } from '@/src/components/film/CastCarousel';
import CountryReleases from '@/src/components/film/CountryReleases';
import { FilmHero } from '@/src/components/film/FilmHero';
import { FilmHeroSkeleton } from '@/src/components/film/FilmHeroSkeleton';
import { FilmReviews } from '@/src/components/film/FilmReviews';
import { FilmDossier } from '@/src/components/film/FilmDossier';
import { FilmStudios } from '@/src/components/film/FilmStudios';
import { FilmSimilar } from '@/src/components/film/FilmSimilar';
import { FilmMediaCarousel } from '@/src/components/film/FilmMediaCarousel';
import { FilmActionRow } from '@/src/components/film/FilmActionRow';
import { useFilmAnimations } from '@/src/hooks/useFilmAnimations';
import TactileEngine from '@/src/utils/TactileEngine';
import { nav } from '@/src/utils/typedRouter';
import { useFilmDetailContext } from '@/src/providers/FilmDetailProvider';


const STATUS_CONFIG = {
  watched: { text: 'WATCHED', Icon: Check },
  rewatched: { text: 'REWATCHED', Icon: RotateCcw },
  abandoned: { text: 'ABANDONED', Icon: XCircle },
};

const DirectorCard = memo(function DirectorCard({ director }: { director: { id: number; name: string; profile_path?: string | null } }) {
  const photoUri = director?.profile_path
    ? tmdb.profile(director.profile_path)
    : null;

  return (
    <PressableScale
      style={s.directorCard}
      onPress={() => { TactileEngine.selection(); nav.push(`/person/${director.id}`); }}
      pressedScale={0.98}
      accessibilityLabel={`Directed by ${director?.name}`}
    >
      {photoUri ? (
        <Image source={{ uri: photoUri }} style={s.directorPhoto} cachePolicy="memory-disk" placeholder={{ blurhash: SEPIA_HASH }} transition={50} />
      ) : (
        <View style={[s.directorPhoto, s.directorPhotoPlaceholder]}>
          <Text style={s.directorPhotoInitial}>
            {director?.name?.charAt(0)?.toUpperCase() || '?'}
          </Text>
        </View>
      )}
      <View style={s.directorInfo}>
        <Text style={s.directorLabel}>DIRECTED BY</Text>
        <Text style={s.directorName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{director?.name}</Text>
      </View>
      <ArrowUpRight size={14} color={colors.fog} strokeWidth={1.5} />
    </PressableScale>
  );
});

export const FilmDetailLayout = memo(function FilmDetailLayout() {
  const {
    film, reviews, reviewsError, similarFilms, directors, cast, videos, trailer, score, providers, studios,
    existingLog, isAuthenticated, isArchivist, user,
    validFilmId, loading, isError, isFocused,
    goBack, handleLog, handleRewatch, handleOpenTrailer,
    handleOpenShare, handleOpenLounge, handleReadFullLog, setTrailerModalVisible, setActiveTrailerKey
  } = useFilmDetailContext();

  const handlePlayVideo = useCallback((key: string) => {
    setActiveTrailerKey(key);
    setTrailerModalVisible(true);
  }, [setActiveTrailerKey, setTrailerModalVisible]);

  const { height: windowHeight } = useWindowDimensions();
  const BACKDROP_H = useMemo(() => windowHeight * metrics.backdropHeightRatio, [windowHeight]);
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);

  const [isTransitionComplete, setIsTransitionComplete] = useState(false);
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      setIsTransitionComplete(true);
    });
    return () => task.cancel();
  }, []);

  const {
    posterGlowStyle,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    whisperPulseStyle,
    skeletonAnimStyle,
    bookmarkAnimStyle,
    backdropAnimatedStyle,
    immersiveAnimatedStyle,
    bookmarkScale
  } = useFilmAnimations({ isFocused, scrollY, backdropHeight: BACKDROP_H });

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  const handleWatchlistToggled = useCallback(() => {
    bookmarkScale.value = withSequence(
      withSpring(1.3, { damping: 8, stiffness: 300 }),
      withSpring(1, { damping: 12, stiffness: 200 })
    );
  }, [bookmarkScale]);



  if (loading && validFilmId) {
    return (
      <View style={s.container}>
        <Animated.View style={[s.floatingBack, { top: Math.max(insets.top + 10, 20), zIndex: 100 }]}>
          <PressableScale onPress={goBack} hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} accessibilityLabel="Go back">
            <ArrowLeft size={16} color={colors.sepia} strokeWidth={1.5} />
          </PressableScale>
        </Animated.View>
        <FilmHeroSkeleton skeletonAnimStyle={skeletonAnimStyle} backdropHeight={BACKDROP_H} />
      </View>
    );
  }

  if (isError && !film) {
    return (
      <View style={[s.container, s.notFoundContainer]}>
        <AlertTriangle size={48} color={colors.bloodReel} strokeWidth={1} />
        <Text style={s.notFoundTitle}>Transmission Failed</Text>
        <Text style={s.notFoundBody}>The archive is currently unreachable. Please check your connection.</Text>
        <PressableScale style={s.backBtn} onPress={goBack} hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} accessibilityLabel="Go back">
          <View style={s.ctaIconRow}>
            <ArrowLeft size={12} color={colors.bone} strokeWidth={1.5} />
            <Text style={s.backBtnText}>GO BACK</Text>
          </View>
        </PressableScale>
      </View>
    );
  }

  if (!validFilmId || !film) {
    return (
      <View style={[s.container, s.notFoundContainer]}>
        <FilmIcon size={48} color={colors.bloodReel} strokeWidth={1} />
        <Text style={s.notFoundTitle}>Not in the Archive</Text>
        <Text style={s.notFoundBody}>This reel could not be found. It may have been withdrawn from circulation.</Text>
        <PressableScale style={s.backBtn} onPress={goBack} hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} accessibilityLabel="Go back">
          <View style={s.ctaIconRow}>
            <ArrowLeft size={12} color={colors.bone} strokeWidth={1.5} />
            <Text style={s.backBtnText}>GO BACK</Text>
          </View>
        </PressableScale>
      </View>
    );
  }
  return (
    <View style={s.container}>
      {/* Parallax Backdrop */}
      <Animated.View style={[s.backdropWrap, { height: BACKDROP_H }, backdropAnimatedStyle]}>
        {film.backdrop_path ? (
          <Image source={{ uri: tmdb.backdrop(film.backdrop_path) }} style={s.backdrop} contentFit="cover" cachePolicy="memory-disk" placeholder={{ blurhash: SEPIA_HASH }} transition={300} />
        ) : (
          <LinearGradient colors={['rgba(8,6,4,0.98)', colors.ink]} style={s.backdrop} />
        )}
        {film.backdrop_path && <View style={s.sepiaTint} />}
        <LinearGradient
          colors={['rgba(11,10,8,0.05)', 'rgba(11,10,8,0.4)', 'rgba(11,10,8,0.85)', colors.ink]}
          locations={[0, 0.5, 0.75, 1]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* Floating Back */}
      <Animated.View style={[s.floatingBack, { top: Math.max(insets.top + 10, 20) }, immersiveAnimatedStyle]}>
        <PressableScale onPress={goBack} hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} accessibilityLabel="Go back">
          <ArrowLeft size={16} color={colors.sepia} strokeWidth={1.5} />
        </PressableScale>
      </Animated.View>

      <Animated.ScrollView
        contentContainerStyle={[s.scrollContent, { paddingBottom: Math.max(insets.bottom, 100) }]}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        <View style={[s.backdropSpacer, { height: BACKDROP_H - 80 }]} />


        {/* HERO */}
        <FilmHero 
          film={film} 
          reviews={reviews} 
          existingLog={existingLog} 
          score={score} 
          studios={studios} 
          posterGlowStyle={posterGlowStyle} 
          statusConfig={STATUS_CONFIG} 
        />

        {/* ACTION ROW */}
        <FilmActionRow
          filmId={film.id}
          film={film}
          existingLog={existingLog}
          isAuthenticated={isAuthenticated}
          isArchivist={isArchivist}
          bookmarkAnimStyle={bookmarkAnimStyle}
          handleLog={handleLog}
          handleRewatch={handleRewatch}
          onWatchlistToggled={handleWatchlistToggled}
          handleOpenTrailer={handleOpenTrailer}
          handleOpenShare={handleOpenShare}
          handleOpenLounge={handleOpenLounge}
          hasTrailer={!!trailer}
        />

        {/* YOUR LOG */}
        {isTransitionComplete && (
          <>
            {existingLog && (
              <Animated.View style={s.yourLogWrap}>
                <View style={s.yourLogHeader}>
                  {(existingLog.rating ?? 0) > 0 && <ReelRating rating={existingLog.rating ?? 0} size={14} />}
                  <View style={s.yourLogMetaRow}>
                    {existingLog.watchedDate && <Text style={s.yourLogMetaText}>{formatDate(existingLog.watchedDate)}</Text>}
                    {(existingLog.viewCount ?? 1) > 1 && (
                      <View style={s.yourLogViewings}>
                        <RotateCcw size={7} color={colors.fog} />
                        <Text style={s.yourLogMetaText}>{existingLog.viewCount} viewings</Text>
                      </View>
                    )}
                  </View>
                </View>
                {existingLog.review ? (
                  <PressableScale onPress={handleReadFullLog} pressedScale={0.98} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} accessibilityLabel="Read full critique">
                    <Text numberOfLines={2} ellipsizeMode="tail" style={s.yourLogReview}>
                      {stripHtml(existingLog.review ?? '')}
                    </Text>
                    {stripHtml(existingLog.review ?? '').length > 100 && (
                      <Text style={s.yourLogReadMore}>READ FULL CRITIQUE →</Text>
                    )}
                  </PressableScale>
                ) : null}
              </Animated.View>
            )}

            {/* SYNOPSIS */}
            <Animated.View style={s.section}>
              <FilmSectionHeader label="SYNOPSIS" />
              <View style={s.synopsisWrap}>
                <Text style={s.synopsis}>{film.overview ?? 'No synopsis available.'}</Text>
              </View>
            </Animated.View>

            {/* DIRECTOR CARDS */}
            {directors.length > 0 && (
              <Animated.View style={s.section}>
                <View style={{ gap: 10 }}>
                  {directors.map((dir: any, idx: number) => (
                    <DirectorCard key={dir.id || idx} director={dir} />
                  ))}
                </View>
              </Animated.View>
            )}

            {/* CAST */}
            {cast.length > 0 && (
              <Animated.View style={s.section}>
                <FilmSectionHeader label="THE PLAYERS" />
                <CastCarousel cast={cast} />
              </Animated.View>
            )}

            {/* VIDEOS */}
            <FilmMediaCarousel videos={videos} onPlayVideo={handlePlayVideo} />

            {/* SOCIETY CRITIQUES — community above commerce */}
            <FilmReviews filmId={Number(film.id)} filmTitle={film.title} reviews={reviews} reviewsError={reviewsError} excludeUserId={user?.id ?? null} />

            {/* WATCH PROVIDERS */}
            <Animated.View style={s.section}>
              <WatchProviders providers={providers as any} />
            </Animated.View>

            {/* DOSSIER */}
            <FilmDossier film={film} formatRuntime={formatRuntime} />

            {/* STUDIOS */}
            <FilmStudios studios={studios} />

            {/* INTERNATIONAL RELEASES */}
            {film.release_dates && (
              <Animated.View style={s.section}>
                <CountryReleases releaseDates={film.release_dates as { results: { iso_3166_1: string; release_dates: { release_date: string; type: number; certification?: string }[] }[] } | null} />
              </Animated.View>
            )}

            {/* SIMILAR FILMS */}
            <FilmSimilar similarFilms={similarFilms} />
          </>
        )}
      </Animated.ScrollView>
    </View>
  );
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  scrollContent: { },
  backdropSpacer: {},
  notFoundContainer: { justifyContent: 'center', alignItems: 'center', padding: 32 },
  notFoundTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.parchment, marginBottom: 8 },
  notFoundBody: { fontFamily: fonts.body, fontSize: 14, color: colors.fog, textAlign: 'center', lineHeight: 22 },
  backdropWrap: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 0 },
  backdrop: { width: '100%', height: '100%' },
  sepiaTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(60,40,10,0.35)' },
  floatingBack: { position: 'absolute', top: 54, left: 16, zIndex: 100, width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.sepiaBorder, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 10, elevation: 8, alignItems: 'center', justifyContent: 'center' },
  yourLogWrap: { marginHorizontal: 24, marginBottom: 20, padding: 16, backgroundColor: 'rgba(8,6,4,0.6)', borderWidth: 1, borderColor: colors.sepiaBorder, borderRadius: 2 },
  yourLogHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  yourLogMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  yourLogMetaText: { fontFamily: fonts.sub, fontSize: 9, color: colors.fog, letterSpacing: 1, includeFontPadding: false },
  yourLogViewings: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 2 },
  yourLogReview: { fontFamily: fonts.body, fontSize: 13, color: colors.bone, lineHeight: 20, opacity: 0.9 },
  yourLogReadMore: { fontFamily: fonts.sub, fontSize: 9, color: colors.sepia, letterSpacing: 1.5, marginTop: 8, includeFontPadding: false },
  section: { marginBottom: 30, paddingHorizontal: 24 },
  synopsisWrap: { backgroundColor: 'rgba(8,6,4,0.4)', padding: 16, borderWidth: 1, borderColor: 'rgba(215,205,190,0.05)', borderRadius: 2 },
  // The house prose hand — Courier, like every review and dossier line.
  synopsis: { fontFamily: fonts.body, fontSize: 13.5, color: colors.bone, lineHeight: 23, letterSpacing: 0.2 },
  directorCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(8,6,4,0.6)', padding: 12, borderWidth: 1, borderColor: 'rgba(215,205,190,0.1)', borderRadius: 2 },
  directorPhoto: { width: 44, height: 44, borderRadius: 22, marginRight: 14 },
  directorPhotoPlaceholder: { backgroundColor: 'rgba(184,137,26,0.1)', alignItems: 'center', justifyContent: 'center' },
  directorPhotoInitial: { fontFamily: fonts.display, fontSize: 18, color: colors.sepia },
  directorInfo: { flex: 1 },
  directorLabel: { fontFamily: fonts.sub, fontSize: 8, color: colors.fog, letterSpacing: 2, marginBottom: 3, includeFontPadding: false },
  directorName: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.bone, letterSpacing: -0.5 },
  backBtn: { backgroundColor: 'rgba(8,6,4,0.8)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 2, borderWidth: 1, borderColor: 'rgba(215,205,190,0.1)', marginTop: 24 },
  backBtnText: { fontFamily: fonts.sub, fontSize: 10, color: colors.bone, letterSpacing: 1.5, includeFontPadding: false },
  ctaIconRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
});
