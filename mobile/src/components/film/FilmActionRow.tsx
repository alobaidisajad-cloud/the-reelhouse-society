/**
 * FilmActionRow — the projectionist's console, three rows maximum.
 * ────────────────────────────────────────────────────────────────
 *   1. The primary act:  LOG THIS FILM / EDIT LOG
 *   2. (logged only)     a slim LOG REWATCH line
 *   3. The stamp bar:    WATCHLIST · TRAILER · SHARE · LOUNGE
 *
 * Laws honored here:
 *   · SAVED wears brass, never blood — red is reserved for the reel.
 *   · SHARE is open to every member on every film (the Nitrate File
 *     works with or without a log) — free marketing, ungated.
 *   · LOUNGE never dead-ends: archivists enter the salon; cinephiles
 *     see the brass key and are walked to the velvet rope.
 */
import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import type { StyleProp, ViewStyle } from 'react-native';
import { Pencil, Plus, RotateCcw, Bookmark as BookIcon, Play, Share2, MessageCircle, KeyRound } from 'lucide-react-native';
import { colors, fonts } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { useFilmStore } from '@/src/stores/films';
import TactileEngine from '@/src/utils/TactileEngine';
import { useRouter } from 'expo-router';

interface FilmActionRowProps {
  filmId: number;
  film: { id: number; title?: string; poster_path?: string | null; release_date?: string };
  existingLog: { status?: string; viewCount?: number } | null;
  isAuthenticated: boolean;
  isArchivist: boolean;
  bookmarkAnimStyle: StyleProp<ViewStyle>;
  handleLog: () => void;
  handleRewatch: () => void;
  onWatchlistToggled?: () => void;
  handleOpenTrailer: () => void;
  handleOpenShare: () => void;
  handleOpenLounge: () => void;
  hasTrailer: boolean;
}

