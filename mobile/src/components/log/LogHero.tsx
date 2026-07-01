 
import React from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { Film as FilmIcon, Star, Archive, X } from 'lucide-react-native';
import { colors } from '@/src/theme/theme';
import { ReelRating } from '@/src/components/Decorative';
import PressableScale from '@/src/components/PressableScale';
import { s } from '@/app/log/_logDetailStyles';

interface LogHeroProps {
  log: {
    film_id: number;
    film_title: string;
    year?: number | null;
    rating: number;
    status: string;
    abandoned_reason?: string | null;
    watched_date?: string | null;
    watched_with?: string | null;
    physical_media?: string | null;
    editorial_header?: string | null;
    alt_poster?: string | null;
    poster_path: string | null;
  };
  profile: {
    username: string;
    role?: string;
  } | null;
  posterUri: string | null | undefined;
  isAuteur: boolean;
  isArchivist: boolean;
  displayTier: string;
  timeAgo: string;
  onPosterLoaded: () => void;
  onPressUser: () => void;
  onPressFilm: () => void;
}

export default function LogHero({
  log,
  profile,
  posterUri,
  isAuteur,
  isArchivist,
  displayTier,
  timeAgo,
  onPosterLoaded,
  onPressUser,
  onPressFilm,
}: LogHeroProps) {
  return (
    <View style={s.logCenter}>
      {/* TOP: User Info — Web: fontSize 0.75rem=12px, ls 0.15em=1.8px, color var(--sepia) */}
      <View style={s.userRow}>
        <View style={s.userRowLeft}>
          <PressableScale style={{ flexShrink: 1 }} onPress={onPressUser} pressedScale={0.95} haptic="selection">
            <Text style={s.userRefText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>@{(profile?.username || 'unknown').toUpperCase()}</Text>
          </PressableScale>
          {displayTier === 'ARCHIVIST' && (
            <View style={s.archivistBadge}>
              <Archive size={7} color={colors.sepia} strokeWidth={1.5} />
              <Text style={s.archivistBadgeText}>ARCHIVIST</Text>
            </View>
          )}
          {displayTier === 'AUTEUR' && (
            <View style={s.auteurBadge}>
              <Star size={7} color={colors.ink} fill={colors.ink} />
              <Text style={s.auteurBadgeLabel}>AUTEUR</Text>
            </View>
          )}
        </View>
        <Text style={s.timestamp}>{timeAgo}</Text>
      </View>

      {/* CENTER: Poster Component — Web: 140x210, radial glow behind for premium */}
      <View style={s.posterSection}>
        {/* Premium radial glow behind poster */}
        {(isAuteur || isArchivist) && posterUri && (
          <View style={[s.posterGlow, isAuteur ? s.posterGlowAuteur : s.posterGlowArchivist]} />
        )}
        <PressableScale onPress={onPressFilm} style={[s.posterBounds, isAuteur && s.posterBoundsAuteur]} pressedScale={0.95} haptic="selection">
          {posterUri ? (
            <Image source={{ uri: posterUri }} style={s.posterCentered} contentFit="cover" cachePolicy="memory-disk" onLoadEnd={onPosterLoaded} />
          ) : (
            <View style={[s.posterCentered, s.posterPlaceholder]}>
              <FilmIcon size={20} color={colors.sepia} strokeWidth={1} />
            </View>
          )}
        </PressableScale>
      </View>

      {/* BOTTOM: Title & Meta — Web: clamp(2rem,8vw,2.75rem), lineHeight 1.1, textShadow 0 4px 12px */}
      <View style={s.titleSection}>
        <PressableScale onPress={onPressFilm} pressedScale={0.95} haptic="selection">
           <Text style={s.logFilmTitle} adjustsFontSizeToFit numberOfLines={3} minimumFontScale={0.8}>{log.film_title}</Text>
        </PressableScale>
        {log.year && <Text style={s.logFilmYear}>{log.year}</Text>}
      </View>

      {log.rating > 0 && (
        <View style={s.ratingWrap}>
          <ReelRating rating={log.rating} size={18} />
        </View>
      )}

      {log.status === 'abandoned' && (
        <View style={s.abandonedWrap}>
          <View style={s.abandonedBadge}>
            <X size={12} color={colors.bloodReel} strokeWidth={2} />
            <Text style={s.abandonedText}>
               ABANDONED{log.abandoned_reason ? ` — ${log.abandoned_reason.toUpperCase()}` : ''}
            </Text>
          </View>
        </View>
      )}

      
      {(log.watched_date || log.watched_with || log.physical_media) && (
         <View style={s.metaRow}>
            {log.watched_date && (
              <Text style={s.metaDateText}>
                 WATCHED {new Date(log.watched_date).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}
              </Text>
            )}
            {log.watched_date && (log.watched_with || log.physical_media) && <Text style={s.metaDot}>·</Text>}
            {log.watched_with && (
              <Text style={s.metaWithText}>
                 WITH {log.watched_with.toUpperCase()}
              </Text>
            )}
            {log.watched_with && log.physical_media && <Text style={s.metaDot}>·</Text>}
            {log.physical_media && (
              <Text style={s.metaFormatText}>
                 FORMAT: {log.physical_media.toUpperCase()}
              </Text>
            )}
         </View>
      )}
    </View>
  );
}
