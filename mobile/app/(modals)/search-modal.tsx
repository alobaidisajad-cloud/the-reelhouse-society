/**
 * UNIVERSAL SEARCH — "The Archive Scanner"
 *
 * 7 filter tabs:
 *  ALL | FILMS | ACTORS | DIRECTORS | PEOPLE | LOGS | LISTS
 */
import { nav } from '@/src/utils/typedRouter';
import { FlashList } from '@shopify/flash-list';
import { NOT_ANCHORED } from '@/src/components/layout/CinematicFlashList';
import { HouseBlur } from '@/src/components/HouseBlur';
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
import Animated, { useAnimatedKeyboard, useAnimatedProps, useAnimatedStyle, useDerivedValue, withTiming } from 'react-native-reanimated';
import { useContentBottom, useModalTop } from '@/src/components/layout/navMetrics';

import PressableScale from '@/src/components/PressableScale';
import { SearchResultRow } from '@/src/components/search/SearchResultRow';
import { SR, useUniversalSearch, type SearchSource } from '@/src/hooks/useUniversalSearch';
import { colors, fonts } from '@/src/theme/theme';
import SearchUnreachable, { SearchPartly } from '@/src/components/search/SearchUnreachable';
import { TryAgainLine } from '@/src/components/TryAgain';
import Buster from '@/src/components/Buster';
import { Arrive } from '@/src/components/Arrive';
import { SEARCH_MAX } from '@/src/constants/inputLimits';

const AnimatedSearchIcon = Animated.createAnimatedComponent(Search);

type FilterTab = 'all' | 'films' | 'actors' | 'directors' | 'people' | 'logs' | 'lists';
type SourceTab = Exclude<FilterTab, 'all'>;

/** The place each tab's rows are read from: the catalogue holds three tabs. */
const SOURCE_OF: Record<SourceTab, SearchSource> = {
  films: 'films', actors: 'films', directors: 'films', people: 'users', logs: 'logs', lists: 'lists',
};

/** ALL is a sampler: the first few of each, under a head that opens that tab. */
const SAMPLED: { tab: SourceTab; take: number }[] = [
  { tab: 'films', take: 5 }, { tab: 'actors', take: 3 }, { tab: 'directors', take: 2 },
  { tab: 'people', take: 3 }, { tab: 'logs', take: 4 }, { tab: 'lists', take: 3 },
];

/** A section's head on ALL: its name and its count, and the way to the whole of it. */
interface Head { kind: 'head'; id: string; tab: SourceTab; count: number; more: boolean }
type Row = SR | Head;
const isHead = (r: Row): r is Head => (r as Head).kind === 'head';

/**
 * A count as it is drawn: exact once the source has no more, "N+" while it holds a next page (the
 * house never counts every match of a word it cannot index); never past 99.
 */
export function countDrawn(n: number, more: boolean): string {
  if (n > 99) return '99+';
  return more ? `${n}+` : `${n}`;
}

/** The same count, spoken. */
export function countSaid(n: number, more: boolean): string {
  if (more || n > 99) return `${Math.min(n, 99)} or more results`;
  return `${n} result${n === 1 ? '' : 's'}`;
}

