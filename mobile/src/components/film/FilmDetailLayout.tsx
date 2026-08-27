import React, { memo, useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, useWindowDimensions, InteractionManager } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedScrollHandler, withSequence, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
// ArrowUpRight went with the director card's chevron — a credit does not
// carry one, and `↗` now means "this leaves the page" and nothing else.
import { ArrowLeft, AlertTriangle, Film as FilmIcon, RotateCcw, Check, XCircle } from 'lucide-react-native';

import { colors, fonts, SEPIA_HASH, metrics } from '@/src/theme/theme';
import { tmdb, getYear, formatRuntime } from '@/src/lib/tmdb';
import { formatDate, formatDateMonthDay } from '@/src/utils/timeAgo';
import { stripHtml } from '@/src/utils/html';



import PressableScale from '@/src/components/PressableScale';
import { ReelRating } from '@/src/components/Decorative';
import { FilmSectionHeader } from '@/src/components/film/FilmSectionHeader';
import { WatchProviders } from '@/src/components/film/WatchProviders';
import { CastCarousel } from '@/src/components/film/CastCarousel';
import { FilmHero } from '@/src/components/film/FilmHero';
import { FilmHeroSkeleton } from '@/src/components/film/FilmHeroSkeleton';
import { FilmReviews } from '@/src/components/film/FilmReviews';
import { FilmDossier } from '@/src/components/film/FilmDossier';
import { FilmSimilar } from '@/src/components/film/FilmSimilar';
import { FilmMediaCarousel } from '@/src/components/film/FilmMediaCarousel';
import { FilmStub } from '@/src/components/film/FilmStub';
import { FilmActionTray, TrayIcons, type TrayAct } from '@/src/components/film/FilmActionTray';
import { FilmScrollHeader } from '@/src/components/film/FilmScrollHeader';
import { dockHeight, scrollReserve } from '@/src/components/film/filmStubMetrics';
import { pickCertificate } from '@/src/components/film/pickCertificate';
import { useFilmStore } from '@/src/stores/films';
import { useFilmAnimations } from '@/src/hooks/useFilmAnimations';
import TactileEngine from '@/src/utils/TactileEngine';
import { nav } from '@/src/utils/typedRouter';
import { useFilmDetailContext } from '@/src/providers/FilmDetailProvider';


const STATUS_CONFIG = {
  watched: { text: 'WATCHED', Icon: Check },
  rewatched: { text: 'REWATCHED', Icon: RotateCcw },
  abandoned: { text: 'ABANDONED', Icon: XCircle },
};

/**
 * ── A CREDIT, SET AS ONE ────────────────────────────────────────────────────
 * This was a bordered card with a round avatar and a chevron — indistinguishable
 * from a settings row, and the least 1924 thing on the page. A director is a
 * film CREDIT, so it is set like one: the name alone, in the display face,
 * centred, over a brass signature rule. The rule is also what says it is
 * pressable, without borrowing a chevron that means "go deeper" everywhere else.
 *
 * The photograph goes with the card. A title card has never had one.
 */
const DirectorCard = memo(function DirectorCard({ director }: { director: { id: number; name: string; profile_path?: string | null } }) {
  return (
    <PressableScale
      onPress={() => { TactileEngine.selection(); nav.push(`/person/${director.id}`); }}
      pressedScale={0.98}
      hitSlop={{ top: 8, bottom: 8, left: 20, right: 20 }}
      accessibilityRole="button"
      accessibilityLabel={`Directed by ${director?.name}. Opens their filmography.`}
    >
      <Text style={s.creditName} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>
        {director?.name}
      </Text>
    </PressableScale>
  );
});

