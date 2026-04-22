import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput,
  Keyboard, FlatList,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import Animated, { FadeInDown, SlideOutDown, useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, Easing } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, X, SlidersHorizontal, Bookmark, Heart, Skull, Sparkles, Sun, Flame, Laugh } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Buster from '@/src/components/Buster';
import { useNetInfo } from '@react-native-community/netinfo';
import { EmptyOffline } from '@/src/components/EmptyStates';

import { colors, fonts, spacing, SEPIA_HASH } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';
import { useDiscoverStore } from '@/src/stores/discover';
import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import PressableScale from '@/src/components/PressableScale';
import { setScrollY } from '@/src/utils/scrollBridge';
import { effects } from '@/src/theme/theme';

// ══════════════════════════════════════════════════════════════
//  DARKROOM SAFELIGHT ATMOSPHERICS
// ══════════════════════════════════════════════════════════════
const DarkroomAtmo = React.memo(function DarkroomAtmo() {
  const pulse = useSharedValue(0.15);
  useEffect(() => {
    // A slow, rhythmic breathing of amber/red darkroom safelight
    pulse.value = withRepeat(
      withSequence(
        withTiming(0.25, { duration: 6000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.12, { duration: 6000, easing: Easing.inOut(Easing.sin) })
      ), -1, true
    );
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <Animated.View style={[StyleSheet.absoluteFillObject, style, { zIndex: 0 }]} pointerEvents="none">
      <LinearGradient
        colors={['rgba(180,45,45,0.4)', 'rgba(139,105,20,0.1)', 'transparent']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFillObject}
      />
    </Animated.View>
  );
});

const AnimatedView = Animated.createAnimatedComponent(View);



// === DATA DEFINITIONS (Mirrored from Web) ===
const GENRES = [
  { id: 28, name: 'Action' }, { id: 27, name: 'Horror' }, { id: 878, name: 'Sci-Fi' },
  { id: 18, name: 'Drama' }, { id: 35, name: 'Comedy' }, { id: 80, name: 'Crime' },
  { id: 14, name: 'Fantasy' }, { id: 9648, name: 'Mystery' }, { id: 37, name: 'Western' },
  { id: 16, name: 'Animation' }, { id: 99, name: 'Doc' }, { id: 10749, name: 'Romance' },
  { id: 53, name: 'Thriller' }, { id: 10751, name: 'Family' }, { id: 36, name: 'History' },
];

const DECADES = [
  { label: '2020s', from: '2020-01-01', to: '2029-12-31' },
  { label: '2010s', from: '2010-01-01', to: '2019-12-31' },
  { label: '2000s', from: '2000-01-01', to: '2009-12-31' },
  { label: '1990s', from: '1990-01-01', to: '1999-12-31' },
  { label: '1980s', from: '1980-01-01', to: '1989-12-31' },
  { label: '70s/Older', from: '1900-01-01', to: '1979-12-31' },
];

const LANGUAGES = [
  { iso: 'en', name: 'English' }, { iso: 'fr', name: 'French' }, { iso: 'es', name: 'Spanish' },
  { iso: 'ja', name: 'Japanese' }, { iso: 'ko', name: 'Korean' }, { iso: 'it', name: 'Italian' },
  { iso: 'de', name: 'German' }, { iso: 'zh', name: 'Chinese' }, { iso: 'ar', name: 'Arabic' },
  { iso: 'hi', name: 'Hindi' },
];

const SORT_OPTIONS = [
  { value: 'popularity.desc', label: 'Most Popular' },
  { value: 'vote_average.desc', label: 'Highest Rated' },
  { value: 'release_date.desc', label: 'Newest First' },
  { value: 'release_date.asc', label: 'Oldest First' },
  { value: 'revenue.desc', label: 'Box Office' },
  { value: 'vote_count.desc', label: 'Most Voted' },
];

const MIN_RATINGS = [0, 6, 7, 7.5, 8, 8.5];

const MOODS = [
  { label: 'Emotional', sub: 'Heavy, profound stories.', icon: 'Heart', genre: 18, sort: 'vote_average.desc', color: '#4A1A3A', accent: '#C06080' },
  { label: 'Terrifying', sub: 'Dark nightmares.', icon: 'Skull', genre: 27, sort: 'vote_average.desc', color: '#1A1A0A', accent: '#8B3A1A' },
  { label: 'Awe-Inspiring', sub: 'Epic magical worlds.', icon: 'Sparkles', genre: 14, sort: 'vote_average.desc', color: '#0A1A2A', accent: '#3A7A8B' },
  { label: 'Heartwarming', sub: 'Love & connection.', icon: 'Sun', genre: 10749, sort: 'release_date.asc', voteGte: 500, color: '#1C1208', accent: '#8B6914' },
  { label: 'Thrilling', sub: 'High-octane cinema.', icon: 'Flame', genre: 28, sort: 'popularity.desc', color: '#2A0A0A', accent: '#8B1A1A' },
  { label: 'Hilarious', sub: 'Pure joy & laughter.', icon: 'Laugh', genre: 35, sort: 'vote_average.desc', voteGte: 200, color: '#0A1A0A', accent: '#4A8B3A' },
];

const MOOD_ICONS: Record<string, typeof Heart> = { Heart, Skull, Sparkles, Sun, Flame, Laugh };

// === COMPONENTS ===

// Breathing skeleton for loading states — hoisted to module scope for stable reference
const AnimatedPosterSkeleton = React.memo(function AnimatedPosterSkeleton() {
  const op = useSharedValue(0.4);
  useEffect(() => {
    op.value = withRepeat(withTiming(0.8, { duration: 1000, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, []);
  const animStyle = useAnimatedStyle(() => ({ opacity: op.value }));
  return (
    <Animated.View style={[s.posterWrap, animStyle, { backgroundColor: 'rgba(14,11,8,0.7)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.06)' }]} />
  );
});

const Chip = React.memo(function Chip({ active, onPress, children, color }: { active: boolean; onPress: () => void; children: React.ReactNode; color?: string }) {
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

interface DiscoverFilm {
  id: number;
  title?: string;
  name?: string;
  poster_path?: string | null;
  profile_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  vote_average?: number;
  media_type?: string;
  popularity?: number;
}

const FilmGridCard = React.memo(function FilmGridCard({ item }: { item: DiscoverFilm }) {
  const router = useRouter();
  const isPerson = item.media_type === 'person';
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const isLogged = useFilmStore(s => !isPerson && !!s._loggedIndex[item.id]);
  const isSaved = useFilmStore(s => !isPerson && !!s._watchlistIndex[item.id]);
  const addToWatchlist = useFilmStore(s => s.addToWatchlist);
  const removeFromWatchlist = useFilmStore(s => s.removeFromWatchlist);

  const posterPath = isPerson ? item.profile_path : item.poster_path;
  const posterUri = posterPath ? (isPerson ? tmdb.profile(posterPath, 'w185') : tmdb.poster(posterPath)) : null;

  const handlePress = () => {
    router.push(isPerson ? `/person/${item.id}` : `/film/${item.id}`);
  };

  const toggleWatchlist = () => {
    if (isSaved) {
      removeFromWatchlist(item.id);
    } else {
      addToWatchlist({ id: item.id, title: item.title ?? item.name, poster_path: item.poster_path, release_date: item.release_date });
    }
  };

  return (
    <View style={s.posterWrap}>
    <PressableScale
      onPress={handlePress}
      haptic
      accessibilityRole="button"
      accessibilityLabel={isPerson ? item.name : (item.title || 'Film')}
    >
      <View style={[s.posterImg, !posterUri && s.posterPlaceholder]}>
        {posterUri ? (
          <>
            <Image source={{ uri: posterUri }} style={StyleSheet.absoluteFillObject} cachePolicy="memory-disk" placeholder={{ blurhash: SEPIA_HASH }} transition={50} contentFit="cover" />
            {/* Soft tactical tungsten edge mapping */}
            <LinearGradient 
              colors={['rgba(255,255,255,0.08)', 'transparent', 'rgba(10,5,3,0.9)']} 
              locations={[0, 0.4, 1]} 
              style={StyleSheet.absoluteFillObject} 
              pointerEvents="none" 
            />
            <View style={s.posterBorderEngrave} pointerEvents="none" />
          </>
        ) : (
          <Text style={s.posterPlaceholderGlyph}>✦</Text>
        )}
      </View>

      {!isPerson && (
        <PressableScale 
          style={[s.quickSaveIcon, isSaved ? s.quickSaveIconActive : s.quickSaveIconInactive]} 
          onPress={toggleWatchlist}
          haptic="light"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Bookmark size={12} color={isSaved ? colors.ink : colors.parchment} fill={isSaved ? colors.ink : 'transparent'} />
        </PressableScale>
      )}

      {isLogged && (
        <View style={s.loggedBadge}>
          <Text style={s.loggedText}>✓</Text>
        </View>
      )}

      {isPerson && (
        <Text style={s.personName} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>
          {item.name}
        </Text>
      )}
    </PressableScale>
    </View>
  );
});

// === HEADER COMPONENT ===
const DarkroomHeader = React.memo(({ filtersVisible, setFiltersVisible }: { filtersVisible: boolean, setFiltersVisible: (v: boolean) => void }) => {
  const router = useRouter();
  const {
    page, mood, query, inputVal, filters, accumulatedFilms,
    setPage, setMood, setQuery, setInputVal,
    setFilters, clearFilters, updateFilter, clearSearch
  } = useDiscoverStore();

  const [suggestions, setSuggestions] = useState<DiscoverFilm[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const [localYearFrom, setLocalYearFrom] = useState(filters.yearFrom ? String(filters.yearFrom) : '');
  const [localYearTo, setLocalYearTo] = useState(filters.yearTo ? String(filters.yearTo) : '');

  // Keep local inputs synced with global clears
  useEffect(() => {
    if (!filters.yearFrom && localYearFrom !== '') setLocalYearFrom('');
    if (!filters.yearTo && localYearTo !== '') setLocalYearTo('');
  }, [filters.yearFrom, filters.yearTo]);

  // Auto-apply year filters when exactly 4 digits (bypasses iOS number-pad lacking "Done" key)
  useEffect(() => {
    if (localYearFrom === '' || localYearFrom.length === 4) {
      const numFrom = parseInt(localYearFrom, 10);
      const validFrom = isNaN(numFrom) ? null : numFrom;
      if (validFrom !== filters.yearFrom) {
        updateFilter({ yearFrom: validFrom, decade: null });
        setPage(1);
      }
    }
  }, [localYearFrom]);

  useEffect(() => {
    if (localYearTo === '' || localYearTo.length === 4) {
      const numTo = parseInt(localYearTo, 10);
      const validTo = isNaN(numTo) ? null : numTo;
      if (validTo !== filters.yearTo) {
        updateFilter({ yearTo: validTo, decade: null });
        setPage(1);
      }
    }
  }, [localYearTo]);
  const isSearching = !!query;
  const activeFilterCount = [
    filters.genreId, filters.decade, filters.language,
    filters.minRating > 0 ? 1 : null,
    filters.yearFrom ? 1 : null,
  ].filter(Boolean).length;

  // -- Debounced Autocomplete (Suggestions) + Semantic Sidecar --
  useEffect(() => {
    const val = inputVal.trim().toLowerCase();
    if (!val || val.length < 2) {
      setSuggestions([]);
      return;
    }
    const timeoutId = setTimeout(async () => {
      try {
        // Buster's Vault: Semantic Intelligence Interceptor
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
            // Fetch precise movie instead of string search
            const match = await fetch(`https://api.themoviedb.org/3/movie/${semanticMatchId}?api_key=${tmdb.apiKey}`).then(r => r.json());
            setSuggestions([{ ...match, media_type: 'movie' }]);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            return;
        }

        const raw = await tmdb.search(val, 1); 
        setSuggestions(raw.results?.slice(0, 5) ?? []);
      } catch (e) {}
    }, 450);
    return () => clearTimeout(timeoutId);
  }, [inputVal]);

  // -- Live Filtering (Updates background grid on typing) --
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

  const handleSearchSubmit = () => {
    Keyboard.dismiss();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setQuery(inputVal);
    setPage(1);
    setSuggestions([]);
  };

  const handleClearSearch = () => {
    clearSearch();
    setPage(1);
  };

  const handleSelectMood = (m: typeof MOODS[number]) => {
    if (mood?.label === m.label) {
      setMood(null);
      clearFilters();
    } else {
      setMood(m);
      setFilters((prev) => ({ ...prev, genreId: m.genre }));
      clearSearch();
    }
    setPage(1);
  };

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
          <Text style={s.heroEyebrow} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
            {new Date().getHours() >= 2 && new Date().getHours() < 6 ? "THE ARCHIVE IS HAUNTED" : "THE REELHOUSE SOCIETY"}
          </Text>
          <Text style={s.heroTitle} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
            {new Date().getHours() >= 2 && new Date().getHours() < 6 ? "Late Night Projection" : "The Darkroom"}
          </Text>

          {/* ── Est. 1924 with gradient rules ── */}
          <View style={s.estRow}>
            <LinearGradient
              colors={['transparent', 'rgba(139,105,20,0.35)']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={s.estRule}
            />
            <Text style={s.heroEst} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Est. 1924</Text>
            <LinearGradient
              colors={['rgba(139,105,20,0.35)', 'transparent']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={s.estRule}
            />
          </View>

          <View style={s.searchWrap}>
            <Search size={16} style={s.searchIcon} />
            <TextInput
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              style={[s.searchInput, (isFocused || query.length > 0) && s.searchInputActive]}
              placeholder="Film title, director, actor..."
              placeholderTextColor={colors.fog}
              value={inputVal}
              onChangeText={setInputVal}
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

            {/* Autocomplete Suggestions */}
            {suggestions.length > 0 && (
              <View style={s.suggestionsBox}>
                {suggestions.map((item) => {
                  const isPerson = item.media_type === 'person';
                  const imgPath = isPerson ? item.profile_path : item.poster_path;
                  const imgUri = imgPath ? (isPerson ? tmdb.profile(imgPath, 'w185') : tmdb.poster(imgPath)) : null;

                  return (
                    <PressableScale 
                      key={`${item.media_type}-${item.id}`} 
                      style={s.suggestionRow}
                      onPress={() => {
                        setSuggestions([]);
                        Keyboard.dismiss();
                        router.push(isPerson ? `/person/${item.id}` : `/film/${item.id}`);
                      }}
                      haptic="light"
                    >
                      {imgUri ? (
                        <View style={[s.suggestionImgWrap, isPerson ? s.suggestionImgWrapPerson : s.suggestionImgWrapFilm]}>
                          <Image source={{ uri: imgUri }} style={StyleSheet.absoluteFillObject} cachePolicy="memory-disk" placeholder={{ blurhash: SEPIA_HASH }} transition={50} contentFit="cover" />
                        </View>
                      ) : (
                        <View style={[s.suggestionImgWrap, isPerson ? s.suggestionImgWrapPerson : s.suggestionImgWrapFilm, s.suggestionImgPlaceholder]} />
                      )}
                      
                      <View style={s.suggestionInfo}>
                        <Text style={s.suggestionTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{isPerson ? item.name : item.title}</Text>
                        <Text style={s.suggestionSubTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                          {isPerson ? 'ARTIST' : `${item.release_date?.slice(0, 4) ?? 'TBA'} · FILM`}
                        </Text>
                      </View>
                    </PressableScale>
                  );
                })}
              </View>
            )}
          </View>
        </Animated.View>
      </View>

      {!isSearching && (
        <View style={s.moodSection}>
          <Text style={s.sectionEyebrow}>✦ DEVELOP BY MOOD ✦</Text>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={MOODS}
            keyExtractor={v => v.label}
            contentContainerStyle={s.moodList}
            renderItem={({ item }) => {
              const active = mood?.label === item.label;
              return (
                <PressableScale
                  onPress={() => handleSelectMood(item)}
                  style={[
                    s.moodCard,
                    active && { backgroundColor: item.color, borderColor: item.accent }
                  ]}
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

      {/* Filter Toggle */}
      <View style={s.filterHeader}>
        <PressableScale 
          style={[s.filterToggle, filtersVisible && s.filterToggleActive]}
          onPress={() => {
            setFiltersVisible(!filtersVisible);
          }}
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

      {/* Expanded Filters */}
      {filtersVisible && (
        <AnimatedView entering={FadeInDown.duration(300)} exiting={SlideOutDown.duration(200)} style={s.filterPanel}>
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

          {/* ── CUSTOM YEAR RANGE (Native Exclusive) ── */}
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
                const num = parseInt(localYearFrom, 10);
                const valid = isNaN(num) ? null : num;
                if (valid !== filters.yearFrom) {
                  updateFilter({ yearFrom: valid, decade: null });
                  setPage(1);
                }
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
                const num = parseInt(localYearTo, 10);
                const valid = isNaN(num) ? null : num;
                if (valid !== filters.yearTo) {
                  updateFilter({ yearTo: valid, decade: null });
                  setPage(1);
                }
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
        </AnimatedView>
      )}

      {/* ── Section Divider ── */}
      <LinearGradient
        colors={['transparent', 'rgba(139,105,20,0.25)', 'transparent']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={s.sectionDividerLine}
      />

      <View style={s.sectionHeaderWrap}>
        <Text style={s.sectionLabel} numberOfLines={1} ellipsizeMode="tail" adjustsFontSizeToFit minimumFontScale={0.7}>
          {isSearching 
            ? `ARCHIVE SEARCH: "${query.toUpperCase()}"` 
            : (mood ? `MOOD: ${mood.label.toUpperCase()}` : 'THE ARCHIVE')}
        </Text>
        <Text style={s.sectionTitle} numberOfLines={1} ellipsizeMode="tail" adjustsFontSizeToFit minimumFontScale={0.7}>
          {isSearching 
            ? `${accumulatedFilms.length} Matches Found` 
            : (mood ? mood.sub : 'Discover Titles')}
        </Text>
      </View>
    </View>
  );
});

// === MAIN SCREEN ===
export default function DarkRoomScreen() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const loadingRef = useRef(false);
  const network = useNetInfo();
  
  const {
    page, mood, query, accumulatedFilms, filters,
    setPage, setAccumulatedFilms
  } = useDiscoverStore();

  // Reset scroll bridge so NavBar returns to transparent on this tab
  useEffect(() => { setScrollY(0); }, []);

  const isSearching = !!query;

  // -- Main Fetching Logic --
  useEffect(() => {
    let active = true;
    const fetchContent = async () => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      setLoading(true);
      try {
        let results = [];
        if (isSearching) {
          const res = await tmdb.search(query, page);
          results = res?.results ?? [];
        } else {
          const params: Record<string, string | number> = {
            sort_by: mood ? mood.sort : filters.sortBy,
            page,
            'vote_count.gte': mood?.voteGte ?? 20,
          };
          if (filters.genreId) params.with_genres = filters.genreId;
          else if (mood) params.with_genres = mood.genre;
          
          // Custom year range takes priority over decade presets
          if (filters.yearFrom || filters.yearTo) {
            if (filters.yearFrom) params['primary_release_date.gte'] = `${filters.yearFrom}-01-01`;
            if (filters.yearTo) params['primary_release_date.lte'] = `${filters.yearTo}-12-31`;
          } else if (filters.decade) {
            params['primary_release_date.gte'] = filters.decade.from;
            params['primary_release_date.lte'] = filters.decade.to;
          }
          if (filters.language) params.with_original_language = filters.language;
          if (filters.minRating > 0) params['vote_average.gte'] = filters.minRating;
          
          // Use the tmdb client for caching, dedup, and retry logic
          const strParams: Record<string, string> = {};
          for (const [k, v] of Object.entries(params)) strParams[k] = String(v);
          const discoverRes = await tmdb.discover(strParams);
          results = discoverRes?.results ?? [];
        }

        if (active) {
          const withPosters = results.filter((f: DiscoverFilm) => f.poster_path || f.profile_path);
          if (page === 1) {
            setAccumulatedFilms(withPosters);
          } else {
            setAccumulatedFilms((prev: DiscoverFilm[]) => {
              const keys = new Set(prev.map(p => p.id));
              const merged = [...prev, ...withPosters.filter((f: DiscoverFilm) => !keys.has(f.id))];
              // Cap at 500 items to prevent unbounded memory growth
              return merged.slice(0, 500);
            });
          }
        }
      } catch (error) {
        console.error(error);
      } finally {
        if (active) {
          setLoading(false);
          loadingRef.current = false;
        }
      }
    };
    fetchContent();
    return () => { active = false; };
  }, [query, page, filters, mood]);

  const renderFooter = () => {
    if (loading && page > 1) {
      return (
        <View style={s.footerLoading}>
           <Animated.Text entering={FadeInDown} style={s.paginationRetrieving}>
             [ ACCESSING ARCHIVES... ]
           </Animated.Text>
        </View>
      );
    }
    return <View style={s.footerSpacer} />;
  };


  const renderEmpty = () => {
    if (loading) {
      return (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: '100%' }}>
          {Array.from({ length: 15 }).map((_, i) => (
            <View key={i} style={{ width: '33.33%', padding: 4 }}>
              <AnimatedPosterSkeleton />
            </View>
          ))}
        </View>
      );
    }
    
    if (network.isConnected === false) {
      return (
        <Animated.View entering={FadeInDown.duration(600)} style={[s.emptyWrap, { flex: 1, paddingTop: 100 }]}>
           <EmptyOffline />
        </Animated.View>
      );
    }

    return (
      <Animated.View entering={FadeInDown.duration(600)} style={s.emptyWrap}>
        <PressableScale onPress={() => {}} haptic="light">
          <Buster size={56} mood="crying" />
        </PressableScale>
        <Text style={s.emptyTitle}>
          {isSearching ? 'The vault is sealed.' : 'No films surfaced.'}
        </Text>
        <Text style={s.emptySub}>
          {isSearching
            ? 'No films match that search. Try a different title.'
            : 'Adjust your filters to uncover something from the archive.'}
        </Text>
      </Animated.View>
    );
  };

  const renderFilmItem = useCallback(({ item }: { item: DiscoverFilm }) => (
    <View style={{ flex: 1, padding: 4 }}>
      <FilmGridCard item={item} />
    </View>
  ), []);

  // Mind Reader Pre-Fetching Engine (Velocity Throttled)
  const viewabilityConfig = useRef({
    minimumViewTime: 400, // Forces user to actually pause, heavily limits scroll spam
    itemVisiblePercentThreshold: 80,
  }).current;

  // Use a ref queue to ensure we don't duplicate inflight detail requests and throttle execution
  const inflightFetches = useRef(new Set<number>());

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: import('react-native').ViewToken[] }) => {
    viewableItems.forEach((vi) => {
      if (vi.item && vi.item.id && !inflightFetches.current.has(vi.item.id)) {
        inflightFetches.current.add(vi.item.id);
        // Fire request to prime the cache
        tmdb.detail(vi.item.id)
          .catch(() => {})
          .finally(() => {
            // Remove from inflight queue after 10 seconds to allow retry if needed later
            setTimeout(() => { inflightFetches.current.delete(vi.item.id!); }, 10000);
          });
      }
    });
  }).current;

  return (
    <View style={s.container}>
      {/* The main background is just colors.ink, preserving the deep rich blacks from the web */}
      <FlashList
        data={accumulatedFilms}
        keyExtractor={(item, idx) => `${item.id}-${idx}`}
        numColumns={3}
        contentContainerStyle={[s.listContent, { paddingTop: insets.top + 90 }]}
        ListHeaderComponent={<DarkroomHeader filtersVisible={filtersVisible} setFiltersVisible={setFiltersVisible} />}
        ListFooterComponent={renderFooter()}
        ListEmptyComponent={renderEmpty()}
        renderItem={renderFilmItem}
        onEndReached={() => {
          if (!loadingRef.current && accumulatedFilms.length > 0 && accumulatedFilms.length < 500) {
            setPage(page + 1);
          }
        }}
        estimatedItemSize={195}
        onEndReachedThreshold={0.5}
        onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={32}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.ink,
  },
  listContent: {
    padding: spacing.md,
    paddingTop: 60, // accommodate generic header margin
  },
  columnWrapper: {
    justifyContent: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
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
  // Web: heroEyebrow fontSize 0.65rem=10.4px, ls 0.4em=4.16px, color var(--sepia)
  heroEyebrow: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 12,
    color: colors.sepia,
    marginBottom: spacing.sm,
    opacity: 0.6,
    fontWeight: '700',
  },
  // Lux, Nitrate Noir Clean Display font
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
    textShadowColor: 'rgba(180,45,45, 0.6)', // Safelight red ambient
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
  heroSub: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.fog,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
    opacity: 0.6,
    paddingHorizontal: 20,
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
    backgroundColor: 'rgba(10,8,5,0.95)', // Deeper inset
    borderWidth: 1.5,
    borderColor: 'rgba(139,105,20,0.2)',
    borderRadius: 6,
    paddingVertical: 16,
    paddingLeft: 46,
    paddingRight: 40,
    color: '#F2ECD8',
    fontFamily: fonts.mono, // Archival feel
    fontSize: 12,
    letterSpacing: 2,
    fontWeight: '700',
    ...effects.shadowSurface, // recessed
  },
  searchInputActive: {
    borderColor: 'rgba(180,45,45,0.5)', // Safelight red border interaction
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
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139,105,20,0.05)',
  },
  suggestionImgWrap: {
    overflow: 'hidden',
    backgroundColor: colors.soot,
  },
  suggestionImgWrapFilm: {
    width: 24,
    height: 38,
    borderRadius: 2,
  },
  suggestionImgWrapPerson: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  suggestionImgPlaceholder: {
    backgroundColor: colors.ash,
  },
  suggestionInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  suggestionTitle: {
    color: colors.parchment,
    fontFamily: fonts.sub,
    fontSize: 14,
    marginBottom: 2,
  },
  suggestionSubTitle: {
    color: colors.fog,
    fontFamily: fonts.ui,
    fontSize: 9,
    letterSpacing: 1,
  },
  moodSection: {
    marginBottom: spacing.xl,
  },
  // Web mobile mood eyebrow: fontSize 0.6rem=9.6px, ls 0.3em=2.88px
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
  // Nitrate Noir plaque design
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
  moodGlyph: {
    fontFamily: fonts.display,
    fontSize: 18,
    color: colors.bone,
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
  // Physical Toggle Switch
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
  // Recessed filing-cabinet drawer — Obsidian Glass density without floating shadow
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
  // Physical Chip 
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
  // Physical 3D edges for posters (Obsidian Glass)
  posterWrap: {
    width: '100%',
    aspectRatio: 2/3,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: 'rgba(8,6,4,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(139,105,20,0.5)',
    elevation: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.8,
    shadowRadius: 30,
  },
  posterBorderEngrave: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 6,
  },
  posterImg: {
    width: '100%',
    height: '100%',
  },
  posterPlaceholder: {
    backgroundColor: colors.ash,
    justifyContent: 'center',
    alignItems: 'center',
  },
  posterPlaceholderGlyph: {
    fontFamily: fonts.display,
    color: colors.fog,
    fontSize: 18,
  },
  quickSaveIcon: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 24,
    height: 24,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139,105,20,0.3)',
  },
  quickSaveIconActive: {
    backgroundColor: colors.sepia,
  },
  quickSaveIconInactive: {
    backgroundColor: 'rgba(10,10,10,0.85)',
  },
  loggedBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.sepia,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loggedText: {
    color: colors.ink,
    fontSize: 10,
    fontFamily: fonts.uiBold,
  },
  personName: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    backgroundColor: 'rgba(10,8,5,0.85)',
    color: colors.parchment,
    fontFamily: fonts.ui,
    fontSize: 10,
    textAlign: 'center',
    paddingVertical: 6,
  },
  footerLoading: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  footerSpacer: {
    height: 100,
  },
  paginationRetrieving: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 4,
    color: colors.sepia,
    opacity: 0.6,
  },

  // ── Empty State (Buster) ──
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontFamily: fonts.display,
    fontSize: 18,
    color: colors.sepia,
    textAlign: 'center',
    marginTop: 20,
    letterSpacing: 1,
    opacity: 0.9,
  },
  emptySub: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.bone,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 18,
    opacity: 0.5,
    fontStyle: 'italic',
  },
});
