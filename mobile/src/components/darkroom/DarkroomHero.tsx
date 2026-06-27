// ============================================================
// DarkroomHero — extracted from DarkroomHeader.tsx
// ============================================================
import React from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Search, X } from 'lucide-react-native';

import { colors, fonts, spacing, effects } from '@/src/theme/theme';
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
              <Text style={s.heroEyebrow} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                {isLateNight ? "✦ THE ARCHIVE IS HAUNTED ✦" : "✦ THE REELHOUSE SOCIETY ✦"}
              </Text>
              <Text style={s.heroTitle} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                {isLateNight ? "Late Night Projection" : "The Darkroom"}
              </Text>
            </>
          );
        })()}

        <View style={s.estRow}>
          <LinearGradient colors={['transparent', 'rgba(184,137,26,0.35)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.estRule} />
          <Text style={s.heroEst} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Est. 1924</Text>
          <LinearGradient colors={['rgba(184,137,26,0.35)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.estRule} />
        </View>

        <View style={s.searchWrap}>
          <AnimatedSearchIcon size={16} animatedProps={animatedSearchProps} style={[animatedSearchStyle, s.searchIcon]} />
          <TextInput
            testID="darkroom-search-input"
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            style={[s.searchInput, (isFocused || query.length > 0) && s.searchInputActive]}
            placeholder="Film title, director, actor..."
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
    paddingVertical: spacing.xxl,
    marginHorizontal: 0,
    marginBottom: spacing.xl,
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
  heroEyebrow: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 12,
    color: colors.sepia,
    marginBottom: spacing.sm,
    opacity: 0.6,
    fontWeight: '700',
  },
  heroTitle: {
    fontFamily: fonts.display,
    fontSize: 34,
    color: '#F2ECD8',
    marginBottom: 8,
    textAlign: 'center',
    lineHeight: 38,
    letterSpacing: 2,
    ...effects.textGlowSepia,
    textShadowRadius: 20,
    textShadowColor: 'rgba(180,45,45, 0.6)',
  },
  estRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  estRule: {
    flex: 1,
    height: 1,
  },
  heroEst: {
    fontFamily: fonts.ui,
    fontSize: 7,
    letterSpacing: 5,
    color: colors.fog,
    opacity: 0.6,
  },
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
    width: '100%',
    backgroundColor: 'rgba(10,8,5,0.95)',
    borderWidth: 1.5,
    borderColor: 'rgba(184,137,26,0.2)',
    borderRadius: 6,
    paddingVertical: 16,
    paddingLeft: 46,
    paddingRight: 40,
    color: '#F2ECD8',
    fontFamily: fonts.mono,
    fontSize: 12,
    letterSpacing: 2,
    fontWeight: '700',
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
