import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/src/components/text';
import Animated, { FadeInDown, runOnJS } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { Bookmark, ScrollText, User, Clapperboard, ArrowRight } from 'lucide-react-native';
import { colors, fonts, SEPIA_HASH } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import type { SR } from '@/src/hooks/useUniversalSearch';
import { RankBadge, rankOf, rankWord } from '@/src/components/RankBadge';
import { ReelRating } from '@/src/components/Decorative';

const TYPE_GLYPH: Record<string, string> = {
  film: '▶', actor: '◎', director: '✦', user: '◉', log: '✎', list: '☰',
};
const TYPE_COLOR: Record<string, { bg: string; border: string }> = {
  film:     { bg: 'rgba(196,150,26,0.12)', border: 'rgba(196,150,26,0.25)' },
  actor:    { bg: 'rgba(218,165,32,0.10)', border: 'rgba(218,165,32,0.25)' },
  director: { bg: 'rgba(184,137,26,0.10)', border: 'rgba(184,137,26,0.25)' },
  user:     { bg: 'rgba(200,185,154,0.08)', border: 'rgba(200,185,154,0.20)' },
  log:      { bg: 'rgba(107,96,85,0.10)',   border: 'rgba(107,96,85,0.25)' },
  list:     { bg: 'rgba(107,26,10,0.08)',    border: 'rgba(107,26,10,0.20)' },
};

/** What a screen reader says for a row: what it is, whose, and what the row shows. */
export function resultLabel(item: SR): string {
  const rank = rankWord(rankOf(item.role));
  const ranked = rank ? `, ${rank}` : '';
  const rated = item.rating ? `, rated ${item.rating} of 5` : '';
  switch (item.type) {
    case 'film':
      return `${item.title}, film${/^\d{4}$/.test(item.subtitle) ? `, ${item.subtitle}` : ''}`;
    case 'actor':
    case 'director':
      return `${item.title}, known for ${item.subtitle.toLowerCase()}`;
    case 'user':
      return `${item.title}, member${ranked}`;
    case 'log':
      return `Log of ${item.title} by ${item.subtitle.toLowerCase()}${ranked}${rated}${item.extra ? `. ${item.extra}` : ''}`;
    case 'list':
      return `Stack, ${item.title}, ${item.subtitle.replace(/✦\s*/g, '').toLowerCase()}`;
  }
}

export const SearchResultRow = React.memo(({ item, index, onPress }: { item: SR; index: number; onPress: (r: SR) => void }) => {
  const tc = TYPE_COLOR[item.type] || TYPE_COLOR.film;
  const isPerson = item.type === 'actor' || item.type === 'director' || item.type === 'user';
  // Track if this row has already animated to prevent
  // FlashList recycling from re-triggering the FadeInDown on every scroll
  const hasAnimated = React.useRef(false);
  const setHasAnimated = React.useCallback(() => { hasAnimated.current = true; }, []);
  const entering = hasAnimated.current
    ? undefined
    : FadeInDown.duration(250).delay(Math.min(index * 25, 150)).withCallback(() => {
        'worklet';
        runOnJS(setHasAnimated)();
      });

  return (
    <Animated.View entering={entering}>
      <PressableScale
        style={st.row}
        onPress={() => onPress(item)}
        haptic="light"
        pressedScale={0.97}
        // A row is at least its poster's 56pt tall: no halo, or stacked rows take each other's taps.
        hitSlop={null}
        accessibilityRole="button"
        accessibilityLabel={resultLabel(item)}
        accessibilityHint="Double tap to view details"
      >
        <View style={[st.badge, { backgroundColor: tc.bg, borderColor: tc.border }]}>
          <Text style={st.badgeGlyph}>{TYPE_GLYPH[item.type]}</Text>
        </View>

        <View style={[st.rowImg, isPerson && st.rowImgRound]}>
          {item.image ? (
            <Image source={{ uri: item.image }} style={st.img} contentFit="cover" cachePolicy="memory-disk" placeholder={{ blurhash: SEPIA_HASH }} transition={150} />
          ) : (
            <View style={st.imgEmpty}>
              {item.type === 'list' ? <Bookmark size={14} color={colors.fog} /> :
               item.type === 'log' ? <ScrollText size={14} color={colors.fog} /> :
               item.type === 'user' ? <User size={14} color={colors.fog} /> :
               <Clapperboard size={14} color={colors.fog} />}
            </View>
          )}
        </View>

        <View style={st.rowText}>
          <Text style={st.rowTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{item.title}</Text>

          <View style={st.rowSubRow}>
            {/* Only when there is something in it: an empty Text still takes a line. */}
            {item.subtitle ? (
              <Text style={st.rowSub} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{item.subtitle}</Text>
            ) : null}
            {item.rating ? <ReelRating rating={item.rating} size={10} /> : null}
            {item.extra && item.type !== 'log' ? (
              <Text style={st.rowExtra} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{item.extra}</Text>
            ) : null}
          </View>

          {item.type === 'log' && item.extra ? (
            <Text style={st.rowExcerpt} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{item.extra}</Text>
          ) : null}

          {item.type === 'user' || item.type === 'log' ? (
            <View style={st.rolePillWrap}><RankBadge rank={rankOf(item.role)} /></View>
          ) : null}
        </View>

        <ArrowRight size={12} color={colors.ash} style={st.rowArrow} />
      </PressableScale>
    </Animated.View>
  );
});

SearchResultRow.displayName = 'SearchResultRow';

const st = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 11, paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(184,137,26,0.05)',
  },

  badge: {
    width: 20, height: 20, borderRadius: 3,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 8, borderWidth: 1,
  },
  badgeGlyph: { fontSize: 9, color: colors.sepia },

  rowImg: {
    width: 38, height: 56, borderRadius: 2, overflow: 'hidden',
    backgroundColor: colors.soot, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(184,137,26,0.12)', marginRight: 12,
  },
  rowImgRound: { width: 42, height: 42, borderRadius: 21 },
  img: { width: '100%', height: '100%' },
  imgEmpty: { alignItems: 'center', justifyContent: 'center' },

  rowText: { flex: 1 },
  rowTitle: { fontFamily: fonts.display, fontSize: 14, color: colors.parchment, lineHeight: 17, marginBottom: 2 },
  rowSubRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowSub: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1, color: colors.sepia },
  rowExtra: { fontFamily: fonts.sub, fontSize: 10, color: colors.fogQuiet },
  rowExcerpt: {
    fontFamily: fonts.body, fontSize: 11, color: colors.fogQuiet,
    fontStyle: 'italic', marginTop: 2, lineHeight: 14,
  },
  /** The badge brings its own box; this only places it in the row. */
  rolePillWrap: { alignSelf: 'flex-start', marginTop: 3 },
  rowArrow: { marginLeft: 6 },
});
