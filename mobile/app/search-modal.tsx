/**
 * UNIVERSAL SEARCH — "The Archive Scanner"
 *
 * 7 filter tabs:
 *  ALL | FILMS | ACTORS | DIRECTORS | PEOPLE | LOGS | LISTS
 *
 * Sources:
 *  - TMDB: films, actors (Acting dept), directors (Directing dept)
 *  - Supabase profiles: app users
 *  - Supabase logs: written reviews (searchable by word, username, film)
 *  - Supabase programmes: curated stacks/lists
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, TextInput, StyleSheet, Pressable, Platform,
  FlatList, KeyboardAvoidingView, ActivityIndicator, Image,
  ScrollView, TouchableOpacity, Keyboard,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import {
  Search, X, Film, Users, Bookmark, ScrollText, Clapperboard,
  User, ArrowRight, Megaphone, Star,
} from 'lucide-react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors, fonts, effects } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';
import { supabase } from '@/src/lib/supabase';

const TMDB_IMG = 'https://image.tmdb.org/t/p/w92';

// ═══════════════════════════════════════════════════════════════
// TABS
// ═══════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════
// RESULT TYPE
// ═══════════════════════════════════════════════════════════════
interface SR {
  id: string;
  type: 'film' | 'actor' | 'director' | 'user' | 'log' | 'list';
  title: string;
  subtitle: string;
  image: string | null;
  extra?: string;
  rating?: number;
  role?: string;
  _nav: string; // navigation path
}

// ═══════════════════════════════════════════════════════════════
// TYPE BADGES — color-coded left edge
// ═══════════════════════════════════════════════════════════════
const TYPE_GLYPH: Record<string, string> = {
  film: '▶', actor: '◎', director: '✦', user: '◉', log: '✎', list: '☰',
};
const TYPE_COLOR: Record<string, { bg: string; border: string }> = {
  film:     { bg: 'rgba(196,150,26,0.12)', border: 'rgba(196,150,26,0.25)' },
  actor:    { bg: 'rgba(218,165,32,0.10)', border: 'rgba(218,165,32,0.25)' },
  director: { bg: 'rgba(139,105,20,0.10)', border: 'rgba(139,105,20,0.25)' },
  user:     { bg: 'rgba(200,185,154,0.08)', border: 'rgba(200,185,154,0.20)' },
  log:      { bg: 'rgba(107,96,85,0.10)',   border: 'rgba(107,96,85,0.25)' },
  list:     { bg: 'rgba(107,26,10,0.08)',    border: 'rgba(107,26,10,0.20)' },
};

export default function SearchModal() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);

  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<FilterTab>('all');
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  // Result buckets
  const [films, setFilms] = useState<SR[]>([]);
  const [actors, setActors] = useState<SR[]>([]);
  const [directors, setDirectors] = useState<SR[]>([]);
  const [users, setUsers] = useState<SR[]>([]);
  const [logs, setLogs] = useState<SR[]>([]);
  const [lists, setLists] = useState<SR[]>([]);

  // Auto-focus
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // SEARCH ENGINE — parallel across all sources
  // ═══════════════════════════════════════════════════════════════
  const performSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setFilms([]); setActors([]); setDirectors([]); setUsers([]); setLogs([]); setLists([]);
      setSearched(false);
      return;
    }
    setSearching(true);
    setSearched(true);
    const text = q.trim();

    const [tmdbRes, usersRes, logsRes, listsRes] = await Promise.allSettled([
      tmdb.search(text),
      supabase
        .from('profiles')
        .select('id, username, avatar_url, role')
        .or(`username.ilike.%${text}%,display_name.ilike.%${text}%`)
        .limit(15),
      supabase
        .from('logs')
        .select('id, film_title, review, rating, username, role, poster_path, created_at')
        .or(`film_title.ilike.%${text}%,review.ilike.%${text}%,username.ilike.%${text}%`)
        .not('review', 'is', null)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('programmes')
        .select('id, title, description, is_public, created_at')
        .or(`title.ilike.%${text}%,description.ilike.%${text}%`)
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(12),
    ]);

    // ── Parse TMDB ──
    if (tmdbRes.status === 'fulfilled') {
      const raw = (tmdbRes.value?.results || []).slice(0, 25);
      const f: SR[] = [];
      const a: SR[] = [];
      const d: SR[] = [];

      for (const item of raw) {
        if (item.media_type === 'movie' || (!item.media_type && item.title)) {
          f.push({
            id: `film-${item.id}`, type: 'film',
            title: item.title || item.name || '',
            subtitle: item.release_date?.slice(0, 4) || 'FILM',
            image: item.poster_path ? `${TMDB_IMG}${item.poster_path}` : null,
            extra: item.vote_average ? `★ ${item.vote_average.toFixed(1)}` : undefined,
            _nav: `/film/${item.id}`,
          });
        } else if (item.media_type === 'person') {
          const dept = (item.known_for_department || 'Acting').toUpperCase();
          const isDir = dept.includes('DIRECT') || dept.includes('PRODUC') || dept.includes('WRIT');

          const entry: SR = {
            id: `person-${item.id}`, type: isDir ? 'director' : 'actor',
            title: item.name || '',
            subtitle: dept,
            image: item.profile_path ? `${TMDB_IMG}${item.profile_path}` : null,
            _nav: `/person/${item.id}`,
          };

          if (isDir) d.push(entry); else a.push(entry);
        }
      }
      setFilms(f);
      setActors(a);
      setDirectors(d);
    }

    // ── Parse users ──
    if (usersRes.status === 'fulfilled' && !usersRes.value.error) {
      setUsers((usersRes.value.data || []).map((u: any) => ({
        id: `user-${u.id}`, type: 'user',
        title: `@${u.username || 'anonymous'}`,
        subtitle: u.role ? (u.role === 'auteur' ? '★ AUTEUR' : u.role === 'archivist' ? '✦ ARCHIVIST' : 'MEMBER') : 'MEMBER',
        image: u.avatar_url || null,
        role: u.role,
        _nav: `/user/${u.username}`,
      })));
    }

    // ── Parse logs ──
    if (logsRes.status === 'fulfilled' && !logsRes.value.error) {
      setLogs((logsRes.value.data || []).map((l: any) => ({
        id: `log-${l.id}`, type: 'log',
        title: l.film_title || 'Untitled',
        subtitle: `@${(l.username || 'anon').toUpperCase()}`,
        image: l.poster_path ? `${TMDB_IMG}${l.poster_path}` : null,
        rating: l.rating,
        role: l.role,
        extra: l.review ? `"${l.review.replace(/<[^>]+>/g, '').trim().slice(0, 80)}…"` : undefined,
        _nav: `/log/${l.id}`,
      })));
    }

    // ── Parse lists ──
    if (listsRes.status === 'fulfilled' && !listsRes.value.error) {
      setLists((listsRes.value.data || []).map((p: any) => ({
        id: `list-${p.id}`, type: 'list',
        title: p.title || 'Untitled Stack',
        subtitle: p.description ? p.description.slice(0, 60) : 'PUBLIC STACK',
        image: null,
        _nav: '',
      })));
    }

    setSearching(false);
  }, []);

  // Debounce
  useEffect(() => {
    if (!query.trim()) {
      setFilms([]); setActors([]); setDirectors([]); setUsers([]); setLogs([]); setLists([]);
      setSearched(false); setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => performSearch(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  // ═══════════════════════════════════════════════════════════════
  // FILTERED RESULTS
  // ═══════════════════════════════════════════════════════════════
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

  // ═══════════════════════════════════════════════════════════════
  // NAVIGATION
  // ═══════════════════════════════════════════════════════════════
  const onPress = useCallback((r: SR) => {
    Haptics.selectionAsync();
    if (r._nav) router.push(r._nav as any);
  }, [router]);

  // ═══════════════════════════════════════════════════════════════
  // RENDER RESULT ROW
  // ═══════════════════════════════════════════════════════════════
  const renderRow = useCallback(({ item, index }: { item: SR; index: number }) => {
    const tc = TYPE_COLOR[item.type] || TYPE_COLOR.film;
    const isPerson = item.type === 'actor' || item.type === 'director' || item.type === 'user';

    return (
      <Animated.View entering={FadeInDown.duration(250).delay(Math.min(index * 25, 150))}>
        <Pressable
          style={({ pressed }) => [st.row, pressed && st.rowPressed]}
          onPress={() => onPress(item)}
        >
          {/* Type badge */}
          <View style={[st.badge, { backgroundColor: tc.bg, borderColor: tc.border }]}>
            <Text style={st.badgeGlyph}>{TYPE_GLYPH[item.type]}</Text>
          </View>

          {/* Image */}
          <View style={[st.rowImg, isPerson && st.rowImgRound]}>
            {item.image ? (
              <Image source={{ uri: item.image }} style={st.img} />
            ) : (
              <View style={st.imgEmpty}>
                {item.type === 'list' ? <Bookmark size={14} color={colors.fog} /> :
                 item.type === 'log' ? <ScrollText size={14} color={colors.fog} /> :
                 item.type === 'user' ? <User size={14} color={colors.fog} /> :
                 <Clapperboard size={14} color={colors.fog} />}
              </View>
            )}
          </View>

          {/* Text */}
          <View style={st.rowText}>
            <Text style={st.rowTitle} numberOfLines={1}>{item.title}</Text>

            <View style={st.rowSubRow}>
              <Text style={st.rowSub} numberOfLines={1}>{item.subtitle}</Text>
              {item.rating ? (
                <Text style={st.rowRating}>{'◉'.repeat(Math.min(item.rating, 5))}</Text>
              ) : null}
              {item.extra && item.type !== 'log' ? (
                <Text style={st.rowExtra}>{item.extra}</Text>
              ) : null}
            </View>

            {/* Log excerpt */}
            {item.type === 'log' && item.extra ? (
              <Text style={st.rowExcerpt} numberOfLines={1}>{item.extra}</Text>
            ) : null}

            {/* User/log role badge */}
            {(item.type === 'user' || item.type === 'log') && item.role && ['auteur', 'archivist'].includes(item.role) ? (
              <Text style={[
                st.rolePill,
                item.role === 'auteur' && { color: '#D4A520', backgroundColor: 'rgba(212,165,32,0.12)' },
                item.role === 'archivist' && { color: colors.sepia, backgroundColor: 'rgba(139,105,20,0.10)' },
              ]}>
                {item.role === 'auteur' ? '★ AUTEUR' : '✦ ARCHIVIST'}
              </Text>
            ) : null}
          </View>

          <ArrowRight size={12} color={colors.ash} style={{ marginLeft: 6 }} />
        </Pressable>
      </Animated.View>
    );
  }, [onPress]);

  // ═══════════════════════════════════════════════════════════════
  // JSX
  // ═══════════════════════════════════════════════════════════════
  return (
    <KeyboardAvoidingView style={st.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <BlurView intensity={Platform.OS === 'ios' ? 55 : 100} tint="dark" style={StyleSheet.absoluteFillObject} />

      {/* ── SEARCH BAR ── */}
      <View style={[st.header, { paddingTop: Math.max(insets.top, 20) + 4 }]}>
        <View style={st.inputWrap}>
          <Search size={15} color={colors.sepia} style={{ marginLeft: 12, marginRight: 8 }} />
          <TextInput
            ref={inputRef}
            style={st.input}
            placeholder="Search the archives..."
            placeholderTextColor={colors.fog}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            keyboardAppearance="dark"
            selectionColor={colors.sepia}
            onSubmitEditing={() => Keyboard.dismiss()}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} style={st.clearBtn}>
              <X size={14} color={colors.fog} />
            </Pressable>
          )}
        </View>
        <Pressable onPress={() => router.back()} style={st.cancelWrap} hitSlop={12}>
          <Text style={st.cancelText}>Cancel</Text>
        </Pressable>
      </View>

      {/* ── FILTER TABS ── */}
      {searched && (
        <Animated.View entering={FadeIn.duration(250)}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={st.tabsContent}
            style={st.tabsWrap}
          >
            {TABS.map((t) => {
              const active = tab === t.key;
              const c = counts[t.key];
              const Icon = t.icon;
              return (
                <TouchableOpacity
                  key={t.key}
                  style={[st.tabBtn, active && st.tabActive]}
                  onPress={() => { Haptics.selectionAsync(); setTab(t.key); }}
                  activeOpacity={0.7}
                >
                  <Icon size={11} color={active ? colors.ink : colors.fog} strokeWidth={active ? 2.5 : 1.5} />
                  <Text style={[st.tabText, active && st.tabTextActive]}>{t.label}</Text>
                  {c > 0 && (
                    <View style={[st.tabCountBg, active && st.tabCountBgActive]}>
                      <Text style={[st.tabCountNum, active && st.tabCountNumActive]}>
                        {c > 99 ? '99+' : c}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Count line */}
          <View style={st.countBar}>
            <Text style={st.countText}>
              {searching ? 'SCANNING ARCHIVES…' : `${filtered.length} RESULT${filtered.length !== 1 ? 'S' : ''}`}
            </Text>
          </View>
        </Animated.View>
      )}

      {/* ── RESULTS ── */}
      <View style={{ flex: 1 }}>
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

        {/* No results */}
        {searched && !searching && filtered.length === 0 && (
          <Animated.View entering={FadeIn} style={st.center}>
            <Text style={st.centerLabel}>NO RESULTS IN THE ARCHIVE</Text>
            <Text style={st.emptySub}>Try a different search term or filter.</Text>
          </Animated.View>
        )}

        {/* Results */}
        {filtered.length > 0 && (
          <FlatList
            data={filtered}
            keyExtractor={(r) => r.id}
            renderItem={renderRow}
            contentContainerStyle={{ paddingTop: 4, paddingBottom: Math.max(insets.bottom, 20) + 20 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </KeyboardAvoidingView>
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
    borderBottomColor: 'rgba(139,105,20,0.10)',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  inputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', height: 42,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 3, borderWidth: 1, borderColor: 'rgba(139,105,20,0.10)',
  },
  input: { flex: 1, height: 42, fontFamily: fonts.body, fontSize: 14, color: colors.parchment },
  clearBtn: { padding: 10 },
  cancelWrap: { paddingLeft: 14 },
  cancelText: { fontFamily: fonts.uiMedium, fontSize: 14, color: colors.sepia },

  // Tabs
  tabsWrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(139,105,20,0.06)',
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  tabsContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 5 },
  tabBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 6, paddingHorizontal: 10,
    borderRadius: 3, borderWidth: 1,
    borderColor: 'rgba(139,105,20,0.12)',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  tabActive: { backgroundColor: colors.sepia, borderColor: colors.sepia },
  tabText: { fontFamily: fonts.uiMedium, fontSize: 8, letterSpacing: 1.2, color: colors.fog },
  tabTextActive: { color: colors.ink },
  tabCountBg: {
    backgroundColor: 'rgba(139,105,20,0.12)',
    paddingHorizontal: 4, paddingVertical: 1, borderRadius: 6, minWidth: 16, alignItems: 'center',
  },
  tabCountBgActive: { backgroundColor: 'rgba(0,0,0,0.18)' },
  tabCountNum: { fontFamily: fonts.ui, fontSize: 7, color: colors.fog },
  tabCountNumActive: { color: colors.ink },

  // Count bar
  countBar: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  countText: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2.5, color: colors.fog, opacity: 0.5 },

  // Result row
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 11, paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(139,105,20,0.05)',
  },
  rowPressed: { backgroundColor: 'rgba(139,105,20,0.04)' },

  badge: {
    width: 20, height: 20, borderRadius: 3,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 8, borderWidth: 1,
  },
  badgeGlyph: { fontSize: 9, color: colors.sepia },

  rowImg: {
    width: 38, height: 56, borderRadius: 2, overflow: 'hidden',
    backgroundColor: colors.soot, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.12)', marginRight: 12,
  },
  rowImgRound: { width: 42, height: 42, borderRadius: 21 },
  img: { width: '100%', height: '100%', resizeMode: 'cover' },
  imgEmpty: { alignItems: 'center', justifyContent: 'center' },

  rowText: { flex: 1 },
  rowTitle: { fontFamily: fonts.display, fontSize: 14, color: colors.parchment, lineHeight: 17, marginBottom: 2 },
  rowSubRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowSub: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1.2, color: colors.sepia },
  rowRating: { fontFamily: fonts.ui, fontSize: 7, color: colors.sepia, opacity: 0.7, letterSpacing: 1 },
  rowExtra: { fontFamily: fonts.ui, fontSize: 9, color: colors.fog, opacity: 0.5 },
  rowExcerpt: {
    fontFamily: fonts.body, fontSize: 11, color: colors.bone, opacity: 0.45,
    fontStyle: 'italic', marginTop: 2, lineHeight: 14,
  },
  rolePill: {
    fontFamily: fonts.ui, fontSize: 7, letterSpacing: 1.2,
    color: colors.fog, paddingHorizontal: 5, paddingVertical: 1.5,
    borderRadius: 2, alignSelf: 'flex-start', overflow: 'hidden', marginTop: 3,
  },

  // Center states
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  centerLabel: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 2, color: colors.fog, textAlign: 'center' },
  emptyTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.parchment, opacity: 0.5 },
  emptySub: {
    fontFamily: fonts.body, fontSize: 12, color: colors.bone, opacity: 0.35,
    textAlign: 'center', lineHeight: 18, maxWidth: 280,
  },
});
