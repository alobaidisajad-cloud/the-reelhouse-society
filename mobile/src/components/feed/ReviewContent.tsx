import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { colors, fonts } from '@/src/theme/theme';
import { ReelRating } from '@/src/components/Decorative';
import PressableScale from '@/src/components/PressableScale';
import SpoilerVeil from '@/src/components/SpoilerVeil';
import { stripHTML, isRTLText } from '@/src/utils/text';
import { scaledTextProps, displayTextProps } from '@/src/constants/textScaling';

import type { FeedItem } from '@/src/schemas/feed.schema';

/** The preview cap. The read-more affordance is derived from it, not guessed. */
const PREVIEW_LINES = 8;

interface VerdictProps {
  item: Pick<FeedItem, 'status' | 'abandoned_reason' | 'rating' | 'watched_with'>;
}

interface ProseProps {
  item: Pick<FeedItem, 'id' | 'rating' | 'pull_quote' | 'review' | 'drop_cap' | 'role' | 'is_spoiler'>;
  isPremium: boolean;
  isAuteur: boolean;
  onPress: () => void;
}

/**
 * VerdictBlock — the film-column verdict on the index card:
 * rating reels (or the abandoned stamp) and the ♡ WITH companion line.
 * Lives beside the poster, under the title.
 */
