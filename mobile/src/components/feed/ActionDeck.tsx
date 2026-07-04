import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import TactileEngine from '@/src/utils/TactileEngine';
import { useRouter } from 'expo-router';
import { Heart, MessageSquare, Edit3, Bookmark, MessageCircle, KeyRound } from 'lucide-react-native';
import { useWatchlistStore } from '@/src/stores/films';
import { useAuthStore } from '@/src/stores/auth';
import { colors, fonts } from '@/src/theme/theme';
import reelToast from '@/src/utils/reelToast';
import PressableScale from '@/src/components/PressableScale';
import ShareToLoungeModal from '@/src/components/ShareToLoungeModal';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSequence, Easing } from 'react-native-reanimated';
import { isArchivistPlusTier } from '@/src/utils/tier';

interface ActionDeckProps {
  itemId: string;
  filmId: number;
  filmTitle: string;
  posterPath: string | null;
  year?: number;
  ownerUsername: string;
}

export const ActionDeck = React.memo(function ActionDeck({
  itemId,
  filmId,
  filmTitle,
  posterPath,
  year,
  ownerUsername,
}: ActionDeckProps) {
  const router = useRouter();
  
  // Zustand slices purely for THIS specific component. ActivityCard won't re-render.
  const endorsed = useWatchlistStore(s => !!s._endorsedIndex[itemId]);
  const filmSaved = useWatchlistStore(s => !!s._watchlistIndex[filmId]);
  
  const toggleEndorse = useWatchlistStore(s => s.toggleEndorse);
  const addToWatchlist = useWatchlistStore(s => s.addToWatchlist);
  const removeFromWatchlist = useWatchlistStore(s => s.removeFromWatchlist);

  const isOwner = useAuthStore(s => s.user?.username === ownerUsername);
  const isLoungeEligible = useAuthStore(s => s.user ? isArchivistPlusTier(s.user) : false);

  const [showShareModal, setShowShareModal] = useState(false);

  const heartScale = useSharedValue(1);
  const bookmarkScale = useSharedValue(1);
  const isAnimating = React.useRef(false);

  const animatedHeartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }]
  }));
  const animatedBookmarkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bookmarkScale.value }]
  }));

  // FIX 6: View Recycling Animation Bleed fix
  React.useEffect(() => {
    heartScale.value = 1;
    bookmarkScale.value = 1;
    isAnimating.current = false;
    setShowShareModal(false);
  }, [itemId, heartScale, bookmarkScale]);

  const handleCertify = useCallback(() => {
    if (!useAuthStore.getState().user) {
        (router.push as any)('/login' as any);
        return;
    }
    if (isAnimating.current) return;
    isAnimating.current = true;
    setTimeout(() => { isAnimating.current = false; }, 500);

    TactileEngine.mutate();
    toggleEndorse(itemId).catch((e) => {
      if (__DEV__) console.warn('Certify failed:', e);
    });
    // Stamp-press pulse — pure timing curves, no spring, no wobble.
    heartScale.value = withSequence(
      withTiming(1.22, { duration: 110, easing: Easing.out(Easing.quad) }),
      withTiming(1, { duration: 150, easing: Easing.bezier(0.33, 0, 0.15, 1) })
    );
  }, [itemId, toggleEndorse, heartScale, router.push]);

  const handleCritique = useCallback(() => {
    if (!useAuthStore.getState().user) {
        (router.push as any)('/login' as any);
        return;
    }
    TactileEngine.selection();
    (router.push as any)(`/log/${itemId}` as any);
  }, [itemId, router]);

  const handleSaveOrEdit = useCallback(() => {
    if (!useAuthStore.getState().user) {
        (router.push as any)('/login' as any);
        return;
    }
    TactileEngine.mutate();
    if (isOwner) {
      (router.push as any)({
        pathname: '/log-modal',
        params: {
          filmId: String(filmId),
          editLogId: itemId,
          filmTitle: filmTitle,
          filmPoster: posterPath ?? '',
          filmYear: year ? String(year) : '',
        },
      } as any);
    } else {
      if (filmSaved) {
        removeFromWatchlist(filmId);
        reelToast.success('Removed from watchlist');
      } else {
        addToWatchlist({
          id: filmId,
          title: filmTitle,
          poster_path: posterPath,
          release_date: year ? `${year}-01-01` : undefined,
        });
        reelToast.success('Saved to watchlist ✦');
      }
      bookmarkScale.value = withSequence(
        withTiming(1.18, { duration: 110, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 150, easing: Easing.bezier(0.33, 0, 0.15, 1) })
      );
    }
  }, [isOwner, filmSaved, addToWatchlist, removeFromWatchlist, router, filmId, itemId, filmTitle, posterPath, year, bookmarkScale]);

  const handleLounge = useCallback(() => {
    if (!useAuthStore.getState().user) {
        (router.push as any)('/login' as any);
        return;
    }
    if (!isLoungeEligible) {
      // The velvet rope, not a dead end — the brass key opens the LoungeGate
      // (CLEARANCE REQUIRED → ASCEND THE RANKS → membership).
      TactileEngine.navigate();
      (router.push as any)('/lounge' as any);
      return;
    }
    TactileEngine.mutate();
    setShowShareModal(true);
  }, [isLoungeEligible, router.push]);

  return (
    <>
      <View style={s.actionDeck}>
        <PressableScale style={s.actionBtn} onPress={handleCertify} pressedScale={0.92} accessibilityRole="button" accessibilityState={{ selected: endorsed }} accessibilityLabel={endorsed ? 'Remove certification from this critique' : 'Certify this critique'}>
          <Animated.View style={animatedHeartStyle}>
            <Heart size={15} strokeWidth={2} color={endorsed ? colors.crimson : colors.fog} fill={endorsed ? colors.crimson : 'transparent'} />
          </Animated.View>
          <Text style={[s.actionLabel, endorsed && s.actionLabelCertified]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{endorsed ? 'CERTIFIED' : 'CERTIFY'}</Text>
        </PressableScale>

        <PressableScale style={s.actionBtn} onPress={handleCritique} accessibilityRole="button" accessibilityLabel="Write a critique">
          <MessageSquare size={16} strokeWidth={2} color={colors.fog} />
          <Text style={s.actionLabel}>CRITIQUE</Text>
        </PressableScale>

        <PressableScale style={s.actionBtn} onPress={handleSaveOrEdit} pressedScale={0.92} accessibilityRole="button" accessibilityState={{ selected: !isOwner && filmSaved }} accessibilityLabel={isOwner ? 'Edit this log' : filmSaved ? 'Remove film from your watchlist' : 'Save film to your watchlist'}>
          <Animated.View style={animatedBookmarkStyle}>
            {isOwner ? (
              <Edit3 size={15} strokeWidth={2} color={colors.fog} />
            ) : (
              <Bookmark size={15} strokeWidth={2} color={filmSaved ? colors.sepia : colors.fog} fill={filmSaved ? colors.sepia : 'transparent'} />
            )}
          </Animated.View>
          <Text style={[s.actionLabel, !isOwner && filmSaved && s.actionLabelSaved]}>{isOwner ? 'EDIT' : filmSaved ? 'SAVED' : 'SAVE'}</Text>
        </PressableScale>

        {/* Eligible members share to a salon; cinephiles hold the brass key —
            an invitation marked private, never a dead switch. */}
        <PressableScale style={s.actionBtn} onPress={handleLounge} accessibilityRole="button" accessibilityLabel={isLoungeEligible ? 'Share to a lounge' : 'The Lounge — clearance required. Opens membership details.'}>
          {isLoungeEligible ? (
            <MessageCircle size={15} strokeWidth={2} color={colors.fog} />
          ) : (
            <KeyRound size={15} strokeWidth={2} color={colors.sepia} style={s.keyDim} />
          )}
          <Text style={[s.actionLabel, !isLoungeEligible && s.actionLabelKey]}>LOUNGE</Text>
        </PressableScale>
      </View>

      <ShareToLoungeModal
        visible={showShareModal}
        onClose={() => setShowShareModal(false)}
        filmTitle={filmTitle}
        filmId={String(filmId)}
        posterPath={posterPath}
        logId={itemId}
        ownerUsername={ownerUsername}
      />
    </>
  );
});

const s = StyleSheet.create({
  actionDeck: {
    // Flush stamp bar — a seam across the full card width, not a floating box.
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(184,137,26,0.12)',
    backgroundColor: '#050403', // Deep soot
    overflow: 'hidden',
    zIndex: 1,
    paddingTop: 1,
    gap: StyleSheet.hairlineWidth,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: colors.ink,
    borderRadius: 1,
  },
  actionLabel: {
    fontFamily: fonts.sub,
    fontSize: 8,
    letterSpacing: 2,
    color: colors.fog,
    includeFontPadding: false,
  },
  // Crimson passion for certification; brass for the archival act of saving —
  // both finally legible (bloodReel was ~1.4:1 on ink).
  actionLabelCertified: {
    color: colors.crimson,
  },
  actionLabelSaved: {
    color: colors.sepia,
  },
  keyDim: {
    opacity: 0.75,
  },
  actionLabelKey: {
    color: colors.sepia,
    opacity: 0.75,
  },
});
