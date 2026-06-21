import React, { useRef, useState, memo, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, Image as RNImage } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { colors, fonts, effects } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';
import { ReelRating } from '@/src/components/Decorative';
import PressableScale from '@/src/components/PressableScale';
import { DossierBorder, DossierFooter, truncateReview, DOSSIER_CARD_WIDTH, DOSSIER_CARD_HEIGHT } from './DossierFrame';

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
    try {
      const uri = await viewShotRef.current.capture();
      const deepLink = `https://reelhouse.app/film/${film.id}`;

      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: `Share Cinematic Dossier - ${deepLink}`,
      });
    } catch (err: unknown) {
      if (__DEV__) console.warn('[ShareCard] Share failed:', err);
    } finally {
      setSharing(false);
      onClose();
    }
  };

  if (!film) return null;

  const posterToUse = log?.altPoster || film.poster_path;
  const posterUrl = posterToUse ? tmdb.poster(posterToUse, 'original') : null;
  const isAbandoned = log?.status === 'abandoned';
  const reviewText = log?.review ? truncateReview(log.review) : null;

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
              {/* ── Poster Zone ── */}
              <View style={s.posterZone}>
                {posterUrl ? (
                  <Image
                    source={{ uri: posterUrl }}
                    style={StyleSheet.absoluteFillObject}
                    contentFit="cover"
                    onLoad={() => setPosterLoaded(true)}
                    onError={() => setPosterError(true)}
                  />
                ) : (
                  <View style={[StyleSheet.absoluteFillObject, s.posterPlaceholder]}>
                    <Text style={s.placeholderGlyph}>∅</Text>
                  </View>
                )}
                {/* Subtle cinematic tint */}
                <View style={[StyleSheet.absoluteFillObject, s.cinematicTint]} />
                {/* Short elegant fade into panel */}
                <LinearGradient
                  colors={['transparent', colors.soot]}
                  locations={[0, 1]}
                  style={s.posterFade}
                />
              </View>

              {/* ── Dossier Data Panel ── */}
              <View style={s.dossierPanel}>
                <Text style={s.eyebrow}>CLASSIFIED DOSSIER</Text>
                <LinearGradient colors={[colors.sepia, 'rgba(184,137,26,0.1)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.rule} />
                <Text style={s.filmTitle} numberOfLines={2}>{film.title}</Text>
                <Text style={s.filmYear}>{film.release_date?.slice(0, 4)}</Text>

                {log && log.rating > 0 && (
                  <View style={s.ratingWrap}>
                    <ReelRating rating={log.rating} size={18} />
                  </View>
                )}

                {isAbandoned && (
                  <View style={s.abandonedBadge}>
                    <Text style={s.abandonedText}>✕ ABANDONED{log?.abandonedReason ? ` — ${log.abandonedReason.toUpperCase()}` : ''}</Text>
                  </View>
                )}

                <Text style={s.reviewText} numberOfLines={5}>
                  "{reviewText || 'Classified Analysis'}"
                </Text>

                {username && <Text style={s.attribution}>— @{username.toUpperCase()}</Text>}
              </View>

              {/* ── Overlays ── */}
              <View style={s.topHud} pointerEvents="none">
                <RNImage source={require('../../../assets/images/reelhouse-logo.png')} style={s.hudLogo} resizeMode="contain" />
                <Text style={s.hudText}>THE REELHOUSE SOCIETY</Text>
              </View>

              <DossierBorder width={DOSSIER_CARD_WIDTH} height={DOSSIER_CARD_HEIGHT} />
              <DossierFooter />
            </ViewShot>
          </View>

          {(() => {
            const isPosterReady = !posterUrl || posterLoaded || posterError;
            const canShare = !sharing && (forceReady || isPosterReady);
            return (
              <PressableScale style={s.shareButton} onPress={handleShare} disabled={!canShare} haptic="medium" pressedScale={0.98}>
                <Text style={s.shareButtonText}>
                  {sharing ? 'TRANSMITTING...' : (!canShare ? 'ARCHIVING...' : 'SHARE TO SOCIALS')}
                </Text>
              </PressableScale>
            );
          })()}
        </View>
      </View>
    </Modal>
  );
})

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
    fontSize: 14,
    color: colors.fog,
  },
  cardWrapper: {
    alignItems: 'center',
    marginBottom: 24,
  },
  /* ── Card Layout ── */
  cardContainer: {
    width: DOSSIER_CARD_WIDTH,
    height: DOSSIER_CARD_HEIGHT,
    backgroundColor: colors.soot,
    borderRadius: 4,
    overflow: 'hidden',
    flexDirection: 'column' as const,
  },
  posterZone: {
    flex: 1.3,
    position: 'relative' as const,
    overflow: 'hidden' as const,
  },
  cinematicTint: {
    backgroundColor: 'rgba(15,11,6,0.3)',
  },
  posterFade: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    height: 40,
  },
  posterPlaceholder: {
    backgroundColor: colors.ash,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  placeholderGlyph: {
    fontFamily: fonts.ui,
    fontSize: 24,
    color: colors.fog,
  },
  /* ── Dossier Panel ── */
  dossierPanel: {
    flex: 1,
    backgroundColor: colors.soot,
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 36,
  },
  eyebrow: {
    fontFamily: fonts.ui,
    fontSize: 8,
    letterSpacing: 3,
    color: colors.sepia,
    marginBottom: 5,
  },
  rule: {
    height: 1,
    marginBottom: 8,
  },
  filmTitle: {
    fontFamily: fonts.display,
    fontSize: 22,
    color: colors.parchment,
    lineHeight: 26,
    marginBottom: 3,
    ...effects.textGlowSepia,
  },
  filmYear: {
    fontFamily: fonts.ui,
    fontSize: 8,
    letterSpacing: 2.5,
    color: colors.flicker,
    opacity: 0.85,
    marginBottom: 10,
  },
  ratingWrap: {
    alignSelf: 'flex-start' as const,
    marginBottom: 10,
  },
  abandonedBadge: {
    alignSelf: 'flex-start' as const,
    backgroundColor: 'rgba(184,137,26,0.08)',
    borderWidth: 1,
    borderColor: colors.sepiaBorderStrong,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
    marginBottom: 8,
  },
  abandonedText: {
    fontFamily: fonts.ui,
    fontSize: 7,
    color: colors.parchment,
    letterSpacing: 1,
  },
  reviewText: {
    fontFamily: fonts.bodyItalic,
    fontSize: 12,
    color: colors.bone,
    lineHeight: 17,
    opacity: 0.92,
  },
  attribution: {
    fontFamily: fonts.ui,
    fontSize: 8,
    letterSpacing: 1.5,
    color: colors.sepia,
    marginTop: 6,
    opacity: 0.95,
  },
  /* ── Top HUD ── */
  topHud: {
    position: 'absolute' as const,
    top: 16,
    left: 18,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
  },
  hudLogo: {
    width: 10,
    height: 10,
    opacity: 0.7,
  },
  hudText: {
    fontFamily: fonts.ui,
    fontSize: 6,
    letterSpacing: 2,
    color: colors.sepiaBorderStrong,
  },
  /* ── Actions ── */
  shareButton: {
    backgroundColor: colors.sepia,
    paddingVertical: 14,
    borderRadius: 4,
    alignItems: 'center' as const,
  },
  shareButtonText: {
    fontFamily: fonts.uiBold,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.ink,
  },
});
