import React, { useCallback, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/src/components/text';
import TactileEngine from '@/src/utils/TactileEngine';
import { nav } from '@/src/utils/typedRouter';
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
import { MarkFigure, certifyLabel, critiqueLabel } from '@/src/components/MarkFigure';
import { useMarkCount } from '@/src/stores/markCounts';

interface ActionDeckProps {
  itemId: string;
  filmId: number;
  filmTitle: string;
  posterPath: string | null;
  year?: number;
  ownerUsername: string;
  /** Whose log this is, by id: a handle can change, an id cannot. */
  ownerId?: string | null;
  /** Counts the page arrived with, shown until the store holds fresher; null if unknown. */
  certifyCount?: number | null;
  critiqueCount?: number | null;
}

export const ActionDeck = React.memo(function ActionDeck({
  itemId,
  filmId,
  filmTitle,
  posterPath,
  year,
  ownerUsername,
  ownerId = null,
  certifyCount: certifyFallback = null,
  critiqueCount: critiqueFallback = null,
}: ActionDeckProps) {

  // Zustand slices purely for THIS specific component. ActivityCard won't re-render.
  const endorsed = useWatchlistStore(s => !!s._endorsedIndex[itemId]);
  const certifyCount = useMarkCount('certify', itemId, certifyFallback);
  const critiqueCount = useMarkCount('critique', itemId, critiqueFallback);
  const filmSaved = useWatchlistStore(s => !!s._watchlistIndex[filmId]);
  
  const toggleEndorse = useWatchlistStore(s => s.toggleEndorse);
  const addToWatchlist = useWatchlistStore(s => s.addToWatchlist);
  const removeFromWatchlist = useWatchlistStore(s => s.removeFromWatchlist);

  const isOwner = useAuthStore(s => !!ownerId && s.user?.id === ownerId);
  const signedIn = useAuthStore(s => !!s.user);
  /** Sharing to a salon posts a message there: the rope is speaking, not the Lounge's door. */
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

  // A recycled card starts at rest: no pulse, no lock, no open modal.
  React.useEffect(() => {
    heartScale.value = 1;
    bookmarkScale.value = 1;
    isAnimating.current = false;
    setShowShareModal(false);
  }, [itemId, heartScale, bookmarkScale]);

  const handleCertify = useCallback(() => {
    if (!useAuthStore.getState().user) {
        nav.push('/login');
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
  }, [itemId, toggleEndorse, heartScale]);

  const handleCritique = useCallback(() => {
    if (!useAuthStore.getState().user) {
        nav.push('/login');
        return;
    }
    TactileEngine.selection();
    nav.push(`/log/${itemId}`);
  }, [itemId]);

  const handleSaveOrEdit = useCallback(() => {
    if (!useAuthStore.getState().user) {
        nav.push('/login');
        return;
    }
    TactileEngine.mutate();
    if (isOwner) {
      nav.push('/log-modal', {
        filmId: String(filmId),
        editLogId: itemId,
        filmTitle,
        filmPoster: posterPath ?? '',
        filmYear: year ? String(year) : '',
      });
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
  }, [isOwner, filmSaved, addToWatchlist, removeFromWatchlist, filmId, itemId, filmTitle, posterPath, year, bookmarkScale]);

  const handleLounge = useCallback(() => {
    if (!useAuthStore.getState().user) {
        nav.push('/login');
        return;
    }
    if (!canShare) {
      // To the Society, told what they reached for — never the open corridor.
      openShare();
      return;
    }
    TactileEngine.mutate();
    setShowShareModal(true);
  // The fields: useClearance returns a fresh object every render, in every card.
  }, [canShare, openShare]);

  return (
    <>
      <View style={s.actionDeck}>
        <PressableScale hitSlop={{ top: 7, bottom: 0, left: 0, right: 0 }} style={s.actionBtn} onPress={handleCertify} pressedScale={0.92} accessibilityRole="button" accessibilityState={{ selected: endorsed }} accessibilityLabel={certifyLabel(certifyCount, endorsed, 'this critique')}>
          <MarkFigure iconSize={15} count={certifyCount} style={[s.actionLabel, endorsed && s.actionLabelCertified]}>
            <Animated.View style={animatedHeartStyle}>
              <Heart size={15} strokeWidth={2} color={endorsed ? colors.crimson : colors.fog} fill={endorsed ? colors.crimson : 'transparent'} />
            </Animated.View>
          </MarkFigure>
          {/* The cap and shrink-to-fit keep each label on one line at every size. */}
          <Text style={[s.actionLabel, endorsed && s.actionLabelCertified]} {...deckLabelProps}>{endorsed ? 'CERTIFIED' : 'CERTIFY'}</Text>
        </PressableScale>

        <PressableScale hitSlop={{ top: 7, bottom: 0, left: 0, right: 0 }} style={s.actionBtn} onPress={handleCritique} accessibilityRole="button" accessibilityLabel={critiqueLabel(critiqueCount, 'Write a critique')}>
          <MarkFigure iconSize={16} count={critiqueCount} style={s.actionLabel}>
            <MessageSquare size={16} strokeWidth={2} color={colors.fog} />
          </MarkFigure>
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

        {/* Who may not speak holds the brass key; its label says it opens the Society. */}
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
  // Crimson to certify, brass to save; both legible on ink.
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
