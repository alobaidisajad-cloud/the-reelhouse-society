import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { colors, fonts } from '@/src/theme/theme';
import { ReelRating } from '@/src/components/Decorative';
import PressableScale from '@/src/components/PressableScale';

import type { FeedItem } from '@/src/schemas/feed.schema';

interface Props {
  item: Pick<FeedItem, 'status' | 'abandoned_reason' | 'rating' | 'pull_quote' | 'review' | 'drop_cap' | 'watched_with' | 'role'>;
  isPremium: boolean;
  isAuteur: boolean;
  onPress: () => void;
}

/**
 * Review content block — rating, pull quote, review text, read-more, watched-with.
 */
const ENTITIES: Record<string, string> = {
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&nbsp;': ' '
};

export const ReviewContent = React.memo(function ReviewContent({ item, isPremium, isAuteur, onPress }: Props) {
  // O(N) Regex stripping blocks the JS thread during FlashList rendering.
  // We memoize the stripped text so it only computes once per item, rather than twice per render cycle.
  const cleanReview = React.useMemo(() => {
    if (!item.review) return '';
    let text = item.review.replace(/<(p|div|br)[^>]*>/gi, '\n').replace(/<[^>]+>/g, '').trim();
    return text.replace(/&[a-z0-9#]+;/gi, (m) => ENTITIES[m] || m);
  }, [item.review]);

  return (
    <PressableScale onPress={onPress} haptic="selection" pressedScale={0.98} style={s.pressable} accessibilityLabel="Read full review">
      {/* Abandoned badge */}
      {item.status === 'abandoned' ? (
        <View style={s.abandonedWrap}>
          <View style={s.abandonedInner}>
            <Text style={s.abandonedText}>
              ABANDONED{item.abandoned_reason ? ` — ${item.abandoned_reason.toUpperCase()}` : ''}
            </Text>
          </View>
        </View>
      ) : (item.rating ?? 0) > 0 ? (
        <View style={s.ratingWrap}><ReelRating rating={item.rating ?? 0} size={15} /></View>
      ) : null}

      {/* Pull quote */}
      {item.pull_quote && (
        <View style={[s.pullQuoteWrap, isAuteur && s.pullQuoteWrapAuteur, isPremium && !isAuteur && s.pullQuoteWrapPremium]}>
          <Text style={[s.pullQuote, isAuteur && s.pullQuoteAuteur, isPremium && !isAuteur && s.pullQuotePremium]}>
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

      {/* Watched with */}
      {item.watched_with && (
        <Text style={s.watchedWith} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          ♡ WITH <Text style={s.watchedWithName}>{item.watched_with.toUpperCase()}</Text>
        </Text>
      )}
    </PressableScale>
  );
});

const s = StyleSheet.create({
  pressable: { flexShrink: 1, width: '100%' },
  abandonedWrap: { marginTop: 8, marginBottom: 4, alignSelf: 'flex-start' },
  abandonedInner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(125,31,31,0.1)',
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 4, borderWidth: 1, borderColor: 'rgba(125,31,31,0.3)',
  },
  abandonedText: {
    includeFontPadding: false, textAlignVertical: 'center',
    fontFamily: fonts.ui, fontSize: 9, letterSpacing: 2, color: colors.bloodReel,
  },
  ratingWrap: { marginBottom: 12, alignItems: 'center' },
  pullQuoteWrap: {
    marginVertical: 4, paddingVertical: 24, paddingHorizontal: 24, alignItems: 'center',
  },
  pullQuoteWrapPremium: {},
  pullQuoteWrapAuteur: {},
  pullQuote: {
    includeFontPadding: false, textAlignVertical: 'center',
    fontFamily: fonts.display, fontSize: 17, fontStyle: 'italic',
    color: colors.sepia, lineHeight: 24, textAlign: 'center', paddingBottom: 8,
    textShadowColor: 'rgba(139,105,20,0.15)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8,
  },
  pullQuotePremium: { color: 'rgba(218,165,32,0.9)' },
  pullQuoteAuteur: { color: 'rgba(180,45,45,0.9)' },
  review: {
    includeFontPadding: false, textAlignVertical: 'center',
    fontFamily: fonts.body, fontSize: 13, color: colors.bone, lineHeight: 22,
    opacity: 0.9, paddingBottom: 8, marginTop: 12, marginBottom: 8,
  },
  dropCapReview: { lineHeight: undefined },
  dropCapLetter: {
    includeFontPadding: false, textAlignVertical: 'center',
    fontFamily: fonts.display, fontSize: 34, color: colors.sepia,
    lineHeight: 36, marginRight: 6, marginTop: -2,
    textShadowColor: 'rgba(139,105,20,0.2)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6,
  },
  dropCapText: { lineHeight: 24 },
  readMoreWrap: { marginTop: 6 },
  readMoreText: {
    includeFontPadding: false, textAlignVertical: 'center',
    fontFamily: fonts.body, fontSize: 13, color: colors.sepia,
    textDecorationLine: 'underline', textDecorationColor: 'rgba(139,105,20,0.3)',
  },
  watchedWith: {
    includeFontPadding: false, textAlignVertical: 'center',
    fontFamily: fonts.ui, fontSize: 10, letterSpacing: 1,
    color: colors.sepia, marginTop: 16, marginBottom: 8,
  },
  watchedWithName: { color: colors.bone },
});
