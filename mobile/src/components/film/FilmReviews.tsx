/**
 * FilmReviews — SOCIETY CRITIQUES, the clippings on the film's dossier.
 * ─────────────────────────────────────────────────────────────────────
 * Compact excerpts of the Society's logs, filed under the film itself.
 * The full index cards live in the archive (film-reviews) and on the
 * Reel; here we show clippings — same ledger handwriting, smaller paper.
 *
 * Laws:
 *   · the ledger row (portrait · handle · crest) is the Reel's own
 *     UserAttributionRow — a log's byline is identical everywhere
 *   · the member's own review lives in YOUR LOG above; it is filtered
 *     out here so nothing on the page prints twice
 *   · four clippings maximum inline; the archive door opens from five
 *   · every clipping carries OPEN LOG → — the door is always visible,
 *     even on a two-line review
 */
import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { XCircle } from 'lucide-react-native';
import { colors, fonts } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { ReelRating } from '@/src/components/Decorative';
import { SectionErrorBoundary } from '@/src/components/SectionErrorBoundary';
import { FilmSectionHeader } from '@/src/components/film/FilmSectionHeader';
import { UserAttributionRow } from '@/src/components/feed/UserAttributionRow';
import { stripHtml } from '@/src/utils/html';
import { extractDropCap } from '@/src/utils/text';
import { timeAgo } from '@/src/utils/timeAgo';
import { isAuteurPlusTier, isArchivistPlusTier } from '@/src/utils/tier';
import SpoilerVeil from '@/src/components/SpoilerVeil';

const INLINE_CLIPPINGS = 4;

interface CommunityReview {
  id: string;
  rating: number;
  review?: string | null;
  status: string;
  abandoned_reason?: string | null;
  created_at: string;
  user_id?: string | null;
  username?: string;
  role?: string;
  avatar_url?: string | null;
  pull_quote?: string | null;
  drop_cap?: boolean | null;
  is_spoiler?: boolean | null;
}

interface FilmReviewsProps {
  filmId: number;
  filmTitle: string;
  reviews: CommunityReview[];
  reviewsError?: any;
  /** The signed-in member's id — their review lives in YOUR LOG, not here. */
  excludeUserId?: string | null;
}