export const FilmDetailLayout = memo(function FilmDetailLayout() {
  const {
    film, reviews, reviewsError, similarFilms, directors, cast, videos, trailer, score, providers, studios, verdict,
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
    scrollHeaderStyle,
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

  // ── THE STUB AND ITS TRAY ───────────────────────────────────────────────────
  const [trayOpen, setTrayOpen] = useState(false);
  const closeTray = useCallback(() => setTrayOpen(false), []);
  const toggleTray = useCallback(() => {
    TactileEngine.selection();
    setTrayOpen((v) => !v);
  }, []);

  const isWatchlisted = useFilmStore((state) => !!state._watchlistIndex[film?.id ?? -1]);
  const addToWatchlist = useFilmStore((state) => state.addToWatchlist);
  const removeFromWatchlist = useFilmStore((state) => state.removeFromWatchlist);

  /**
   * Every act but this one lets the tray close first, then travels. Four of the
   * six present a view controller, and stacking one on a sheet that is still on
   * screen is the conflict that broke the old FAB. The tray is a View rather
   * than a Modal so this is belt AND braces, not the only defence.
   */
  const actThenClose = useCallback((run: () => void) => () => {
    setTrayOpen(false);
    run();
  }, []);

  /**
   * The deliberate exception. The watchlist changes state without presenting
   * anything, and closing the tray would hide the very confirmation the member
   * pressed for — the row turns brass and the chip appears under their finger.
   */
  const toggleWatchlist = useCallback(() => {
    if (!isAuthenticated) { nav.push('/login'); return; }
    if (!film?.id) return;
    TactileEngine.selection();
    if (isWatchlisted) {
      removeFromWatchlist(film.id);
    } else {
      addToWatchlist({
        id: film.id,
        title: film.title,
        poster_path: film.poster_path,
        release_date: film.release_date,
      });
    }
    handleWatchlistToggled();
  }, [isAuthenticated, film, isWatchlisted, addToWatchlist, removeFromWatchlist, handleWatchlistToggled]);

  /**
   * The velvet rope is never a dead end: an archivist enters the salon, and a
   * cinephile is walked to the gate that shows them how to earn the room.
   */
  const openLounge = useCallback(() => {
    if (!isAuthenticated) { nav.push('/login'); return; }
    if (!isArchivist) { TactileEngine.navigate(); nav.push('/lounge'); return; }
    handleOpenLounge();
  }, [isAuthenticated, isArchivist, handleOpenLounge]);

  /**
   * ── THE STUB'S DATE IS THE SHORT ONE ──────────────────────────────────────
   * Dates are formatted HERE; no component below touches one.
   *
   * `SEEN ×2 · ★★★★☆ · JUL 21, 2026` is the busiest row in the app, and on a
   * 375pt screen it does not fit — the date is clipped or the chevron is
   * pushed off the plate. So the stub gets `JUL 21`, and the year appears only
   * when the film was watched in a DIFFERENT year, which is the one case where
   * the year is the interesting part.
   */
  const watchedLabel = useMemo(() => {
    if (!existingLog?.watchedDate) return null;
    const watched = new Date(existingLog.watchedDate);
    if (Number.isNaN(watched.getTime())) return null;
    // Watched this year, the DAY is what a member is placing. Watched years
    // ago, the YEAR is the whole point and the day is noise. Both forms are
    // short, which is what lets the row survive a rewatch count and five reels
    // beside them — `JUL 21, 2025` did not.
    return watched.getFullYear() === new Date().getFullYear()
      ? formatDateMonthDay(existingLog.watchedDate).toUpperCase()
      : String(watched.getFullYear());
  }, [existingLog?.watchedDate]);

  const trayActs = useMemo<TrayAct[]>(() => {
    const acts: TrayAct[] = [
      {
        key: 'log',
        Icon: existingLog ? TrayIcons.Pencil : TrayIcons.Plus,
        label: existingLog ? 'EDIT YOUR LOG' : 'LOG THIS FILM',
        gloss: existingLog ? 'Change the rating, or say more.' : 'Set it down in your Ledger.',
        onPress: actThenClose(handleLog),
        primary: true,
      },
    ];
    // Absent, not disabled: a rewatch row on a film you have never seen is a
    // control that means nothing.
    if (existingLog) {
      acts.push({
        key: 'rewatch',
        Icon: TrayIcons.RotateCcw,
        label: 'LOG A REWATCH',
        gloss: 'The second time is a different film.',
        onPress: actThenClose(handleRewatch),
      });
    }
    acts.push({
      key: 'watchlist',
      Icon: TrayIcons.Bookmark,
      label: isWatchlisted ? 'ON THE WATCHLIST' : 'ADD TO THE WATCHLIST',
      gloss: isWatchlisted ? 'Take it off the shelf.' : 'Keep it where you can find it.',
      onPress: toggleWatchlist,
      brass: isWatchlisted,
      chip: isWatchlisted ? 'SAVED' : undefined,
      // The one act that resolves without the tray closing, so its feedback
      // has to happen in place: the bookmark springs under your finger.
      iconStyle: bookmarkAnimStyle,
    });
    if (trailer) {
      acts.push({
        key: 'trailer',
        Icon: TrayIcons.Play,
        label: 'PLAY THE TRAILER',
        gloss: 'From the studio.',
        onPress: actThenClose(handleOpenTrailer),
      });
    }
    acts.push({
      key: 'nitrate',
      Icon: TrayIcons.Share2,
      label: 'THE NITRATE FILE',
      gloss: 'A card worth sending.',
      onPress: actThenClose(handleOpenShare),
      travels: true,
    });
    acts.push({
      key: 'lounge',
      Icon: isArchivist ? TrayIcons.MessageCircle : TrayIcons.KeyRound,
      label: 'THE LOUNGE',
      gloss: isArchivist ? 'Talk about it with the house.' : 'Archivists and above.',
      onPress: actThenClose(openLounge),
      brass: true,
      travels: true,
    });
    return acts;
  }, [
    existingLog, isWatchlisted, trailer, isArchivist,
    actThenClose, handleLog, handleRewatch, toggleWatchlist, handleOpenTrailer, handleOpenShare, openLounge,
    bookmarkAnimStyle,
  ]);

  const traySubtitle = useMemo(() => {
    if (!film) return '';
    const year = getYear(film.release_date);
    const runtime = formatRuntime(film.runtime).toUpperCase();
    return [year, runtime].filter(Boolean).join('  ·  ');
  }, [film]);

  const dockH = useMemo(() => dockHeight(insets.bottom), [insets.bottom]);

  /**
   * The certificate, with the region it belongs to. Absorbed from the
   * international-releases rail this revision retires.
   */
  const certificate = useMemo(
    () => pickCertificate(
      film?.release_dates as any,
      film?.production_countries?.[0]?.iso_3166_1,
      null,
    ),
    [film?.release_dates, film?.production_countries],
  );

  /**
   * ── WHERE THE HOUSE'S VOICES SIT ──────────────────────────────────────────
   * `reviews` excludes nobody yet — YOURS below removes the member's own — so
   * "has the house spoken" is asked of the same list the section will render,
   * not of a count from somewhere else.
   */
  const hasSociety = useMemo(
    () => reviews.some((r: { user_id?: string | null }) => r.user_id !== (user?.id ?? null)),
    [reviews, user?.id],
  );

  /**
   * One block, rendered in one of two places. Written once so the two call
   * sites cannot drift into two different sections — which is exactly how a
   * page ends up showing the same thing twice.
   */
  const TheSociety = useCallback(() => (
    <View style={s.societyAir}>
      <FilmReviews
        filmId={Number(film?.id)}
        filmTitle={film?.title ?? ''}
        reviews={reviews}
        reviewsError={reviewsError}
        excludeUserId={user?.id ?? null}
      />
    </View>
  ), [film?.id, film?.title, reviews, reviewsError, user?.id]);

  if (loading && validFilmId) {
    return (
      <View style={s.container}>
        <Animated.View style={[s.floatingBack, { top: Math.max(insets.top + 10, 20), zIndex: 100 }]}>
          <PressableScale onPress={goBack} hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} accessibilityLabel="Go back">
            <ArrowLeft size={16} color={colors.sepia} strokeWidth={1.5} />
          </PressableScale>
        </Animated.View>
        <FilmHeroSkeleton skeletonAnimStyle={skeletonAnimStyle} backdropHeight={BACKDROP_H} bottomInset={insets.bottom} />
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
      {/* testID so a static render can be driven through the fade — it is the
          only way to SEE that the backdrop leaves rather than ghosting behind
          every section, on a page nobody can build to a device yet. */}
      <Animated.View testID="film-backdrop" style={[s.backdropWrap, { height: BACKDROP_H }, backdropAnimatedStyle]}>
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

      {/* Floating Back — hands over to the header as the hero leaves. Both are
          hidden from the reader while the tray is up, for the same reason the
          page beneath is: a modal that can be talked around is not modal. */}
      <Animated.View
        style={[s.floatingBack, { top: Math.max(insets.top + 10, 20) }, immersiveAnimatedStyle]}
        importantForAccessibility={trayOpen ? 'no-hide-descendants' : 'auto'}
      >
        <PressableScale onPress={goBack} hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} accessibilityLabel="Go back">
          <ArrowLeft size={16} color={colors.sepia} strokeWidth={1.5} />
        </PressableScale>
      </Animated.View>

      {/* ...and takes over from it, over the same fifty points. */}
      <FilmScrollHeader
        title={film.title ?? ''}
        onBack={goBack}
        topInset={Math.max(insets.top, 20)}
        animatedStyle={scrollHeaderStyle}
        hiddenFromReader={trayOpen}
      />

      <Animated.ScrollView
        contentContainerStyle={[s.scrollContent, { paddingBottom: scrollReserve(insets.bottom) }]}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        // The page must not scroll behind an open tray. A Modal would have
        // blocked this for us; an overlay has to say so.
        scrollEnabled={!trayOpen}
        /**
         * ── accessibilityViewIsModal IS iOS-ONLY ──────────────────────────
         * The tray sets it, and its own comment says the page beneath is
         * hidden from a screen reader. On iOS that is true. On ANDROID it does
         * nothing at all — TalkBack would read straight through an open tray
         * into the whole page behind it, and the promise in that comment was
         * simply not kept on half the devices we ship to.
         *
         * The stub is deliberately NOT hidden: it stays the visible close
         * control, and on Android it remains reachable.
         */
        importantForAccessibility={trayOpen ? 'no-hide-descendants' : 'auto'}
      >
        {/* The poster rises INTO the backdrop rather than sitting below it. */}
        <View style={[s.backdropSpacer, { height: BACKDROP_H - metrics.posterLift }]} />


        {/* HERO */}
        <FilmHero
          film={film}
          existingLog={existingLog}
          score={score}
          studios={studios}
          verdict={verdict}
          posterGlowStyle={posterGlowStyle}
          statusConfig={STATUS_CONFIG}
        />

        {/* The six-control console is gone. Its acts live in the tray raised by
            the docked stub at the foot of this screen. */}

        {isTransitionComplete && (
          <>
            {/**
              * ── A HEADING WITH NOTHING UNDER IT ─────────────────────────────
              * `film.overview ?? '…'` only catches null. TMDB returns an EMPTY
              * STRING for a film it has no synopsis for, which sailed past the
              * `??` and drew the brass tick, the label and the rule over
              * nothing at all — a dangling heading, on exactly the obscure
              * films this app sends people to look for.
              *
              * The section omits itself, as the cast, the footage and the shelf
              * already do. Those blocks say nothing when they have nothing; the
              * ones that DO show an empty state — WHERE IT PLAYS, THE SOCIETY —
              * are the two a member can act on. Nobody can write a synopsis.
              */}
            {film.overview ? (
              <Animated.View style={s.section}>
                <FilmSectionHeader label="SYNOPSIS" />
                <View style={s.synopsisWrap}>
                  <Text style={s.synopsis}>{film.overview}</Text>
                </View>
              </Animated.View>
            ) : null}

            {/* ── YOURS, THEN THE HOUSE'S ──────────────────────────────────
                Your own critique sits directly above the society's, wearing a
                brass edge so it reads as yours without a second label. It used
                to sit under the console at the top of the page, which put your
                own writing above the film's synopsis. */}
            {existingLog && (
              <Animated.View style={s.section}>
                <FilmSectionHeader label="YOURS" />
                <View style={s.mine}>
                  <LinearGradient
                    colors={[colors.champagne, colors.sepia, colors.tarnishDeep]}
                    start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
                    style={s.mineEdge}
                  />
                  <View style={s.mineHead}>
                    {(existingLog.rating ?? 0) > 0 && <ReelRating rating={existingLog.rating ?? 0} size={14} />}
                    <Text style={s.mineMeta} numberOfLines={1}>
                      {[
                        existingLog.watchedDate ? formatDate(existingLog.watchedDate) : null,
                        (existingLog.viewCount ?? 1) > 1 ? `${existingLog.viewCount} VIEWINGS` : null,
                      ].filter(Boolean).join('  ·  ')}
                    </Text>
                  </View>
                  {/* A log with a rating and no words collapses to the line
                      above rather than framing an empty space. */}
                  {existingLog.review ? (
                    <PressableScale onPress={handleReadFullLog} pressedScale={0.98}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityRole="button" accessibilityLabel="Read your full critique">
                      <Text numberOfLines={3} ellipsizeMode="tail" style={s.mineBody}>
                        {stripHtml(existingLog.review ?? '')}
                      </Text>
                      {stripHtml(existingLog.review ?? '').length > 100 && (
                        <Text style={s.mineMore}>READ FULL CRITIQUE →</Text>
                      )}
                    </PressableScale>
                  ) : null}
                </View>
              </Animated.View>
            )}

            {/* ── THE PAGE TAKES THE SHAPE OF WHAT IS TRUE ────────────────────
                THE SOCIETY sits third — directly under the synopsis, the
                emotional peak, and the only block given more air than the
                utility sections around it — WHEN THERE IS SOMETHING TO READ.

                When there is not, it drops below the players and the footage.
                An empty box in the third slot on every film says "nobody has
                been here" before a member has seen a single thing about the
                film; the same block low down says "be the first voice" and
                reads as an invitation. With 288 logs across 250 films, the
                empty case is not the edge — it is nearly every film. */}
            {hasSociety && <TheSociety />}

            {/* THE CREDIT — a film credit, set as one. */}
            {directors.length > 0 && (
              <Animated.View style={s.credit}>
                <Text style={s.creditRole}>DIRECTED BY</Text>
                {directors.map((dir: any, idx: number) => (
                  <DirectorCard key={dir.id || idx} director={dir} />
                ))}
                <View style={s.creditRule} />
              </Animated.View>
            )}

            {/* CAST */}
            {cast.length > 0 && (
              <Animated.View style={s.section}>
                <FilmSectionHeader label="THE PLAYERS" />
                <CastCarousel cast={cast} />
              </Animated.View>
            )}

            <FilmMediaCarousel videos={videos} onPlayVideo={handlePlayVideo} />

            {/* ...and here it is when nobody has written yet: after the film
                has been shown to you, where the invitation can land. */}
            {!hasSociety && <TheSociety />}

            <Animated.View style={s.section}>
              <WatchProviders providers={providers as any} />
            </Animated.View>

            {/* THE PARTICULARS — absorbing the studio marks and the certificate
                from the two rails this retires. */}
            <FilmDossier
              film={film}
              studios={studios}
              certificate={certificate}
            />

            {/* The international-releases rail is retired: it existed to carry
                the CERTIFICATE, which now sits in the particulars where a
                member looks for it — beside the runtime and the language. */}

            <FilmSimilar similarFilms={similarFilms} />
          </>
        )}
      </Animated.ScrollView>

      {/* ── ONE CONTROL, DOCKED ────────────────────────────────────────────────
          It mounts only once the film has resolved: a stub over a skeleton, or
          over "Not in the Archive", would be a control offering to log a film
          that is not there. Both of those paths return earlier. */}
      <FilmStub
        existingLog={existingLog}
        isWatchlisted={isWatchlisted}
        watchedLabel={watchedLabel}
        open={trayOpen}
        onPress={toggleTray}
        bottomInset={insets.bottom}
      />

      <FilmActionTray
        visible={trayOpen}
        onDismiss={closeTray}
        film={film}
        subtitle={traySubtitle}
        acts={trayActs}
        windowHeight={windowHeight}
        dockHeight={dockH}
      />
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
  /**
   * z-index 50, the SAME level as the header it hands over to — they are two
   * forms of one control and must sit at one height.
   *
   * At 100 it outranked the tray (60) and the stub (70): opening the tray left
   * a brass-ringed disc floating over the scrim, still tappable, offering to
   * leave the film while the actions for it were open. The scrim is supposed
   * to cover everything except the tray and the handle that raised it.
   */
  floatingBack: { position: 'absolute', top: 54, left: 16, zIndex: 50, width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.sepiaBorder, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 10, elevation: 8, alignItems: 'center', justifyContent: 'center' },
  /** Your own critique: a brass edge rather than a box, so it reads as yours
      at a glance without needing a second label to say so. */
  mine: { paddingLeft: 17, paddingRight: 4, paddingVertical: 2, overflow: 'hidden' },
  mineEdge: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 3 },
  mineHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 9 },
  mineMeta: { fontFamily: fonts.sub, fontSize: 9, color: colors.fog, letterSpacing: 1.3, includeFontPadding: false },
  mineBody: { fontFamily: fonts.bodyItalic, fontSize: 13, color: colors.bone, lineHeight: 22 },
  mineMore: { fontFamily: fonts.sub, fontSize: 9, color: colors.sepia, letterSpacing: 1.6, marginTop: 9, includeFontPadding: false },

  /** The crescendo, made of space: the one block where members talk to each
      other gets more air than the utility sections around it. */
  /**
   * ── AIR THAT ADDS UP TO WHAT WAS INTENDED ─────────────────────────────────
   * The house gets 44pt where the utility sections get 30. But FilmReviews
   * already carries `marginBottom: 24` of its own, so a flat 44 here made the
   * gap below it 68 — a third more than designed, and visibly a cavern before
   * DIRECTED BY. Margins do not replace each other; they stack.
   *
   * Above:  30 (the section before) + 14 = 44.
   * Below:  20 + 24 (the component's own) = 44.
   */
  societyAir: { marginTop: 14, marginBottom: 20 },

  credit: { alignItems: 'center', marginBottom: 30, paddingHorizontal: 24 },
  creditRole: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 3, color: colors.fog, marginBottom: 7, includeFontPadding: false },
  creditName: { fontFamily: fonts.display, fontSize: 20, color: colors.parchment, textAlign: 'center', includeFontPadding: false },
  creditRule: { width: 96, height: 1, backgroundColor: colors.sepia, marginTop: 9, opacity: 0.65 },
  section: { marginBottom: 30, paddingHorizontal: 24 },
  /**
   * Unboxed with the particulars. Once the dossier's card came off, this was
   * the last framed block on an open page — and framing the SYNOPSIS is the
   * wrong choice twice over: it is the studio's copy, not the house's, and
   * plainness is exactly what marks it as somebody else's voice. The critiques
   * are the only cards on this page now, and they are meant to look like cards.
   */
  synopsisWrap: {},
  // The house prose hand — Courier, like every review and dossier line.
  synopsis: { fontFamily: fonts.body, fontSize: 13.5, color: colors.bone, lineHeight: 23, letterSpacing: 0.2 },
  // The director card's styles went with the card — see DirectorCard above.
  backBtn: { backgroundColor: 'rgba(8,6,4,0.8)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 2, borderWidth: 1, borderColor: 'rgba(215,205,190,0.1)', marginTop: 24 },
  backBtnText: { fontFamily: fonts.sub, fontSize: 10, color: colors.bone, letterSpacing: 1.5, includeFontPadding: false },
  ctaIconRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
});
