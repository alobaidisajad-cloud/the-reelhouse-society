/**
 * ActivityCard — a frame of The Reel: one log, as a frame of film.
 * ───────────────────────────────────────────────────────────────
 * Reading order:
 *   who filed it (the byline, its ··· for another member's log)
 *   → the editorial still, when filed, shown whole across the frame, no words on it
 *   → the film: the poster the member chose (over the still's lower edge), title, year, reels,
 *     the slate (WITH, the format, REWATCH)
 *   → the words: the spoiler's leader row, or the pull-quote as a title card and the review
 *     (five lines, two under a quote), READ ON · N WORDS where words were left out
 *   → the breakdown, when scored
 *   → the action band.
 *
 * THE STOCK is the author's rank: the house's card for a Cinephile and an Archivist (the
 * Archivist told by its brass), the Auteur's own card for an Auteur. No glow, no layered paper,
 * no shadow: one flat colour, which a scroll never blends. The frame's height is planned by
 * arithmetic (planReview, breakdownColumns), never measured after it is drawn.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, PixelRatio } from 'react-native';
import { RemoteImage, PosterMark } from '@/src/components/Picture';
import { Text } from '@/src/components/text';
import { nav } from '@/src/utils/typedRouter';
import { memberPath } from '@/src/utils/memberPath';
import { colors, fonts, SEPIA_HASH } from '@/src/theme/theme';
import { displayTextProps, scaledTextProps } from '@/src/constants/textScaling';
import PressableScale from '@/src/components/PressableScale';
import { ReelRating } from '@/src/components/Decorative';
import SpoilerVeil from '@/src/components/SpoilerVeil';
import { ActionDeck } from './ActionDeck';
import { hasRatedAutopsy } from './frame/scores';
import { UserAttributionRow } from './UserAttributionRow';
import { Breakdown } from './frame/Breakdown';
import { FRAME, FRAME_RADIUS, frameInner } from './frame/metrics';
import { planReview, REVIEW, DROP_CAP } from './frame/planReview';
import { isAuteurPlusTier, isArchivistPlusTier } from '@/src/utils/tier';
import { useTimeAgo } from '@/src/hooks/useClock';
import { useTextScale } from '@/src/hooks/useTextScale';
import { useColumnWidth } from '@/src/components/layout/navMetrics';
import { useAuthStore } from '@/src/stores/auth';
import { askAboutLog } from '@/src/components/moderation/LogModerationHost';
import { balancedWidth } from '@/src/components/lobby/measure';
import { stripHTML, isRTLText, spokenExcerpt, OPEN_QUOTE, CLOSE_QUOTE } from '@/src/utils/text';
import { UNSPOKEN } from '@/src/components/dispatch/paper/paperMetrics';
import { counted } from '@/src/utils/counted';
import { hasPhysicalFormat } from '@/src/components/log/logRecord';

import type { FeedItem } from '@/src/schemas/feed.schema';
import { saidStruck, useStruck } from '@/src/components/StruckWords';
import { STRUCK_OPENS } from '@/src/utils/slurs';
export type { FeedItem };

// The still spans the frame: 1074 pixels on a 3x screen, which a 780px image fills nearly whole.
const TMDB_STILL = `https://image.tmdb.org/t/p/${PixelRatio.get() >= 3 ? 'w780' : 'w500'}`;
const TMDB_POSTER = 'https://image.tmdb.org/t/p/w185';
/** The pull-quote's title card: Spectral italic, centred, its lines balanced. */
const QUOTE = { size: 16, line: 22, pad: 16 } as const;

type Rank = 'cine' | 'arch' | 'aut';
/** The rank's inks on its stock; the stock itself is the frame's ground (st.groundHouse, st.groundAuteur). */
const STOCK: Record<Rank, { accent: string; name: string }> = {
  cine: { accent: colors.bone, name: colors.parchment },
  arch: { accent: colors.sepia, name: colors.sepia },
  aut: { accent: colors.sepia, name: colors.sepia },
};

