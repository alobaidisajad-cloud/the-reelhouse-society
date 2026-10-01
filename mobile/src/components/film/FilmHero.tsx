import { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/src/components/text';
import Animated from 'react-native-reanimated';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Film as FilmIcon } from 'lucide-react-native';
import { tmdb, formatRuntime, getYear } from '@/src/lib/tmdb';
import { colors, fonts, SEPIA_HASH } from '@/src/theme/theme';
import { ReelRating } from '@/src/components/Decorative';
import { scaledTextProps } from '@/src/constants/textScaling';
import { BRASS, BRASS_STOPS, BRASS_START, BRASS_END, ON_BRASS } from '@/src/theme/brass';
import type { FilmVerdict } from '@/src/services/FilmService';

import type { TMDBMovieDetail } from '@/src/lib/tmdb';
import type { StyleProp, ViewStyle } from 'react-native';
import { EDGE_LIT } from '@/src/theme/light';
import { softBreak } from '@/src/utils/softBreak';

const POSTER_W = 140;
const POSTER_H = POSTER_W * 1.5;

interface FilmHeroProps {
  film: TMDBMovieDetail;
  existingLog: { status?: string; rating?: number; viewCount?: number } | null;
  score: number;
  studios: { name?: string }[];
  /**
   * What the members of this house made of it — never TMDB, and never the
   * length of whichever page of critiques loaded. Null while it is not known
   * (not yet read, or the read failed): the hero then claims nothing.
   */
  verdict: FilmVerdict | null;
  posterGlowStyle: StyleProp<ViewStyle>;
  statusConfig: Record<string, { text: string; Icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }> }>;
}

/**
 * How many members have to have rated a film before the page will call their
 * average "the house".
 *
 * Three is the smallest number that can disagree with itself. One is a member;
 * two is a pair; three is the first point at which an average is describing a
 * body of opinion rather than adding up a couple of people. Below it the line
 * names what it actually is, and the reels still show — a first voice is worth
 * seeing, it just is not a consensus.
 */
