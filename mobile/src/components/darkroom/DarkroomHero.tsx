// ============================================================
// DarkroomHero — the Darkroom's title and its search, with suggestions
// ============================================================
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, TextInput } from '@/src/components/text';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Search, X } from 'lucide-react-native';

import { colors, fonts, spacing, effects } from '@/src/theme/theme';
import { scaledTextProps } from '@/src/constants/textScaling';
import PressableScale from '@/src/components/PressableScale';
import { DarkroomAtmo, DarkroomSuggestionRow } from './DarkroomCards';
import type { DiscoverFilm } from '@/src/stores/discover';
import { EDGE_LIT, WASH } from '@/src/theme/light';
import { e2eTrace } from '@/src/utils/e2eTrace';

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
  setFieldFocused: (focused: boolean) => void;
}

export const DarkroomHero = React.memo(function DarkroomHero({
  isFocused, inputVal, query,
  handleInputValChange, handleSearchSubmit, handleClearSearch,
  suggestions, handleSuggestionPress,
  animatedSearchProps, animatedSearchStyle, setFieldFocused,
}: DarkroomHeroProps) {
  return (
    <View style={s.heroContainer}>
      <DarkroomAtmo />
      {/* A thin wash: at full strength it darkened the room's lamp into two
          dark columns down the screen. */}
      <LinearGradient
        colors={['rgba(13,11,9,0.8)', 'rgba(6,5,4,0.9)', 'transparent']}
        locations={[0, 0.6, 1]}
        style={[StyleSheet.absoluteFillObject, WASH]}
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

        <View style={s.searchWrap}>
          <AnimatedSearchIcon size={16} animatedProps={animatedSearchProps} style={[animatedSearchStyle, s.searchIcon]} />
          <TextInput
            testID="darkroom-search-input"
            onFocus={() => setFieldFocused(true)}
            onBlur={() => setFieldFocused(false)}
            style={[s.searchInput, (isFocused || query.length > 0) && s.searchInputActive]}
            {...scaledTextProps}
            /* A placeholder cannot shrink to fit, so the words fit instead:
               231pt of the 238pt slot at 1.35 (mockups/tools/layout.cjs). */
            placeholder="Title, director, cast"
            placeholderTextColor={colors.fog}
            selectionColor={colors.selection}
            value={inputVal}
            onChangeText={handleInputValChange}
            maxLength={120}
            // Names, not words: autocorrect turns "Ozu" into "Out", and on
            // Android its composing let the last letter miss the search.
            autoCorrect={false}
            spellCheck={false}
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
            <View
              style={s.suggestionsBox}
              // E2E only: where the list lands in the window.
              onLayout={(e) => {
                const box = e.currentTarget;
                box.measureInWindow((x, y, w, h) => e2eTrace('darkroom.suggestions.drawn', {
                  x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), rows: suggestions.length,
                }));
              }}
            >
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

const s = StyleSheet.create({
  heroContainer: {
    // Room for the safelight to fall off, and no more: the first poster must
    // not start low on the screen.
    paddingTop: 40,
    paddingBottom: 32,
    marginHorizontal: 0,
    marginBottom: 20,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(184,137,26,0.2)',
    position: 'relative',
    zIndex: 100,
    elevation: 100, ...effects.flat,
  },
  heroContent: {
    alignItems: 'center',
    zIndex: 1,
  },
  heroTitle: {
    fontFamily: fonts.display,
    fontSize: 34,
    color: colors.silverScreen,
    marginBottom: 14,
    textAlign: 'center',
    // No fixed lineHeight: a fixed box stays tall while adjustsFontSizeToFit
    // shrinks "Late Night Projection", and the words sit off-centre.
    letterSpacing: 2,
    ...effects.textGlowSepia,
    textShadowRadius: 20,
    textShadowColor: 'rgba(180,45,45, 0.6)',
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
    // Courier ledger hand, not bold terminal mono — typing should feel
    // like filling an archival form, same as every input in the app.
    width: '100%',
    backgroundColor: colors.well,
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
    ...effects.shadowSurface, ...effects.flat,
  },
  searchInputActive: {
    borderColor: 'rgba(180,45,45,0.5)',
    backgroundColor: colors.inkwell,
  },
  clearBtn: {
    position: 'absolute',
    right: spacing.md,
    top: 16,
    zIndex: 1,
  },
  suggestionsBox: { ...EDGE_LIT,
    position: 'absolute',
    top: 55,
    left: 0,
    right: 0,
    backgroundColor: colors.soot,
    borderWidth: 1,
    borderColor: 'rgba(184,137,26,0.5)',
    borderStyle: 'solid',
    borderRadius: 6,
    overflow: 'hidden',
    zIndex: 20,
    // Elevation draws it ABOVE the grid on Android; `flat` drops the shadow.
    elevation: 25,
    ...effects.flat,
  },
});