const ClippingCard = memo(function ClippingCard({ review }: { review: CommunityReview }) {
  const nav = useRouter();
  const strippedReview = stripHtml(review.review ?? '');
  const { first: dropCapFirst, rest: dropCapRest } = extractDropCap(strippedReview);

  const isAuteur = isAuteurPlusTier(review.role);
  const isArchivist = isArchivistPlusTier(review.role) && !isAuteur;

  const handleOpenLog = React.useCallback(() => {
    if (review.id) nav.push(`/log/${review.id}` as any);
  }, [nav, review.id]);

  const handleOpenProfile = React.useCallback(() => {
    if (review.username) nav.push(`/user/${encodeURIComponent(review.username)}` as any);
  }, [nav, review.username]);

  return (
    <View style={s.reviewCard}>
      {/**
        * ── THE QUOTE MARK IS GONE ────────────────────────────────────────────
        * It was a 60pt opening quote at `bottom: -22` on a card with
        * `overflow: hidden`: the wrong glyph for the end of a passage, clipped
        * in half, and sitting under OPEN LOG →. Corrected to a whole closing
        * quote it then landed on the words themselves — because this card has
        * no whitespace to host a watermark. Every position is on top of
        * something.
        *
        * So it goes. The card already carries a drop cap, a brass border, an
        * avatar, a rule and the reels; the drop cap alone says "these are
        * somebody's own words". An ornament that can only be placed over the
        * writing is not an ornament on the block that IS the writing.
        */}

      {/* The ledger row — the Reel's own handwriting */}
      <UserAttributionRow
        username={review.username ?? 'anonymous'}
        avatarUrl={review.avatar_url}
        role={review.role}
        timeAgo={timeAgo(review.created_at)}
        onUserPress={handleOpenProfile}
      />

      {/* The verdict line */}
      <View style={s.verdictRow}>
        {review.status === 'abandoned' ? (
          <View style={s.abandonedBadge}>
            <XCircle size={9} color={colors.crimson} strokeWidth={2} />
            <Text style={s.abandonedText} numberOfLines={1}>
              ABANDONED{review.abandoned_reason ? ` — ${review.abandoned_reason.toUpperCase()}` : ''}
            </Text>
          </View>
        ) : review.rating > 0 ? (
          <ReelRating rating={review.rating} size={12} />
        ) : null}
      </View>

      <PressableScale onPress={handleOpenLog} pressedScale={0.99} accessibilityLabel={`Open the full log by ${review.username ?? 'anonymous'}`}>
        {/* COMP-SPOILER-1: veil flagged critiques. */}
        <SpoilerVeil isSpoiler={review.is_spoiler} revealKey={review.id}>
          {review.pull_quote && (
            <View style={[s.pullQuoteWrap, isAuteur && s.pullQuoteWrapAuteur, isArchivist && s.pullQuoteWrapPremium]}>
              <Text style={[s.pullQuote, isAuteur && s.pullQuoteAuteur]}>
                « {review.pull_quote} »
              </Text>
            </View>
          )}
          {strippedReview ? (
            review.drop_cap ? (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <Text style={s.dropCapLetter}>{dropCapFirst}</Text>
                <Text style={[s.reviewText, { flex: 1, marginTop: 4 }]} numberOfLines={7} ellipsizeMode="tail">
                  {dropCapRest}
                </Text>
              </View>
            ) : (
              <Text style={s.reviewText} numberOfLines={7} ellipsizeMode="tail">
                {strippedReview}
              </Text>
            )
          ) : null}
          {/* The door is always visible — even a two-line review opens a room. */}
          <View style={s.cardFooter}>
            {strippedReview.length > 250 ? (
              <Text style={s.readFullText}>READ FULL CRITIQUE →</Text>
            ) : <View />}
            <Text style={s.openLogText}>OPEN LOG →</Text>
          </View>
        </SpoilerVeil>
      </PressableScale>
    </View>
  );
});

export const FilmReviews = memo(function FilmReviews({ filmId, filmTitle, reviews, reviewsError, excludeUserId }: FilmReviewsProps) {
  if (reviewsError) {
    throw reviewsError;
  }

  const nav = useRouter();

  // YOUR LOG owns the member's own critique — nothing prints twice.
  const communityReviews = React.useMemo(() => {
    if (!excludeUserId) return reviews;
    return reviews.filter(r => r.user_id !== excludeUserId);
  }, [reviews, excludeUserId]);

  const clippings = communityReviews.slice(0, INLINE_CLIPPINGS);
  const hasMore = communityReviews.length > INLINE_CLIPPINGS;

  return (
    <SectionErrorBoundary fallbackMessage="Community critiques could not be loaded.">
      <Animated.View style={s.section}>
        <FilmSectionHeader label="SOCIETY CRITIQUES" />

        {clippings.length === 0 ? (
          <View style={s.emptyReviewBox}>
            <Text style={s.emptyReviewTitle}>The projection box awaits.</Text>
            <Text style={s.emptyReviewBody}>No transmissions yet. Log this film to be the first voice in the archive.</Text>
          </View>
        ) : (
          clippings.map((r) => <ClippingCard key={r.id} review={r} />)
        )}

        {hasMore && (
          <PressableScale
            onPress={() => nav.push(`/film-reviews/${filmId}?title=${encodeURIComponent(filmTitle || 'Archive')}` as any)}
            style={s.readAllBtn}
            pressedScale={0.97} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            accessibilityLabel="Read all logs"
          >
            {/**
              * ── A NUMBER YOU CANNOT KNOW MUST NOT BE PRINTED ────────────────
              * This read `READ ALL {communityReviews.length} LOGS`, and both
              * halves were false.
              *
              * The COUNT came from a fetch capped at ten, so a film with two
              * hundred and forty-seven critiques invited you to read all ten
              * of them. And the NOUN was wrong: these are written critiques,
              * not logs — a member can log a film without writing a word, and
              * the screen this opens lists only the writing.
              *
              * The count is not available here and adding a column to carry it
              * would be a migration to print a number nobody asked for. So the
              * false precision goes and the true invitation stays.
              */}
            <Text style={s.readAllText}>READ EVERY CRITIQUE →</Text>
          </PressableScale>
        )}
      </Animated.View>
    </SectionErrorBoundary>
  );
});

