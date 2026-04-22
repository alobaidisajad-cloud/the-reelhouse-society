import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Heart, MessageSquare, Edit3, Bookmark, MessageCircle } from 'lucide-react-native';
import { useFilmStore } from '@/src/stores/films';
import { useAuthStore } from '@/src/stores/auth';
import { colors, fonts } from '@/src/theme/theme';
import reelToast from '@/src/utils/reelToast';
import PressableScale from '@/src/components/PressableScale';
import ShareToLoungeModal from '@/src/components/ShareToLoungeModal';

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
  const { hasEndorsed, toggleEndorse, _watchlistIndex, addToWatchlist, removeFromWatchlist } = useFilmStore();
  const { user: currentUser } = useAuthStore();

  const [showShareModal, setShowShareModal] = useState(false);

  const endorsed = hasEndorsed(itemId);
  const filmSaved = !!_watchlistIndex[filmId];
  const isOwner = currentUser?.username === ownerUsername;
  const isLoungeEligible = currentUser && ['archivist', 'auteur'].includes(currentUser.role ?? '');

  const handleCertify = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleEndorse(itemId);
  }, [itemId, toggleEndorse]);

  const handleCritique = useCallback(() => {
    Haptics.selectionAsync();
    router.push(`/log/${itemId}`);
  }, [itemId, router]);

  const handleSaveOrEdit = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isOwner) {
      router.push({
        pathname: '/log-modal',
        params: {
          filmId: String(filmId),
          editLogId: itemId,
          filmTitle: filmTitle,
          posterPath: posterPath ?? '',
        },
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
    }
  }, [isOwner, filmSaved, addToWatchlist, removeFromWatchlist, router, filmId, itemId, filmTitle, posterPath, year]);

  const handleLounge = useCallback(() => {
    if (!isLoungeEligible) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      reelToast.error('Archivist or Auteur tier required to share to The Lounge.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowShareModal(true);
  }, [isLoungeEligible]);

  return (
    <>
      <View style={s.actionDeck}>
        <PressableScale style={s.actionBtn} onPress={handleCertify} haptic="medium">
          <Heart size={16} strokeWidth={2} color={endorsed ? colors.sepia : colors.fog} fill={endorsed ? colors.sepia : 'transparent'} />
          <Text style={[s.actionLabel, endorsed && s.actionLabelCertified]}>{endorsed ? 'CERTIFIED' : 'CERT'}</Text>
        </PressableScale>

        <PressableScale style={s.actionBtn} onPress={handleCritique} haptic="light">
          <MessageSquare size={16} strokeWidth={2} color={colors.fog} />
          <Text style={s.actionLabel}>CRITIQUE</Text>
        </PressableScale>

        <PressableScale style={s.actionBtn} onPress={handleSaveOrEdit} haptic="medium">
          {isOwner ? (
            <Edit3 size={16} strokeWidth={2} color={colors.fog} />
          ) : (
            <Bookmark size={16} strokeWidth={2} color={filmSaved ? colors.sepia : colors.fog} fill={filmSaved ? colors.sepia : 'transparent'} />
          )}
          <Text style={[s.actionLabel, !isOwner && filmSaved && s.actionLabelCertified]}>{isOwner ? 'EDIT' : filmSaved ? 'SAVED' : 'SAVE'}</Text>
        </PressableScale>

        <PressableScale style={s.actionBtn} onPress={handleLounge} haptic="medium">
          <MessageCircle size={16} strokeWidth={2} color={isLoungeEligible ? colors.fog : colors.ash} />
          <Text style={[s.actionLabel, !isLoungeEligible && s.actionIconLocked]}>LOUNGE</Text>
        </PressableScale>
      </View>

      <ShareToLoungeModal
        visible={showShareModal}
        onClose={() => setShowShareModal(false)}
        filmTitle={filmTitle}
        filmId={String(filmId)}
        posterPath={posterPath}
      />
    </>
  );
});

const s = StyleSheet.create({
  actionDeck: {
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(139,105,20,0.1)',
    backgroundColor: '#050403', // Deep soot
    borderRadius: 2,
    overflow: 'hidden',
    zIndex: 1,
    padding: 1,
    gap: StyleSheet.hairlineWidth,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.ink,
    borderRadius: 1,
  },
  actionLabel: {
    fontFamily: fonts.ui,
    fontSize: 8,
    letterSpacing: 2,
    color: colors.fog,
  },
  actionLabelCertified: {
    color: colors.sepia,
  },
  actionIconLocked: {
    opacity: 0.3,
  },
});