export const VerdictBlock = React.memo(function VerdictBlock({ item }: VerdictProps) {
  return (
    <View>
      {item.status === 'abandoned' ? (
        <View style={s.abandonedWrap}>
          <View style={s.abandonedInner}>
            <Text style={s.abandonedText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              ABANDONED{item.abandoned_reason ? ` — ${item.abandoned_reason.toUpperCase()}` : ''}
            </Text>
          </View>
        </View>
      ) : (item.rating ?? 0) > 0 ? (
        <View style={s.ratingWrap}><ReelRating rating={item.rating ?? 0} size={13} /></View>
      ) : null}

      {item.watched_with && (
        <Text style={s.watchedWith} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          ♡ WITH <Text style={s.watchedWithName}>{item.watched_with.toUpperCase()}</Text>
        </Text>
      )}
    </View>
  );
});

/**
 * ReviewContent — the full-width critique prose beneath the film row:
 * pull quote (4-line cap), review preview (drop cap honored), read-more.
 * Spoiler-veiled and keyed by item id so reveals never leak across
 * recycled FlashList rows.
 */
export const ReviewContent = React.memo(function ReviewContent({ item, isPremium, isAuteur, onPress }: ProseProps) {
  // The shared cleaner, not a second copy. This file used to carry its own,
  // and the two disagreed on entities, unknown tags and paragraph breaks — so
  // a review read one way here and another on its own page.
  //
  // Still memoized: the regex work is O(N) and this runs inside FlashList's
  // render path, where a re-cleaned review is a dropped frame.
  const cleanReview = React.useMemo(() => stripHTML(item.review ?? ''), [item.review]);

  // Whether this member wrote right-to-left. Decided from the text itself, not
  // from the device's locale — an Arabic review on an English phone is still
  // Arabic, and this is the app's own members we are talking about.
  const rtl = React.useMemo(() => isRTLText(item.pull_quote || cleanReview), [item.pull_quote, cleanReview]);

  // Did the preview actually clip? onTextLayout reports the lines that were
  // laid out, so this asks the same question the cap answers instead of
  // guessing from character count.
  const [truncated, setTruncated] = React.useState(false);
  const onLayout = React.useCallback((e: { nativeEvent: { lines: unknown[] } }) => {
    setTruncated(e.nativeEvent.lines.length >= PREVIEW_LINES);
  }, []);

  if (!item.pull_quote && !cleanReview) return null;

  return (
    <PressableScale
      onPress={onPress}
      haptic="selection"
      pressedScale={0.98}
      style={s.pressable}
      // 10pt under the title at its tightest (no year, no rating) and 14pt above
      // the deck. At the default 15 a tap just below the review certified it.
      hitSlop={{ top: 5, bottom: 7, left: 15, right: 15 }}
      accessibilityLabel="Read full review"
    >
      <SpoilerVeil isSpoiler={item.is_spoiler} revealKey={item.id} compact>
        {/* Pull quote — capped at 4 lines so no quote can swallow the card */}
        {item.pull_quote && (
          <View style={s.pullQuoteWrap}>
            <Text style={[s.pullQuote, isAuteur && s.pullQuoteAuteur, isPremium && !isAuteur && s.pullQuotePremium, rtl && s.rtl]} {...displayTextProps} numberOfLines={4}>
              « {item.pull_quote} »
            </Text>
          </View>
        )}

        {/* Review text.
            A drop cap is suppressed for right-to-left prose: Arabic letters
            join, so lifting the first one out leaves an isolated form and a
            broken word. The ornament is worth less than the sentence. */}
        {cleanReview ? (
          item.drop_cap && !rtl ? (
            <Text style={[s.review, s.dropCapReview]} {...scaledTextProps} numberOfLines={PREVIEW_LINES} onTextLayout={onLayout}>
              <Text style={s.dropCapLetter} allowFontScaling={false}>{cleanReview.charAt(0).toUpperCase()}</Text>
              <Text style={s.dropCapText}>{cleanReview.slice(1)}</Text>
            </Text>
          ) : (
            <Text style={[s.review, rtl && s.rtl]} {...scaledTextProps} numberOfLines={PREVIEW_LINES} onTextLayout={onLayout}>
              {cleanReview}
            </Text>
          )
        ) : null}

        {/* Read more — shown when the text ACTUALLY clipped.
            The old gate was `length > 200`, which is a different question from
            the one the cap asks: a short-but-tall review was cut with no way to
            know, and a long-but-flat one offered to reveal nothing. */}
        {truncated && (
          <View style={[s.readMoreWrap, rtl && s.rtlAlign]}>
            <Text style={s.readMoreText}>Read more</Text>
          </View>
        )}
      </SpoilerVeil>
    </PressableScale>
  );
});

const s = StyleSheet.create({
  pressable: { width: '100%' },

  // ── Verdict (film column) ──
  abandonedWrap: { marginTop: 2, marginBottom: 4, alignSelf: 'flex-start' },
  abandonedInner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.crimsonFaint,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 3, borderWidth: 1, borderColor: colors.crimsonBorder,
  },
  abandonedText: {
    includeFontPadding: false, textAlignVertical: 'center',
    // Bone, not crimson. The previous note (below) moved this from bloodReel to
    // crimson for legibility, but crimson tops out at 3.18:1 on ink and this
    // text sits on a FAINT CRIMSON wash, which lightens the background to a
    // real 3.03:1 — worse than it looked. Crimson cannot reach AA at any
    // opacity, so the colour had to change rather than the alpha.
    //
    // Bone on the same wash measures 9.25:1. The stamp stays red — the faint
    // fill and the crimson border still carry the meaning — and only the
    // lettering becomes legible, which is exactly how CONFIDENTIAL already
    // works on the autopsy strip.
    //
    // Previous note, kept because it explains the fill and border:
    // Crimson, not bloodReel — the deep stamp red was near-invisible on soot.
    fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1.5, color: colors.bone,
  },
  ratingWrap: { marginTop: 2, marginBottom: 4, alignItems: 'flex-start' },
  watchedWith: {
    includeFontPadding: false, textAlignVertical: 'center',
    fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1.5,
    color: colors.sepia, marginTop: 8,
  },
  watchedWithName: { color: colors.bone },

  // ── Prose (full card width) ──
  pullQuoteWrap: {
    marginTop: 10,
    paddingLeft: 12,
    borderLeftWidth: 1,
    borderLeftColor: colors.sepia,
  },
  pullQuote: {
    includeFontPadding: false, textAlignVertical: 'center',
    fontFamily: fonts.display, fontSize: 15, fontStyle: 'italic',
    color: colors.sepia, lineHeight: 22,
    textShadowColor: colors.sepiaSubtle, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8,
  },
  pullQuotePremium: { color: 'rgba(220,166,58,0.9)' },
  pullQuoteAuteur: { color: colors.crimson },
  review: {
    includeFontPadding: false, textAlignVertical: 'center',
    fontFamily: fonts.body, fontSize: 13, color: colors.bone, lineHeight: 22,
    opacity: 0.9, marginTop: 10,
  },
  dropCapReview: { lineHeight: undefined },
  dropCapLetter: {
    includeFontPadding: false, textAlignVertical: 'center',
    fontFamily: fonts.display, fontSize: 32, color: colors.sepia,
    lineHeight: 34, marginRight: 6,
    textShadowColor: 'rgba(184,137,26,0.2)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6,
  },
  dropCapText: { lineHeight: 22 },
  // iOS needs the paragraph direction stated; Android resolves it itself, and
  // textAlign 'right' is what makes the block sit on the side it reads from.
  rtl: { writingDirection: 'rtl', textAlign: 'right' } as import('react-native').TextStyle,
  rtlAlign: { alignItems: 'flex-end' } as import('react-native').ViewStyle,
  readMoreWrap: { marginTop: 6 },
  readMoreText: {
    includeFontPadding: false, textAlignVertical: 'center',
    fontFamily: fonts.body, fontSize: 12, color: colors.sepia,
    textDecorationLine: 'underline', textDecorationColor: 'rgba(184,137,26,0.3)',
  },
});
