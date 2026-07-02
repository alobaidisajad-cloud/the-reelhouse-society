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
  posterImg: { 
    width: '100%', 
    height: '100%', 
    borderRadius: 4, 
    borderWidth: StyleSheet.hairlineWidth, 
    borderColor: 'rgba(184,137,26,0.2)' 
  },
  posterPlaceholder: { 
    backgroundColor: '#050402', 
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
  const glowStyle = isAuteurPlus ? s.auteurGlow : isArchivistPlus ? s.archivistGlow : {};
  
  return (
    <PressableScale
      key={log.id ?? log.filmId ?? log.film_id}
      style={[
        { aspectRatio: 2 / 3, position: 'relative' }, 
        width > 0 ? { width } : { flex: 1 }, 
        isArchivistPlus ? glowStyle : {}
      ]}
      onPress={() => {
        if (navigateToLog && log.id) {
          (router.push as any)(`/log/${log.id}` as any);
        } else {
          const fid = log.filmId ?? log.film_id;
          if (fid) (router.push as any)(`/film/${fid}` as any);
        }
      }}
      haptic
    >
      {posterUri ? (
        <Image 
          source={{ uri: posterUri }} 
          style={s.posterImg} 
          cachePolicy="memory-disk" 
          placeholder={{ blurhash: SEPIA_HASH }} 
          transition={200} 
        />
      ) : (
        <View style={[s.posterImg, s.posterPlaceholder]}>
          <FilmIcon size={18} color={colors.sepia} strokeWidth={1} />
        </View>
      )}
      {/* Bottom gradient overlay */}
      {(showRating || showTimeAgo) && (
        <View style={s.posterBottomGrad}>
          {showRating && log.rating > 0 && (
            <View style={s.posterRatingRow}>
              <ReelRating rating={log.rating} size={10} />
            </View>
          )}
          {showTimeAgo && (
            <Text style={s.posterTimeAgo}>
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
