// ============================================================
// DarkroomHero — extracted from DarkroomHeader.tsx
// ============================================================
import React from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Search, X } from 'lucide-react-native';

import { colors, fonts, spacing, effects } from '@/src/theme/theme';
import { scaledTextProps } from '@/src/constants/textScaling';
import PressableScale from '@/src/components/PressableScale';
import { DarkroomAtmo, DarkroomSuggestionRow } from './DarkroomCards';
import type { DiscoverFilm } from '@/src/stores/discover';

const AnimatedSearchIcon = Animated.createAnimatedComponent(Search);

interface DarkroomHeroProps {
  isFocused: boolean;
  inputVal: string;
  query: string;
  handleInputValChange: (text: string) => void;
  handleSearchSubmit: () => void;
  handleClearSearch: () => void;
  suggestions: DiscoverFilm[];
  handleSuggestionPress: (item: DiscoverFilm) => void;
   
  animatedSearchProps: any;
   
  animatedSearchStyle: any;
  setIsFocused: (v: boolean) => void;
}

export const DarkroomHero = React.memo(function DarkroomHero({
  isFocused, inputVal, query,
  handleInputValChange, handleSearchSubmit, handleClearSearch,
  suggestions, handleSuggestionPress,
  animatedSearchProps, animatedSearchStyle, setIsFocused,
}: DarkroomHeroProps) {
  return (
    <View style={s.heroContainer}>
      <DarkroomAtmo />
      <LinearGradient
        colors={['rgba(10,7,3,0.8)', 'rgba(5,3,2,0.9)', 'transparent']}
        locations={[0, 0.6, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      <Animated.View entering={FadeInDown.springify().mass(0.8).damping(18)} style={s.heroContent}>
        {(() => {
          const h = new Date().getHours();
          const isLateNight = h >= 2 && h < 6;
          return (
            <>
              <Text style={s.heroTitle} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                {isLateNight ? "Late Night Projection" : "The Darkroom"}
              </Text>
            </>
          );
        })()}

        {/* The "EST. 1924" rule lived here. It is lore that already appears in
            eleven other files, it cost a full row plus two gradients, and it
            measured 3.38:1. The title and the safelight carry this room. */}

        <View style={s.searchWrap}>
          <AnimatedSearchIcon size={16} animatedProps={animatedSearchProps} style={[animatedSearchStyle, s.searchIcon]} />
          <TextInput
            testID="darkroom-search-input"
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            style={[s.searchInput, (isFocused || query.length > 0) && s.searchInputActive]}
            {...scaledTextProps}
            /* "Film title, director, actor..." needed 249pt in a 259pt slot — it
               fit at 1.00x with 10pt to spare and truncated at 1.04x, so ANY
               Dynamic Type setting cut it (as it does in production). A
               TextInput placeholder cannot use adjustsFontSizeToFit, so the
               string itself had to give. "Film" is redundant inside a film app,
               under a heading that reads THE NEGATIVES; this keeps every piece
               of information and buys headroom to 1.36x — just past the 1.35
               cap applied above, so the two agree. */
            placeholder="Title, director, actor…"
            placeholderTextColor={colors.fog}
            selectionColor={colors.selection}
            value={inputVal}
            onChangeText={handleInputValChange}
            maxLength={120}
            onSubmitEditing={handleSearchSubmit}
            returnKeyType="search"
            keyboardAppearance="dark"
            accessibilityLabel="Search films by title, director, or actor"
          />
          {inputVal.length > 0 && (
            <PressableScale onPress={handleClearSearch} style={s.clearBtn} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} haptic="light">
              <X size={16} color={colors.fog} />
            </PressableScale>
          )}

          {isFocused && suggestions.length > 0 && (
            <View style={s.suggestionsBox}>
              {suggestions.map((item) => (
                <DarkroomSuggestionRow key={`${item.media_type || 'movie'}-${item.id}`} item={item} onPress={handleSuggestionPress} />
              ))}
            </View>
          )}
        </View>
      </Animated.View>
    </View>
  );
});

DarkroomHero.displayName = 'DarkroomHero';

// ── Styles — copied PIXEL-PERFECT from DarkroomHeader.tsx ──
const s = StyleSheet.create({
  heroContainer: {
    // Was paddingVertical 48 + marginBottom 32 — 128pt of frame around one
    // title and a search box, which pushed the first poster to 82% down the
    // screen. Trimmed, but NOT flattened: the safelight behind this block is
    // the signature of the page and needs room to fall off. It gives up 8pt at
    // the top; the rest of the reclaimed space comes from dead gaps below.
    paddingTop: 40,
    paddingBottom: 32,
    marginHorizontal: 0,
    marginBottom: 20,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(184,137,26,0.2)',
    position: 'relative',
    zIndex: 100,
    elevation: 100,
  },
  heroContent: {
    alignItems: 'center',
    zIndex: 1,
  },
  heroTitle: {
    fontFamily: fonts.display,
    fontSize: 34,
    color: colors.silverScreen,
    // 8 -> 14: the Est. rule used to sit between this and the search field and
    // carried its own 14pt margin. Without it the title needs that breath.
    marginBottom: 14,
    textAlign: 'center',
    // No fixed lineHeight. It fought adjustsFontSizeToFit — the line box stayed
    // 38 while the glyphs shrank, so "Late Night Projection" (which DOES shrink,
    // at minimumFontScale 0.6) sat off-centre in its own row.
    letterSpacing: 2,
    ...effects.textGlowSepia,
    textShadowRadius: 20,
    textShadowColor: 'rgba(180,45,45, 0.6)',
  },
  // `estRow`, `estRule` and `heroEst` removed with the "EST. 1924" line.
  searchWrap: {
    width: '100%',
    position: 'relative',
    zIndex: 10,
  },
  searchIcon: {
    position: 'absolute',
    left: spacing.md,
    top: 16,
    color: colors.sepia,
    opacity: 0.8,
    zIndex: 1,
  },
  searchInput: {
    // Courier ledger hand, not bold terminal mono — typing should feel
    // like filling an archival form, same as every input in the app.
    width: '100%',
    backgroundColor: 'rgba(10,8,5,0.95)',
    borderWidth: 1.5,
    borderColor: 'rgba(184,137,26,0.2)',
    borderRadius: 6,
    paddingVertical: 16,
    paddingLeft: 46,
    paddingRight: 40,
    color: colors.silverScreen,
    fontFamily: fonts.body,
    fontSize: 13,
    letterSpacing: 0.5,
    ...effects.shadowSurface,
  },
  searchInputActive: {
    borderColor: 'rgba(180,45,45,0.5)',
    backgroundColor: 'rgba(5,3,2,0.95)',
  },
  clearBtn: {
    position: 'absolute',
    right: spacing.md,
    top: 16,
    zIndex: 1,
  },
  suggestionsBox: {
    position: 'absolute',
    top: 55,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(8,6,4,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(184,137,26,0.5)',
    borderStyle: 'solid',
    borderRadius: 6,
    overflow: 'hidden',
    zIndex: 20,
    elevation: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.8,
    shadowRadius: 30,
  },
});
