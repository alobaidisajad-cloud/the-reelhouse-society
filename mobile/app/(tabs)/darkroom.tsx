import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Image,
  Dimensions, FlatList, Modal, ActivityIndicator, Keyboard,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp, Layout, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, X, SlidersHorizontal, ChevronDown, Bookmark } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

import { colors, fonts, spacing } from '@/src/theme/theme';
import { tmdb, obscurityScore } from '@/src/lib/tmdb';
import { useDiscoverStore } from '@/src/stores/discover';
import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const POSTER_W = (SCREEN_W - spacing.md * 4) / 3;
const POSTER_H = POSTER_W * 1.5;

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

const MOODS = [
  { label: 'Emotional', sub: 'Heavy, profound stories.', glyph: '†', genre: 18, sort: 'vote_average.desc', color: '#4A1A3A', accent: '#C06080' },
  { label: 'Terrifying', sub: 'Dark nightmares.', glyph: '◉', genre: 27, sort: 'vote_average.desc', color: '#1A1A0A', accent: '#8B3A1A' },
  { label: 'Awe-Inspiring', sub: 'Epic magical worlds.', glyph: '✦', genre: 14, sort: 'vote_average.desc', color: '#0A1A2A', accent: '#3A7A8B' },
  { label: 'Heartwarming', sub: 'Love & connection.', glyph: '▣', genre: 10749, sort: 'release_date.asc', voteGte: 500, color: '#1C1208', accent: '#8B6914' },
  { label: 'Thrilling', sub: 'High-octane cinema.', glyph: '✕', genre: 28, sort: 'popularity.desc', color: '#2A0A0A', accent: '#8B1A1A' },
  { label: 'Hilarious', sub: 'Pure joy & laughter.', glyph: '◎', genre: 35, sort: 'vote_average.desc', voteGte: 200, color: '#0A1A0A', accent: '#4A8B3A' },
];

const AnimatedView = Animated.createAnimatedComponent(View);
const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

// === COMPONENTS ===

function Chip({ active, onPress, children, color }: any) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        s.chip,
        {
          backgroundColor: active ? (color || colors.sepia) : colors.soot,
          borderColor: active ? (color || colors.sepia) : colors.ash,
        }
      ]}
    >
      <Text style={[s.chipText, { color: active ? colors.ink : colors.bone }]}>
        {children}
      </Text>
    </TouchableOpacity>
  );
}

function FilmGridCard({ item }: { item: any }) {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const { logs, watchlist, addToWatchlist, removeFromWatchlist } = useFilmStore();
  
  const isPerson = item.media_type === 'person';
  const isLogged = isAuthenticated && !isPerson && logs.some((l:any) => l.filmId === item.id);
  const isSaved = isAuthenticated && !isPerson && watchlist.some((w:any) => w.filmId === item.id);

  const posterPath = isPerson ? item.profile_path : item.poster_path;
  const posterUri = posterPath ? (isPerson ? tmdb.profile(posterPath, 'w185') : tmdb.poster(posterPath)) : null;

  const handlePress = () => {
    // router.push(isPerson ? `/person/${item.id}` : `/film/${item.id}`);
    router.push(`/film/${item.id}`); // native only has film route for now
  };

  const toggleWatchlist = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isSaved) {
      removeFromWatchlist(item.id);
    } else {
      addToWatchlist({ id: item.id, title: item.title || item.name, poster_path: item.poster_path, release_date: item.release_date });
    }
  };

  return (
    <AnimatedTouchableOpacity 
      style={s.posterWrap} 
      onPress={handlePress} 
      activeOpacity={0.8}
      entering={FadeInDown.duration(400)}
    >
      <View style={[s.posterImg, !posterUri && { backgroundColor: colors.ash, justifyContent: 'center', alignItems: 'center' }]}>
        {posterUri ? (
          <Image source={{ uri: posterUri }} style={StyleSheet.absoluteFillObject} />
        ) : (
          <Text style={{ fontFamily: fonts.display, color: colors.fog, fontSize: 18 }}>✦</Text>
        )}
      </View>

      {!isPerson && (
        <TouchableOpacity 
          style={[s.quickSaveIcon, { backgroundColor: isSaved ? colors.sepia : 'rgba(10,10,10,0.85)' }]} 
          onPress={toggleWatchlist}
        >
          <Bookmark size={12} color={isSaved ? colors.ink : colors.parchment} fill={isSaved ? colors.ink : 'transparent'} />
        </TouchableOpacity>
      )}

      {isLogged && (
        <View style={s.loggedBadge}>
          <Text style={s.loggedText}>✓</Text>
        </View>
      )}

      {isPerson && (
        <Text style={s.personName} numberOfLines={2}>
          {item.name}
        </Text>
      )}
    </AnimatedTouchableOpacity>
  );
}