/** The words of a frame: the spoiler's leader row, or the pull-quote's title card and the planned review. */
export const FrameWords = React.memo(function FrameWords({ item, inner, scale, accent, onPress }: {
  item: FeedItem; inner: number; scale: number; accent: string; onPress: () => void;
}) {
  // Each slur struck before the lines are planned, for a reader who asked (StruckWords): the plan
  // measures the words as they will be drawn.
  const struck = useStruck();
  const review = useMemo(() => struck(stripHTML(item.review ?? '')), [item.review, struck]);
  const rtl = useMemo(() => isRTLText(review), [review]);
  const quoteRtl = useMemo(() => isRTLText(item.pull_quote), [item.pull_quote]);
  const quote = struck(item.pull_quote?.trim() || null);
  // A joined script's first letter cannot be lifted out: no drop cap, and the phone sets its lines.
  // Any other is lifted as the record lifts it (planReview: extractDropCap), the whole letter; a
  // review opening on a struck word has no letter of its own to lift.
  const dropCap = !!item.drop_cap && !rtl && !review.startsWith(STRUCK_OPENS);
  const limit = quote ? FRAME.lines.underQuote : FRAME.lines.alone;
  const plan = useMemo(() => (review && !rtl ? planReview(review, { width: inner, scale, limit, dropCap }) : null), [review, rtl, inner, scale, limit, dropCap]);
  // Right-to-left writing is set in the phone's own face, which no table here measures: the phone
  // lays it out once, unseen, and says whether it ran past its lines.
  const [rtlCut, setRtlCut] = useState(false);
  const cut = plan ? plan.cut : rtl && rtlCut;
  const quoteWidth = quote ? balancedWidth(`${OPEN_QUOTE}${quote}${CLOSE_QUOTE}`, 'spectralItalic', QUOTE.size, scale, inner - QUOTE.pad * 2) : 0;
  if (!quote && !review) return null;
  const words = (plan?.words ?? review.split(/\s+/).filter(Boolean).length);
  return (
    <SpoilerVeil isSpoiler={item.is_spoiler} revealKey={item.id} leader>
      <PressableScale onPress={onPress} haptic="selection" pressedScale={0.99} style={st.words} hitSlop={null} testID="log-words"
        accessibilityLabel={`${spokenExcerpt(saidStruck(quote), saidStruck(review))}${cut ? ` Read on, ${counted(words, 'word', 'words')}.` : ''}`}
        accessibilityHint="Opens the whole log">
        {quote ? (
          <View style={st.intertitle}>
            <View style={st.intertitleRule} pointerEvents="none" />
            <Text {...scaledTextProps} style={[st.quote, { width: quoteWidth }, quoteRtl && st.rtl]}>{OPEN_QUOTE}{quote}{CLOSE_QUOTE}</Text>
          </View>
        ) : null}
        {review ? (
          plan ? (
            <View style={quote && st.review} {...UNSPOKEN}>
              {plan.beside.length ? (
                <View style={st.capRow}>
                  {/* The record's initial: one size at every setting (its planned width is this size's). */}
                  <Text style={[st.cap, { color: accent }]} allowFontScaling={false}>{plan.cap}</Text>
                  <View style={st.capLines}>
                    {plan.beside.map((l, i) => <Text key={i} {...scaledTextProps} numberOfLines={1} style={st.line}>{l}</Text>)}
                  </View>
                </View>
              ) : null}
              {plan.under.map((l, i) => <Text key={i} {...scaledTextProps} numberOfLines={1} style={st.line}>{l}</Text>)}
            </View>
          ) : (
            <View style={quote && st.review}>
              <Text {...scaledTextProps} numberOfLines={limit} style={[st.line, st.rtl]}>{review}</Text>
              <View style={st.measure} pointerEvents="none" {...UNSPOKEN}>
                <Text {...scaledTextProps} style={[st.line, st.rtl]} onTextLayout={(e) => setRtlCut(e.nativeEvent.lines.length > limit)}>{review}</Text>
              </View>
            </View>
          )
        ) : null}
        {cut ? (
          <View style={[st.readOn, rtl && st.readOnRtl]} {...UNSPOKEN}>
            <Text {...scaledTextProps} style={[st.readOnWord, { color: accent }]}>READ ON</Text>
            <Text {...scaledTextProps} style={st.readOnCount}>{counted(words, 'WORD', 'WORDS')}</Text>
            <Text {...scaledTextProps} style={[st.readOnWord, { color: accent }]}>›</Text>
          </View>
        ) : null}
      </PressableScale>
    </SpoilerVeil>
  );
});

