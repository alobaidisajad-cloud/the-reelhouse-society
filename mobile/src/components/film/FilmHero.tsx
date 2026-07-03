import { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { Image } from 'expo-image';
import { Clock, Globe, Film as FilmIcon } from 'lucide-react-native';
import { tmdb, formatRuntime, getYear } from '@/src/lib/tmdb';
import { colors, fonts, SEPIA_HASH } from '@/src/theme/theme';
import { ReelRating } from '@/src/components/Decorative';

import type { TMDBMovieDetail } from '@/src/lib/tmdb';
import type { StyleProp, ViewStyle } from 'react-native';

const POSTER_W = 140;
const POSTER_H = POSTER_W * 1.5;
const AnimatedExpoImage = Animated.createAnimatedComponent(Image);

interface FilmHeroProps {
  film: TMDBMovieDetail;
  reviews: { id: string; author?: string; content?: string }[];
  existingLog: { status?: string; rating?: number; viewCount?: number } | null;
  score: number;
  studios: { name?: string }[];
  posterGlowStyle: StyleProp<ViewStyle>;
  statusConfig: Record<string, { text: string; Icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }> }>;
}

const PRESTIGE_STUDIOS = ['A24', 'NEON', 'MUBI', 'Criterion', 'Janus Films', 'Oscilloscope', 'Kino Lorber'];

