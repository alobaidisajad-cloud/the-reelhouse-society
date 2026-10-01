/**
 * UNIVERSAL SEARCH — "The Archive Scanner"
 *
 * 7 filter tabs:
 *  ALL | FILMS | ACTORS | DIRECTORS | PEOPLE | LOGS | LISTS
 */
import { nav } from '@/src/utils/typedRouter';
import { FlashList } from '@shopify/flash-list';
import { NOT_ANCHORED } from '@/src/components/layout/CinematicFlashList';
import { BlurView } from 'expo-blur';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, InteractionManager, Keyboard, Platform, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '@/src/components/text';

import TactileEngine from '@/src/utils/TactileEngine';
import {
    Bookmark,
    Film,
    Megaphone,
    ScrollText,
    Search,
    Star,
    Users,
    X,
} from 'lucide-react-native';
import Animated, { FadeIn, useAnimatedKeyboard, useAnimatedProps, useAnimatedStyle, useDerivedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PressableScale from '@/src/components/PressableScale';
import { SearchResultRow } from '@/src/components/search/SearchResultRow';
import { SR, useUniversalSearch } from '@/src/hooks/useUniversalSearch';
import { colors, fonts } from '@/src/theme/theme';
import SearchUnreachable, { SearchPartly } from '@/src/components/search/SearchUnreachable';

const AnimatedSearchIcon = Animated.createAnimatedComponent(Search);

type FilterTab = 'all' | 'films' | 'actors' | 'directors' | 'people' | 'logs' | 'lists';

const TABS: { key: FilterTab; label: string; icon: typeof Film }[] = [
  { key: 'all',       label: 'ALL',       icon: Search },
  { key: 'films',     label: 'FILMS',     icon: Film },
  { key: 'actors',    label: 'ACTORS',    icon: Star },
  { key: 'directors', label: 'DIRECTORS', icon: Megaphone },
  { key: 'people',    label: 'PEOPLE',    icon: Users },
  { key: 'logs',      label: 'LOGS',      icon: ScrollText },
  { key: 'lists',     label: 'LISTS',     icon: Bookmark },
];

export default function SearchModal() {
  const insets = useSafeAreaInsets();
  const keyboard = useAnimatedKeyboard();

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [tab, setTab] = useState<FilterTab>('all');

  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 400);
    return () => clearTimeout(t);
  }, [query]);

  const { data, isFetching, isError, refetch } = useUniversalSearch(debouncedQuery);

  const searched = query.trim().length > 0;
  const searching = searched && (isFetching || debouncedQuery.trim() !== query.trim());

  const films = useMemo(() => data?.films || [], [data?.films]);
  const actors = useMemo(() => data?.actors || [], [data?.actors]);
  const directors = useMemo(() => data?.directors || [], [data?.directors]);
  const users = useMemo(() => data?.users || [], [data?.users]);
  const logs = useMemo(() => data?.logs || [], [data?.logs]);
  const lists = useMemo(() => data?.lists || [], [data?.lists]);

  const tabSourceDown = useMemo(() => {
    const down = data?._down;
    if (!down) return false;
    switch (tab) {
      case 'films': case 'actors': case 'directors': return down.films;
      case 'people': return down.users;
      case 'logs': return down.logs;
      case 'lists': return down.lists;
      default: return down.films || down.users || down.logs || down.lists;
    }
  }, [data?._down, tab]);
  const retrySearch = useCallback(() => { void refetch(); }, [refetch]);

  // An emptied box is empty at once: waiting out the debounce would show the
  // last search's results under a blank box.
  const handleQueryChange = (text: string) => {
    setQuery(text);
    if (!text.trim()) setDebouncedQuery('');
  };

  const filtered = useMemo(() => {
    switch (tab) {
      case 'films': return films;
      case 'actors': return actors;
      case 'directors': return directors;
      case 'people': return users;
      case 'logs': return logs;
      case 'lists': return lists;
      default: {
        const all: SR[] = [];
        all.push(...films.slice(0, 5));
        all.push(...actors.slice(0, 3));
        all.push(...directors.slice(0, 2));
        all.push(...users.slice(0, 3));
        all.push(...logs.slice(0, 4));
        all.push(...lists.slice(0, 3));
        return all;
      }
    }
  }, [tab, films, actors, directors, users, logs, lists]);

  const counts = useMemo(() => ({
    all: films.length + actors.length + directors.length + users.length + logs.length + lists.length,
    films: films.length,
    actors: actors.length,
    directors: directors.length,
    people: users.length,
    logs: logs.length,
    lists: lists.length,
  }), [films, actors, directors, users, logs, lists]);

  const onPress = useCallback((r: SR) => {
    TactileEngine.selection();
    if (r._nav) {
      nav.dismiss();
      InteractionManager.runAfterInteractions(() => {
        nav.push(r._nav);
      });
    }
  }, []);

  const animatedContainerStyle = useAnimatedStyle(() => ({
    // iOS only: on Android the root ends at the keyboard (KeyboardRoom).
    paddingBottom: Platform.OS === 'ios' ? keyboard.height.value : 0,
  }));

  // Derived value instead of withTiming-inside-useAnimatedStyle: the animation
  // restarts only when `searching` actually changes, never on incidental
  // re-renders. Identical timing and target.
  const searchDim = useDerivedValue(
    () => withTiming(searching ? 0.4 : 1, { duration: 250 }),
    [searching]
  );
  const animatedSearchStyle = useAnimatedStyle(() => ({
    opacity: searchDim.value,
  }));
  const animatedSearchProps = useAnimatedProps(() => ({
    color: searching ? colors.fog : colors.sepia,
  }));

  const listContentStyle = useMemo(() => ({
    paddingTop: 8,
    paddingBottom: Math.max(insets.bottom, 20) + 60,
  }), [insets.bottom]);

  const renderTabItem = useCallback(({ item: t }: { item: typeof TABS[0] }) => {
    const active = tab === t.key;
    const c = counts[t.key] as number;
    const Icon = t.icon;
    return (
      <PressableScale
        key={t.key}
        style={[st.tabBtn, active && st.tabActive]}
        onPress={() => { TactileEngine.selection(); setTab(t.key); }}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        haptic="selection"
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        accessibilityLabel={`${t.label.charAt(0)}${t.label.slice(1).toLowerCase()}, ${c} result${c === 1 ? '' : 's'}`}>
        <Icon size={11} color={active ? colors.ink : colors.fog} strokeWidth={active ? 2.5 : 1.5} />
        <Text style={[st.tabText, active && st.tabTextActive]}>{t.label}</Text>
        {c > 0 && (
          <View style={[st.tabCountBg, active && st.tabCountBgActive]}>
            <Text style={[st.tabCountNum, active && st.tabCountNumActive]}>
              {c > 99 ? '99+' : c}
            </Text>
          </View>
        )}
      </PressableScale>
    );
  }, [tab, counts]);

  const keyExtractorTab = useCallback((t: typeof TABS[0]) => t.key, []);

  const renderSearchResult = useCallback(({ item, index }: { item: SR; index: number }) => (
    <SearchResultRow item={item} index={index} onPress={onPress} />
  ), [onPress]);

  const keyExtractorResult = useCallback((r: SR) => r.id, []);

  return (
    <Animated.View style={[st.root, animatedContainerStyle]}>
      <BlurView intensity={Platform.OS === 'ios' ? 55 : 100} tint="dark" style={StyleSheet.absoluteFillObject} />

      {/* ── SEARCH BAR ── */}
      <View style={[st.header, { paddingTop: Math.max(insets.top, 20) + 4 }]}>
        <View style={st.inputWrap}>
          <AnimatedSearchIcon size={15} animatedProps={animatedSearchProps} style={[animatedSearchStyle, { marginLeft: 12, marginRight: 8 }]} />
          <TextInput
            ref={inputRef}
            style={st.input}
            placeholder="Search the archives..."
            placeholderTextColor={colors.fog}
            value={query}
            onChangeText={handleQueryChange}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            keyboardAppearance="dark"
            selectionColor={colors.sepia}
            accessibilityLabel="Search the archives"
            accessibilityHint="Search for films, actors, directors, and members"
            onSubmitEditing={() => Keyboard.dismiss()}
          />
          {query.length > 0 && (
            <PressableScale onPress={() => handleQueryChange('')} style={st.clearBtn} hitSlop={{top: 15, right: 15, bottom: 15, left: 15}} haptic="light" accessibilityRole="button" accessibilityLabel="Clear search">
              <X size={14} color={colors.fog} />
            </PressableScale>
          )}
        </View>
        <PressableScale onPress={() => nav.back()} style={st.cancelWrap} hitSlop={12} haptic="light" accessibilityRole="button" accessibilityLabel="Close search">
          <Text style={st.cancelText}>Cancel</Text>
        </PressableScale>
      </View>

      {/* ── FILTER TABS ── */}
      {searched && (
        <Animated.View entering={FadeIn.duration(250)}>
          <View style={st.tabsWrap} accessibilityRole="tablist">
            <FlashList
              horizontal
              data={TABS}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={st.tabsContent}
              estimatedItemSize={70}
              keyExtractor={keyExtractorTab}
              renderItem={renderTabItem}
            />
          </View>

          {/* Count line */}
          <View style={st.countBar}>
            <Text style={st.countText}>
              {searching ? 'SCANNING ARCHIVES…' : `${filtered.length} RESULT${filtered.length !== 1 ? 'S' : ''}`}
            </Text>
          </View>
        </Animated.View>
      )}

      {/* ── RESULTS ── */}
      <View style={st.resultsWrap}>
        {/* Pre-search */}
        {!searched && !searching && (
          <Animated.View entering={FadeIn} style={st.center}>
            <Search size={30} color={colors.ash} />
            <Text style={st.emptyTitle}>The Archive Awaits</Text>
            <Text style={st.emptySub}>
              Search for films, actors, directors,{'\n'}members, written logs, and curated stacks.
            </Text>
          </Animated.View>
        )}

        {/* Searching spinner */}
        {searching && filtered.length === 0 && (
          <Animated.View entering={FadeIn} style={st.center}>
            <ActivityIndicator size="small" color={colors.sepia} />
            <Text style={st.centerLabel}>SCANNING ARCHIVES…</Text>
          </Animated.View>
        )}

        {/* Could not be asked: every source, or the one this tab reads from.
            An empty tab whose source was down is unknown, not empty. */}
        {searched && !searching && filtered.length === 0 && (isError || tabSourceDown) && (
          <Animated.View entering={FadeIn} style={st.center}>
            <SearchUnreachable onRetry={retrySearch} />
          </Animated.View>
        )}

        {/* No results */}
        {searched && !searching && !isError && !tabSourceDown && filtered.length === 0 && (
          <Animated.View entering={FadeIn} style={st.center}>
            <Text style={st.centerLabel}>THE ARCHIVE RETURNS SILENCE</Text>
            <Text style={st.emptySub}>Adjust your query or consult a different catalogue.</Text>
          </Animated.View>
        )}

        {/* Results */}
        {searched && filtered.length > 0 && (
          <FlashList
            maintainVisibleContentPosition={NOT_ANCHORED}
            data={filtered}
            ListHeaderComponent={!searching && (isError || tabSourceDown) ? <SearchPartly onRetry={retrySearch} /> : null}
            keyExtractor={keyExtractorResult}
            renderItem={renderSearchResult}
            contentContainerStyle={listContentStyle}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
            estimatedItemSize={72}
          />
        )}
      </View>
    </Animated.View>
  );
}

// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════
const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(6,5,4,0.7)' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(184,137,26,0.10)',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  inputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', height: 42,
    backgroundColor: colors.well,
    borderRadius: 3, borderWidth: 1, borderColor: 'rgba(184,137,26,0.10)',
  },
  input: { flex: 1, height: 42, fontFamily: fonts.body, fontSize: 14, color: colors.parchment },
  clearBtn: { padding: 10 },
  cancelWrap: { paddingLeft: 14 },
  cancelText: { fontFamily: fonts.sub, fontSize: 14, color: colors.sepia },

  // Tabs
  tabsWrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(184,137,26,0.06)',
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  tabsContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 5 },
  tabBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 6, paddingHorizontal: 10,
    borderRadius: 3, borderWidth: 1,
    borderColor: 'rgba(184,137,26,0.12)',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  tabActive: { backgroundColor: colors.sepia, borderColor: colors.sepia },
  tabText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.8, color: colors.fog },
  tabTextActive: { color: colors.ink },
  tabCountBg: {
    backgroundColor: 'rgba(184,137,26,0.12)',
    paddingHorizontal: 4, paddingVertical: 1, borderRadius: 6, minWidth: 16, alignItems: 'center',
  },
  tabCountBgActive: { backgroundColor: 'rgba(0,0,0,0.18)' },
  tabCountNum: { fontFamily: fonts.sub, fontSize: 9, color: colors.fog },
  tabCountNumActive: { color: colors.ink },

  // Count bar
  countBar: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  countText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6, color: colors.fogQuiet },

  resultsWrap: { flex: 1 },

  // Center states
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  centerLabel: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.fog, textAlign: 'center' },
  emptyTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.fogQuiet },
  emptySub: {
    fontFamily: fonts.body, fontSize: 12, color: colors.fogQuiet,
    textAlign: 'center', lineHeight: 18, maxWidth: 280,
  },
});

// Expo Router per-route crash net — see src/components/RouteErrorBoundary.tsx
export { RouteErrorBoundary as ErrorBoundary } from '@/src/components/RouteErrorBoundary';
