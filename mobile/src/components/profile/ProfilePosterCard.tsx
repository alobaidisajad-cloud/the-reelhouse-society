import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Sparkles, X, Film as FilmIcon } from 'lucide-react-native';
import { colors, SEPIA_HASH } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';
import PressableScale from '@/src/components/PressableScale';
import { nav } from '@/src/utils/typedRouter';
import type { ProfileLog, ProfileVaultItem, ProfileWatchlistItem } from '@/src/types';

/** A film in a room's grid (the Archive, the Watchlist): its poster, opening the film. */
interface ProfilePosterCardProps {
  item: ProfileLog | ProfileVaultItem | ProfileWatchlistItem;
  width?: number;
  isAuteurPlus?: boolean;
  isArchivistPlus?: boolean;
}

const s = StyleSheet.create({
  /**
   * BONE, not brass, as the altarpiece frames its films: brass is the colour of
   * ACTION here, and sixteen brass frames in a grid read as a toolbar. Radius
   * 2, as every frame in the house; nothing here is round.
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
    backgroundColor: 'rgba(13,11,9,0.85)',
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
  isAuteurPlus = false,
  isArchivistPlus = false,
}: ProfilePosterCardProps) {
  const log = item as any;
  const posterUri = tmdb.poster(log.altPoster ?? log.poster ?? log.poster_path, 'w185');
  // Whether a glow exists, and the rank picks which.
  const hasGlow = isAuteurPlus || isArchivistPlus;
  const glowStyle = isAuteurPlus ? s.auteurGlow : s.archivistGlow;

  return (
    <PressableScale
      style={[
        s.posterFrame,
        width > 0 ? { width } : { flex: 1 },
        hasGlow ? glowStyle : null,
      ]}
      /**
       * NOTHING, every side explicitly zero. The grids' gaps are 8 and 12, and
       * any slop reaches onto the next poster's face, where the LATER sibling
       * takes the touch; a 79×118pt card is four times the 44pt floor alone.
       */
      hitSlop={{ top: 0, bottom: 0, left: 0, right: 0 }}
      onPress={() => {
        const fid = log.filmId ?? log.film_id;
        if (fid) nav.push(`/film/${fid}`);
      }}
      haptic
      accessibilityRole="button"
      accessibilityLabel={[
        log.title ?? 'Untitled film',
        log.year ? String(log.year) : '',
        log.status && log.status !== 'watched' ? String(log.status) : '',
      ].filter(Boolean).join(', ')}
      accessibilityHint="Opens the film"
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
      {/* Status badges */}
      {log.status === 'rewatched' && (
        <View style={s.statusBadge} pointerEvents="none">
          <Sparkles size={7} color={colors.sepia} strokeWidth={1.5} />
        </View>
      )}
      {log.status === 'abandoned' && (
        <View style={[s.statusBadge, s.statusBadgeAbandoned]} pointerEvents="none">
          <X size={7} color={colors.bloodReel} strokeWidth={2} />
        </View>
      )}
    </PressableScale>
  );
});
