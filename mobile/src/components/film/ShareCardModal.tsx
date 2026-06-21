import React, { useRef, useState, memo, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Modal, Share, Pressable } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeIn } from 'react-native-reanimated';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { colors, fonts, effects } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';
import { ReelRating } from '@/src/components/Decorative';
import PressableScale from '@/src/components/PressableScale';

export const DOSSIER_CARD_WIDTH = 360;
export const DOSSIER_CARD_HEIGHT = 640;

interface ShareFilm {
  id?: number | string;
  title: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
}

interface ShareLog {
  rating: number;
  review?: string | null;
  status?: string;
  watchedDate?: string;
  altPoster?: string;
  abandonedReason?: string | null;
}

interface ShareCardModalProps {
  visible: boolean;
  onClose: () => void;
  film: ShareFilm | null;
  log?: ShareLog | null;
  username?: string | null;
}

const truncateReview = (text: string, max = 350): string => {
  const raw = String(text || '').trim();
  if (raw.length <= max) return raw;
  const cut = raw.lastIndexOf(' ', max);
  return raw.slice(0, cut > 40 ? cut : max).trimEnd() + '…';
};

function CardContent({ film, log, username }: { film: ShareFilm; log?: ShareLog | null; username?: string | null }) {
  const posterToUse = log?.altPoster || film.poster_path;
  const posterUrl = posterToUse ? tmdb.poster(posterToUse, 'w500') : null;
  const reviewText = log?.review ? truncateReview(log.review) : null;
  const yearDisplay = film.release_date?.slice(0, 4) || '';

  return (
    <View style={s.cardContainer}>
      {/* Ambient Blur Layer */}
      {posterUrl && (
        <Image
          source={{ uri: posterUrl }}
          style={s.blurBackground}
          contentFit="cover"
          blurRadius={40}
        />
      )}

      {/* Vignette Overlay */}
      <View style={s.vignette} />

      {/* Obsidian Slab */}
      <View style={s.obsidianSlab}>
        {/* Header */}
        <View style={s.slabHeader}>
          <Text style={s.slabHeaderText}>● ARCHIVE DOSSIER ●</Text>
        </View>

        {/* Poster Area */}
        <View style={s.slabPosterArea}>
          <View style={s.slabPosterWrapper}>
            {posterUrl ? (
              <Image source={{ uri: posterUrl }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
            ) : (
              <View style={[StyleSheet.absoluteFillObject, s.posterPlaceholder]}>
                <Text style={s.placeholderGlyph}>∅</Text>
              </View>
            )}
          </View>
        </View>

        {/* Film & Review Metadata */}
        <View style={s.slabInfoArea}>
          <Text style={s.slabFilmTitle} numberOfLines={2} adjustsFontSizeToFit>{film.title}</Text>
          <Text style={s.slabFilmMeta}>{yearDisplay}</Text>
          
          {log && log.rating > 0 && (
            <View style={s.slabRatingWrap}>
              <ReelRating rating={log.rating} size={13} />
            </View>
          )}

          <View style={s.slabReviewBox}>
            <Text style={s.slabReviewText} numberOfLines={3}>
              "{reviewText || 'Classified Analysis'}"
            </Text>
          </View>
        </View>

        {/* Footer */}
        <View style={s.slabFooter}>
          <View style={s.slabFooterLeft}>
            <Image source={require('@/assets/images/reelhouse-logo-transparent.png')} style={s.slabFooterLogo} />
            <Text style={s.slabFooterText}>REELHOUSE</Text>
          </View>
          {username && (
            <Text style={s.slabFooterUsername}>@{username.toUpperCase()}</Text>
          )}
        </View>
      </View>
    </View>
  );
}

export const ShareCardModal = memo(function ShareCardModal({ visible, onClose, film, log, username }: ShareCardModalProps) {
  const viewShotRef = useRef<ViewShot>(null);
  const [sharing, setSharing] = useState(false);
  const [posterLoaded, setPosterLoaded] = useState(false);
  const [posterError, setPosterError] = useState(false);
  const [forceReady, setForceReady] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (visible) {
      setForceReady(false);
      setPosterLoaded(false);
      setPosterError(false);
      timer = setTimeout(() => setForceReady(true), 2000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [visible]);

  const handleShare = async () => {
    if (!viewShotRef.current?.capture || !film) return;
    setSharing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const uri = await viewShotRef.current.capture();
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: `${film.title} • ReelHouse Dossier`,
        });
      } else {
        const deepLink = `https://reelhouse.app/film/${film.id}`;
        const ratingText = log && log.rating > 0 ? ` • ${log.rating}/5 reels` : '';
        await Share.share({
          message: `${film.title}${ratingText}\n\n"${truncateReview(log?.review || '')}"\n\n• view on ReelHouse: ${deepLink}`.trim(),
        });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: unknown) {
      if (__DEV__) console.warn('[ShareCard] Share failed:', err);
    } finally {
      setSharing(false);
      onClose();
    }
  };

  if (!film) return null;

  const isPosterReady = !film.poster_path || posterLoaded || posterError;
  const canShare = !sharing && (forceReady || isPosterReady);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View style={s.modalContent}>
          <View style={s.header}>
            <Text style={s.title}>GENERATE CLASSIFIED DOSSIER</Text>
            <PressableScale onPress={onClose} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }} haptic="light" pressedScale={0.96}>
              <Text style={s.closeText}>✕</Text>
            </PressableScale>
          </View>

          <View style={s.cardWrapper}>
            <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1 }} style={s.cardContainer}>
              <CardContent film={film} log={log} username={username} />
            </ViewShot>
          </View>

          <PressableScale style={s.shareButton} onPress={handleShare} disabled={!canShare} haptic="medium" pressedScale={0.98}>
            <Text style={s.shareButtonText}>
              {sharing ? 'TRANSMITTING...' : (!canShare ? 'DEVELOPING...' : 'SHARE TO SOCIALS')}
            </Text>
          </PressableScale>
        </View>
      </View>
    </Modal>
  );
});

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 3, 1, 0.9)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.ink,
    borderWidth: 1,
    borderColor: 'rgba(196,150,26,0.3)',
    borderRadius: 8,
    padding: 16,
    shadowColor: colors.sepia,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontFamily: fonts.uiBold,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.bone,
  },
  closeText: {
    fontFamily: fonts.ui,
    fontSize: 18,
    color: colors.fog,
  },
  cardWrapper: {
    alignItems: 'center',
    marginBottom: 24,
  },
  cardContainer: {
    width: DOSSIER_CARD_WIDTH,
    height: DOSSIER_CARD_HEIGHT,
    backgroundColor: '#040302',
    overflow: 'hidden',
    flexDirection: 'column',
  },
  blurBackground: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.45,
    transform: [{ scale: 1.15 }],
  },
  vignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(4,3,2,0.4)',
  },
  obsidianSlab: {
    marginHorizontal: 24,
    marginVertical: 45,
    flex: 1,
    backgroundColor: '#090705',
    borderWidth: 1,
    borderColor: 'rgba(196, 150, 26, 0.3)',
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.8,
    shadowRadius: 30,
    elevation: 10,
  },
  slabHeader: {
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196, 150, 26, 0.15)',
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  slabHeaderText: {
    fontFamily: fonts.ui, fontSize: 8, letterSpacing: 3,
    color: colors.sepia, opacity: 0.9,
  },
  slabPosterArea: {
    flex: 1,
    padding: 16,
    paddingBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 0,
  },
  slabPosterWrapper: {
    height: '100%',
    aspectRatio: 2/3,
    backgroundColor: colors.soot,
    ...effects.shadowPrimary,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  posterPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  placeholderGlyph: { fontFamily: fonts.ui, fontSize: 24, color: colors.fog },
  slabInfoArea: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  slabFilmTitle: {
    fontFamily: fonts.display, fontSize: 20, lineHeight: 24,
    color: colors.parchment, textAlign: 'center', marginBottom: 4,
  },
  slabFilmMeta: {
    fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2,
    color: colors.sepia, opacity: 0.85, marginBottom: 8,
  },
  slabRatingWrap: { marginBottom: 8 },
  slabReviewBox: {
    width: '100%',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 4,
    borderLeftWidth: 2,
    borderLeftColor: colors.sepia,
  },
  slabReviewText: {
    fontFamily: fonts.bodyItalic, fontSize: 11, color: colors.bone,
    lineHeight: 16, textAlign: 'left', opacity: 0.95,
  },
  slabFooter: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(196, 150, 26, 0.15)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  slabFooterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  slabFooterLogo: { width: 10, height: 10, opacity: 0.7 },
  slabFooterText: {
    fontFamily: fonts.ui, fontSize: 7, letterSpacing: 2, color: colors.sepia,
  },
  slabFooterUsername: {
    fontFamily: fonts.ui, fontSize: 7, letterSpacing: 1.5, color: colors.flicker,
  },
  shareButton: {
    backgroundColor: colors.sepia, paddingVertical: 14,
    borderRadius: 4, alignItems: 'center',
  },
  shareButtonText: {
    fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 2, color: colors.ink,
  },
});
