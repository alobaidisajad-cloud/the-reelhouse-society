import { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { Image } from 'expo-image';
import { Film as FilmIcon } from 'lucide-react-native';
import { tmdb, formatRuntime, getYear } from '@/src/lib/tmdb';
import { colors, fonts, SEPIA_HASH } from '@/src/theme/theme';
import { ReelRating } from '@/src/components/Decorative';
import { scaledTextProps } from '@/src/constants/textScaling';
import type { FilmVerdict } from '@/src/services/FilmService';

import type { TMDBMovieDetail } from '@/src/lib/tmdb';
import type { StyleProp, ViewStyle } from 'react-native';

const POSTER_W = 140;
const POSTER_H = POSTER_W * 1.5;
const AnimatedExpoImage = Animated.createAnimatedComponent(Image);

interface FilmHeroProps {
  film: TMDBMovieDetail;
  // `reviews` is gone: the hero used it only to print "N SOCIETY REVIEWS"
  // beside a stranger's score. What the house made of a film now arrives as
  // `verdict`, which is an average and a real count rather than the length of
  // whichever page of written critiques happened to load.
  existingLog: { status?: string; rating?: number; viewCount?: number } | null;
  score: number;
  studios: { name?: string }[];
  /** What the members of this house made of it — never TMDB. */
  verdict: FilmVerdict | null;
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

// GenreTag is gone with the chip row it drew. Genres are now a plain
// letterspaced line: three bordered boxes were three pieces of chrome around
// three words, on a page whose whole revision was about removing exactly that.

export const FilmHero = memo(function FilmHero({
  film,
  existingLog,
  score,
  studios,
  verdict,
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

        <Text style={styles.filmTitle} adjustsFontSizeToFit numberOfLines={3} minimumFontScale={0.7}>{film.title}</Text>

        {film.tagline ? <Text style={styles.tagline} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.7}>&ldquo;{film.tagline}&rdquo;</Text> : null}

        {/**
          * ── TWO LINES, NOT ONE, AND NOT THREE ──────────────────────────────
          * This was a row of bordered genre chips above a strip of icon-and-
          * label pairs: three rows of chrome for six words of fact. Merged into
          * a single run it read as "FANTASY 2H 53M" — one item — because the
          * only thing dividing the genres from the particulars was a space.
          *
          * Two lines, then: what KIND of film, and then its particulars, the
          * genres carrying a touch more presence so the eye reads them as
          * different kinds of fact rather than one long string.
          */}
        {(film.genres?.length ?? 0) > 0 && (
          <Text {...scaledTextProps} style={styles.genreLine} numberOfLines={1}>
            {film.genres!.slice(0, 3).map((g: { name: string }) => g.name.toUpperCase()).join('  ·  ')}
          </Text>
        )}

        <Text {...scaledTextProps} style={styles.metaLine} numberOfLines={1}>
          {formatRuntime(film.runtime).toUpperCase()}
          {'  ·  '}{getYear(film.release_date)}
          {film.production_countries?.[0] ? `  ·  ${film.production_countries[0].iso_3166_1}` : ''}
          {/**
            * TMDB's score is a PARTICULAR, and it sits with the runtime and
            * the year where a particular belongs. It used to wear four brass
            * reels — the house's own language — with `2,317 GLOBAL` beside it,
            * and no member could tell whose verdict either one was.
            */}
          {(film.vote_average ?? 0) > 0 ? `  ·  TMDB ${(film.vote_average ?? 0).toFixed(1)}` : ''}
        </Text>

        {/**
          * ── THE REELS BELONG TO THE HOUSE ──────────────────────────────────
          * They appear only when the house has actually spoken, and when it
          * has not the page SAYS SO — ruled like a title card, which is
          * dignified, and which sets up the invitation further down the page.
          */}
        {verdict?.avg_rating ? (
          <View style={styles.verdictRow}>
            <ReelRating rating={verdict.avg_rating} size={18} />
            <Text {...scaledTextProps} style={styles.verdictScore}>{verdict.avg_rating.toFixed(1)}</Text>
            <Text {...scaledTextProps} style={styles.verdictWho} numberOfLines={1}>
              THE HOUSE · {verdict.log_count} LOG{verdict.log_count === 1 ? '' : 'S'}
            </Text>
          </View>
        ) : (
          <View style={styles.silentRow}>
            <View style={styles.silentRule} />
            <Text {...scaledTextProps} style={styles.silentText} numberOfLines={1}>THE HOUSE HAS NOT SPOKEN</Text>
            <View style={styles.silentRule} />
          </View>
        )}

        {/**
          * The rarity stamp, only where it means something. At 26 it reads
          * KNOWN, which tells a member nothing and spends a row saying it.
          * Above 40 it reads INDIE, DEEP CUT, GHOST REEL — and for an app
          * about archive-diving that is one of the most distinctive things on
          * the page. Deleting it outright was over-eager; gating it is right.
          */}
        {score > 40 && <ObscurityBadge score={score} />}
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
  filmTitle: {
    includeFontPadding: false, textAlignVertical: 'center', fontFamily: fonts.display, fontSize: 26, color: colors.parchment,
    textAlign: 'center', lineHeight: 32, marginBottom: 6,
  },
  tagline: {
    includeFontPadding: false, textAlignVertical: 'center', fontFamily: fonts.bodyItalic, fontSize: 14, color: colors.bone,
    textAlign: 'center', marginBottom: 14, opacity: 0.75,
  },
  /** Genres carry a touch more presence than the particulars beneath them —
      that difference is what tells the eye they are two kinds of fact. */
  genreLine: {
    includeFontPadding: false, textAlignVertical: 'center',
    fontFamily: fonts.sub, fontSize: 9.5, letterSpacing: 1.6, color: colors.bone,
    textAlign: 'center', lineHeight: 15, marginBottom: 5, opacity: 0.85,
  },
  metaLine: {
    includeFontPadding: false, textAlignVertical: 'center',
    fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1, color: colors.fog,
    textAlign: 'center', lineHeight: 15, marginBottom: 12,
  },

  /** The house's verdict. Nothing else in the app wears these reels. */
  verdictRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  verdictScore: { includeFontPadding: false, fontFamily: fonts.body, fontSize: 13, color: colors.parchment },
  verdictWho: { includeFontPadding: false, fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1.4, color: colors.fog },

  /** And when it has not spoken: a statement, ruled like a title card. */
  silentRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    alignSelf: 'stretch', paddingHorizontal: 18, marginBottom: 10,
  },
  silentRule: { flex: 1, height: 1, backgroundColor: 'rgba(184,137,26,0.22)' },
  silentText: {
    includeFontPadding: false,
    fontFamily: fonts.sub, fontSize: 9.5, letterSpacing: 2.2, color: colors.fog,
  },
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
