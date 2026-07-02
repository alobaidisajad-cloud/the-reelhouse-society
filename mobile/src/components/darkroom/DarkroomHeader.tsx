import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Keyboard } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SlidersHorizontal } from 'lucide-react-native';
import TactileEngine from '@/src/utils/TactileEngine';
import { useRouter } from 'expo-router';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, useAnimatedProps, cancelAnimation } from 'react-native-reanimated';
import { useShallow } from 'zustand/react/shallow';

import { colors, fonts, spacing, effects } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';
import { useDiscoverStore, type DiscoverFilm } from '@/src/stores/discover';
import PressableScale from '@/src/components/PressableScale';

import { MOODS } from './constants';
import { DarkroomHero } from './DarkroomHero';
import { DarkroomMoodBar } from './DarkroomMoodBar';
import { DarkroomFilterPanel } from './DarkroomFilterPanel';

// We must export Chip for DarkroomFilterPanel to use
export const Chip = React.memo(function Chip({ active, onPress, children, color }: { active: boolean; onPress: () => void; children: React.ReactNode; color?: string }) {
  return (
    <PressableScale
      onPress={onPress}
      haptic="light"
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={[
        s.chip,
        {
          backgroundColor: active ? (color ?? colors.sepia) : colors.soot,
          borderColor: active ? (color ?? colors.sepia) : colors.ash,
        }
      ]}
    >
      {/* No glow on the active chip — sepia glow around ink text on a sepia
          ground was invisible mud. A crisp stamp reads better. */}
      <Text style={[s.chipText, { color: active ? colors.ink : colors.bone }]}>
        {children}
      </Text>
    </PressableScale>
  );
});

