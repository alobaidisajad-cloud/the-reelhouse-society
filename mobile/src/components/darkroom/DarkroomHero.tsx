// ============================================================
// DarkroomHero — the Darkroom's title and its enlarger (the search), with suggestions
// ============================================================
import React from 'react';
import { useClock } from '@/src/hooks/useClock';
import { View, StyleSheet } from 'react-native';
import { Text, TextInput } from '@/src/components/text';
import { Search, X } from 'lucide-react-native';

import { colors, fonts } from '@/src/theme/theme';
import { displayTextProps, scaledTextProps } from '@/src/constants/textScaling';
import PressableScale from '@/src/components/PressableScale';
import { DarkroomSuggestionRow } from './DarkroomCards';
import type { DiscoverFilm } from '@/src/stores/discover';
import { EDGE_LIT } from '@/src/theme/light';
import { e2eTrace } from '@/src/utils/e2eTrace';
import { SEARCH_MAX } from '@/src/constants/inputLimits';
import SearchUnreachable from '@/src/components/search/SearchUnreachable';
import { ceilingFor } from '@/src/components/lobby/measure';
import { useColumnWidth } from '@/src/components/layout/navMetrics';
import { ROOM } from './sheet';

/** What the empty field says, and its measures: the hint must fit the field whole at every size. */
const HINT = 'Title, director, cast';
const FIELD = { size: 14, pad: 16, icon: 16, gap: 12 } as const;

interface DarkroomHeroProps {
  isFocused: boolean;
  inputVal: string;
  query: string;
  handleInputValChange: (text: string) => void;
  handleSearchSubmit: () => void;
  handleClearSearch: () => void;
  suggestions: DiscoverFilm[];
  /** The suggestions for the field's words could not be read: said where they would be. */
  suggestionsUnreachable: boolean;
  askForSuggestionsAgain: () => void;
  handleSuggestionPress: (item: DiscoverFilm) => void;
  setFieldFocused: (focused: boolean) => void;
}

export const DarkroomHero = React.memo(function DarkroomHero({
  isFocused, inputVal, query,
  handleInputValChange, handleSearchSubmit, handleClearSearch,
  suggestions, suggestionsUnreachable, askForSuggestionsAgain, handleSuggestionPress, setFieldFocused,
}: DarkroomHeroProps) {
  // The small hours are told as they come, with the tray open.
  const isLateNight = useClock((now) => { const h = new Date(now).getHours(); return h >= 2 && h < 6; });
  // The hint grows with the member's text no further than it fits the field whole (Courier is even).
  const room = useColumnWidth() - 2 * ROOM.page - 2 * FIELD.pad - FIELD.icon - FIELD.gap - 2;
  const hintCap = Math.min(scaledTextProps.maxFontSizeMultiplier, ceilingFor(HINT, 'courierItalic', FIELD.size, 0, room));
  // In use (in the field, or words in it): the enlarger's red.
  const lit = isFocused || inputVal.length > 0 || query.length > 0;
  return (
    <View style={s.hero}>
      {/* A display heading, so the house's display cap; a long one (Late Night Projection) takes two lines. */}
      <Text style={s.title} accessibilityRole="header" {...displayTextProps}>
        {isLateNight ? 'Late Night Projection' : 'The Darkroom'}
      </Text>

      <View style={[s.field, lit && s.fieldLit]}>
        <Search size={FIELD.icon} color={lit ? colors.bloodReel : colors.sepia} />
        <TextInput
          testID="darkroom-search-input"
          onFocus={() => setFieldFocused(true)}
          onBlur={() => setFieldFocused(false)}
          // The hint in Courier's italic, the member's words upright.
          style={[s.input, !inputVal && s.inputHint]}
          allowFontScaling
          maxFontSizeMultiplier={hintCap}
          placeholder={HINT}
          placeholderTextColor={colors.fog}
          selectionColor={colors.selection}
          value={inputVal}
          onChangeText={handleInputValChange}
          maxLength={SEARCH_MAX}
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
          <PressableScale onPress={handleClearSearch} style={s.clear} hitSlop={null} haptic="light"
            accessibilityRole="button" accessibilityLabel="Clear search">
            <X size={FIELD.icon} color={colors.bloodReel} />
          </PressableScale>
        )}
      </View>

      {/* In the flow, under the field, never hung outside it: Android neither delivers a touch to,
          nor exposes to accessibility, a view outside its parent. */}
      {isFocused && suggestions.length > 0 && (
        <View
          style={s.suggestions}
          // E2E only: where the list lands in the window.
          onLayout={(e) => {
            const box = e.currentTarget;
            box.measureInWindow((x, y, w, h) => e2eTrace('darkroom.suggestions.drawn', {
              x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), rows: suggestions.length,
            }));
          }}
        >
          {suggestions.map((item, i) => (
            <DarkroomSuggestionRow key={`${item.media_type || 'movie'}-${item.id}`} item={item} first={i === 0} onPress={handleSuggestionPress} />
          ))}
        </View>
      )}
      {isFocused && suggestionsUnreachable && suggestions.length === 0 && (
        <View style={s.suggestions}>
          <SearchUnreachable onRetry={askForSuggestionsAgain} />
        </View>
      )}
    </View>
  );
});

DarkroomHero.displayName = 'DarkroomHero';

const s = StyleSheet.create({
  hero: { paddingTop: 10 },
  title: { fontFamily: fonts.display, fontSize: 30, lineHeight: 36, color: colors.silverScreen, textAlign: 'center' },
  // The enlarger: the well, ruled in brass; in use, in the safelight's red.
  field: {
    marginTop: 14, minHeight: 50, borderRadius: ROOM.radius, backgroundColor: colors.well,
    borderWidth: 1, borderColor: 'rgba(184,137,26,0.75)',
    flexDirection: 'row', alignItems: 'center', gap: FIELD.gap, paddingHorizontal: FIELD.pad,
  },
  fieldLit: { borderColor: 'rgba(180,45,45,0.5)' },
  input: {
    flex: 1, minHeight: 48, paddingVertical: 0, paddingHorizontal: 0,
    fontFamily: fonts.body, fontSize: FIELD.size, color: colors.parchment,
  },
  inputHint: { fontFamily: fonts.bodyItalic },
  // As tall as the field holds (48), at its end: a target by its own box.
  clear: { width: 48, height: 48, marginRight: -14, alignItems: 'center', justifyContent: 'center' },
  suggestions: { ...EDGE_LIT, marginTop: 6, backgroundColor: colors.surfaceRaised, borderRadius: ROOM.radius, overflow: 'hidden' },
});
