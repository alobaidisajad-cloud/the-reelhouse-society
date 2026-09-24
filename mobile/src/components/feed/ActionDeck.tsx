import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import TactileEngine from '@/src/utils/TactileEngine';
import { useRouter } from 'expo-router';
import { Heart, MessageSquare, Edit3, Bookmark, MessageCircle, KeyRound } from 'lucide-react-native';
import { useWatchlistStore } from '@/src/stores/films';
import { useAuthStore } from '@/src/stores/auth';
import { colors, fonts } from '@/src/theme/theme';
import { deckLabelProps } from '@/src/constants/textScaling';
import reelToast from '@/src/utils/reelToast';
import PressableScale from '@/src/components/PressableScale';
import ShareToLoungeModal from '@/src/components/ShareToLoungeModal';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSequence, Easing } from 'react-native-reanimated';
import { useClearance } from '@/src/hooks/useClearance';

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
  const signedIn = useAuthStore(s => !!s.user);
  /**
   * Sharing a critique into a salon IS posting a message there — the act
   * `tr_tier_gate_lounge_messages` refuses — so the rope is `lounge-speaking`,
   * not the Lounge's door. The corridor itself is open to everyone to read.
   */
  const { held: canShare, standing: shareStanding, open: openShare } = useClearance('lounge-speaking');

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
    if (!canShare) {
      /**
       * This used to walk the member to '/lounge', on the promise that the tab
       * would refuse them and explain. The corridor opened to everyone, so it
       * stopped refusing — and a member tapping "share" was dropped into a list
       * of salons with their critique left behind and no word about why. The
       * rope now goes where it says: the Society, told what they reached for.
       */
      openShare();
      return;
    }
    TactileEngine.mutate();
    setShowShareModal(true);
  // The fields, not `share` itself: useClearance returns a fresh object every
  // render, and this handler lives in every card of a long feed.
  }, [canShare, openShare, router.push]);

  return (
    <>
      <View style={s.actionDeck}>
        <PressableScale hitSlop={{ top: 7, bottom: 0, left: 0, right: 0 }} style={s.actionBtn} onPress={handleCertify} pressedScale={0.92} accessibilityRole="button" accessibilityState={{ selected: endorsed }} accessibilityLabel={endorsed ? 'Remove certification from this critique' : 'Certify this critique'}>
          <Animated.View style={animatedHeartStyle}>
            <Heart size={15} strokeWidth={2} color={endorsed ? colors.crimson : colors.fog} fill={endorsed ? colors.crimson : 'transparent'} />
          </Animated.View>
          {/* Four labels, one line each, at every text size the app allows.
              The cap does the work: at 1.35 the widest of them ('CERTIFIED')
              needs ~79pt of an ~81pt column, and shrink-to-fit absorbs the
              rest. Uncapped, all four ran past their columns — three of them
              wrapped to a second line and left the deck ragged. */}
          <Text style={[s.actionLabel, endorsed && s.actionLabelCertified]} {...deckLabelProps}>{endorsed ? 'CERTIFIED' : 'CERTIFY'}</Text>
        </PressableScale>

        <PressableScale hitSlop={{ top: 7, bottom: 0, left: 0, right: 0 }} style={s.actionBtn} onPress={handleCritique} accessibilityRole="button" accessibilityLabel="Write a critique">
          <MessageSquare size={16} strokeWidth={2} color={colors.fog} />
          <Text style={s.actionLabel} {...deckLabelProps}>CRITIQUE</Text>
        </PressableScale>

        <PressableScale hitSlop={{ top: 7, bottom: 0, left: 0, right: 0 }} style={s.actionBtn} onPress={handleSaveOrEdit} pressedScale={0.92} accessibilityRole="button" accessibilityState={{ selected: !isOwner && filmSaved }} accessibilityLabel={isOwner ? 'Edit this log' : filmSaved ? 'Remove film from your watchlist' : 'Save film to your watchlist'}>
          <Animated.View style={animatedBookmarkStyle}>
            {isOwner ? (
              <Edit3 size={15} strokeWidth={2} color={colors.fog} />
            ) : (
              <Bookmark size={15} strokeWidth={2} color={filmSaved ? colors.sepia : colors.fog} fill={filmSaved ? colors.sepia : 'transparent'} />
            )}
          </Animated.View>
          <Text style={[s.actionLabel, !isOwner && filmSaved && s.actionLabelSaved]} {...deckLabelProps}>{isOwner ? 'EDIT' : filmSaved ? 'SAVED' : 'SAVE'}</Text>
        </PressableScale>

        {/* Members who may speak share to a salon; everyone else holds the
            brass key — an invitation marked private, never a dead switch. The
            spoken label says where the key actually leads, in the rope's own
            words, because it no longer leads to the corridor. */}
        <PressableScale hitSlop={{ top: 7, bottom: 0, left: 0, right: 0 }} style={s.actionBtn} onPress={handleLounge} accessibilityRole="button" accessibilityLabel={
          canShare ? 'Share to a lounge'
            : !signedIn ? 'Share to a lounge. Sign in first.'
            : shareStanding === 'lapsed' ? 'Share to a lounge. Your dues have lapsed. The Archivist opens this again. Opens the Society.'
            : 'Share to a lounge. Clearance required. The Archivist opens this. Opens the Society.'
        }>
          {canShare ? (
            <MessageCircle size={15} strokeWidth={2} color={colors.fog} />
          ) : (
            <KeyRound size={15} strokeWidth={2} color={colors.sepia} style={s.keyDim} />
          )}
          <Text style={[s.actionLabel, !canShare && s.actionLabelKey]} {...deckLabelProps}>LOUNGE</Text>
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
    backgroundColor: colors.inkwell,
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
    fontSize: 10,
    letterSpacing: 1.3,
    color: colors.fog,
    includeFontPadding: false,
  },
  // Crimson passion for certification; brass for the archival act of saving —
  // both finally legible (bloodReel was ~1.4:1 on ink).
  actionLabelCertified: {
    color: colors.crimsonInk,
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