export const DarkroomHeader = React.memo(() => {
  const [filtersVisible, setFiltersVisible] = useState(false);
  const router = useRouter();
  const matchCount = useDiscoverStore(s => s.accumulatedFilms.length);
  const {
    mood, query, inputVal, filters,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    setPage, setMood, setQuery, setInputVal,
    clearFilters, updateFilter, clearSearch, applyMood
  } = useDiscoverStore(
    useShallow((s) => ({
      mood: s.mood,
      query: s.query,
      inputVal: s.inputVal,
      filters: s.filters,
      setPage: s.setPage,
      setMood: s.setMood,
      setQuery: s.setQuery,
      setInputVal: s.setInputVal,
      clearFilters: s.clearFilters,
      updateFilter: s.updateFilter,
      clearSearch: s.clearSearch,
      applyMood: s.applyMood
    }))
  );

  const [suggestions, setSuggestions] = useState<DiscoverFilm[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const [localYearFrom, setLocalYearFrom] = useState(filters.yearFrom ? String(filters.yearFrom) : '');
  const [localYearTo, setLocalYearTo] = useState(filters.yearTo ? String(filters.yearTo) : '');
  
  // ── Breathing Ember (Scanning) ──
  const searchEmberOpacity = useSharedValue(0.5);
  useEffect(() => {
    if (isFocused && inputVal.length > 0 && suggestions.length === 0 && inputVal !== query) {
      searchEmberOpacity.value = withRepeat(withTiming(1, { duration: 600 }), -1, true);
    } else {
      searchEmberOpacity.value = withTiming(0.5, { duration: 300 });
    }
    return () => cancelAnimation(searchEmberOpacity);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, inputVal, query, suggestions.length]);

  // ── Search ghosting ──
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidHide', () => {
      // Do not wipe suggestions from memory, just rely on isFocused to visually hide them.
      setIsFocused(false);
    });
    return () => sub.remove();
  }, [setIsFocused]);

  const animatedSearchProps = useAnimatedProps(() => ({
    color: (isFocused && inputVal.length > 0) ? colors.bloodReel : colors.sepia,
  }));
  const animatedSearchStyle = useAnimatedStyle(() => ({
    opacity: searchEmberOpacity.value,
  }));

  const handleInputValChange = useCallback((text: string) => {
    setInputVal(text);
  }, [setInputVal]);

  // Sync year inputs from store
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
    
    // Prevent race condition if user hits submit early
    if (!val || val.length < 2 || val === query.trim().toLowerCase()) {
      setSuggestions([]);
      return;
    }
    const timeoutId = setTimeout(async () => {
      try {
        const semanticMap: Record<string, number> = {
          'that 90s thriller where the guy forgets his tattoos': 77, // Memento
          'chef anxiety movie': 730888, // Boiling Point
          'the one with the glowing briefcase': 680, // Pulp Fiction
          'guy trapped in a computer matrix': 603, // The Matrix
        };

        let semanticMatchId: number | null = null;
        for (const [key, id] of Object.entries(semanticMap)) {
          // Strict Easter Egg Match
          if (key === val || (val.length >= 18 && key.startsWith(val))) {
             semanticMatchId = id; 
             break;
          }
        }

        if (semanticMatchId) {
            const match = await tmdb.detail(semanticMatchId);
            if (active && match) {
              setSuggestions([{ ...match, media_type: 'movie' }]);
              TactileEngine.success();
            }
            return;
        }

        const raw = await tmdb.search(val, 1); 
        if (active) {
            setSuggestions(raw.results?.slice(0, 5) ?? []);
        }
       
      } catch (e: unknown) {
        if (__DEV__) console.error('[DarkroomHeader] Stats fetch error:', e);
      }
    }, 450);
    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [inputVal, query]);

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
    if (mood?.label === m.label) {
      applyMood(null);
    } else {
      applyMood(m);
    }
  }, [mood?.label, applyMood]);

  const handleSuggestionPress = useCallback((item: DiscoverFilm) => {
    setSuggestions([]);
    Keyboard.dismiss();
    (router.push as any)((item.media_type === 'person' ? `/person/${item.id}` : `/film/${item.id}`) as any);
  }, [router]);

  return (
    <View style={s.headerContainer}>
      <DarkroomHero 
        isFocused={isFocused}
        inputVal={inputVal}
        query={query}
        handleInputValChange={handleInputValChange}
        handleSearchSubmit={handleSearchSubmit}
        handleClearSearch={handleClearSearch}
        suggestions={suggestions}
        handleSuggestionPress={handleSuggestionPress}
        animatedSearchProps={animatedSearchProps}
        animatedSearchStyle={animatedSearchStyle}
        setIsFocused={setIsFocused}
      />

      {/* Hide filters block natively during search to prevent state desync UX */}
      {!isSearching && (
        <>
          <DarkroomMoodBar 
            mood={mood} 
            handleSelectMood={handleSelectMood} 
          />

          <View style={s.filterHeader}>
            <PressableScale 
              style={[s.filterToggle, filtersVisible && s.filterToggleActive]}
              onPress={() => setFiltersVisible(!filtersVisible)}
              haptic="medium"
              hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            >
              <SlidersHorizontal size={14} color={filtersVisible ? colors.sepia : colors.fog} />
              <Text style={[s.filterToggleText, filtersVisible && s.filterToggleTextActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {filtersVisible ? 'HIDE FILTERS' : 'EXPAND FILTERS'}
              </Text>
              {activeFilterCount > 0 && (
                <View style={s.filterBadge}><Text style={s.filterBadgeText}>{activeFilterCount}</Text></View>
              )}
            </PressableScale>

            {activeFilterCount > 0 && (
              <PressableScale onPress={() => { clearFilters(); setPage(1); }} haptic="light" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={s.clearFiltersText}>CLEAR</Text>
              </PressableScale>
            )}
          </View>

          {filtersVisible && (
            <DarkroomFilterPanel 
              filters={filters}
              updateFilter={updateFilter}
              localYearFrom={localYearFrom}
              setLocalYearFrom={setLocalYearFrom}
              localYearTo={localYearTo}
              setLocalYearTo={setLocalYearTo}
            />
          )}
        </>
      )}

      <LinearGradient colors={['transparent', 'rgba(184,137,26,0.25)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.sectionDividerLine} />

      {/* THE NEGATIVES — undeveloped stock. ("The Archive" belongs to the
          profile's watched-films room; two rooms must never share a name.) */}
      <View style={s.sectionHeaderWrap}>
        <Text style={s.sectionLabel} numberOfLines={1} ellipsizeMode="tail" adjustsFontSizeToFit minimumFontScale={0.7}>
          {isSearching ? `DEVELOPING: "${query.toUpperCase()}"` : (mood ? `MOOD: ${mood.label.toUpperCase()}` : 'THE NEGATIVES')}
        </Text>
        <Text style={s.sectionTitle} numberOfLines={1} ellipsizeMode="tail" adjustsFontSizeToFit minimumFontScale={0.7}>
          {isSearching ? `${matchCount} Matches Found` : (mood ? mood.sub : 'Awaiting Development')}
        </Text>
      </View>
    </View>
  );
});

DarkroomHeader.displayName = 'DarkroomHeader';

const s = StyleSheet.create({
  headerContainer: {
    marginBottom: spacing.xl,
    zIndex: 100,
  },
  chip: {
    borderWidth: 1.5,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 16,
    ...effects.shadowSurface,
  },
  chipText: {
    fontFamily: fonts.sub,
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  filterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  filterToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(18,14,9,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(184,137,26,0.2)',
    borderRadius: 6,
    ...effects.shadowSurface,
  },
  filterToggleActive: {
    backgroundColor: 'rgba(10,8,5,0.95)',
    borderColor: 'rgba(184,137,26,0.4)',
  },
  filterToggleText: {
    fontFamily: fonts.sub,
    fontSize: 10,
    letterSpacing: 2.5,
    color: colors.fog,
  },
  filterToggleTextActive: {
    color: '#F2ECD8',
    ...effects.textGlowSepia, textShadowRadius: 8
  },
  filterBadge: {
    backgroundColor: colors.sepia,
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  filterBadgeText: {
    color: colors.ink,
    fontSize: 9,
    fontFamily: fonts.sub,
  },
  clearFiltersText: {
    fontFamily: fonts.sub,
    fontSize: 10,
    color: colors.sepia,
    letterSpacing: 1.5,
  },
  sectionDividerLine: {
    height: 1,
    marginVertical: spacing.md,
    marginHorizontal: -spacing.md,
  },
  sectionHeaderWrap: {
    marginBottom: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  sectionLabel: {
    fontFamily: fonts.sub,
    fontSize: 10,
    letterSpacing: 3,
    color: colors.sepia,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontFamily: fonts.display,
    fontSize: 18,
    color: colors.parchment,
    textAlign: 'center',
  },
});
