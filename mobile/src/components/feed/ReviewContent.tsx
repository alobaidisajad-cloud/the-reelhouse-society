import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { colors, fonts } from '@/src/theme/theme';
import { ReelRating } from '@/src/components/Decorative';
import PressableScale from '@/src/components/PressableScale';
import SpoilerVeil from '@/src/components/SpoilerVeil';

import type { FeedItem } from '@/src/schemas/feed.schema';

interface VerdictProps {
  item: Pick<FeedItem, 'status' | 'abandoned_reason' | 'rating' | 'watched_with'>;
}

interface ProseProps {
  item: Pick<FeedItem, 'id' | 'rating' | 'pull_quote' | 'review' | 'drop_cap' | 'role' | 'is_spoiler'>;
  isPremium: boolean;
  isAuteur: boolean;
  onPress: () => void;
}

const ENTITIES: Record<string, string> = {
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&nbsp;': ' '
};

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
  // O(N) Regex stripping blocks the JS thread during FlashList rendering.
  // We memoize the stripped text so it only computes once per item.
  const cleanReview = React.useMemo(() => {
    if (!item.review) return '';
    let text = item.review.replace(/<(p|div|br)[^>]*>/gi, '\n').replace(/<[^>]+>/g, '').trim();
    return text.replace(/&[a-z0-9#]+;/gi, (m) => ENTITIES[m] || m);
  }, [item.review]);

  if (!item.pull_quote && !cleanReview) return null;

  return (
    <PressableScale onPress={onPress} haptic="selection" pressedScale={0.98} style={s.pressable} accessibilityLabel="Read full review">
      <SpoilerVeil isSpoiler={item.is_spoiler} revealKey={item.id} compact>
        {/* Pull quote — capped at 4 lines so no quote can swallow the card */}
        {item.pull_quote && (
          <View style={s.pullQuoteWrap}>
            <Text style={[s.pullQuote, isAuteur && s.pullQuoteAuteur, isPremium && !isAuteur && s.pullQuotePremium]} numberOfLines={4}>
              « {item.pull_quote} »
            </Text>
          </View>
        )}

        {/* Review text */}
        {cleanReview ? (
          item.drop_cap ? (
            <Text style={[s.review, s.dropCapReview]} numberOfLines={8}>
              <Text style={s.dropCapLetter}>{cleanReview.charAt(0).toUpperCase()}</Text>
              <Text style={s.dropCapText}>{cleanReview.slice(1)}</Text>
            </Text>
          ) : (
            <Text style={s.review} numberOfLines={8}>
              {cleanReview}
            </Text>
          )
        ) : null}

        {/* Read more */}
        {cleanReview.length > 200 && (
          <View style={s.readMoreWrap}>
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
    // Crimson, not bloodReel — the deep stamp red was near-invisible on soot.
    fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1.5, color: colors.crimson,
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
    textShadowColor: 'rgba(184,137,26,0.15)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8,
  },
  pullQuotePremium: { color: 'rgba(218,165,32,0.9)' },
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
  readMoreWrap: { marginTop: 6 },
  readMoreText: {
    includeFontPadding: false, textAlignVertical: 'center',
    fontFamily: fonts.body, fontSize: 12, color: colors.sepia,
    textDecorationLine: 'underline', textDecorationColor: 'rgba(184,137,26,0.3)',
  },
});