export const FilmActionRow = memo(function FilmActionRow({
  filmId,
  film,
  existingLog,
  isAuthenticated,
  isArchivist,
  bookmarkAnimStyle,
  handleLog,
  handleRewatch,
  onWatchlistToggled,
  handleOpenTrailer,
  handleOpenShare,
  handleOpenLounge,
  hasTrailer
}: FilmActionRowProps) {
  const router = useRouter();
  const isWatchlisted = useFilmStore((state) => !!state._watchlistIndex[filmId]);
  const addToWatchlist = useFilmStore((state) => state.addToWatchlist);
  const removeFromWatchlist = useFilmStore((state) => state.removeFromWatchlist);

  const handleToggleWatchlist = React.useCallback(() => {
    if (!isAuthenticated) return (router.push as any)('/login' as any);
    TactileEngine.selection();

    if (isWatchlisted) {
      removeFromWatchlist(filmId);
    } else {
      addToWatchlist({
        id: filmId,
        title: film.title,
        poster_path: film.poster_path,
        release_date: film.release_date,
      });
    }
    onWatchlistToggled?.();
  }, [isAuthenticated, router, isWatchlisted, filmId, film, removeFromWatchlist, addToWatchlist, onWatchlistToggled]);

  // The velvet rope, not a dead end — the brass key walks cinephiles
  // to the LoungeGate (CLEARANCE REQUIRED → ✦ ASCEND THE RANKS).
  const handleLoungePress = React.useCallback(() => {
    if (!isAuthenticated) return (router.push as any)('/login' as any);
    if (!isArchivist) {
      TactileEngine.navigate();
      (router.push as any)('/lounge' as any);
      return;
    }
    handleOpenLounge();
  }, [isAuthenticated, isArchivist, router, handleOpenLounge]);

  return (
    <Animated.View style={s.ctaSection}>
      {/* Row 1 — the primary act */}
      <PressableScale testID="log-film-button" style={s.ctaPrimary} onPress={handleLog} pressedScale={0.97} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} accessibilityRole="button" accessibilityLabel={existingLog ? 'Edit your log' : 'Log this film'}>
        <View style={s.ctaIconRow}>
          {existingLog ? <Pencil size={13} color={colors.ink} strokeWidth={2} /> : <Plus size={15} color={colors.ink} strokeWidth={2.5} />}
          <Text style={s.ctaPrimaryText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
            {existingLog ? 'EDIT LOG' : 'LOG THIS FILM'}
          </Text>
        </View>
      </PressableScale>

      {/* Row 2 — the slim rewatch line, logged members only */}
      {existingLog && (
        <PressableScale style={s.ctaRewatch} onPress={handleRewatch} pressedScale={0.97} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} accessibilityRole="button" accessibilityLabel="Log a rewatch">
          <View style={s.ctaIconRow}>
            <RotateCcw size={11} color={colors.sepia} strokeWidth={2} />
            <Text style={s.ctaRewatchText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
              LOG REWATCH{(existingLog?.viewCount ?? 1) > 1 ? ` (${(existingLog?.viewCount ?? 1) + 1})` : ''}
            </Text>
          </View>
        </PressableScale>
      )}

      {/* Row 3 — the stamp bar */}
      <View style={s.ctaRow}>
        <PressableScale
          style={[s.ctaStamp, isWatchlisted && s.ctaStampSaved]}
          onPress={handleToggleWatchlist} pressedScale={0.95} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
          accessibilityRole="button" accessibilityLabel={isWatchlisted ? 'Remove from watchlist' : 'Add to watchlist'}
        >
          <View style={s.ctaIconRow}>
            <Animated.View style={bookmarkAnimStyle}>
              <BookIcon size={11} color={isWatchlisted ? colors.sepia : colors.bone} fill={isWatchlisted ? colors.sepia : 'transparent'} strokeWidth={1.5} />
            </Animated.View>
            <Text style={[s.ctaStampText, isWatchlisted && s.ctaStampTextSaved]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {isWatchlisted ? 'SAVED' : 'WATCHLIST'}
            </Text>
          </View>
        </PressableScale>

        {hasTrailer && (
          <PressableScale
            style={s.ctaStamp}
            onPress={handleOpenTrailer}
            pressedScale={0.95} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            accessibilityRole="button" accessibilityLabel="Watch trailer"
          >
            <View style={s.ctaIconRow}>
              <Play size={10} color={colors.bone} fill={colors.bone} strokeWidth={1.5} />
              <Text style={s.ctaStampText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>TRAILER</Text>
            </View>
          </PressableScale>
        )}

        <PressableScale
          style={s.ctaStamp}
          onPress={handleOpenShare} pressedScale={0.95} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
          accessibilityRole="button" accessibilityLabel="Share this film"
        >
          <View style={s.ctaIconRow}>
            <Share2 size={11} color={colors.bone} strokeWidth={1.5} />
            <Text style={s.ctaStampText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>SHARE</Text>
          </View>
        </PressableScale>

        <PressableScale
          style={[s.ctaStamp, isArchivist && s.ctaStampLounge]}
          onPress={handleLoungePress}
          pressedScale={0.95} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
          accessibilityRole="button"
          accessibilityLabel={isArchivist ? 'Open film lounge' : 'Lounge — requires a higher rank'}
        >
          <View style={s.ctaIconRow}>
            {isArchivist ? (
              <MessageCircle size={11} color={colors.sepia} strokeWidth={1.5} />
            ) : (
              <KeyRound size={11} color={colors.sepia} strokeWidth={1.5} />
            )}
            <Text style={[s.ctaStampText, s.ctaStampTextLounge]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>LOUNGE</Text>
          </View>
        </PressableScale>
      </View>
    </Animated.View>
  );
});

const s = StyleSheet.create({
  ctaSection: { paddingHorizontal: 20, marginTop: 10, marginBottom: 20, gap: 10, zIndex: 10 },
  ctaRow: { flexDirection: 'row', gap: 8 },
  ctaIconRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  ctaPrimary: { backgroundColor: colors.sepia, borderRadius: 2, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', shadowColor: colors.sepia, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  ctaPrimaryText: { fontFamily: fonts.sub, fontSize: 12, color: colors.ink, letterSpacing: 2, includeFontPadding: false },
  ctaRewatch: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.sepiaBorder, borderRadius: 2, paddingVertical: 11, alignItems: 'center' },
  ctaRewatchText: { fontFamily: fonts.sub, fontSize: 10, color: colors.sepia, letterSpacing: 1.5, includeFontPadding: false },
  ctaStamp: { flex: 1, backgroundColor: 'rgba(25,23,20,0.8)', borderWidth: 1, borderColor: 'rgba(215,205,190,0.1)', borderRadius: 2, paddingVertical: 12, paddingHorizontal: 4, alignItems: 'center' },
  ctaStampText: { fontFamily: fonts.sub, fontSize: 8, color: colors.bone, letterSpacing: 1, includeFontPadding: false },
  ctaStampSaved: { backgroundColor: colors.sepiaSubtle, borderColor: colors.sepiaBorder },
  ctaStampTextSaved: { color: colors.sepia },
  ctaStampLounge: { backgroundColor: 'rgba(184,137,26,0.08)', borderColor: colors.sepiaBorder },
  ctaStampTextLounge: { color: colors.sepia },
});
