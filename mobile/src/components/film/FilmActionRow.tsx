import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import type { StyleProp, ViewStyle } from 'react-native';
import { Pencil, Plus, RotateCcw, Bookmark as BookIcon, Play, Share2, MessageCircle } from 'lucide-react-native';
import { colors } from '@/src/theme/theme';
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

  return (
    <Animated.View style={s.ctaSection}>
      <PressableScale testID="log-film-button" style={s.ctaPrimary} onPress={handleLog} pressedScale={0.97} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} accessibilityRole="button" accessibilityLabel={existingLog ? 'Edit your log' : 'Log this film'}>
        <View style={s.ctaIconRow}>
          {existingLog ? <Pencil size={13} color={colors.ink} strokeWidth={2} /> : <Plus size={15} color={colors.ink} strokeWidth={2.5} />}
          <Text style={s.ctaPrimaryText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
            {existingLog ? 'EDIT LOG' : 'LOG THIS FILM'}
          </Text>
        </View>
      </PressableScale>

      {existingLog && (
        <PressableScale style={s.ctaRewatch} onPress={handleRewatch} pressedScale={0.97} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} accessibilityRole="button" accessibilityLabel="Log a rewatch">
          <View style={s.ctaIconRow}>
            <RotateCcw size={12} color={colors.sepia} strokeWidth={2} />
            <Text style={s.ctaRewatchText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
              LOG REWATCH{(existingLog?.viewCount ?? 1) > 1 ? ` (${(existingLog?.viewCount ?? 1) + 1})` : ''}
            </Text>
          </View>
        </PressableScale>
      )}

      <View style={s.ctaRow}>
        <PressableScale
          style={[s.ctaSecondary, isWatchlisted && s.ctaDanger]}
          onPress={handleToggleWatchlist} pressedScale={0.95} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
          accessibilityRole="button" accessibilityLabel={isWatchlisted ? 'Remove from watchlist' : 'Add to watchlist'}
        >
          <View style={s.ctaIconRow}>
          <Animated.View style={bookmarkAnimStyle}>
            <BookIcon size={11} color={isWatchlisted ? colors.bloodReel : colors.bone} fill={isWatchlisted ? colors.bloodReel : 'transparent'} strokeWidth={1.5} />
          </Animated.View>
            <Text style={[s.ctaSecondaryText, isWatchlisted && s.ctaDangerText]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
              {isWatchlisted ? 'SAVED' : 'WATCHLIST'}
            </Text>
          </View>
        </PressableScale>

        {hasTrailer && (
          <PressableScale
            style={s.ctaSecondary}
            onPress={handleOpenTrailer}
            pressedScale={0.95} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            accessibilityRole="button" accessibilityLabel="Watch trailer"
          >
            <View style={s.ctaIconRow}>
              <Play size={10} color={colors.bone} fill={colors.bone} strokeWidth={1.5} />
              <Text style={s.ctaSecondaryText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>TRAILER</Text>
            </View>
          </PressableScale>
        )}

        {existingLog && (
          <PressableScale
            style={s.ctaSecondary}
            onPress={handleOpenShare} pressedScale={0.95} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            accessibilityRole="button" accessibilityLabel="Share this film"
          >
            <View style={s.ctaIconRow}>
              <Share2 size={11} color={colors.bone} strokeWidth={1.5} />
              <Text style={s.ctaSecondaryText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>SHARE</Text>
            </View>
          </PressableScale>
        )}
      </View>

      {isArchivist && (
        <View style={s.ctaRow}>
          <PressableScale
            style={s.ctaArchivist}
            onPress={handleOpenLounge}
            pressedScale={0.95} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            accessibilityLabel="Open film lounge"
          >
            <View style={s.ctaIconRow}>
              <MessageCircle size={11} color={colors.sepia} strokeWidth={1.5} />
              <Text style={s.ctaArchivistText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>LOUNGE</Text>
            </View>
          </PressableScale>
        </View>
      )}
    </Animated.View>
  );
});

const s = StyleSheet.create({
  ctaSection: { paddingHorizontal: 20, marginTop: 10, marginBottom: 20, gap: 10, zIndex: 10 },
  ctaRow: { flexDirection: 'row', gap: 10 },
  ctaIconRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  ctaPrimary: { backgroundColor: colors.sepia, borderRadius: 2, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', shadowColor: colors.sepia, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  ctaPrimaryText: { fontFamily: 'CourierPrime_700Bold', fontSize: 13, color: colors.ink, letterSpacing: 1 },
  ctaRewatch: { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)', borderRadius: 2, paddingVertical: 12, alignItems: 'center' },
  ctaRewatchText: { fontFamily: 'CourierPrime_700Bold', fontSize: 11, color: colors.sepia, letterSpacing: 1 },
  ctaSecondary: { flex: 1, backgroundColor: 'rgba(25,23,20,0.8)', borderWidth: 1, borderColor: 'rgba(215,205,190,0.1)', borderRadius: 2, paddingVertical: 12, alignItems: 'center' },
  ctaSecondaryText: { fontFamily: 'Inter_700Bold', fontSize: 10, color: colors.bone, letterSpacing: 1 },
  ctaDanger: { backgroundColor: 'rgba(180,20,20,0.1)', borderColor: 'rgba(180,20,20,0.3)' },
  ctaDangerText: { color: colors.bloodReel },
  ctaArchivist: { flex: 1, backgroundColor: 'rgba(139,105,20,0.1)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)', borderRadius: 2, paddingVertical: 12, alignItems: 'center' },
  ctaArchivistText: { fontFamily: 'Inter_700Bold', fontSize: 10, color: colors.sepia, letterSpacing: 1 },
});
