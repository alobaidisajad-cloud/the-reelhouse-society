/**
 * DarkroomHeader — the head of the Darkroom's page: the title and the enlarger (search), the baths
 * (moods), the settings (filters), then the head of the contact sheet: what it holds, in the
 * room's own words, and the sheet's top edge. A search puts the baths and settings away (it
 * searches by its words alone). Prints kept from a visit when the archives cannot be reached are
 * said to be that, under a line that says why and offers TRY AGAIN.
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, StyleSheet, Keyboard } from 'react-native';
import { Text } from '@/src/components/text';
import { SlidersHorizontal } from 'lucide-react-native';
import TactileEngine from '@/src/utils/TactileEngine';
import { useShallow } from 'zustand/react/shallow';

import { colors, fonts } from '@/src/theme/theme';
import { scaledTextProps, displayTextProps } from '@/src/constants/textScaling';
import { tmdb } from '@/src/lib/tmdb';
import { useDiscoverStore, type DiscoverFilm } from '@/src/stores/discover';
import PressableScale from '@/src/components/PressableScale';
import { TryAgainLine } from '@/src/components/TryAgain';
import { e2eTrace } from '@/src/utils/e2eTrace';
import { nav } from '@/src/utils/typedRouter';

import { MOODS } from './constants';
import { DarkroomHero } from './DarkroomHero';
import { DarkroomMoodBar } from './DarkroomMoodBar';
import { DarkroomFilterPanel } from './DarkroomFilterPanel';
import { Presence } from '@/src/components/motion/Presence';
import { ROOM, SHEET } from './sheet';

export const DarkroomHeader = React.memo(function DarkroomHeader({ sheet, stale, onRetry }: {
  /** A contact sheet follows (prints, or its still tiles): its head and top edge are drawn. */
  sheet: boolean;
  /** The prints shown are kept from a visit: the archives could not be reached. */
  stale: boolean;
  /** Ask the archives again; absent while the phone has no connection (it asks by itself). */
  onRetry?: () => void;
}) {
  const [filtersVisible, setFiltersVisible] = useState(false);
  const matchCount = useDiscoverStore((s) => s.accumulatedFilms.length);
  const {
    mood, query, inputVal, filters,
    setPage, setQuery, setInputVal,
    clearFilters, updateFilter, clearSearch, applyMood,
  } = useDiscoverStore(
    useShallow((s) => ({
      mood: s.mood,
      query: s.query,
      inputVal: s.inputVal,
      filters: s.filters,
      setPage: s.setPage,
      setQuery: s.setQuery,
      setInputVal: s.setInputVal,
      clearFilters: s.clearFilters,
      updateFilter: s.updateFilter,
      clearSearch: s.clearSearch,
      applyMood: s.applyMood,
    })),
  );

  const [suggestions, setSuggestions] = useState<DiscoverFilm[]>([]);
  // The suggestions for the words in the field could not be read: said where they would be,
  // never left as none (a member searching sees why nothing came). Asked again on TRY AGAIN.
  const [suggestionsUnreachable, setSuggestionsUnreachable] = useState(false);
  const [askedAgain, setAskedAgain] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const [localYearFrom, setLocalYearFrom] = useState(filters.yearFrom ? String(filters.yearFrom) : '');
  const [localYearTo, setLocalYearTo] = useState(filters.yearTo ? String(filters.yearTo) : '');

  // Suggestions show while the member is in the search, and the keyboard going
  // away closes them. On Android the back key hides the keyboard but leaves the
  // field focused, so tapping it again never fires onFocus: the keyboard coming
  // back, or a keystroke, is what reopens them.
  const fieldFocused = useRef(false);
  const setFieldFocused = useCallback((focused: boolean) => {
    e2eTrace('darkroom.field', { focused });
    fieldFocused.current = focused;
    setIsFocused(focused);
  }, []);
  useEffect(() => {
    const hid = Keyboard.addListener('keyboardDidHide', () => {
      e2eTrace('darkroom.keyboard', { shown: false });
      setIsFocused(false);
    });
    const shown = Keyboard.addListener('keyboardDidShow', () => {
      e2eTrace('darkroom.keyboard', { shown: true, field: fieldFocused.current });
      if (fieldFocused.current) setIsFocused(true);
    });
    return () => { hid.remove(); shown.remove(); };
  }, []);
  // E2E only: which header this is, so a second one mounted is seen.
  const instance = useRef(Math.random().toString(36).slice(2, 6)).current;
  useEffect(() => {
    e2eTrace('darkroom.header', { instance, mounted: true });
    return () => e2eTrace('darkroom.header', { instance, mounted: false });
  }, [instance]);
  useEffect(() => {
    e2eTrace('darkroom.suggestions', { instance, open: isFocused, count: suggestions.length });
  }, [instance, isFocused, suggestions.length]);

  const handleInputValChange = useCallback((text: string) => {
    setInputVal(text);
    if (fieldFocused.current) setIsFocused(true);
  }, [setInputVal]);

  // The year fields follow the store (a filter cleared elsewhere empties them).
  useEffect(() => {
    if (filters.yearFrom && String(filters.yearFrom) !== localYearFrom) setLocalYearFrom(String(filters.yearFrom));
    else if (!filters.yearFrom && localYearFrom !== '') setLocalYearFrom('');

    if (filters.yearTo && String(filters.yearTo) !== localYearTo) setLocalYearTo(String(filters.yearTo));
    else if (!filters.yearTo && localYearTo !== '') setLocalYearTo('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.yearFrom, filters.yearTo]);

  const isSearching = !!query;
  const activeFilterCount = [
    filters.genreId,
    filters.decade,
    filters.language,
    filters.minRating > 0 ? 1 : null,
    (filters.yearFrom || filters.yearTo) ? 1 : null,
    filters.sortBy !== 'popularity.desc' ? 1 : null,
  ].filter(Boolean).length;

  useEffect(() => {
    let active = true;
    const val = inputVal.trim().toLowerCase();

    // Words that are new: what the last ones' failure said is not said of these.
    setSuggestionsUnreachable(false);
    // Too short, or already submitted as the search: no suggestions.
    if (!val || val.length < 2 || val === query.trim().toLowerCase()) {
      setSuggestions([]);
      return;
    }
    const timeoutId = setTimeout(async () => {
      try {
        e2eTrace('darkroom.search.ask', { val });
        const raw = await tmdb.search(val, 1);
        e2eTrace('darkroom.search.answer', { val, active, count: raw.results?.length ?? null, type: raw.searchType ?? null });
        if (active) setSuggestions(raw.results?.slice(0, 5) ?? []);
      } catch (e: unknown) {
        e2eTrace('darkroom.search.error', { val, message: e instanceof Error ? e.message : String(e) });
        if (__DEV__) console.error('[DarkroomHeader] suggestions fetch error:', e);
        // Never the last words' suggestions under these: pressing one would open
        // a film the member is no longer asking for. Where they would be, the
        // catalogue is said to be out of reach, as the search itself says it.
        if (active) {
          setSuggestions([]);
          setSuggestionsUnreachable(true);
        }
      }
    }, 450);
    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [inputVal, query, askedAgain]);

  const askForSuggestionsAgain = useCallback(() => setAskedAgain((n) => n + 1), []);

  useEffect(() => {
    if (!inputVal.trim() && query !== '') {
      setQuery('');
      setPage(1);
    }
  }, [inputVal, query, setQuery, setPage]);

  const handleSearchSubmit = useCallback(() => {
    Keyboard.dismiss();
    TactileEngine.mutate();
    setQuery(inputVal);
    setPage(1);
    setSuggestions([]);
  }, [inputVal, setQuery, setPage]);

  const handleClearSearch = useCallback(() => {
    clearSearch();
    setSuggestions([]);
    setPage(1);
  }, [clearSearch, setPage]);

  const handleSelectMood = useCallback((m: typeof MOODS[number]) => {
    applyMood(mood?.label === m.label ? null : m);
  }, [mood?.label, applyMood]);

  const handleSuggestionPress = useCallback((item: DiscoverFilm) => {
    setSuggestions([]);
    Keyboard.dismiss();
    nav.push(item.media_type === 'person' ? `/person/${item.id}` : `/film/${item.id}`);
  }, []);

  return (
    <View>
      <DarkroomHero
        isFocused={isFocused}
        inputVal={inputVal}
        query={query}
        handleInputValChange={handleInputValChange}
        handleSearchSubmit={handleSearchSubmit}
        handleClearSearch={handleClearSearch}
        suggestions={suggestions}
        suggestionsUnreachable={suggestionsUnreachable}
        askForSuggestionsAgain={askForSuggestionsAgain}
        handleSuggestionPress={handleSuggestionPress}
        setFieldFocused={setFieldFocused}
      />

      {!isSearching && (
        <>
          <DarkroomMoodBar mood={mood} handleSelectMood={handleSelectMood} />

          {/* The settings' bar: the toggle, and CLEAR beside it, each a target of its own. */}
          <View style={s.setbar}>
            <PressableScale style={s.setToggle} onPress={() => setFiltersVisible(!filtersVisible)} haptic="medium" hitSlop={null}
              accessibilityRole="button" accessibilityState={{ expanded: filtersVisible }}
              // The pill's number was read alone, after the words: said with them.
              accessibilityLabel={`${filtersVisible ? 'Hide filters' : 'Expand filters'}${activeFilterCount > 0 ? `, ${activeFilterCount} applied` : ''}`}>
              <SlidersHorizontal size={16} color={colors.sepia} />
              <Text style={s.setWord} {...scaledTextProps}>{filtersVisible ? 'HIDE FILTERS' : 'EXPAND FILTERS'}</Text>
              {activeFilterCount > 0 && (
                <View style={s.pill}><Text style={s.pillWord} {...scaledTextProps}>{activeFilterCount}</Text></View>
              )}
            </PressableScale>
            {activeFilterCount > 0 && (
              <PressableScale style={s.clear} onPress={() => { clearFilters(); setPage(1); }} haptic="light" hitSlop={null}
                accessibilityRole="button" accessibilityLabel="Clear the filters">
                <Text style={s.clearWord} {...scaledTextProps}>CLEAR</Text>
              </PressableScale>
            )}
          </View>

          <Presence>
            {filtersVisible && (
              <DarkroomFilterPanel
                key="filters"
                filters={filters}
                updateFilter={updateFilter}
                localYearFrom={localYearFrom}
                setLocalYearFrom={setLocalYearFrom}
                localYearTo={localYearTo}
                setLocalYearTo={setLocalYearTo}
              />
            )}
          </Presence>
        </>
      )}

      {stale && (
        <View style={s.unreached}>
          <Text style={s.unreachedWords} {...scaledTextProps}>The archives could not be reached.</Text>
          {onRetry ? <TryAgainLine onPress={onRetry} what="reach the archives" style={s.tryLine} /> : null}
        </View>
      )}

      {sheet && (
        <>
          {/* THE NEGATIVES: undeveloped stock. ("The Archive" is the profile's watched films; two rooms
              never share a name.) Loaded so far, not a total: the count climbs as the sheet is read. */}
          <View style={s.head}>
            <Text style={s.headWord} {...scaledTextProps} accessibilityRole="header">
              {isSearching ? `DEVELOPING: "${query.toUpperCase()}"` : (mood ? `MOOD: ${mood.label.toUpperCase()}` : 'THE NEGATIVES')}
            </Text>
            <Text style={s.headTitle} {...displayTextProps}>
              {isSearching ? `${matchCount} ${matchCount === 1 ? 'Print' : 'Prints'} Developed` : (mood ? mood.sub : 'Awaiting Development')}
            </Text>
            {stale ? <Text style={s.headOld} {...scaledTextProps}>From your last visit: these prints may have changed.</Text> : null}
          </View>
          <View style={s.sheetTop} />
        </>
      )}
    </View>
  );
});

DarkroomHeader.displayName = 'DarkroomHeader';

const s = StyleSheet.create({
  setbar: { marginTop: 12, flexDirection: 'row', minHeight: 48, backgroundColor: colors.soot, borderRadius: ROOM.radius },
  setToggle: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14, paddingRight: 8 },
  setWord: { flexShrink: 1, fontFamily: fonts.sub, fontSize: 11, letterSpacing: 2.4, color: colors.bone, includeFontPadding: false },
  pill: { minWidth: 20, minHeight: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: colors.sepia, alignItems: 'center', justifyContent: 'center' },
  pillWord: { fontFamily: fonts.sub, fontSize: 10, color: colors.ink, includeFontPadding: false },
  clear: { minHeight: 48, paddingHorizontal: 14, justifyContent: 'center' },
  clearWord: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 2.4, color: colors.sepia, includeFontPadding: false },
  unreached: {
    marginTop: 20, minHeight: 56, backgroundColor: colors.soot, borderRadius: ROOM.radius,
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 10,
    paddingVertical: 8, paddingHorizontal: 16,
  },
  unreachedWords: { flexShrink: 1, fontFamily: fonts.bodyItalic, fontSize: 13, lineHeight: 20, color: colors.bone },
  tryLine: { minHeight: 44, justifyContent: 'center' },
  head: { marginTop: 28, alignItems: 'center' },
  headWord: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 3, color: colors.sepia, textAlign: 'center', includeFontPadding: false },
  headTitle: { fontFamily: fonts.display, fontSize: 20, lineHeight: 26, color: colors.silverScreen, textAlign: 'center', marginTop: 4 },
  headOld: { fontFamily: fonts.bodyItalic, fontSize: 12, lineHeight: 18, color: colors.bone, textAlign: 'center', marginTop: 10 },
  // The sheet's top edge: its rows follow, on the same ink, and its foot closes it (SheetFoot).
  sheetTop: { marginTop: 14, height: SHEET.pad, backgroundColor: colors.inkwell, borderTopLeftRadius: ROOM.radius, borderTopRightRadius: ROOM.radius },
});
