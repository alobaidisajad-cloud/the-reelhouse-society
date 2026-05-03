import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, Keyboard } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import Animated, { FadeInDown, SlideOutDown, useSharedValue, useAnimatedStyle, withRepeat, withTiming, useAnimatedProps, cancelAnimation } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Search, X, SlidersHorizontal } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';

import { colors, fonts, spacing, effects } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';
import { useDiscoverStore, type DiscoverFilm } from '@/src/stores/discover';
import PressableScale from '@/src/components/PressableScale';

import { GENRES, DECADES, LANGUAGES, SORT_OPTIONS, MIN_RATINGS, YEAR_MIN, YEAR_MAX, MOODS, MOOD_ICONS } from './constants';
import { DarkroomAtmo, DarkroomSuggestionRow } from './DarkroomCards';

const AnimatedSearchIcon = Animated.createAnimatedComponent(Search);

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
      <Text style={[s.chipText, { color: active ? colors.ink : colors.bone, ...(active ? effects.textGlowSepia : {}) }]}>
        {children}
      </Text>
    </PressableScale>
  );
});

 
export const DarkroomHeader = React.memo(({ filtersVisible, setFiltersVisible }: { filtersVisible: boolean, setFiltersVisible: (v: boolean) => void }) => {
  const router = useRouter();
  const {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    page, mood, query, inputVal, filters, accumulatedFilms,
    setPage, setMood, setQuery, setInputVal,
    clearFilters, updateFilter, clearSearch
  } = useDiscoverStore();

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

  const animatedSearchProps = useAnimatedProps(() => ({
    color: (isFocused && inputVal.length > 0) ? colors.bloodReel : colors.sepia,
  }));
  const animatedSearchStyle = useAnimatedStyle(() => ({
    opacity: searchEmberOpacity.value,
  }));

  const handleInputValChange = useCallback((text: string) => {
    setInputVal(text);
  }, [setInputVal]);

  useEffect(() => {
    if (!filters.yearFrom && localYearFrom !== '') setLocalYearFrom('');
    if (!filters.yearTo && localYearTo !== '') setLocalYearTo('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.yearFrom, filters.yearTo]);

  useEffect(() => {
    if (localYearFrom === '' || localYearFrom.length === 4) {
      const raw = parseInt(localYearFrom, 10);
      const clamped = isNaN(raw) ? null : Math.max(YEAR_MIN, Math.min(YEAR_MAX, raw));
      if (clamped !== filters.yearFrom) {
        const safeFrom = (clamped && filters.yearTo && clamped > filters.yearTo) ? filters.yearTo : clamped;
        updateFilter({ yearFrom: safeFrom, decade: null });
        setPage(1);
        if (safeFrom !== null && String(safeFrom) !== localYearFrom) setLocalYearFrom(String(safeFrom));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localYearFrom]);

  useEffect(() => {
    if (localYearTo === '' || localYearTo.length === 4) {
      const raw = parseInt(localYearTo, 10);
      const clamped = isNaN(raw) ? null : Math.max(YEAR_MIN, Math.min(YEAR_MAX, raw));
      if (clamped !== filters.yearTo) {
        const safeTo = (clamped && filters.yearFrom && clamped < filters.yearFrom) ? filters.yearFrom : clamped;
        updateFilter({ yearTo: safeTo, decade: null });
        setPage(1);
        if (safeTo !== null && String(safeTo) !== localYearTo) setLocalYearTo(String(safeTo));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localYearTo]);
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
    if (!val || val.length < 2) {
      setSuggestions([]);
      return;
    }
    const timeoutId = setTimeout(async () => {
      try {
        const semanticMap: Record<string, number> = {
          'that 90s thriller where the guy forgets his tattoos': 77, // Memento
          'chef anxiety movie': 112160, // The Bear
          'the one with the glowing briefcase': 680, // Pulp Fiction
          'guy trapped in a computer matrix': 603, // The Matrix
        };

        let semanticMatchId: number | null = null;
        for (const [key, id] of Object.entries(semanticMap)) {
          if (val.includes('movie') || val.length > 20) {
              if (key.includes(val) || val.includes(key.substring(0, 15))) {
                  semanticMatchId = id; break;
              }
          }
        }

        if (semanticMatchId) {
            const match = await tmdb.detail(semanticMatchId);
            if (active && match) {
              setSuggestions([{ ...match, media_type: 'movie' }]);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
  }, [inputVal]);

  useEffect(() => {
    if (!inputVal.trim()) {
      if (query !== '') {
        setQuery('');
        setPage(1);
      }
      return;
    }
    const timeoutId = setTimeout(() => {
      if (inputVal.trim() !== query) {
        setQuery(inputVal.trim());
        setPage(1);
      }
    }, 450);
    return () => clearTimeout(timeoutId);
  }, [inputVal, query, setQuery, setPage]);

  const handleSearchSubmit = useCallback(() => {
    Keyboard.dismiss();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
      setMood(null);
      clearFilters();
    } else {
      setMood(m);
      clearFilters();
      updateFilter({ genreId: m.genre });
      clearSearch();
    }
    setPage(1);
  }, [mood, setMood, clearFilters, updateFilter, clearSearch, setPage]);

  const handleSuggestionPress = useCallback((item: DiscoverFilm) => {
    setSuggestions([]);
    Keyboard.dismiss();
    router.push((item.media_type === 'person' ? `/person/${item.id}` : `/film/${item.id}`) as any);
  }, [router]);

  return (
    <View style={s.headerContainer}>
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
                  {isLateNight ? "THE ARCHIVE IS HAUNTED" : "THE REELHOUSE SOCIETY"}
                </Text>
                <Text style={s.heroTitle} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                  {isLateNight ? "Late Night Projection" : "The Darkroom"}
                </Text>
              </>
            );
          })()}

          <View style={s.estRow}>
            <LinearGradient colors={['transparent', 'rgba(139,105,20,0.35)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.estRule} />
            <Text style={s.heroEst} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Est. 1924</Text>
            <LinearGradient colors={['rgba(139,105,20,0.35)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.estRule} />
          </View>

          <View style={s.searchWrap}>
            <AnimatedSearchIcon size={16} animatedProps={animatedSearchProps} style={[animatedSearchStyle, s.searchIcon]} />
            <TextInput
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              style={[s.searchInput, (isFocused || query.length > 0) && s.searchInputActive]}
              placeholder="Film title, director, actor..."
              placeholderTextColor={colors.fog}
              value={inputVal}
              onChangeText={handleInputValChange}
              maxLength={120}
              onSubmitEditing={handleSearchSubmit}
              returnKeyType="search"
              keyboardAppearance="dark"
              accessibilityLabel="Search films by title, director, or actor"
            />
            {query.length > 0 && (
              <PressableScale onPress={handleClearSearch} style={s.clearBtn} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} haptic="light">
                <X size={16} color={colors.fog} />
              </PressableScale>
            )}

            {suggestions.length > 0 && (
              <View style={s.suggestionsBox}>
                {suggestions.map((item) => (
                  <DarkroomSuggestionRow key={`${item.media_type}-${item.id}`} item={item} onPress={handleSuggestionPress} />
                ))}
              </View>
            )}
          </View>
        </Animated.View>
      </View>

      {!isSearching && (
        <View style={s.moodSection}>
          <Text style={s.sectionEyebrow}>✦ DEVELOP BY MOOD ✦</Text>
          <FlashList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={MOODS}
            keyExtractor={v => v.label}
            contentContainerStyle={s.moodList}
            estimatedItemSize={80}
            ListFooterComponent={<View style={{ width: 16 }} />}
            renderItem={({ item }) => {
              const active = mood?.label === item.label;
              return (
                <PressableScale
                  onPress={() => handleSelectMood(item)}
                  style={[s.moodCard, active && { backgroundColor: item.color, borderColor: item.accent }]}
                  haptic="medium"
                >
                  {(() => {
                    const IconComp = MOOD_ICONS[item.icon];
                    return IconComp ? <IconComp size={16} color={active ? item.accent : colors.bone} strokeWidth={1.5} /> : null;
                  })()}
                  <View style={{ flexShrink: 1 }}>
                    <Text style={[s.moodLabel, active && s.moodLabelActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{item.label}</Text>
                    <Text style={[s.moodSub, active && s.moodSubActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{item.sub}</Text>
                  </View>
                </PressableScale>
              );
            }}
          />
        </View>
      )}

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
        <Animated.View entering={FadeInDown.duration(300)} exiting={SlideOutDown.duration(200)} style={s.filterPanel}>
          <Text style={s.filterSectionTitle}>GENRE</Text>
          <View style={s.chipRow}>
            {GENRES.map(g => (
              <Chip key={g.id} active={filters.genreId === g.id} onPress={() => { updateFilter({ genreId: filters.genreId === g.id ? null : g.id }); setPage(1); }}>
                {g.name}
              </Chip>
            ))}
          </View>

          <Text style={[s.filterSectionTitle, s.filterSectionTitleSpaced]}>DECADE</Text>
          <View style={s.chipRow}>
            {DECADES.map(d => (
              <Chip key={d.label} active={filters.decade?.label === d.label} onPress={() => { updateFilter({ decade: filters.decade?.label === d.label ? null : d, yearFrom: null, yearTo: null }); setPage(1); }}>
                {d.label}
              </Chip>
            ))}
          </View>

          <Text style={[s.filterSectionTitle, s.filterSectionTitleSpaced]}>CUSTOM YEAR RANGE</Text>
          <View style={s.yearRangeRow}>
            <TextInput
              style={s.yearInput}
              placeholder="FROM"
              placeholderTextColor={colors.fog}
              keyboardType="number-pad"
              keyboardAppearance="dark"
              maxLength={4}
              value={localYearFrom}
              onChangeText={setLocalYearFrom}
              onEndEditing={() => {
                const raw = parseInt(localYearFrom, 10);
                const clamped = isNaN(raw) ? null : Math.max(YEAR_MIN, Math.min(YEAR_MAX, raw));
                const safeVal = (clamped && filters.yearTo && clamped > filters.yearTo) ? filters.yearTo : clamped;
                if (safeVal !== filters.yearFrom) {
                  updateFilter({ yearFrom: safeVal, decade: null });
                  setPage(1);
                }
                if (safeVal !== null && String(safeVal) !== localYearFrom) setLocalYearFrom(String(safeVal));
              }}
              returnKeyType="done"
            />
            <Text style={s.yearRangeDash}>—</Text>
            <TextInput
              style={s.yearInput}
              placeholder="TO"
              placeholderTextColor={colors.fog}
              keyboardType="number-pad"
              keyboardAppearance="dark"
              maxLength={4}
              value={localYearTo}
              onChangeText={setLocalYearTo}
              onEndEditing={() => {
                const raw = parseInt(localYearTo, 10);
                const clamped = isNaN(raw) ? null : Math.max(YEAR_MIN, Math.min(YEAR_MAX, raw));
                const safeVal = (clamped && filters.yearFrom && clamped < filters.yearFrom) ? filters.yearFrom : clamped;
                if (safeVal !== filters.yearTo) {
                  updateFilter({ yearTo: safeVal, decade: null });
                  setPage(1);
                }
                if (safeVal !== null && String(safeVal) !== localYearTo) setLocalYearTo(String(safeVal));
              }}
              returnKeyType="done"
            />
            {(filters.yearFrom || filters.yearTo) && (
              <PressableScale 
                onPress={() => { updateFilter({ yearFrom: null, yearTo: null }); setPage(1); }} 
                style={s.yearClearBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                haptic="light"
              >
                <X size={12} color={colors.fog} />
              </PressableScale>
            )}
          </View>

          <Text style={[s.filterSectionTitle, s.filterSectionTitleSpaced]}>LANGUAGE</Text>
          <View style={s.chipRow}>
            {LANGUAGES.map(l => (
              <Chip key={l.iso} active={filters.language === l.iso} onPress={() => { updateFilter({ language: filters.language === l.iso ? null : l.iso }); setPage(1); }}>
                {l.name}
              </Chip>
            ))}
          </View>

          <Text style={[s.filterSectionTitle, s.filterSectionTitleSpaced]}>SORT BY</Text>
          <View style={s.chipRow}>
            {SORT_OPTIONS.map(o => (
              <Chip key={o.value} active={filters.sortBy === o.value} onPress={() => { updateFilter({ sortBy: o.value }); setPage(1); }}>
                {o.label}
              </Chip>
            ))}
          </View>

          <Text style={[s.filterSectionTitle, s.filterSectionTitleSpaced]}>MIN RATING{filters.minRating > 0 ? `: ${filters.minRating}+` : ''}</Text>
          <View style={s.chipRow}>
            {MIN_RATINGS.map(r => (
              <Chip key={r} active={filters.minRating === r} onPress={() => { updateFilter({ minRating: filters.minRating === r ? 0 : r }); setPage(1); }}>
                {r === 0 ? 'Any' : `${r}+`}
              </Chip>
            ))}
          </View>
        </Animated.View>
      )}

      <LinearGradient colors={['transparent', 'rgba(139,105,20,0.25)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.sectionDividerLine} />

      <View style={s.sectionHeaderWrap}>
        <Text style={s.sectionLabel} numberOfLines={1} ellipsizeMode="tail" adjustsFontSizeToFit minimumFontScale={0.7}>
          {isSearching ? `ARCHIVE SEARCH: "${query.toUpperCase()}"` : (mood ? `MOOD: ${mood.label.toUpperCase()}` : 'THE ARCHIVE')}
        </Text>
        <Text style={s.sectionTitle} numberOfLines={1} ellipsizeMode="tail" adjustsFontSizeToFit minimumFontScale={0.7}>
          {isSearching ? `${accumulatedFilms.length} Matches Found` : (mood ? mood.sub : 'Discover Titles')}
        </Text>
      </View>
    </View>
  );
});

const s = StyleSheet.create({
  headerContainer: {
    marginBottom: spacing.xl,
  },
  heroContainer: {
    paddingVertical: spacing.xxl,
    marginHorizontal: 0,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139,105,20,0.2)',
    position: 'relative',
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
    borderColor: 'rgba(139,105,20,0.2)',
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
    borderColor: 'rgba(139,105,20,0.5)',
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
  moodSection: {
    marginBottom: spacing.xl,
  },
  sectionEyebrow: {
    fontFamily: fonts.ui,
    fontSize: 10,
    letterSpacing: 3,
    color: colors.sepia,
    textAlign: 'center',
    marginBottom: 10,
  },
  moodList: {
    gap: 8,
    paddingHorizontal: 4,
  },
  moodCard: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(10,8,5,0.8)',
    borderColor: 'rgba(139,105,20,0.15)',
    minWidth: 140,
    ...effects.shadowSurface,
  },
  moodLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 3,
    color: colors.bone,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  moodLabelActive: {
    color: '#F2ECD8',
    ...effects.textGlowSepia, textShadowRadius: 8
  },
  moodSub: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.fog,
    marginTop: 4,
    opacity: 0.6,
  },
  moodSubActive: {
    opacity: 0.9,
    color: '#f2e8a0'
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
    borderColor: 'rgba(139,105,20,0.2)',
    borderRadius: 6,
    ...effects.shadowSurface,
  },
  filterToggleActive: {
    backgroundColor: 'rgba(10,8,5,0.95)',
    borderColor: 'rgba(139,105,20,0.4)',
  },
  filterToggleText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 3,
    color: colors.fog,
    fontWeight: '700',
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
    fontFamily: fonts.uiBold,
  },
  clearFiltersText: {
    fontFamily: fonts.ui,
    fontSize: 10,
    color: colors.sepia,
    letterSpacing: 1,
  },
  filterPanel: {
    backgroundColor: 'rgba(8,6,4,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(139,105,20,0.35)',
    padding: spacing.md,
    borderRadius: 8,
    marginBottom: spacing.lg,
  },
  filterSectionTitle: {
    fontFamily: fonts.ui,
    fontSize: 9,
    letterSpacing: 2,
    color: colors.sepia,
    marginBottom: spacing.sm,
  },
  filterSectionTitleSpaced: {
    marginTop: spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  yearRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  yearInput: {
    flex: 1,
    backgroundColor: 'rgba(14,11,8,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(139,105,20,0.15)',
    borderRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 14,
    color: colors.parchment,
    fontFamily: fonts.ui,
    fontSize: 13,
    letterSpacing: 2,
    textAlign: 'center',
  },
  yearRangeDash: {
    fontFamily: fonts.display,
    fontSize: 16,
    color: colors.fog,
    opacity: 0.4,
  },
  yearClearBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(139,105,20,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  chip: {
    borderWidth: 1.5,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 16,
    ...effects.shadowSurface,
  },
  chipText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    fontWeight: '700'
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
    fontFamily: fonts.ui,
    fontSize: 10,
    letterSpacing: 4,
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


DarkroomHeader.displayName = 'DarkroomHeader';