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

// Exported dimensions so we don't break existing imports
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

const CornerTicks = () => {
  const TICK = 12;
  const THICK = 1.5;
  const corners = [
    { top: 0, left: 0, vTop: true, hLeft: true },
    { top: 0, right: 0, vTop: true, hLeft: false },
    { bottom: 0, left: 0, vTop: false, hLeft: true },
    { bottom: 0, right: 0, vTop: false, hLeft: false },
  ];
  return (
    <>
      {corners.map((p, i) => (
        <View key={i} style={{ position: 'absolute', top: p.top, bottom: p.bottom, left: p.left, right: p.right, width: TICK, height: TICK }}>
          <View style={{ position: 'absolute', top: p.vTop ? 0 : undefined, bottom: p.vTop ? undefined : 0, left: p.hLeft ? 0 : undefined, right: p.hLeft ? undefined : 0, width: TICK, height: THICK, backgroundColor: colors.sepiaBorderStrong }} />
          <View style={{ position: 'absolute', top: p.vTop ? 0 : undefined, bottom: p.vTop ? undefined : 0, left: p.hLeft ? 0 : undefined, right: p.hLeft ? undefined : 0, width: THICK, height: TICK, backgroundColor: colors.sepiaBorderStrong }} />
        </View>
      ))}
    </>
  );
};

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
              
              {/* Inset Border with Ticks */}
              <View style={s.insetBorder} pointerEvents="none">
                <CornerTicks />
              </View>

              {/* 1. Top HUD */}
              <View style={s.topHud}>
                <Text style={s.topHudText}>● ARCHIVE DOSSIER ●</Text>
              </View>

              <View style={s.spacerLg} />

              {/* 2. The Art (Poster) */}
              <View style={s.posterWrapper}>
                <View style={s.posterArt}>
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
                </View>
              </View>

              <View style={s.spacerMd} />

              {/* 3. The Placard (Typography) */}
              <View style={s.placard}>
                <Text style={s.filmTitle} numberOfLines={2} adjustsFontSizeToFit>{film.title}</Text>
                
                <Text style={s.filmMeta}>
                  {film.release_date?.slice(0, 4)}
                </Text>

                {log && log.rating > 0 && (
                  <View style={s.ratingWrap}>
                    <ReelRating rating={log.rating} size={14} />
                  </View>
                )}

                <Text style={s.reviewText} numberOfLines={4}>
                  "{reviewText || 'Classified Analysis'}"
                </Text>

                {username && <Text style={s.attribution}>— @{username.toUpperCase()}</Text>}
              </View>

              <View style={s.spacerMd} />

              {/* 4. Footer Lockup */}
              <View style={s.footerLockup}>
                <RNImage source={require('../../../assets/images/reelhouse-logo.png')} style={s.footerLogo} resizeMode="contain" />
                <Text style={s.footerText}>THE REELHOUSE SOCIETY</Text>
              </View>

            </ViewShot>
          </View>

          {(() => {
            const isPosterReady = !posterUrl || posterLoaded || posterError;
            const canShare = !sharing && (forceReady || isPosterReady);
            return (
              <PressableScale style={s.shareButton} onPress={handleShare} disabled={!canShare} haptic="medium" pressedScale={0.98}>
                <Text style={s.shareButtonText}>
                  {sharing ? 'TRANSMITTING...' : (!canShare ? 'DEVELOPING...' : 'SHARE TO SOCIALS')}
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
  
  /* ── Exhibition Print Layout ── */
  cardContainer: {
    width: DOSSIER_CARD_WIDTH,
    height: DOSSIER_CARD_HEIGHT,
    backgroundColor: colors.ink, // Pure Nitrate background
    borderRadius: 4,
    overflow: 'hidden',
    flexDirection: 'column',
    padding: 14, // Margin for the inner frame
  },
  insetBorder: {
    ...StyleSheet.absoluteFillObject,
    margin: 14,
    borderWidth: 1,
    borderColor: colors.sepiaBorder,
  },
  
  // HUD
  topHud: {
    alignItems: 'center',
    marginTop: 4,
  },
  topHudText: {
    fontFamily: fonts.ui,
    fontSize: 8,
    letterSpacing: 3,
    color: colors.sepia,
    opacity: 0.8,
  },

  spacerLg: { flex: 0.8 },
  spacerMd: { flex: 1 },

  // Art
  posterWrapper: {
    alignItems: 'center',
    width: '100%',
  },
  posterArt: {
    width: 220,
    height: 330, // Perfect 2:3 aspect ratio
    backgroundColor: colors.soot,
    ...effects.shadowPrimary, // Lift the poster off the page
    borderWidth: 1,
    borderColor: 'rgba(196,150,26,0.15)',
  },
  posterPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderGlyph: {
    fontFamily: fonts.ui,
    fontSize: 24,
    color: colors.fog,
  },

  // Placard
  placard: {
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  filmTitle: {
    fontFamily: fonts.display,
    fontSize: 24,
    lineHeight: 28,
    color: colors.parchment,
    textAlign: 'center',
    marginBottom: 6,
    ...effects.textGlowSepia,
  },
  filmMeta: {
    fontFamily: fonts.ui,
    fontSize: 9,
    letterSpacing: 2,
    color: colors.flicker,
    opacity: 0.85,
    marginBottom: 12,
  },
  ratingWrap: {
    marginBottom: 12,
  },
  reviewText: {
    fontFamily: fonts.bodyItalic,
    fontSize: 12,
    color: colors.bone,
    lineHeight: 18,
    textAlign: 'center',
    opacity: 0.95,
  },
  attribution: {
    fontFamily: fonts.ui,
    fontSize: 8,
    letterSpacing: 1.5,
    color: colors.sepia,
    marginTop: 8,
    opacity: 0.9,
  },

  // Footer Lockup
  footerLockup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 2,
  },
  footerLogo: {
    width: 12,
    height: 12,
    opacity: 0.8,
  },
  footerText: {
    fontFamily: fonts.ui,
    fontSize: 7,
    letterSpacing: 3,
    color: colors.sepiaBorderStrong,
  },

  /* ── Actions ── */
  shareButton: {
    backgroundColor: colors.sepia,
    paddingVertical: 14,
    borderRadius: 4,
    alignItems: 'center',
  },
  shareButtonText: {
    fontFamily: fonts.uiBold,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.ink,
  },
});
