import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeInDown, runOnJS } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { Bookmark, ScrollText, User, Clapperboard, ArrowRight } from 'lucide-react-native';
import { colors, fonts, SEPIA_HASH } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import type { SR } from '@/src/hooks/useUniversalSearch';
import { isAuteurPlusTier, isArchivistPlusTier } from '@/src/utils/tier';

const TYPE_GLYPH: Record<string, string> = {
  film: '▶', actor: '◎', director: '✦', user: '◉', log: '✎', list: '☰',
};
const TYPE_COLOR: Record<string, { bg: string; border: string }> = {
  film:     { bg: 'rgba(196,150,26,0.12)', border: 'rgba(196,150,26,0.25)' },
  actor:    { bg: 'rgba(218,165,32,0.10)', border: 'rgba(218,165,32,0.25)' },
  director: { bg: 'rgba(139,105,20,0.10)', border: 'rgba(139,105,20,0.25)' },
  user:     { bg: 'rgba(200,185,154,0.08)', border: 'rgba(200,185,154,0.20)' },
  log:      { bg: 'rgba(107,96,85,0.10)',   border: 'rgba(107,96,85,0.25)' },
  list:     { bg: 'rgba(107,26,10,0.08)',    border: 'rgba(107,26,10,0.20)' },
};

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
        accessibilityRole="button"
        accessibilityLabel={`Go to ${item.title}${item.subtitle ? `, ${item.subtitle}` : ''}`}
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
            <Text style={st.rowSub} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{item.subtitle}</Text>
            {item.rating ? (
              <Text style={st.rowRating}>{'◉'.repeat(Math.min(item.rating, 5))}</Text>
            ) : null}
            {item.extra && item.type !== 'log' ? (
              <Text style={st.rowExtra} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{item.extra}</Text>
            ) : null}
          </View>

          {item.type === 'log' && item.extra ? (
            <Text style={st.rowExcerpt} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{item.extra}</Text>
          ) : null}

          {(item.type === 'user' || item.type === 'log') && item.role && isArchivistPlusTier(item.role) ? (
            <Text style={[
              st.rolePill,
              isAuteurPlusTier(item.role) 
                ? { color: '#D4A520', backgroundColor: 'rgba(212,165,32,0.12)' }
                : { color: colors.sepia, backgroundColor: 'rgba(139,105,20,0.10)' },
            ]}>
              {isAuteurPlusTier(item.role) ? '★ AUTEUR' : '✦ ARCHIVIST'}
            </Text>
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
    borderBottomColor: 'rgba(139,105,20,0.05)',
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
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.12)', marginRight: 12,
  },
  rowImgRound: { width: 42, height: 42, borderRadius: 21 },
  img: { width: '100%', height: '100%' },
  imgEmpty: { alignItems: 'center', justifyContent: 'center' },

  rowText: { flex: 1 },
  rowTitle: { fontFamily: fonts.display, fontSize: 14, color: colors.parchment, lineHeight: 17, marginBottom: 2 },
  rowSubRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowSub: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1.2, color: colors.sepia },
  rowRating: { fontFamily: fonts.ui, fontSize: 7, color: colors.sepia, opacity: 0.7, letterSpacing: 1 },
  rowExtra: { fontFamily: fonts.ui, fontSize: 9, color: colors.fog, opacity: 0.5 },
  rowExcerpt: {
    fontFamily: fonts.body, fontSize: 11, color: colors.bone, opacity: 0.45,
    fontStyle: 'italic', marginTop: 2, lineHeight: 14,
  },
  rolePill: {
    fontFamily: fonts.ui, fontSize: 7, letterSpacing: 1.2,
    color: colors.fog, paddingHorizontal: 5, paddingVertical: 1.5,
    borderRadius: 2, alignSelf: 'flex-start', overflow: 'hidden', marginTop: 3,
  },
  rowArrow: { marginLeft: 6 },
});
