import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Sparkles, X, Film as FilmIcon } from 'lucide-react-native';
import { colors, fonts, SEPIA_HASH } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';
import PressableScale from '@/src/components/PressableScale';
import { ReelRating } from '@/src/components/Decorative';
import { timeAgo } from '@/src/utils/timeAgo';
import type { ProfileLog, ProfileVaultItem, ProfileWatchlistItem } from '@/src/types';
import { scaledTextProps } from '@/src/constants/textScaling';

interface ProfilePosterCardProps {
  item: ProfileLog | ProfileVaultItem | ProfileWatchlistItem;
  width?: number;
  showRating?: boolean;
  showTimeAgo?: boolean;
  navigateToLog?: boolean;
  isAuteurPlus?: boolean;
  isArchivistPlus?: boolean;
}

const s = StyleSheet.create({
  /**
   * BONE, not brass.
   *
   * Every poster in the app was framed in a brass hairline — while the
   * altarpiece on the member's own profile, three scrolls up, frames its films
   * in bone. Brass is the colour of ACTION here: a picture frame that glows
   * like a button reads as a control, and sixteen of them in a grid read as a
   * toolbar. Radius drops 4 → 2 to match the frames upstairs and the rest of
   * the house; nothing in this app is round.
   */
  posterImg: {
    width: '100%',
    height: '100%',
    borderRadius: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(232,223,208,0.14)',
  },
  /** No inner hairline under a tier glow — two borders 1pt apart is a smudge. */
  posterImgGlowed: { borderWidth: 0 },
  /**
   * Four points of nothing, just inside the frame: the difference between a
   * picture on a wall and an image in a box. The altarpiece's mount board,
   * scaled from 4 to 3 for a cell a third the width of its centre panel.
   */
  mountBoard: {
    position: 'absolute',
    top: 3, left: 3, right: 3, bottom: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(232,223,208,0.10)',
    borderRadius: 1,
    // No zIndex: paint order alone puts it over the image and under the rating
    // bar and the status badge, which is exactly right. A zIndex here would
    // have drawn a hairline straight across the badges.
  },
  posterPlaceholder: { 
    backgroundColor: colors.posterVoid, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  posterBottomGrad: {
    position: 'absolute', 
    bottom: 0, 
    left: 0, 
    right: 0,
    padding: 4, 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.65)', 
    borderBottomLeftRadius: 4, 
    borderBottomRightRadius: 4,
    overflow: 'hidden', 
    flexWrap: 'wrap',
  },
  posterRatingRow: { 
    flexDirection: 'row', 
    gap: 2 
  },
  posterTimeAgo: {
    fontFamily: fonts.sub,
    fontSize: 7,
    letterSpacing: 1,
    color: colors.fog,
  },
  auteurGlow: {
    borderWidth: 1,
    borderColor: 'rgba(139,26,26,0.6)', // ruby family — bloodReel was invisible
    borderRadius: 2,
    borderStyle: 'solid',
  },
  archivistGlow: {
    borderWidth: 1,
    borderColor: 'rgba(196,150,26,0.5)', // champagne — the Archivist metal
    borderRadius: 2,
    borderStyle: 'solid',
  },
  posterFrame: { aspectRatio: 2 / 3, position: 'relative' },
  statusBadge: { 
    position: 'absolute', 
    top: 4, 
    right: 4, 
    backgroundColor: 'rgba(10,7,3,0.85)', 
    borderWidth: 1, 
    borderColor: 'rgba(184,137,26,0.35)', 
    borderRadius: 2, 
    paddingHorizontal: 4, 
    paddingVertical: 2 
  },
  statusBadgeAbandoned: { 
    borderColor: 'rgba(139,30,30,0.4)' 
  },
});

