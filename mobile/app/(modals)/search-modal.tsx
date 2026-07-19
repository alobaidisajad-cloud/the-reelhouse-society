/**
 * UNIVERSAL SEARCH — "The Archive Scanner"
 *
 * 7 filter tabs:
 *  ALL | FILMS | ACTORS | DIRECTORS | PEOPLE | LOGS | LISTS
 */
import { nav } from '@/src/utils/typedRouter';
import { FlashList } from '@shopify/flash-list';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    InteractionManager,
    Keyboard,
    Platform,
    StyleSheet,
    Text, TextInput,
    View,
} from 'react-native';

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
import { ToastOverlay } from '@/src/components/ToastOverlay';
import { SR, useUniversalSearch } from '@/src/hooks/useUniversalSearch';
import { colors, fonts } from '@/src/theme/theme';

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
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const keyboard = useAnimatedKeyboard();

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [tab, setTab] = useState<FilterTab>('all');
  
  const inputRef = useRef<TextInput>(null);

  // Debounce logic
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 400);
    return () => clearTimeout(t);
  }, [query]);

  // Execute TanStack Query
  const { data, isFetching, isError } = useUniversalSearch(debouncedQuery);

  const searched = query.trim().length > 0;
  const searching = isFetching || debouncedQuery !== query;

  const films = useMemo(() => data?.films || [], [data?.films]);
  const actors = useMemo(() => data?.actors || [], [data?.actors]);
  const directors = useMemo(() => data?.directors || [], [data?.directors]);
  const users = useMemo(() => data?.users || [], [data?.users]);
  const logs = useMemo(() => data?.logs || [], [data?.logs]);
  const lists = useMemo(() => data?.lists || [], [data?.lists]);

  const handleQueryChange = (text: string) => {
    setQuery(text);
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
      router.dismiss();
      InteractionManager.runAfterInteractions(() => {
        nav.push(r._nav);
      });
    }
  }, [router]);

  const animatedContainerStyle = useAnimatedStyle(() => ({
    // iOS only: Android's window resize handles the keyboard natively.
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
       accessibilityLabel="Switch search tab">
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
    <Animated.View style={[st.root, animatedContainerStyle]} accessibilityViewIsModal={true}>
      <BlurView intensity={Platform.OS === 'ios' ? 55 : 100} tint="dark" style={StyleSheet.absoluteFillObject} />
      <ToastOverlay />

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
            <PressableScale onPress={() => setQuery('')} style={st.clearBtn} hitSlop={{top: 15, right: 15, bottom: 15, left: 15}} haptic="light" accessibilityRole="button" accessibilityLabel="Clear search">
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
          <View style={st.tabsWrap}>
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
              Search for films, actors, directors,{'\n'}users, written logs, and curated stacks.
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

        {/* Network/API error state */}
        {searched && !searching && isError && (
          <Animated.View entering={FadeIn} style={st.center}>
            <Text style={st.centerLabel}>THE TELEGRAPH IS DOWN</Text>
            <Text style={st.emptySub}>Unable to reach the archives. Check your connection and try again.</Text>
          </Animated.View>
        )}

        {/* No results */}
        {searched && !searching && !isError && filtered.length === 0 && (
          <Animated.View entering={FadeIn} style={st.center}>
            <Text style={st.centerLabel}>THE ARCHIVE RETURNS SILENCE</Text>
            <Text style={st.emptySub}>Adjust your query or consult a different catalogue.</Text>
          </Animated.View>
        )}

        {/* Results */}
        {filtered.length > 0 && (
          <FlashList
            data={filtered}
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
  root: { flex: 1, backgroundColor: 'rgba(5,3,1,0.7)' },

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
    backgroundColor: 'rgba(255,255,255,0.05)',
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
  tabText: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1.2, color: colors.fog },
  tabTextActive: { color: colors.ink },
  tabCountBg: {
    backgroundColor: 'rgba(184,137,26,0.12)',
    paddingHorizontal: 4, paddingVertical: 1, borderRadius: 6, minWidth: 16, alignItems: 'center',
  },
  tabCountBgActive: { backgroundColor: 'rgba(0,0,0,0.18)' },
  tabCountNum: { fontFamily: fonts.sub, fontSize: 7, color: colors.fog },
  tabCountNumActive: { color: colors.ink },

  // Count bar
  countBar: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  countText: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 2.5, color: colors.fog, opacity: 0.5 },

  resultsWrap: { flex: 1 },

  // Center states
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  centerLabel: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.fog, textAlign: 'center' },
  emptyTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.parchment, opacity: 0.5 },
  emptySub: {
    fontFamily: fonts.body, fontSize: 12, color: colors.bone, opacity: 0.35,
    textAlign: 'center', lineHeight: 18, maxWidth: 280,
  },
});