export const ActivityCard = React.memo(function ActivityCard({ item, onFilmPress }: { item: FeedItem; index: number; onFilmPress?: () => void }) {
  const rank: Rank = isAuteurPlusTier(item.role) ? 'aut' : isArchivistPlusTier(item.role) ? 'arch' : 'cine';
  const stock = STOCK[rank];
  const inner = frameInner(useColumnWidth());
  const scale = useTextScale();
  // The shared timeAgo: past a month it gives the date. Read from the shared clock.
  const relativeTime = useTimeAgo(item.created_at);
  const me = useAuthStore((s) => s.user?.id);
  const struck = useStruck();
  const anothers = !!me && !!item.user_id && me !== item.user_id;
  const autopsy = (item.autopsy ?? undefined) as Record<string, number> | undefined;
  const scored = !!item.is_autopsied && hasRatedAutopsy(autopsy);
  const still = item.editorial_header ? `${TMDB_STILL}${item.editorial_header}` : null;
  // The print the member chose for their log, else the film's own.
  const posterPath = item.alt_poster || item.poster_path;
  const poster = posterPath ? `${TMDB_POSTER}${posterPath}` : null;
  const abandoned = item.status === 'abandoned';
  // The slate: who it was watched with (the name in parchment), the format, a rewatch.
  const slate = [
    item.watched_with ? { key: 'with', word: 'WITH ', name: struck(item.watched_with).toUpperCase() } : null,
    hasPhysicalFormat(item.physical_media) ? { key: 'format', word: (item.physical_media ?? '').trim().toUpperCase() } : null,
    item.status === 'rewatched' ? { key: 'rewatch', word: 'REWATCH' } : null,
  ].filter((x): x is { key: string; word: string; name?: string } => !!x);
  const rated = !abandoned && (item.rating ?? 0) > 0;
  // What the film control says: everything drawn in it, then where it goes.
  const filmSaid = [
    item.film_title, item.year != null ? String(item.year) : null, rated ? `${item.rating} of 5 reels` : null,
    ...slate.map((x) => `${x.word}${x.name ?? ''}`.toLowerCase()), abandoned ? 'abandoned' : null,
  ].filter(Boolean).join(', ') + '. Opens the film.';

  // Host screens already standing on the film (its reviews page) override this, so the poster
  // never stacks a second film page.
  const handleFilmPress = useCallback(() => { if (onFilmPress) return onFilmPress(); nav.push(`/film/${item.film_id}`); }, [item.film_id, onFilmPress]);
  const handleUserPress = useCallback(() => { nav.push(memberPath(String(item.username), item.user_id)); }, [item.username, item.user_id]);
  const handleLogPress = useCallback(() => { nav.push(`/log/${item.id}`); }, [item.id]);
  const handleMore = useCallback(() => {
    if (item.user_id) askAboutLog({ logId: item.id, userId: item.user_id, username: item.username });
  }, [item.id, item.user_id, item.username]);

  return (
    <View style={[st.frame, rank === 'aut' ? st.groundAuteur : st.groundHouse]}>
      <View style={st.byline}>
        <UserAttributionRow username={item.username} avatarUrl={item.avatar_url} role={item.role} timeAgo={relativeTime}
          onUserPress={handleUserPress} ruled={false} nameInk={stock.name} onMore={anothers ? handleMore : undefined} />
      </View>

      {still ? (
        <RemoteImage uri={still} style={st.still} recyclingKey={still} placeholder={{ blurhash: SEPIA_HASH }} contentFit="cover" transition={150} fallback={null} accessible={false} />
      ) : null}

      {/* The film, one control: its poster and its title open the same page, so neither reaches into the other. */}
      <PressableScale onPress={handleFilmPress} haptic="heavy" pressedScale={0.99} hitSlop={null} style={[st.film, still && st.filmOver]}
        accessibilityLabel={filmSaid}>
        <RemoteImage uri={poster} style={st.poster} recyclingKey={`poster-${posterPath ?? item.film_id}`} placeholder={{ blurhash: SEPIA_HASH }} transition={100}
          fallback={<PosterMark style={st.poster} />} />
        <View style={[st.meta, still && st.metaOver]}>
          <Text {...displayTextProps} style={st.title} numberOfLines={3}>{item.film_title}</Text>
          {item.year != null ? <Text {...scaledTextProps} style={st.year}>{item.year}</Text> : null}
          {rated ? <ReelRating rating={item.rating ?? 0} size={16} /> : null}
          {slate.length ? (
            <View style={st.slate}>
              {slate.map((x) => (
                <Text key={x.key} {...scaledTextProps} style={st.slateItem}>
                  {x.word}{x.name ? <Text style={st.slateName}>{x.name}</Text> : null}
                </Text>
              ))}
            </View>
          ) : null}
          {abandoned ? <View style={st.stamp}><Text {...scaledTextProps} style={st.stampText}>ABANDONED</Text></View> : null}
        </View>
      </PressableScale>

      <View style={st.pad}>
        {abandoned && item.abandoned_reason ? <Text {...scaledTextProps} style={st.reason}>{item.abandoned_reason}</Text> : null}
        <FrameWords item={item} inner={inner} scale={scale} accent={stock.accent} onPress={handleLogPress} />
        {scored ? <Breakdown autopsy={autopsy} width={inner} scale={scale} accent={stock.accent} /> : null}
      </View>

      <View style={st.foot}>
        <ActionDeck itemId={item.id} filmId={item.film_id} filmTitle={item.film_title} posterPath={item.poster_path ?? null}
          year={item.year ?? undefined} ownerUsername={item.username} ownerId={item.user_id} certifyCount={item.certify_count} critiqueCount={item.critique_count} />
      </View>
    </View>
  );
});