const PrestigeBadge = memo(function PrestigeBadge({ companies }: { companies: { name?: string }[] }) {
  const match = companies?.find((c) => PRESTIGE_STUDIOS.some(p => c.name?.toLowerCase().includes(p.toLowerCase())));
  if (!match) return null;
  return (
    <View style={sub.prestigeBadge}>
      <FilmIcon size={12} color={colors.flicker} strokeWidth={2.0} />
      <Text style={sub.prestigeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{match.name?.toUpperCase()}</Text>
    </View>
  );
});

const ObscurityBadge = memo(function ObscurityBadge({ score }: { score: number }) {
  if (score <= 0) return null;
  const label = score > 80 ? 'GHOST REEL' : score > 60 ? 'DEEP CUT' : score > 40 ? 'INDIE' : score > 20 ? 'KNOWN' : 'MAINSTREAM';
  const color = score > 70 ? colors.sepia : score > 40 ? colors.bone : colors.fog;
  return (
    <View style={[sub.obsBadge, { borderColor: color }]}>
      <Text style={[sub.obsScore, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{score}</Text>
      <Text style={sub.obsLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{label}</Text>
    </View>
  );
});

const GenreTag = memo(function GenreTag({ name }: { name: string }) {
  return (
    <View style={styles.genreTag}>
      <Text style={styles.genreText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{(name || '').toUpperCase()}</Text>
    </View>
  );
});

export const FilmHero = memo(function FilmHero({
  film,
  reviews,
  existingLog,
  score,
  studios,
  posterGlowStyle,
  statusConfig
}: FilmHeroProps) {
  return (
    <Animated.View style={styles.heroSection}>
      {/* Poster */}
      <View style={styles.posterWrap}>
        <Animated.View style={[styles.posterGlow, posterGlowStyle]} />
        {film.poster_path ? (
          <AnimatedExpoImage
            sharedTransitionTag={`poster-${film.id}`}
            source={{ uri: tmdb.poster(film.poster_path, 'w342') }}
            style={styles.poster}
            cachePolicy="memory-disk"
            placeholder={{ blurhash: SEPIA_HASH }}
            transition={300}
            accessibilityLabel={`${film.title} movie poster`}
          />
        ) : (
          <View style={[styles.poster, styles.posterPlaceholder]}>
            <Text style={styles.posterPlaceholderText}>NO POSTER</Text>
          </View>
        )}
        <View style={styles.scanlines} />
        {existingLog && (
          <View style={styles.loggedBadgeOnPoster}>
            {(() => {
              const cfg = statusConfig[existingLog.status ?? 'watched'];
              const Icon = cfg?.Icon;
              return (
                <View style={styles.loggedBadgeContent}>
                  {Icon && <Icon size={8} color={colors.ink} strokeWidth={2.5} />}
                  <Text style={styles.loggedBadgeText}>{cfg?.text ?? 'LOGGED'}</Text>
                </View>
              );
            })()}
          </View>
        )}
      </View>

      {/* Film Info */}
      <View style={styles.infoBlock}>
        <PrestigeBadge companies={studios} />

        {(film.genres?.length ?? 0) > 0 && (
          <View style={styles.genreRow}>
            {film?.genres?.slice(0, 3).map((g: { id: number; name: string }) => <GenreTag key={g.id} name={g.name} />)}
          </View>
        )}

        <Text style={styles.filmTitle} adjustsFontSizeToFit numberOfLines={3} minimumFontScale={0.7}>{film.title}</Text>

        {film.tagline ? <Text style={styles.tagline} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.7}>&ldquo;{film.tagline}&rdquo;</Text> : null}

        {/* Meta strip */}
        <View style={styles.metaStrip}>
          <View style={styles.metaItem}>
            <Clock size={10} color={colors.fog} strokeWidth={1.5} />
            <Text style={styles.metaText}>{formatRuntime(film.runtime)}</Text>
          </View>
          <Text style={styles.metaDot}>·</Text>
          <Text style={styles.metaText}>{getYear(film.release_date)}</Text>
          {film.production_countries?.[0] && (
            <>
              <Text style={styles.metaDot}>·</Text>
              <View style={styles.metaItem}>
                <Globe size={10} color={colors.fog} strokeWidth={1.5} />
                <Text style={styles.metaText}>{film.production_countries[0].iso_3166_1}</Text>
              </View>
            </>
          )}
        </View>

        {/* Rating */}
        <View style={styles.ratingRow}>
          <ReelRating rating={Math.round(film.vote_average ?? 0) / 2} size={18} />
          <Text style={styles.ratingText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {(film.vote_average ?? 0).toFixed(1)} · {reviews.length > 0 ? `${reviews.length}${reviews.length >= 10 ? '+' : ''} SOCIETY REVIEW${reviews.length === 1 ? '' : 'S'}` : (film.vote_count ?? 0) > 0 ? `${(film.vote_count ?? 0).toLocaleString()} GLOBAL` : 'AWAITING RATINGS'}
          </Text>
        </View>

        <ObscurityBadge score={score} />
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  heroSection: { paddingHorizontal: 20, alignItems: 'center', zIndex: 2, marginBottom: 8 },
  posterWrap: { position: 'relative', marginBottom: 20 },
  posterGlow: {
    position: 'absolute',
    top: 5, left: -5, right: -5, bottom: -5,
    backgroundColor: 'rgba(184,137,26,0.25)',
    borderRadius: 8,
    boxShadow: '0 0 20px rgba(184, 137, 26, 0.8)',
    shadowColor: colors.sepia, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 20,
  },
  poster: {
    width: POSTER_W, height: POSTER_H, borderRadius: 2,
    borderWidth: 1, borderColor: colors.sepiaBorder,
    backgroundColor: colors.surface,
  },
  posterPlaceholder: { 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  posterPlaceholderText: { includeFontPadding: false, textAlignVertical: 'center', fontFamily: fonts.sub, fontSize: 10, color: colors.fog, letterSpacing: 2 },
  scanlines: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 6, opacity: 0.04,
    backgroundColor: 'transparent',
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)',
  },
  loggedBadgeOnPoster: {
    position: 'absolute', bottom: -12, alignSelf: 'center',
    paddingHorizontal: 14, paddingVertical: 5, borderRadius: 3,
    backgroundColor: colors.sepia,
    shadowColor: colors.sepia, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 10,
    elevation: 8,
  },
  loggedBadgeContent: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  loggedBadgeText: { includeFontPadding: false, textAlignVertical: 'center', fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1.5, color: colors.ink },
  infoBlock: { alignItems: 'center', paddingHorizontal: 8, width: '100%' },
  genreRow: { flexDirection: 'row', gap: 6, marginBottom: 12, flexWrap: 'wrap', justifyContent: 'center' },
  genreTag: {
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: colors.sepiaBorder, borderRadius: 2,
    backgroundColor: colors.surface,
  },
  genreText: { includeFontPadding: false, textAlignVertical: 'center', fontFamily: fonts.sub, fontSize: 8, letterSpacing: 2, color: colors.sepia },
  filmTitle: {
    includeFontPadding: false, textAlignVertical: 'center', fontFamily: fonts.display, fontSize: 26, color: colors.parchment,
    textAlign: 'center', lineHeight: 32, marginBottom: 6,
  },
  tagline: {
    includeFontPadding: false, textAlignVertical: 'center', fontFamily: fonts.bodyItalic, fontSize: 14, color: colors.bone,
    textAlign: 'center', marginBottom: 14, opacity: 0.75,
  },
  metaStrip: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { includeFontPadding: false, textAlignVertical: 'center', fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1, color: colors.fog },
  metaDot: { fontSize: 8, color: colors.sepiaBorderStrong },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  ratingText: { includeFontPadding: false, textAlignVertical: 'center', fontFamily: fonts.body, fontSize: 12, color: colors.bone, opacity: 0.7 },
});

const sub = StyleSheet.create({
  prestigeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 2,
    borderWidth: 1, borderColor: colors.sepiaBorderBold,
    backgroundColor: colors.surface,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 4, elevation: 4,
    marginBottom: 12, alignSelf: 'center',
  },
  prestigeText: { includeFontPadding: false, textAlignVertical: 'center', fontFamily: fonts.sub, fontSize: 8, letterSpacing: 2, color: colors.flicker },
  obsBadge: { 
    flexDirection: 'row', alignItems: 'center', gap: 6, 
    paddingHorizontal: 10, paddingVertical: 4, 
    borderWidth: 1, borderRadius: 3, marginBottom: 4,
    backgroundColor: colors.surface,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 3, elevation: 3, 
  },
  obsScore: { includeFontPadding: false, textAlignVertical: 'center', fontFamily: fonts.sub, fontSize: 14 },
  obsLabel: { includeFontPadding: false, textAlignVertical: 'center', fontFamily: fonts.sub, fontSize: 8, letterSpacing: 2, color: colors.fog },
});