// === HEADER COMPONENT ===
const DarkroomHeader = React.memo(({ filtersVisible, setFiltersVisible }: { filtersVisible: boolean, setFiltersVisible: (v: boolean) => void }) => {
  const router = useRouter();
  const {
    page, mood, query, inputVal, filters, accumulatedFilms,
    setPage, setMood, setQuery, setInputVal,
    setFilters, clearFilters, updateFilter, clearSearch
  } = useDiscoverStore();

  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const isSearching = !!query;
  const activeFilterCount = [filters.genreId, filters.decade, filters.language, filters.minRating > 0 ? 1 : null].filter(Boolean).length;

  // -- Debounced Autocomplete (Suggestions) --
  useEffect(() => {
    if (!inputVal.trim() || inputVal.length < 2) {
      setSuggestions([]);
      return;
    }
    const timeoutId = setTimeout(async () => {
      try {
        const raw = await tmdb.search(inputVal.trim(), 1); 
        setSuggestions(raw.results?.slice(0, 5) || []);
      } catch (e) {}
    }, 300);
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
    Haptics.selectionAsync();
    setQuery(inputVal);
    setPage(1);
    setSuggestions([]);
  };

  const handleClearSearch = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    clearSearch();
    setPage(1);
  };

  const handleSelectMood = (m: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (mood?.label === m.label) {
      setMood(null);
      clearFilters();
    } else {
      setMood(m);
      setFilters((prev: any) => ({ ...prev, genreId: m.genre }));
      clearSearch();
    }
    setPage(1);
  };

  return (
    <View style={s.headerContainer}>
      <View style={s.heroContainer}>
        <LinearGradient
          colors={['rgba(139,105,20,0.15)', 'transparent']}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={s.heroContent}>
          <Text style={s.heroEyebrow}>THE DARKROOM</Text>
          <Text style={s.heroTitle}>Search the Archive</Text>

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
              onSubmitEditing={handleSearchSubmit}
              returnKeyType="search"
              keyboardAppearance="dark"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={handleClearSearch} style={s.clearBtn}>
                <X size={16} color={colors.fog} />
              </TouchableOpacity>
            )}

            {/* Autocomplete Suggestions */}
            {suggestions.length > 0 && (
              <View style={s.suggestionsBox}>
                {suggestions.map((item) => {
                  const isPerson = item.media_type === 'person';
                  const imgPath = isPerson ? item.profile_path : item.poster_path;
                  const imgUri = imgPath ? (isPerson ? tmdb.profile(imgPath, 'w185') : tmdb.poster(imgPath)) : null;

                  return (
                    <TouchableOpacity 
                      key={`${item.media_type}-${item.id}`} 
                      style={s.suggestionRow}
                      onPress={() => {
                        setSuggestions([]);
                        Keyboard.dismiss();
                        router.push(isPerson ? `/person/${item.id}` : `/film/${item.id}`);
                      }}
                      activeOpacity={0.7}
                    >
                      {imgUri ? (
                        <View style={[s.suggestionImgWrap, isPerson ? s.suggestionImgWrapPerson : s.suggestionImgWrapFilm]}>
                          <Image source={{ uri: imgUri }} style={StyleSheet.absoluteFillObject} />
                        </View>
                      ) : (
                        <View style={[s.suggestionImgWrap, isPerson ? s.suggestionImgWrapPerson : s.suggestionImgWrapFilm, { backgroundColor: colors.ash }]} />
                      )}
                      
                      <View style={s.suggestionInfo}>
                        <Text style={s.suggestionTitle} numberOfLines={1}>{isPerson ? item.name : item.title}</Text>
                        <Text style={s.suggestionSubTitle}>
                          {isPerson ? 'ARTIST' : `${item.release_date?.slice(0, 4) || 'TBA'} · FILM`}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        </View>
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
                <TouchableOpacity
                  onPress={() => handleSelectMood(item)}
                  style={[
                    s.moodCard,
                    { 
                      backgroundColor: active ? item.color : colors.soot,
                      borderColor: active ? item.accent : 'rgba(139,105,20,0.1)'
                    }
                  ]}
                >
                  <Text style={[s.moodGlyph, active && { color: item.accent, textShadowColor: item.accent, textShadowRadius: 8 }]}>
                    {item.glyph}
                  </Text>
                  <Text style={[s.moodLabel, active && { color: colors.flicker }]}>{item.label}</Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      )}

      {/* Filter Toggle */}
      <View style={s.filterHeader}>
        <TouchableOpacity 
          style={[s.filterToggle, filtersVisible && { backgroundColor: 'rgba(139,105,20,0.15)', borderColor: colors.sepia }]}
          onPress={() => {
            Haptics.selectionAsync();
            setFiltersVisible(!filtersVisible);
          }}
        >
          <SlidersHorizontal size={14} color={filtersVisible ? colors.sepia : colors.fog} />
          <Text style={[s.filterToggleText, filtersVisible && { color: colors.sepia }]}>
            {filtersVisible ? '[-] HIDE FILTERS' : '[+] EXPAND FILTERS'}
          </Text>
          {activeFilterCount > 0 && (
            <View style={s.filterBadge}><Text style={s.filterBadgeText}>{activeFilterCount}</Text></View>
          )}
        </TouchableOpacity>

        {activeFilterCount > 0 && (
          <TouchableOpacity onPress={() => { clearFilters(); setPage(1); }}>
            <Text style={s.clearFiltersText}>CLEAR</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Expanded Filters */}
      {filtersVisible && (
        <AnimatedView entering={FadeInDown.duration(300)} style={s.filterPanel}>
          <Text style={s.filterSectionTitle}>GENRE</Text>
          <View style={s.chipRow}>
            {GENRES.map(g => (
              <Chip key={g.id} active={filters.genreId === g.id} onPress={() => { updateFilter({ genreId: filters.genreId === g.id ? null : g.id }); setPage(1); }}>
                {g.name}
              </Chip>
            ))}
          </View>
          <Text style={[s.filterSectionTitle, { marginTop: spacing.md }]}>DECADE</Text>
          <View style={s.chipRow}>
            {DECADES.map(d => (
              <Chip key={d.label} active={filters.decade?.label === d.label} onPress={() => { updateFilter({ decade: filters.decade?.label === d.label ? null : d }); setPage(1); }}>
                {d.label}
              </Chip>
            ))}
          </View>
        </AnimatedView>
      )}

      <View style={s.sectionHeaderWrap}>
        <Text style={s.sectionLabel}>
          {isSearching 
            ? `ARCHIVE SEARCH: "${query.toUpperCase()}"` 
            : (mood ? `MOOD: ${mood.label.toUpperCase()}` : 'THE ARCHIVE')}
        </Text>
        <Text style={s.sectionTitle}>
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
  
  const {
    page, mood, query, accumulatedFilms, filters,
    setPage, setAccumulatedFilms
  } = useDiscoverStore();

  const isSearching = !!query;

  // -- Main Fetching Logic --
  useEffect(() => {
    let active = true;
    const fetchContent = async () => {
      setLoading(true);
      try {
        let results = [];
        if (isSearching) {
          const res = await tmdb.search(query, page);
          results = res?.results || [];
        } else {
          const params: any = {
            sort_by: mood ? mood.sort : filters.sortBy,
            page,
            'vote_count.gte': mood?.voteGte ?? 20,
          };
          if (filters.genreId) params.with_genres = filters.genreId;
          else if (mood) params.with_genres = mood.genre;
          
          if (filters.decade) {
            params['primary_release_date.gte'] = filters.decade.from;
            params['primary_release_date.lte'] = filters.decade.to;
          }
          if (filters.minRating > 0) Object.assign(params, { 'vote_average.gte': filters.minRating });
          
          // tmdb.ts lacks direct discover mapping, so we manual fetch
          const qs = Object.entries(params).map(([k,v]) => `${k}=${v}`).join('&');
          const res = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${process.env.EXPO_PUBLIC_TMDB_API_KEY}&${qs}`);
          const json = await res.json();
          results = json.results || [];
        }

        if (active) {
          const withPosters = results.filter((f: any) => f.poster_path || f.profile_path);
          if (page === 1) {
            setAccumulatedFilms(withPosters);
          } else {
            setAccumulatedFilms((prev: any[]) => {
              const keys = new Set(prev.map(p => p.id));
              const merged = [...prev, ...withPosters.filter((f:any) => !keys.has(f.id))];
              return merged;
            });
          }
        }
      } catch (error) {
        console.error(error);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchContent();
    return () => { active = false; };
  }, [query, page, filters, mood]);

  const renderFooter = () => {
    if (loading && page > 1) {
      return (
        <View style={s.footerLoading}>
          <ActivityIndicator color={colors.sepia} size="small" />
        </View>
      );
    }
    return <View style={{ height: 100 }} />;
  };

  return (
    <View style={s.container}>
      {/* The main background is just colors.ink, preserving the deep rich blacks from the web */}
      <FlatList
        data={accumulatedFilms}
        keyExtractor={(item, idx) => `${item.id}-${idx}`}
        numColumns={3}
        contentContainerStyle={[s.listContent, { paddingTop: insets.top + 90 }]}
        columnWrapperStyle={s.columnWrapper}
        ListHeaderComponent={<DarkroomHeader filtersVisible={filtersVisible} setFiltersVisible={setFiltersVisible} />}
        ListFooterComponent={renderFooter()}
        renderItem={({ item }) => <FilmGridCard item={item} />}
        onEndReached={() => {
          if (!loading && accumulatedFilms.length > 0) {
            setPage(page + 1);
          }
        }}
        onEndReachedThreshold={0.5}
        removeClippedSubviews={true}
        keyboardShouldPersistTaps="handled"
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
    marginHorizontal: -spacing.md,
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
    fontFamily: fonts.ui,
    fontSize: 10,
    letterSpacing: 4,
    color: colors.sepia,
    marginBottom: spacing.sm,
  },
  // Web mobile: clamp(1.8rem,7vw,2.5rem) ≈ 28px on 390px, lineHeight 1
  heroTitle: {
    fontFamily: fonts.display,
    fontSize: 28,
    color: colors.parchment,
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 28,
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
  // Web mobile search: fontSize 1rem=16px, padding 0.9rem 2.5rem 0.9rem 3rem = 14.4px 40px 14.4px 48px
  searchInput: {
    width: '100%',
    backgroundColor: colors.soot,
    borderWidth: 1,
    borderColor: colors.ash,
    borderRadius: 4,
    paddingVertical: 14,
    paddingLeft: 46,
    paddingRight: 40,
    color: colors.parchment,
    fontFamily: fonts.sub,
    fontSize: 16,
  },
  searchInputActive: {
    borderColor: colors.sepia,
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
    backgroundColor: 'rgba(10,7,3,0.98)',
    borderWidth: 1,
    borderColor: colors.ash,
    borderRadius: 8,
    overflow: 'hidden',
    zIndex: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
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
  // Web mobile mood button: padding 0.5rem 1rem = 8px 16px, borderRadius 2px, fontSize 0.55rem=8.8px ls 0.1em
  moodCard: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  moodGlyph: {
    fontFamily: fonts.display,
    fontSize: 16,
    color: colors.bone,
  },
  moodLabel: {
    fontFamily: fonts.ui,
    fontSize: 9,
    letterSpacing: 1,
    color: colors.bone,
    textTransform: 'uppercase',
  },
  filterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  // Web: filter toggle fontSize 0.6rem=9.6px, ls 0.12em=1.15px, padding 0.55rem 1rem = 8.8px 16px, borderRadius 2px
  filterToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 16,
    backgroundColor: colors.soot,
    borderWidth: 1,
    borderColor: colors.ash,
    borderRadius: 2,
  },
  filterToggleText: {
    fontFamily: fonts.ui,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.fog,
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
    fontFamily: fonts.ui,
    fontWeight: 'bold',
  },
  clearFiltersText: {
    fontFamily: fonts.ui,
    fontSize: 10,
    color: colors.danger,
    letterSpacing: 1,
  },
  filterPanel: {
    backgroundColor: colors.soot,
    borderWidth: 1,
    borderColor: colors.ash,
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  // Web chip: padding 0.35rem 0.75rem = 5.6px 12px, fontSize 0.55rem=8.8px ls 0.1em, borderRadius 2px
  chip: {
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 2,
  },
  chipText: {
    fontFamily: fonts.ui,
    fontSize: 9,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  sectionHeaderWrap: {
    marginBottom: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.md,
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
    fontSize: 28,
    color: colors.parchment,
    textAlign: 'center',
  },
  // Web grid card: borderRadius 2px, border 1px solid var(--ash)
  posterWrap: {
    width: POSTER_W,
    height: POSTER_H,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: colors.soot,
    borderWidth: 1,
    borderColor: colors.ash,
  },
  posterImg: {
    width: '100%',
    height: '100%',
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
    fontWeight: 'bold',
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
});