const s = StyleSheet.create({
  section: { paddingHorizontal: 20, marginBottom: 24, zIndex: 2 },

  reviewCard: {
    backgroundColor: 'rgba(8,6,4,0.98)', borderWidth: 1, borderColor: colors.sepiaBorder,
    borderRadius: 4, padding: 16, marginTop: 10,
    borderLeftWidth: 3, borderLeftColor: 'rgba(184,137,26,0.4)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 10, elevation: 8,
    position: 'relative', overflow: 'hidden',
  },
  verdictRow: {
    flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center',
    marginTop: 8, marginBottom: 6, minHeight: 14,
  },
  reviewText: { fontFamily: fonts.bodyItalic, fontSize: 13, color: colors.bone, lineHeight: 20, opacity: 0.9 },

  pullQuoteWrap: { marginTop: 2, marginBottom: 8, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: 'rgba(184,137,26,0.4)', paddingVertical: 2 },
  pullQuoteWrapAuteur: { borderLeftColor: colors.crimson, backgroundColor: colors.crimsonFaint, paddingVertical: 6, borderRadius: 2 },
  pullQuoteWrapPremium: { borderLeftColor: colors.sepia, backgroundColor: colors.sepiaSubtle, paddingVertical: 6, borderRadius: 2 },
  pullQuote: { fontFamily: fonts.display, fontSize: 15, color: colors.sepia, lineHeight: 22 },
  pullQuoteAuteur: { color: colors.crimson },
  dropCapLetter: { fontFamily: fonts.display, fontSize: 42, color: colors.sepia, marginRight: 6, marginTop: -4, lineHeight: 42 },

  cardFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 8,
  },
  readFullText: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1, color: colors.sepia, includeFontPadding: false },
  openLogText: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1.5, color: colors.sepia, opacity: 0.8, includeFontPadding: false },

  /**
   * ── UNBOXED, WITH EVERY OTHER EMPTY STATE ON THIS PAGE ────────────────────
   * The dossier, the synopsis and WHERE IT PLAYS all lost their frames this
   * pass. This was the last one left, which made an ABSENCE the most heavily
   * framed thing on the page — a bordered, shadowed, centred box announcing
   * that there is nothing here.
   *
   * The writing is good enough to stand on the ground. The only boxes left are
   * the critique cards themselves, and those are meant to look like cards.
   */
  emptyReviewBox: {
    paddingVertical: 4,
  },
  emptyReviewTitle: { fontFamily: fonts.display, fontSize: 16, letterSpacing: 1, color: colors.sepia, marginBottom: 8 },
  // Left, and readable. It was centred because the box it sat in was centred,
  // and at 0.5 opacity the one line inviting a member to be the first voice
  // here was the faintest text on the page.
  emptyReviewBody: { fontFamily: fonts.body, fontSize: 12, color: colors.fog, fontStyle: 'italic', lineHeight: 20 },

  readAllBtn: {
    marginTop: 12, paddingVertical: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(8,6,4,0.98)', borderRadius: 2,
    borderWidth: 1, borderColor: colors.sepiaBorder,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 10, elevation: 8,
  },
  readAllText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 3, color: colors.sepia, includeFontPadding: false },

  abandonedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.crimsonFaint,
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 2, borderWidth: 1, borderColor: colors.crimsonBorder,
    flexShrink: 1,
  },
  abandonedText: {
    fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1, color: colors.crimson,
    includeFontPadding: false, flexShrink: 1,
  },
});