const st = StyleSheet.create({
  // One frame: flat stock, the film frame's soft corner, the frame line before the next.
  frame: { marginHorizontal: FRAME.margin, marginBottom: FRAME.gap, borderRadius: FRAME_RADIUS },
  // The house's card for a Cinephile and an Archivist; the Auteur's own.
  groundHouse: { backgroundColor: colors.soot },
  groundAuteur: { backgroundColor: colors.sootAuteur },
  byline: { paddingHorizontal: FRAME.pad, paddingTop: FRAME.pad },
  pad: { paddingHorizontal: FRAME.pad },
  still: { height: FRAME.still, marginTop: 12, width: '100%' },
  film: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingHorizontal: FRAME.pad, marginTop: 12 },
  // The poster stands over the still's lower edge; the film's words begin under the still.
  filmOver: { marginTop: -FRAME.overlap },
  poster: { width: FRAME.poster.width, height: FRAME.poster.height, borderRadius: 2, borderWidth: 1, borderColor: colors.inkwell, backgroundColor: colors.posterVoid },
  meta: { flex: 1, minWidth: 0, gap: 6, paddingTop: 1 },
  metaOver: { paddingTop: FRAME.overlap + 10 },
  title: { fontFamily: fonts.display, fontSize: 19, lineHeight: 23, color: colors.silverScreen, includeFontPadding: false },
  year: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 2, color: colors.bone, includeFontPadding: false },
  slate: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 3, marginTop: 2 },
  slateItem: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.4, color: colors.bone, includeFontPadding: false },
  slateName: { color: colors.parchment },
  stamp: { alignSelf: 'flex-start', marginTop: 4, marginLeft: 2, borderWidth: 1.5, borderColor: colors.crimsonInk, paddingHorizontal: 7, paddingTop: 2, paddingBottom: 1, transform: [{ rotate: '-6deg' }] },
  stampText: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 3, color: colors.crimsonInk, includeFontPadding: false },
  reason: { marginTop: 10, fontFamily: fonts.bodyItalic, fontSize: 13, lineHeight: 19, color: colors.bone },
  // The words' own box runs from the film down to the band: the gaps above and below are inside it
  // (the lower one taken back by its margin, so nothing under it moves), so a one-line review is a
  // whole 48 to a finger and reaches into neither neighbour.
  words: { paddingTop: 12, paddingBottom: FRAME.foot, marginBottom: -FRAME.foot },
  intertitle: { backgroundColor: colors.inkwell, borderRadius: 3, paddingVertical: 12, paddingHorizontal: QUOTE.pad, alignItems: 'center' },
  intertitleRule: { position: 'absolute', top: 3, left: 3, right: 3, bottom: 3, borderWidth: 1, borderColor: colors.sepiaBorderStrong, borderRadius: 2 },
  quote: { fontFamily: fonts.serifItalic, fontSize: QUOTE.size, lineHeight: QUOTE.line, color: colors.silverScreen, textAlign: 'center', includeFontPadding: false },
  // Under the quote's title card; under the film, the words' own top is the 12.
  review: { marginTop: 12 },
  capRow: { flexDirection: 'row' },
  cap: { fontFamily: fonts.display, fontSize: DROP_CAP.size, lineHeight: DROP_CAP.line, marginRight: DROP_CAP.gap, marginTop: 3, includeFontPadding: false },
  capLines: { flex: 1, minWidth: 0 },
  line: { fontFamily: fonts.body, fontSize: REVIEW.size, lineHeight: REVIEW.line, color: colors.parchment, includeFontPadding: false },
  rtl: { writingDirection: 'rtl', textAlign: 'right' },
  // The unseen layout of right-to-left words: the review's own box, nothing of it drawn.
  measure: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', opacity: 0 },
  readOn: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, marginBottom: -10 },
  // On the side the review is read from.
  readOnRtl: { justifyContent: 'flex-end' },
  readOnWord: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 2, includeFontPadding: false },
  readOnCount: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 1.4, color: colors.bone, includeFontPadding: false },
  foot: { marginTop: FRAME.foot },
});
