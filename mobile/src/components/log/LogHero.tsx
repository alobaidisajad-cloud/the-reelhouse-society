import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { RemoteImage, PosterMark } from '@/src/components/Picture';
import { Text } from '@/src/components/text';
import { colors, fonts, SEPIA_HASH } from '@/src/theme/theme';
import { ReelRating } from '@/src/components/Decorative';
import PressableScale from '@/src/components/PressableScale';
import { UserAttributionRow } from '@/src/components/feed/UserAttributionRow';
import { buildFilingMark } from '@/src/components/log/logRecord';
import { displayTextProps, scaledTextProps } from '@/src/constants/textScaling';
import { PAGE } from '@/src/components/log/pageMetrics';
import { ceilingFor } from '@/src/components/lobby/measure';
import { useColumnWidth } from '@/src/components/layout/navMetrics';

/**
 * The opened log's head: the editorial still projected behind the page's bar, falling into the
 * page's own stock, and the film over its lower edge (its poster, title, year and reels, one
 * control to the film's page). With no still, the head is the bar's own height of ink, and the
 * film stands just under it. Then the byline and the slate: who filed it, and the facts of the
 * viewing.
 */
interface LogHeroProps {
  log: {
    film_title: string;
    year?: number | null;
    rating: number;
    status: string;
    abandoned_reason?: string | null;
    watched_date?: string | null;
    watched_with?: string | null;
    physical_media?: string | null;
  };
  profile: { username: string; role?: string; avatar_url?: string | null } | null;
  /** The editorial still, at the projection's size; null for none. */
  stillUri: string | null;
  posterUri: string | null | undefined;
  /** Where the page's bar sits: the safe area's top. */
  barTop: number;
  /** The page's stock: the projection falls into it. */
  ground: string;
  /** The rank's ink for the author's name. */
  nameInk: string;
  timeAgo: string;
  onPosterLoaded: () => void;
  onPressUser: () => void;
  onPressFilm: () => void;
}

/** How tall the projection hangs: the bar, then the still's own room under it. */
export const projectionHeight = (barTop: number, still: boolean) => barTop + PAGE.bar + (still ? PAGE.stillUnderBar : PAGE.plainUnderBar);