/** A tab's name as it is spoken: "Films", not "FILMS". */
const spokenName = (label: string) => `${label.charAt(0)}${label.slice(1).toLowerCase()}`;

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
  const end = useContentBottom();
  const headerTop = useModalTop();
  const keyboard = useAnimatedKeyboard();

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [tab, setTab] = useState<FilterTab>('all');

  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 400);
    return () => clearTimeout(t);
  }, [query]);

  const { data, isFetching, isError, refetch, answered, more, readingMore, moreFailed, loadMore } = useUniversalSearch(debouncedQuery);

  const searched = query.trim().length > 0;
  const searching = searched && (isFetching || debouncedQuery.trim() !== query.trim());

  const films = useMemo(() => data?.films || [], [data?.films]);
  const actors = useMemo(() => data?.actors || [], [data?.actors]);
  const directors = useMemo(() => data?.directors || [], [data?.directors]);
  const users = useMemo(() => data?.users || [], [data?.users]);
  const logs = useMemo(() => data?.logs || [], [data?.logs]);
  const lists = useMemo(() => data?.lists || [], [data?.lists]);

  /** Whether the source a tab reads from could not be asked: its count is then unknown, not 0. */
  const downFor = useCallback((key: string) => {
    const down = data?._down;
    if (!down) return false;
    switch (key) {
      case 'films': case 'actors': case 'directors': return down.films;
      case 'people': return down.users;
      case 'logs': return down.logs;
      case 'lists': return down.lists;
      default: return down.films || down.users || down.logs || down.lists;
    }
  }, [data?._down]);
  const tabSourceDown = downFor(tab);
  const retrySearch = useCallback(() => { void refetch(); }, [refetch]);

  // An emptied box is empty at once: waiting out the debounce would show the
  // last search's results under a blank box.
  const handleQueryChange = (text: string) => {
    setQuery(text);
    if (!text.trim()) setDebouncedQuery('');
  };

  const rowsOf = useMemo<Record<SourceTab, SR[]>>(() => ({
    films, actors, directors, people: users, logs, lists,
  }), [films, actors, directors, users, logs, lists]);
  /** Whether a tab's source holds a next page: its count is then "N+", never a total. */
  const moreOf = useCallback((key: FilterTab) => (key === 'all'
    ? more.films || more.users || more.logs || more.lists
    : more[SOURCE_OF[key]]), [more]);

  const filtered = useMemo<Row[]>(() => {
    if (tab !== 'all') return rowsOf[tab];
    // ALL: each section's first few under its head, the head carrying the section's own count. Drawn
    // in order, each section once every section above it has answered: a slower source never puts
    // its rows above rows already drawn, under the member's finger (each tab draws its own at once).
    const all: Row[] = [];
    for (const { tab: key, take } of SAMPLED) {
      if (!answered[SOURCE_OF[key]]) break;
      const rows = rowsOf[key];
      if (rows.length === 0) continue;
      all.push({ kind: 'head', id: `head-${key}`, tab: key, count: rows.length, more: more[SOURCE_OF[key]] });
      all.push(...rows.slice(0, take));
    }
    return all;
  }, [tab, rowsOf, more, answered]);

  // The foot of a tab: the next page of its source, as it is read.
  const tabSource = tab === 'all' ? null : SOURCE_OF[tab];
  const readOn = useCallback(() => { if (tabSource) loadMore(tabSource); }, [tabSource, loadMore]);
  const tabMore = !!tabSource && more[tabSource];
  const tabReadingMore = !!tabSource && readingMore[tabSource];
  const tabMoreFailed = !!tabSource && moreFailed[tabSource];

  // No results, and held there while the next letter is searched: otherwise the
  // answer (and Buster with it) blinks out at every keystroke and back.
  const reachable = !isError && !tabSourceDown;
  const settledSilence = searched && !searching && reachable && filtered.length === 0;
  const [heldSilence, setHeldSilence] = useState(false);
  // Adjusted as it renders (React's own way to keep a value from a render before), never a frame late.
  if (settledSilence && !heldSilence) setHeldSilence(true);
  else if (heldSilence && !settledSilence && (!searched || !reachable || filtered.length > 0)) setHeldSilence(false);
  const silence = settledSilence || (heldSilence && searched && searching && reachable && filtered.length === 0);

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
    paddingBottom: end,
  }), [end]);

  const renderTabItem = useCallback(({ item: t }: { item: typeof TABS[0] }) => {
    const active = tab === t.key;
    const c = counts[t.key] as number;
    const m = moreOf(t.key);
    const Icon = t.icon;
    return (
      <PressableScale room
        key={t.key}
        style={[st.tabBtn, active && st.tabActive]}
        onPress={() => { TactileEngine.selection(); setTab(t.key); }}
        hitSlop={{ top: 10, bottom: 10, left: 2, right: 2 }}
        haptic="selection"
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        // A count is said only once it is known: while a search is out, or its source could not
        // be asked, "0 results" was a count nobody had (review round 7).
        // A count said "or more" while its source holds a next page (review round 12).
        accessibilityLabel={`${spokenName(t.label)}${
          isError || downFor(t.key) ? ', not reached' : searching || !data ? '' : `, ${countSaid(c, m)}`}`}>
        <Icon size={11} color={active ? colors.ink : colors.fog} strokeWidth={active ? 2.5 : 1.5} />
        <Text style={[st.tabText, active && st.tabTextActive]}>{t.label}</Text>
        {/* A count drawn only once it is known, as it is said: a tab whose source was not reached shows none. */}
        {c > 0 && !isError && !downFor(t.key) && (
          <View style={[st.tabCountBg, active && st.tabCountBgActive]}>
            <Text style={[st.tabCountNum, active && st.tabCountNumActive]}>
              {countDrawn(c, m)}
            </Text>
          </View>
        )}
      </PressableScale>
    );
  }, [tab, counts, moreOf, isError, downFor, searching, data]);

  const keyExtractorTab = useCallback((t: typeof TABS[0]) => t.key, []);

  const openTab = useCallback((key: SourceTab) => { TactileEngine.selection(); setTab(key); }, []);

  const renderSearchResult = useCallback(({ item, index }: { item: Row; index: number }) => (
    isHead(item)
      ? <SectionHead head={item} onPress={openTab} />
      : <SearchResultRow item={item} index={index} onPress={onPress} />
  ), [onPress, openTab]);

  const keyExtractorResult = useCallback((r: Row) => r.id, []);
  const itemTypeOf = useCallback((r: Row) => (isHead(r) ? 'head' : 'row'), []);

  // A tab's foot: its next page read as the list reaches it, said while it is read or when it
  // could not be, and offered as a press while there is more (a catalogue page may add nothing
  // to this tab, and the list's end is then not reached again).
  const footer = useMemo(() => {
    if (!tabSource || filtered.length === 0) return null;
    if (tabReadingMore) {
      return (
        <View style={st.foot}>
          <ActivityIndicator size="small" color={colors.sepia} accessibilityLabel="Reading more of the archive" />
        </View>
      );
    }
    if (tabMoreFailed) {
      return (
        <View style={st.foot}>
          <Text style={st.footWords}>The rest could not be reached.</Text>
          <TryAgainLine onPress={readOn} what="ask for the rest" />
        </View>
      );
    }
    if (!tabMore) return null;
    return (
      <PressableScale
        style={st.readOn}
        onPress={readOn}
        haptic="selection"
        accessibilityRole="button"
        accessibilityLabel="More from the archive"
      >
        <Text style={st.readOnText}>MORE FROM THE ARCHIVE</Text>
      </PressableScale>
    );
  }, [tabSource, filtered.length, tabReadingMore, tabMoreFailed, tabMore, readOn]);
  const onEndReached = tabMore && !tabReadingMore && !tabMoreFailed ? readOn : undefined;

  return (
    <Animated.View style={[st.root, animatedContainerStyle]}>
      <HouseBlur intensity={Platform.OS === 'ios' ? 55 : 100} tint="dark" style={StyleSheet.absoluteFill} />

      {/* ── SEARCH BAR ── */}
      <View style={[st.header, { paddingTop: headerTop }]}>
        <View style={st.inputWrap}>
          <AnimatedSearchIcon size={15} animatedProps={animatedSearchProps} style={[animatedSearchStyle, { marginLeft: 12, marginRight: 8 }]} />
          <TextInput
            ref={inputRef}
            style={st.input}
            // Opened to search: the keys are up at once, as the Log sheet's search has them.
            autoFocus
            placeholder="Search the archives..."
            placeholderTextColor={colors.fog}
            value={query}
            onChangeText={handleQueryChange}
            maxLength={SEARCH_MAX}
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
            <PressableScale room onPress={() => handleQueryChange('')} style={st.clearBtn} hitSlop={{top: 15, right: 15, bottom: 15, left: 15}} haptic="light" accessibilityRole="button" accessibilityLabel="Clear search">
              <X size={14} color={colors.fog} />
            </PressableScale>
          )}
        </View>
        <PressableScale touch="wayOut" onPress={() => nav.back()} style={st.cancelWrap} hitSlop={12} haptic="light" accessibilityRole="button" accessibilityLabel="Cancel: close search">
          <Text style={st.cancelText}>CANCEL</Text>
        </PressableScale>
      </View>

      {/* ── FILTER TABS ── */}
      {searched && (
        <Arrive name="search-modal-1" duration={250} rise={0}>
          <View style={st.tabsWrap} accessibilityRole="tablist">
            <FlashList
              horizontal
              data={TABS}
              // A tab pressed while the search is typed changes the tab on the first press.
              keyboardShouldPersistTaps="handled"
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={st.tabsContent}
              estimatedItemSize={70}
              keyExtractor={keyExtractorTab}
              renderItem={renderTabItem}
            />
          </View>

          {/* Count line: one number a tab, the tab's own. ALL has none: each section's head
              carries its own, and a sum beside the badges was a second total (review round 12). */}
          <View style={st.countBar}>
            <Text
              style={st.countText}
              accessibilityLabel={!searching && reachable && tab !== 'all' ? countSaid(filtered.length, tabMore) : undefined}
            >
              {searching ? 'SCANNING ARCHIVES…'
                : !reachable && filtered.length === 0 ? 'NOT REACHED'
                : tab === 'all' ? ''
                : `${countDrawn(filtered.length, tabMore)} RESULT${filtered.length !== 1 || tabMore ? 'S' : ''}`}
            </Text>
          </View>
        </Arrive>
      )}

      {/* ── RESULTS ── */}
      <View style={st.resultsWrap}>
        {/* Pre-search */}
        {!searched && !searching && (
          <Arrive name="search-modal-2" duration={300} rise={0} style={st.center}>
            <Search size={30} color={colors.ash} />
            <Text style={st.emptyTitle}>The Archive Awaits</Text>
            <Text style={st.emptySub}>
              Search for films, actors, directors,{'\n'}members, written logs, and curated stacks.
            </Text>
          </Arrive>
        )}

        {/* Searching spinner */}
        {searching && filtered.length === 0 && !silence && (
          <Arrive name="search-modal-3" duration={300} rise={0} style={st.center}>
            <ActivityIndicator size="small" color={colors.sepia} />
            <Text style={st.centerLabel}>SCANNING ARCHIVES…</Text>
          </Arrive>
        )}

        {/* Could not be asked: every source, or the one this tab reads from.
            An empty tab whose source was down is unknown, not empty. */}
        {searched && !searching && filtered.length === 0 && (isError || tabSourceDown) && (
          <Arrive name="search-modal-4" duration={300} rise={0} style={st.center}>
            <SearchUnreachable onRetry={retrySearch} />
          </Arrive>
        )}

        {/* No results; through the next letter's search it stays, and only its line changes */}
        {silence && (
          <Arrive name="search-modal-5" duration={300} rise={0} style={st.center}>
            <Buster size={48} mood="suspicious" />
            <Text style={st.centerLabel}>{searching ? 'SCANNING ARCHIVES…' : 'THE ARCHIVE RETURNS SILENCE'}</Text>
            <Text style={st.emptySub}>Adjust your query or consult a different catalogue.</Text>
          </Arrive>
        )}

        {/* Results */}
        {searched && filtered.length > 0 && (
          <FlashList
            maintainVisibleContentPosition={NOT_ANCHORED}
            data={filtered}
            ListHeaderComponent={!searching && (isError || tabSourceDown) ? <SearchPartly onRetry={retrySearch} /> : null}
            keyExtractor={keyExtractorResult}
            getItemType={itemTypeOf}
            renderItem={renderSearchResult}
            ListFooterComponent={footer}
            onEndReached={onEndReached}
            onEndReachedThreshold={0.5}
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

/**
 * A section's head on ALL: its name and its count ("LOGS · 20+ ›"), pressed to open its tab,
 * where the whole of it is read page by page.
 */
function SectionHead({ head, onPress }: { head: Head; onPress: (tab: SourceTab) => void }) {
  const label = TABS.find((t) => t.key === head.tab)?.label ?? head.tab.toUpperCase();
  return (
    <PressableScale
      style={st.head}
      onPress={() => onPress(head.tab)}
      haptic="selection"
      hitSlop={null}
      accessibilityRole="button"
      accessibilityLabel={`${spokenName(label)}, ${countSaid(head.count, head.more)}: show them all`}
    >
      <Text style={st.headText}>{`${label} · ${countDrawn(head.count, head.more)}`}</Text>
      <Text style={st.headArrow}>›</Text>
    </PressableScale>
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
    borderBottomColor: colors.fieldEdge,
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

  // ALL's section heads: a full-width line, 48 tall, so its own box is the finger's.
  head: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    minHeight: 48, paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(184,137,26,0.10)',
  },
  headText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6, color: colors.sepia },
  headArrow: { fontFamily: fonts.sub, fontSize: 14, color: colors.sepia },

  // A tab's foot: the next page, as it is read.
  foot: { alignItems: 'center', paddingVertical: 18, gap: 6 },
  footWords: { fontFamily: fonts.body, fontSize: 12, color: colors.fogQuiet, textAlign: 'center' },
  readOn: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  readOnText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6, color: colors.sepia },

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
