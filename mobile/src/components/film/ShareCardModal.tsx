import React, { useRef, useState, memo, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Modal, Share, Pressable } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
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
        <View style={{
            position: 'relative', width: 360, height: 640,
            backgroundColor: colors.ink, overflow: 'hidden'
        }}>
            {/* Poster top half full bleed */}
            <View style={{ position: 'absolute', top: 0, left: 0, width: 360, height: 360, zIndex: 1, backgroundColor: colors.soot }}>
                {posterUrl ? (
                    <Image source={{ uri: posterUrl }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                ) : null}
            </View>

            {/* Abyss Fade Mask */}
            <LinearGradient
                colors={['rgba(11, 10, 8, 0)', 'rgba(11, 10, 8, 1)']}
                style={{ position: 'absolute', top: 120, left: 0, width: 360, height: 240, zIndex: 2 }}
            />

            {/* Typography Container */}
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 5 }}>
                {/* Film Title */}
                <Text style={{
                    position: 'absolute', top: 270, left: 20, width: 320,
                    textAlign: 'center', fontFamily: fonts.display, color: colors.flicker,
                    fontSize: 28, lineHeight: 32, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 12
                }} numberOfLines={2}>
                    {film.title}
                </Text>

                {/* Metadata */}
                <View style={{
                    position: 'absolute', top: 335, left: 20, width: 320,
                    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8
                }}>
                    {yearDisplay ? <Text style={{ fontFamily: fonts.ui, color: colors.sepia, fontSize: 11, letterSpacing: 1.5, fontWeight: '600' }}>{yearDisplay}</Text> : null}
                    {yearDisplay ? <Text style={{ fontFamily: fonts.ui, color: colors.sepia, fontSize: 11, opacity: 0.5 }}>•</Text> : null}
                    {log && log.rating > 0 ? <ReelRating rating={log.rating} size={11} /> : null}
                </View>

                {/* Review Text */}
                <View style={{
                    position: 'absolute', top: 380, left: 24, width: 312, height: 170,
                    overflow: 'hidden', alignItems: 'center'
                }}>
                    {reviewText ? (
                        <Text style={{
                            fontFamily: 'Courier', fontSize: 13, lineHeight: 20,
                            color: colors.bone, textAlign: 'center', fontStyle: 'italic'
                        }}>
                            "{reviewText}"
                        </Text>
                    ) : (
                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                            <Text style={{ fontFamily: 'Courier', fontSize: 12, color: 'rgba(200, 185, 154, 0.4)', letterSpacing: 1 }}>
                                LOGGED // {log?.status?.toUpperCase() || 'WATCHED'}
                            </Text>
                        </View>
                    )}
                    
                    {/* Fade to black at bottom of review */}
                    {reviewText ? (
                        <LinearGradient
                            colors={['rgba(11, 10, 8, 0)', 'rgba(11, 10, 8, 1)']}
                            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 40 }}
                        />
                    ) : null}
                </View>

                {/* Footer */}
                <View style={{
                    position: 'absolute', top: 580, left: 24, width: 312,
                    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                    paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(196, 150, 26, 0.2)'
                }}>
                    <Text style={{ fontFamily: fonts.ui, fontSize: 10, color: colors.sepia, letterSpacing: 1, opacity: 0.8 }}>REELHOUSE</Text>
                    {username && <Text style={{ fontFamily: fonts.ui, fontSize: 10, color: colors.parchment, letterSpacing: 1, opacity: 0.8 }}>@{username}</Text>}
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
  slabFooterLogo: { width: 14, height: 14, opacity: 0.7 },
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