export const HOUSE_QUORUM = 3;

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
          <Image
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
          /**
           * ── BRASS, NOT A FLAT GOLD ───────────────────────────────────────
           * The house's ramp, as the stub and the tray wear it: four golds on
           * a diagonal, lit from the top left. A flat fill would read as
           * plastic within an inch of the real thing.
           *
           * Two views, for the same reason the stub needs two: a view that
           * CLIPS a gradient to its corners cannot also cast a shadow on iOS.
           */
          <View style={styles.loggedBadgeOnPoster}>
            <View style={styles.loggedBadgeFace}>
              <LinearGradient
                colors={BRASS}
                locations={BRASS_STOPS}
                start={BRASS_START}
                end={BRASS_END}
                style={StyleSheet.absoluteFill}
              />
              {(() => {
                const cfg = statusConfig[existingLog.status ?? 'watched'];
                const Icon = cfg?.Icon;
                return (
                  <View style={styles.loggedBadgeContent}>
                    {Icon && <Icon size={8} color={ON_BRASS} strokeWidth={2.5} />}
                    <Text style={styles.loggedBadgeText}>{cfg?.text ?? 'LOGGED'}</Text>
                  </View>
                );
              })()}
            </View>
          </View>
        )}
      </View>

      {/* Film Info */}
      <View style={styles.infoBlock}>
        <PrestigeBadge companies={studios} />

        <Text style={styles.filmTitle} adjustsFontSizeToFit numberOfLines={3} minimumFontScale={0.7}>{film.title}</Text>

        {/* softBreak: TMDB sets some taglines as one 45-character word
            ("Sensational...Daring...Unforgettable..."). With nowhere to wrap,
            the phone would break it mid-letter or shrink the whole line below
            the type floor; it wraps after an ellipsis, as a poster would. */}
        {film.tagline ? <Text style={styles.tagline} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.7}>&ldquo;{softBreak(film.tagline)}&rdquo;</Text> : null}

        {/**
          * ── TWO LINES, NOT ONE, AND NOT THREE ──────────────────────────────
          * No chrome for six words of fact, and not one run either (that reads
          * "FANTASY 2H 53M" as one item). What KIND of film, then its
          * particulars, the genres carrying a touch more presence so the eye
          * reads them as different kinds of fact rather than one long string.
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
            * the year where a particular belongs, never in the house's reels:
            * a member must always be able to tell whose verdict is whose.
            */}
          {(film.vote_average ?? 0) > 0 ? `  ·  TMDB ${(film.vote_average ?? 0).toFixed(1)}` : ''}
        </Text>

        {/**
          * ── THE REELS BELONG TO THE HOUSE ──────────────────────────────────
          * They appear only when the house has actually spoken, and when it
          * has not the page SAYS SO — ruled like a title card, which is
          * dignified, and which sets up the invitation further down the page.
          *
          * ── AND "THE HOUSE" HAS TO MEAN MORE THAN ONE PERSON ───────────────
          * A single member's opinion never wears the house's name. Below a
          * quorum the line names what it actually is: one voice, or two. The
          * reels still show, because a first voice IS worth showing — it just
          * is not a consensus, and must not claim to be one.
          *
          * ── AND NOT KNOWING IS NOT SILENCE ─────────────────────────────────
          * A verdict not yet read, or that could not be read, is null: the rule
          * is drawn without its words, and nothing is claimed either way.
          *
          * The count is RATING_COUNT, not log_count. The reels are an average
          * over the people who RATED it; attributing them to everyone who
          * logged it would overstate the very number they rest on.
          */}
        {verdict?.avg_rating ? (
          <View style={styles.verdictRow}>
            <ReelRating rating={verdict.avg_rating} size={18} />
            <Text {...scaledTextProps} style={styles.verdictScore}>{verdict.avg_rating.toFixed(1)}</Text>
            {/* On a 320pt phone at large type this ran 9pt off the screen. An
                ellipsis would cut the count, which is the fact; instead it gives
                back what large type added — down to its designed size, no smaller. */}
            <Text {...scaledTextProps} style={styles.verdictWho} numberOfLines={1}
              adjustsFontSizeToFit minimumFontScale={1 / scaledTextProps.maxFontSizeMultiplier}>
              {verdict.rating_count >= HOUSE_QUORUM
                ? `THE HOUSE · ${verdict.rating_count} VOICES`
                : verdict.rating_count === 1 ? 'ONE VOICE' : `${verdict.rating_count} VOICES`}
            </Text>
          </View>
        ) : verdict ? (
          <View style={styles.silentRow}>
            <View style={styles.silentRule} />
            <Text {...scaledTextProps} style={styles.silentText} numberOfLines={1}>THE HOUSE HAS NOT SPOKEN</Text>
            <View style={styles.silentRule} />
          </View>
        ) : (
          <View testID="verdict-unknown" style={styles.silentRow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View style={styles.silentRule} />
          </View>
        )}

        {/**
          * The rarity stamp, only where it means something. At 26 it reads
          * KNOWN, which tells a member nothing and spends a row saying it.
          * Above 40 it reads INDIE, DEEP CUT, GHOST REEL — and for an app
          * about archive-diving that is one of the most distinctive things on
          * the page.
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
  // A photograph is not a lit surface: the edge light is the empty frame’s.
  poster: {
    width: POSTER_W, height: POSTER_H, borderRadius: 2,
    borderWidth: 1, borderColor: colors.sepiaBorder,
    backgroundColor: colors.surface,
  },
  posterPlaceholder: { ...EDGE_LIT,
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
  // The host carries the glow; it must not clip, or the shadow is lost on iOS.
  loggedBadgeOnPoster: {
    position: 'absolute', bottom: -12, alignSelf: 'center', borderRadius: 3,
    shadowColor: colors.sepia, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 10,
    elevation: 8,
  },
  // The face clips the ramp to the pill's own corners.
  loggedBadgeFace: {
    paddingHorizontal: 14, paddingVertical: 5, borderRadius: 3, overflow: 'hidden',
  },
  loggedBadgeContent: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  loggedBadgeText: { includeFontPadding: false, textAlignVertical: 'center', fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1.2, color: colors.ink },
  infoBlock: { alignItems: 'center', paddingHorizontal: 8, width: '100%' },
  filmTitle: {
    includeFontPadding: false, textAlignVertical: 'center', fontFamily: fonts.display, fontSize: 26, color: colors.parchment,
    textAlign: 'center', lineHeight: 32, marginBottom: 6,
  },
  tagline: {
    includeFontPadding: false, textAlignVertical: 'center', fontFamily: fonts.bodyItalic, fontSize: 14, color: colors.fog,
    textAlign: 'center', marginBottom: 14,
  },
  /** Genres carry a touch more presence than the particulars beneath them —
      that difference is what tells the eye they are two kinds of fact. */
  genreLine: {
    includeFontPadding: false, textAlignVertical: 'center',
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.4, color: colors.bone,
    textAlign: 'center', lineHeight: 16, marginBottom: 5,
  },
  metaLine: {
    includeFontPadding: false, textAlignVertical: 'center',
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.8, color: colors.fog,
    textAlign: 'center', lineHeight: 16.5, marginBottom: 12,
  },

  /** The house's verdict. Nothing else in the app wears these reels. */
  // Wraps: where the reels, the score and "THE HOUSE · 30 VOICES" do not fit on
  // one line (320pt at large type — 30pt short even at the designed size), the
  // count takes the line below, whole, rather than losing its number.
  verdictRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, rowGap: 4, marginBottom: 10 },
  verdictScore: { includeFontPadding: false, fontFamily: fonts.body, fontSize: 13, color: colors.parchment },
  verdictWho: { includeFontPadding: false, fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.1, color: colors.fog, flexShrink: 1 },

  /** And when it has not spoken: a statement, ruled like a title card. Its
      height is held without the words, so a verdict arriving moves nothing. */
  silentRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    alignSelf: 'stretch', paddingHorizontal: 18, marginBottom: 10, minHeight: 14,
  },
  silentRule: { flex: 1, height: 1, backgroundColor: 'rgba(184,137,26,0.22)' },
  silentText: {
    includeFontPadding: false,
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.fog,
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
  prestigeText: { includeFontPadding: false, textAlignVertical: 'center', fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1.6, color: colors.flicker },
  obsBadge: { 
    flexDirection: 'row', alignItems: 'center', gap: 6, 
    paddingHorizontal: 10, paddingVertical: 4, 
    borderWidth: 1, borderRadius: 3, marginBottom: 4,
    backgroundColor: colors.surface,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 3, elevation: 3, 
  },
  obsScore: { includeFontPadding: false, textAlignVertical: 'center', fontFamily: fonts.sub, fontSize: 14 },
  obsLabel: { includeFontPadding: false, textAlignVertical: 'center', fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.3, color: colors.fog },
});