export default function LogHero({
  log, profile, stillUri, posterUri, barTop, ground, nameInk, timeAgo, onPosterLoaded, onPressUser, onPressFilm,
}: LogHeroProps) {
  const { watched_date, watched_with, physical_media } = log;
  const filed = React.useMemo(() => buildFilingMark({ watched_date, watched_with, physical_media }), [watched_date, watched_with, physical_media]);
  const abandoned = log.status === 'abandoned';
  const rated = !abandoned && log.rating > 0;
  // The slate: FILED and its date, who it was watched with, the format, a rewatch.
  const slate = [
    ...filed.map((e) => (e.key === 'date' ? { key: e.key, word: 'FILED', value: e.value.toUpperCase() } : { key: e.key, word: '', value: e.value })),
    ...(log.status === 'rewatched' ? [{ key: 'rewatch', word: '', value: 'REWATCH' }] : []),
  ];
  const filmSaid = [log.film_title, log.year ? String(log.year) : null, rated ? `${log.rating} of 5 reels` : null, abandoned ? 'abandoned' : null]
    .filter(Boolean).join(', ') + '. Opens the film.';
  const still = !!stillUri;
  // The title grows with the member's text no further than its longest word fits its line whole.
  const titleRoom = useColumnWidth() - PAGE.pad * 2 - PAGE.poster.width - TITLE_GAP;
  const titleCap = Math.min(displayTextProps.maxFontSizeMultiplier,
    ...log.film_title.split(/\s+/).filter(Boolean).map((w) => ceilingFor(w, 'rye', TITLE_SIZE, 0, titleRoom)));

  return (
    <View>
      <View style={[st.projection, { height: projectionHeight(barTop, still) }, !still && st.plain]}>
        {still ? (
          <>
            <RemoteImage uri={stillUri} style={StyleSheet.absoluteFill} contentFit="cover" placeholder={{ blurhash: SEPIA_HASH }} transition={150} fallback={null} accessible={false} />
            {/* Dark where the bar reads, clear where the still is seen, falling into the page's stock. */}
            <LinearGradient colors={[PAGE.veilTop, PAGE.veilTop2, PAGE.veilClear, ground]} locations={[0, 0.43, 0.68, 1]} style={StyleSheet.absoluteFill} />
          </>
        ) : null}
      </View>

      {/* The film, one control: poster, title, year and reels open the same page. */}
      <PressableScale onPress={onPressFilm} haptic="selection" pressedScale={0.99} hitSlop={null} style={[st.film, still ? st.filmOver : st.filmUnder]}
        accessibilityRole="link" accessibilityLabel={filmSaid}>
        <RemoteImage uri={posterUri} style={st.poster} contentFit="cover" transition={150} onLoadEnd={onPosterLoaded}
          placeholder={{ blurhash: SEPIA_HASH }} fallback={<PosterMark style={st.poster} size={24} />} />
        <View style={st.meta}>
          <Text style={st.title} allowFontScaling maxFontSizeMultiplier={titleCap}>{log.film_title}</Text>
          {/* `!!`: a bare 0 in a && guard renders, and a loose 0 outside a Text is a red screen. */}
          {!!log.year && <Text style={st.year} {...scaledTextProps}>{log.year}</Text>}
          {rated ? <ReelRating rating={log.rating} size={18} /> : null}
        </View>
      </PressableScale>

      <View style={st.byline}>
        <UserAttributionRow username={profile?.username || 'unknown'} avatarUrl={profile?.avatar_url} role={profile?.role}
          timeAgo={timeAgo} onUserPress={onPressUser} ruled={false} nameInk={nameInk} />
        {slate.length ? (
          <View style={st.slate}>
            {slate.map((x) => (
              <Text key={x.key} style={st.slateItem} {...scaledTextProps}>
                {x.word ? `${x.word} ` : ''}<Text style={st.slateValue}>{x.value}</Text>
              </Text>
            ))}
          </View>
        ) : null}
        {abandoned ? (
          <View style={st.abandoned}>
            <View style={st.stamp}><Text style={st.stampText} {...scaledTextProps}>ABANDONED</Text></View>
            {log.abandoned_reason ? <Text style={st.reason} {...scaledTextProps}>{log.abandoned_reason}</Text> : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const TITLE_SIZE = 24;
const TITLE_GAP = 16;

const st = StyleSheet.create({
  projection: { overflow: 'hidden' },
  plain: { backgroundColor: colors.ink },
  film: { flexDirection: 'row', alignItems: 'flex-end', gap: TITLE_GAP, paddingHorizontal: PAGE.pad },
  // Over the still's lower edge; under the bar's ink when there is no still.
  filmOver: { marginTop: -PAGE.overlap },
  filmUnder: { paddingTop: 4 },
  poster: {
    width: PAGE.poster.width, height: PAGE.poster.height, borderRadius: 2,
    borderWidth: 1, borderColor: colors.inkwell, backgroundColor: colors.posterVoid,
  },
  meta: { flex: 1, minWidth: 0, gap: 7, paddingBottom: 2 },
  title: { fontFamily: fonts.display, fontSize: TITLE_SIZE, lineHeight: 28, color: colors.silverScreen },
  year: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 2, color: colors.bone, includeFontPadding: false },
  byline: { paddingHorizontal: PAGE.pad, paddingTop: 18 },
  slate: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 4, marginTop: 12 },
  slateItem: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.4, color: colors.bone, includeFontPadding: false },
  slateValue: { color: colors.parchment },
  abandoned: { marginTop: 14, gap: 10 },
  stamp: {
    alignSelf: 'flex-start', marginLeft: 2, borderWidth: 1.5, borderColor: colors.crimsonInk,
    paddingHorizontal: 7, paddingTop: 2, paddingBottom: 1, transform: [{ rotate: '-4deg' }],
  },
  stampText: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 3, color: colors.crimsonInk, includeFontPadding: false },
  reason: { fontFamily: fonts.bodyItalic, fontSize: 13, lineHeight: 19, color: colors.bone },
});
