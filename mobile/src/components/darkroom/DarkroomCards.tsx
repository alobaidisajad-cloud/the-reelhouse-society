import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, Easing, cancelAnimation, useReducedMotion } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { Bookmark } from 'lucide-react-native';

import { colors, fonts, SEPIA_HASH } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';
import { type DiscoverFilm } from '@/src/stores/discover';
import { useFilmStore } from '@/src/stores/films';
import { useAuthStore } from '@/src/stores/auth';
import PressableScale from '@/src/components/PressableScale';

// ══════════════════════════════════════════════════════════════
//  DARKROOM SAFELIGHT ATMOSPHERICS
// ══════════════════════════════════════════════════════════════
export const DarkroomAtmo = React.memo(function DarkroomAtmo() {
  const isFocused = useIsFocused();
  const reducedMotion = useReducedMotion();
  const pulse = useSharedValue(0.15);
  // The safelight stays — it is the soul of this room. It just stops breathing
  // when nobody is in it. This ran with `[]` deps and cancelled only on
  // unmount, and a tab screen never unmounts, so a 12-second cycle drove the
  // UI thread for the whole session from behind a header nobody was looking at.
  //
  // Parked at 0.18 rather than 0: the lamp is still on, it simply holds still.
  useEffect(() => {
    if (!isFocused || reducedMotion) {
      cancelAnimation(pulse);
      pulse.value = 0.18;
      return;
    }
    // A slow, rhythmic breathing of amber/red darkroom safelight
    pulse.value = withRepeat(
      withSequence(
        withTiming(0.25, { duration: 6000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.12, { duration: 6000, easing: Easing.inOut(Easing.sin) })
      ), -1, true
    );
    return () => cancelAnimation(pulse);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, reducedMotion]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <Animated.View style={[StyleSheet.absoluteFillObject, style, { zIndex: 0 }]} pointerEvents="none">
      <LinearGradient
        colors={['rgba(180,45,45,0.4)', 'rgba(184,137,26,0.1)', 'transparent']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFillObject}
      />
    </Animated.View>
  );
});

// Breathing skeleton for loading states
export const AnimatedPosterSkeleton = React.memo(function AnimatedPosterSkeleton({ sharedOp }: { sharedOp?: any }) {
  const localOp = useSharedValue(0.4);
  const op = sharedOp || localOp;
  
  useEffect(() => {
    if (!sharedOp) {
      op.value = withRepeat(withTiming(0.8, { duration: 1000, easing: Easing.inOut(Easing.ease) }), -1, true);
      return () => cancelAnimation(op);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedOp]);
  
  const animStyle = useAnimatedStyle(() => ({ opacity: op.value }));
  return (
    <Animated.View style={[s.posterWrap, animStyle, { backgroundColor: 'rgba(14,11,8,0.7)', borderWidth: 1, borderColor: 'rgba(184,137,26,0.06)' }]} />
  );
});

export const FilmGridCard = React.memo(function FilmGridCard({ item }: { item: DiscoverFilm }) {
  const router = useRouter();
  const isPerson = item.media_type === 'person';
  const isLogged = useFilmStore((s: any) => !isPerson && !!s._loggedIndex[item.id]);
  const isSaved = useFilmStore((s: any) => !isPerson && !!s._watchlistIndex[item.id]);
  const addToWatchlist = useFilmStore((s: any) => s.addToWatchlist);
  const removeFromWatchlist = useFilmStore((s: any) => s.removeFromWatchlist);
  const isAuthenticated = useAuthStore(s => !!s.user);

  // Every poster-less film measured against the live API carried a year, so the
  // plate can bear it the way a negative's edge marking would.
  const year = ((item as { release_date?: string; first_air_date?: string }).release_date
    || (item as { release_date?: string; first_air_date?: string }).first_air_date
    || '').slice(0, 4);
  const posterPath = isPerson ? item.profile_path : item.poster_path;
  const posterUri = posterPath ? (isPerson ? tmdb.profile(posterPath, 'w185') : tmdb.poster(posterPath, 'w342')) : null;

  const handlePress = () => {
    (router.push as any)((isPerson ? `/person/${item.id}` : `/film/${item.id}`) as any);
  };

  const isMutatingWatchlist = useRef(false);
  const currentItemId = useRef(item.id);

  if (currentItemId.current !== item.id) {
    currentItemId.current = item.id;
    isMutatingWatchlist.current = false;
  }

  const toggleWatchlist = async () => {
    if (!isAuthenticated) {
      (router.push as any)('/login' as any);
      return;
    }
    if (isMutatingWatchlist.current) return;
    isMutatingWatchlist.current = true;
    const captureId = item.id;
    try {
      if (isSaved) {
        await removeFromWatchlist(captureId);
      } else {
        await addToWatchlist({ id: captureId, title: item.title || item.name || 'Unknown Title', poster_path: item.poster_path, release_date: item.release_date });
      }
    } catch (e) {
      if (__DEV__) console.warn('[FilmGridCard] Watchlist mutation failed:', e);
    } finally {
      if (currentItemId.current === captureId) {
        isMutatingWatchlist.current = false;
      }
    }
  };

  return (
    <View style={s.posterWrap}>
      <PressableScale
        testID="film-card"
        style={StyleSheet.absoluteFillObject}
        onPress={handlePress}
        haptic
        accessibilityRole="button"
        accessibilityLabel={isPerson ? item.name : (item.title || 'Film')}
      >
        <View style={[s.posterImg, !posterUri && s.posterPlaceholder]}>
          {posterUri ? (
            <>
              {/* THE DEVELOP — each print surfaces from its sepia ghost like
                  paper in the tray. Native GPU crossfade: zero JS cost. */}
              <Image source={{ uri: posterUri }} style={StyleSheet.absoluteFillObject} cachePolicy="memory-disk" recyclingKey={`${item.media_type || 'movie'}-${item.id}`} placeholder={{ blurhash: SEPIA_HASH }} transition={300} contentFit="cover" />
              {/* Soft tactical tungsten edge mapping */}
              <LinearGradient 
                colors={['rgba(255,255,255,0.08)', 'transparent', 'rgba(10,5,3,0.9)']} 
                locations={[0, 0.4, 1]} 
                style={StyleSheet.absoluteFillObject} 
                pointerEvents="none" 
              />
              <View style={s.posterBorderEngrave} pointerEvents="none" />
            </>
          ) : (
            /* An undeveloped negative. These used to be filtered out of the
               fetch entirely, so a real film with no poster simply did not
               exist as far as search was concerned. On a page headed THE
               NEGATIVES — "undeveloped stock" — a film with no print made yet
               is the purest example of the idea, so it gets a plate of its own
               rather than deletion: the mark, then the title and year that a
               negative would carry on its edge. */
            <View style={s.undevelopedWrap}>
              <Text style={s.posterPlaceholderGlyph}>✦</Text>
              <Text style={s.undevelopedTitle} numberOfLines={3} ellipsizeMode="tail">
                {(item.title || item.name || 'UNTITLED').toUpperCase()}
              </Text>
              {!!year && <Text style={s.undevelopedYear}>{year}</Text>}
            </View>
          )}
        </View>

        {isLogged && (
          <View style={s.loggedBadge}>
            <Text style={s.loggedText}>✓</Text>
          </View>
        )}

        {isPerson && (
          <Text style={s.personName} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>
            {item.name}
          </Text>
        )}
      </PressableScale>

      {!isPerson && (
        <PressableScale 
          style={[s.quickSaveIcon, isSaved ? s.quickSaveIconActive : s.quickSaveIconInactive]} 
          onPress={toggleWatchlist}
          haptic="light"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={isSaved ? `Remove ${item.title || 'film'} from watchlist` : `Add ${item.title || 'film'} to watchlist`}
        >
          <Bookmark size={12} color={isSaved ? colors.ink : colors.parchment} fill={isSaved ? colors.ink : 'transparent'} />
        </PressableScale>
      )}
    </View>
  );
});

 
export const DarkroomSuggestionRow = React.memo(({ item, onPress }: { item: DiscoverFilm; onPress: (item: DiscoverFilm) => void }) => {
  const isPerson = item.media_type === 'person';
  const imgPath = isPerson ? item.profile_path : item.poster_path;
  const imgUri = imgPath ? (isPerson ? tmdb.profile(imgPath, 'w185') : tmdb.poster(imgPath, 'w92')) : null;

  return (
    <PressableScale
      testID="darkroom-suggestion-row"
      style={s.suggestionRow}
      onPress={() => onPress(item)}
      haptic="light"
      pressedScale={0.98}
      accessibilityRole="button"
      accessibilityLabel={isPerson ? `${item.name}, artist` : `${item.title}, ${item.release_date?.slice(0, 4) ?? 'TBA'}`}
    >
      {imgUri ? (
        <View style={[s.suggestionImgWrap, isPerson ? s.suggestionImgWrapPerson : s.suggestionImgWrapFilm]}>
          <Image source={{ uri: imgUri }} style={StyleSheet.absoluteFillObject} cachePolicy="memory-disk" recyclingKey={`${item.media_type || 'movie'}-${item.id}`} placeholder={{ blurhash: SEPIA_HASH }} transition={50} contentFit="cover" />
        </View>
      ) : (
        <View style={[s.suggestionImgWrap, isPerson ? s.suggestionImgWrapPerson : s.suggestionImgWrapFilm, s.suggestionImgPlaceholder]} />
      )}
      
      <View style={s.suggestionInfo}>
        <Text style={s.suggestionTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{isPerson ? item.name : item.title}</Text>
        <Text style={s.suggestionSubTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
          {isPerson ? 'ARTIST' : `${item.release_date?.slice(0, 4) ?? 'TBA'} · FILM`}
        </Text>
      </View>
    </PressableScale>
  );
});

const s = StyleSheet.create({
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(184,137,26,0.05)',
  },
  suggestionImgWrap: {
    overflow: 'hidden',
    backgroundColor: colors.soot,
  },
  suggestionImgWrapFilm: {
    width: 24,
    height: 38,
    borderRadius: 2,
  },
  suggestionImgWrapPerson: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  suggestionImgPlaceholder: {
    backgroundColor: colors.ash,
  },
  suggestionInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  suggestionTitle: {
    color: colors.parchment,
    fontFamily: fonts.sub,
    fontSize: 14,
    marginBottom: 2,
  },
  suggestionSubTitle: {
    color: colors.fog,
    fontFamily: fonts.sub,
    fontSize: 9,
    letterSpacing: 1,
  },
  posterWrap: {
    width: '100%',
    aspectRatio: 2/3,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: 'rgba(8,6,4,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(184,137,26,0.5)',
    elevation: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.8,
    shadowRadius: 30,
  },
  posterBorderEngrave: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 6,
  },
  posterImg: {
    width: '100%',
    height: '100%',
  },
  posterPlaceholder: {
    backgroundColor: colors.ash,
    justifyContent: 'center',
    alignItems: 'center',
  },
  posterPlaceholderGlyph: {
    fontFamily: fonts.display,
    color: colors.fog,
    fontSize: 18,
    opacity: 0.55,
    marginBottom: 8,
  },
  undevelopedWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  undevelopedTitle: {
    fontFamily: fonts.sub,
    fontSize: 9,
    letterSpacing: 1,
    lineHeight: 13,
    color: colors.bone,
    textAlign: 'center',
  },
  undevelopedYear: {
    fontFamily: fonts.sub,
    fontSize: 8,
    letterSpacing: 2,
    color: colors.sepia,
    // No opacity. This plate sits on ash, not ink, so the usual sums do not
    // apply: 0.85 measured 4.00:1 against ash, just under AA at 8pt, while
    // full sepia gives 4.99:1 and still reads quieter than the title above it.
    marginTop: 6,
  },
  quickSaveIcon: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 24,
    height: 24,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(184,137,26,0.3)',
  },
  quickSaveIconActive: {
    backgroundColor: colors.sepia,
  },
  quickSaveIconInactive: {
    backgroundColor: 'rgba(10,10,10,0.85)',
  },
  loggedBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.sepia,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loggedText: {
    color: colors.ink,
    fontSize: 10,
    fontFamily: fonts.sub,
  },
  personName: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    backgroundColor: 'rgba(10,8,5,0.85)',
    color: colors.parchment,
    fontFamily: fonts.sub,
    fontSize: 9,
    letterSpacing: 0.5,
    textAlign: 'center',
    paddingVertical: 6,
  },
});


DarkroomSuggestionRow.displayName = 'DarkroomSuggestionRow';
