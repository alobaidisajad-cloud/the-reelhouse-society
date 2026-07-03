/**
 * ShareCardModal — develops THE NITRATE FILE for the film page.
 * Works for every member on every film: with a log the file carries the
 * verdict and the stamp; without one it's a clean archive frame. The
 * card template itself lives in NitrateFileCard (shared with the log page).
 */
import React, { useRef, useState, memo, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, Share, Pressable, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import TactileEngine from '@/src/utils/TactileEngine';
import { colors, fonts } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';
import PressableScale from '@/src/components/PressableScale';
import { truncateReview } from '@/src/utils/text';
import { stripHtml } from '@/src/utils/html';
import {
  NitrateFileCard,
  NITRATE_CARD_WIDTH,
  NITRATE_CARD_HEIGHT,
  NITRATE_EXPORT_WIDTH,
  NITRATE_EXPORT_HEIGHT,
} from '@/src/components/film/NitrateFileCard';

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
  pullQuote?: string | null;
}

interface ShareCardModalProps {
  visible: boolean;
  onClose: () => void;
  film: ShareFilm | null;
  log?: ShareLog | null;
  username?: string | null;
  memberNo?: number | null;
}

export const ShareCardModal = memo(function ShareCardModal({ visible, onClose, film, log, username, memberNo }: ShareCardModalProps) {
  const viewShotRef = useRef<ViewShot>(null);
  const { width: winW, height: winH } = useWindowDimensions();
  // The preview shrinks to fit ANY phone; the capture always exports full-size.
  const previewScale = Math.min(1, (winW - 72) / NITRATE_CARD_WIDTH, (winH - 240) / NITRATE_CARD_HEIGHT);
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
    TactileEngine.mutate();

    try {
      const uri = await viewShotRef.current.capture();
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: `${film.title} • The Nitrate File`,
        });
      } else {
        const deepLink = `https://reelhouse.app/film/${film.id}`;
        const ratingText = log && log.rating > 0 ? ` • ${log.rating}/5 reels` : '';
        const reviewLine = log?.review ? `\n\n"${truncateReview(stripHtml(log.review))}"` : '';
        await Share.share({
          message: `${film.title}${ratingText}${reviewLine}\n\n• view on ReelHouse: ${deepLink}`.trim(),
        });
      }
      TactileEngine.success();
    } catch (err: unknown) {
      if (__DEV__) console.warn('[NitrateFile] Share failed:', err);
    } finally {
      setSharing(false);
      onClose();
    }
  };

  if (!film) return null;

  const posterToUse = log?.altPoster || film.poster_path;
  const posterUrl = posterToUse ? tmdb.poster(posterToUse, 'w500') : null;

  const isPosterReady = !posterUrl || posterLoaded || posterError;
  const canShare = !sharing && (forceReady || isPosterReady);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View style={s.modalContent}>
          <View style={s.header}>
            <Text style={s.title}>✦ THE NITRATE FILE</Text>
            <PressableScale onPress={onClose} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }} haptic="light" pressedScale={0.96}>
              <Text style={s.closeText}>✕</Text>
            </PressableScale>
          </View>

          <View style={[s.cardWrapper, { width: NITRATE_CARD_WIDTH * previewScale, height: NITRATE_CARD_HEIGHT * previewScale }]}>
            {/* Silent pre-loader: the capture waits until the poster is developed. */}
            {posterUrl && (
              <Image
                source={{ uri: posterUrl }}
                style={s.posterProbe}
                onLoad={() => setPosterLoaded(true)}
                onError={() => setPosterError(true)}
              />
            )}
            <View style={{ transform: [{ scale: previewScale }] }}>
              <ViewShot
                ref={viewShotRef}
                options={{ format: 'png', quality: 1, width: NITRATE_EXPORT_WIDTH, height: NITRATE_EXPORT_HEIGHT }}
                style={s.cardContainer}
              >
                <NitrateFileCard
                  data={{
                    title: film.title,
                    year: film.release_date?.slice(0, 4) || '',
                    posterUrl,
                    rating: log?.rating ?? 0,
                    review: log?.review,
                    pullQuote: log?.pullQuote,
                    status: log?.status ?? null,
                    username,
                    memberNo,
                  }}
                />
              </ViewShot>
            </View>
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
    borderColor: colors.sepiaBorder,
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
    fontFamily: fonts.sub,
    fontSize: 10,
    letterSpacing: 2.5,
    color: colors.sepia,
  },
  closeText: {
    fontFamily: fonts.body,
    fontSize: 18,
    color: colors.fog,
  },
  cardWrapper: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  posterProbe: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  cardContainer: {
    width: NITRATE_CARD_WIDTH,
    height: NITRATE_CARD_HEIGHT,
    backgroundColor: '#040302',
    overflow: 'hidden',
  },
  shareButton: {
    backgroundColor: colors.sepia,
    paddingVertical: 14,
    borderRadius: 4,
    alignItems: 'center',
  },
  shareButtonText: {
    fontFamily: fonts.sub,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.ink,
  },
});