export const ProfilePosterCard = React.memo(function ProfilePosterCard({
  item,
  width = 0,
  showRating = false,
  showTimeAgo = false,
  navigateToLog = false,
  isAuteurPlus = false,
  isArchivistPlus = false,
}: ProfilePosterCardProps) {
  const router = useRouter();
  const log = item as any;
  const posterUri = tmdb.poster(log.altPoster ?? log.poster ?? log.poster_path, 'w185');
  // `isAuteurPlus` used to be computed and then thrown away unless
  // `isArchivistPlus` also happened to be true — which it always is, since
  // Auteur outranks Archivist, but the expression said the opposite of what it
  // meant. One flag now decides whether a glow exists, and rank picks which.
  const hasGlow = isAuteurPlus || isArchivistPlus;
  const glowStyle = isAuteurPlus ? s.auteurGlow : s.archivistGlow;

  return (
    <PressableScale
      key={log.id ?? log.filmId ?? log.film_id}
      style={[
        s.posterFrame,
        width > 0 ? { width } : { flex: 1 },
        hasGlow ? glowStyle : null,
      ]}
      /**
       * NOTHING. Not a partial object — every side, explicitly zero.
       *
       * This card is the most-repeated control in the app: sixteen to a screen
       * in the Archive, nine in the Watchlist, and it had no hitSlop at all, so
       * it inherited PressableScale's 15pt on all four sides. The grids it sits
       * in have gaps of 8 and 12 — meaning each poster reached 15pt into a gap
       * of 8 and 7pt past it, onto the FACE of the next poster. Both platforms
       * hand an overlapping touch to the LATER sibling, so the right-hand 7pt
       * of every poster in every grid opened the film beside it.
       *
       * A 79×118pt card is four times the 44pt floor on its own; the halo was
       * pure surplus, and surplus is exactly how a control takes its
       * neighbour's taps.
       */
      hitSlop={{ top: 0, bottom: 0, left: 0, right: 0 }}
      onPress={() => {
        if (navigateToLog && log.id) {
          (router.push as any)(`/log/${log.id}` as any);
        } else {
          const fid = log.filmId ?? log.film_id;
          if (fid) (router.push as any)(`/film/${fid}` as any);
        }
      }}
      haptic
      accessibilityRole="button"
      accessibilityLabel={[
        log.title ?? 'Untitled film',
        log.year ? String(log.year) : '',
        showRating && log.rating > 0 ? `rated ${log.rating} of 5` : '',
        log.status && log.status !== 'watched' ? String(log.status) : '',
      ].filter(Boolean).join(', ')}
      accessibilityHint={navigateToLog ? 'Opens your log' : 'Opens the film'}
    >
      {posterUri ? (
        <Image
          source={{ uri: posterUri }}
          style={[s.posterImg, hasGlow && s.posterImgGlowed]}
          recyclingKey={posterUri}
          cachePolicy="memory-disk"
          placeholder={{ blurhash: SEPIA_HASH }}
          transition={200}
        />
      ) : (
        <View style={[s.posterImg, hasGlow && s.posterImgGlowed, s.posterPlaceholder]}>
          <FilmIcon size={18} color={colors.sepia} strokeWidth={1} />
        </View>
      )}
      {/* RN has no ::after — the mount board is a real view, and it must never
          intercept the tap that belongs to the frame beneath it. */}
      <View style={s.mountBoard} pointerEvents="none" />
      {/* Bottom gradient overlay */}
      {(showRating || showTimeAgo) && (
        <View style={s.posterBottomGrad}>
          {showRating && log.rating > 0 && (
            <View style={s.posterRatingRow}>
              <ReelRating rating={log.rating} size={10} />
            </View>
          )}
          {showTimeAgo && (
            <Text {...scaledTextProps} style={s.posterTimeAgo}>
              {timeAgo(log.watchedDate ?? log.createdAt)}
            </Text>
          )}
        </View>
      )}
      {/* Status badges */}
      {log.status === 'rewatched' && (
        <View style={s.statusBadge}>
          <Sparkles size={7} color={colors.sepia} strokeWidth={1.5} />
        </View>
      )}
      {log.status === 'abandoned' && (
        <View style={[s.statusBadge, s.statusBadgeAbandoned]}>
          <X size={7} color={colors.bloodReel} strokeWidth={2} />
        </View>
      )}
    </PressableScale>
  );
});
