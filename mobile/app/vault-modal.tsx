import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, ActivityIndicator, InteractionManager } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';

import { useFilmStore } from '@/src/stores/films';
import { tmdb } from '@/src/lib/tmdb';
import { colors, fonts } from '@/src/theme/theme';
import reelToast from '@/src/utils/reelToast';
import PressableScale from '@/src/components/PressableScale';
import { FlashList } from '@shopify/flash-list';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, useAnimatedKeyboard } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ToastOverlay } from '@/src/components/ToastOverlay';

interface VaultSearchResult {
  id: number;
  title?: string;
  poster_path?: string | null;
  release_date?: string;
  media_type?: string;
}

 
const VaultSearchResultRow = React.memo(({
  item,
  onSelect
}: {
  item: VaultSearchResult;
  onSelect: (film: VaultSearchResult) => void;
}) => {
  const posterUri = item.poster_path ? tmdb.poster(item.poster_path) : null;
  return (
    <PressableScale style={s.resultRow} onPress={() => onSelect(item)} accessibilityRole="button" accessibilityLabel={item.title ? `Select ${item.title}` : 'Select film'}>
      {posterUri ? (
        <Image source={{ uri: posterUri }} style={s.poster} contentFit="cover" />
      ) : (
        <View style={[s.poster, { backgroundColor: colors.ash }]} />
      )}
      <View style={s.resultInfo}>
        <Text style={s.resultTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.85}>{item.title}</Text>
        <Text style={s.resultYear}>{item.release_date?.substring(0, 4)}</Text>
      </View>
    </PressableScale>
  );
});

export default function VaultModal() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const keyboard = useAnimatedKeyboard();
  const animatedContainerStyle = useAnimatedStyle(() => ({
    paddingBottom: keyboard.height.value,
  }));

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<VaultSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formatFilm, setFormatFilm] = useState<VaultSearchResult | null>(null);

  // Nitrate Noir Breathing Ember Protocol
  const emberOpacity = useSharedValue(0.5);
  useEffect(() => {
    if (loading) {
      emberOpacity.value = withTiming(1, { duration: 600 });
    } else {
      emberOpacity.value = withTiming(0.5, { duration: 300 });
    }
  }, [loading, emberOpacity]);

  const animatedIconStyle = useAnimatedStyle(() => ({
    opacity: emberOpacity.value,
  }));

  // Debounced search — 300ms after last keystroke, race-condition-safe
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const resp = await tmdb.search(query);
        const movies = (resp.results || []).filter((r: VaultSearchResult) => r.media_type === 'movie' || r.media_type === undefined) as VaultSearchResult[];
        if (active) setResults(movies);
      } catch {
        if (active) reelToast.error('Archive connection disrupted. Try again.');
      }
      if (active) setLoading(false);
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [query]);

  // Callback isolation: stabilize input handler to prevent FlashList re-renders
  const handleQueryChange = useCallback((text: string) => {
    setQuery(text);
  }, []);

  const handleAddToVault = useCallback(async (film: VaultSearchResult, formats: string[]) => {
    setSaving(true);
    try {
      const { addToPhysicalArchive } = useFilmStore.getState();
      await addToPhysicalArchive(
        { id: film.id, title: film.title || 'Untitled', poster_path: film.poster_path, release_date: film.release_date },
        formats
      );
      
      reelToast.success(`${film.title || 'Untitled'} cataloged.`);
      InteractionManager.runAfterInteractions(() => {
          router.back();
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to catalog.';
      reelToast.error(msg);
    } finally {
      setSaving(false);
    }
  }, [router]);

  const handleSelectFormat = useCallback((film: VaultSearchResult) => {
    setFormatFilm(film);
  }, []);

  const handleFormatChoice = useCallback((format: string) => {
    if (!formatFilm) return;
    handleAddToVault(formatFilm, [format]);
    setFormatFilm(null);
  }, [formatFilm, handleAddToVault]);

  const renderRow = useCallback(({ item }: { item: VaultSearchResult }) => {
    return <VaultSearchResultRow item={item} onSelect={handleSelectFormat} />;
  }, [handleSelectFormat]);

  return (
    <Animated.View style={[s.container, animatedContainerStyle]}>
      <ToastOverlay />
      {/* Drag handle */}
      <View style={[s.dragHandleWrap, { paddingTop: Math.max(insets.top + 10, 20) }]}><View style={s.dragHandle} /></View>

      <View style={s.header}>
        <PressableScale style={s.closeBtn} onPress={() => router.back()} hitSlop={{ top: 15, right: 15, bottom: 15, left: 15 }} haptic="light" accessibilityRole="button" accessibilityLabel="Cancel">
          <Text style={s.closeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>CANCEL</Text>
        </PressableScale>
        <Text style={s.title}>Add to Vault</Text>
        <View style={{ width: 70 }} />
      </View>

      <View style={s.searchWrap}>
        <View style={s.searchBox}>
          <Animated.Text style={[s.searchIcon, animatedIconStyle, { color: loading ? colors.bloodReel : colors.sepia }]}>◈</Animated.Text>
          <TextInput
            style={s.searchInput}
            value={query}
            onChangeText={handleQueryChange}
            placeholder="Search films to catalog..."
            placeholderTextColor={colors.fog}
            autoFocus
            selectionColor={'rgba(218,165,32,0.3)'}
            cursorColor={colors.sepia}
            keyboardAppearance="dark"
            accessibilityLabel="Search films to add to your vault"
            returnKeyType="search"
          />
        </View>
      </View>

      {/* ── Nitrate Noir Format Selection Sheet ── */}
      {formatFilm && (
        <View style={s.formatSheet}>
          <Text style={s.formatTitle}>SELECT FORMAT</Text>
          <Text style={s.formatFilmName} numberOfLines={1}>{formatFilm.title?.toUpperCase()}</Text>
          {['4K Ultra HD', 'Blu-ray', 'DVD', 'VHS'].map(fmt => (
            <PressableScale key={fmt} style={s.formatBtn} onPress={() => handleFormatChoice(fmt === '4K Ultra HD' ? '4K' : fmt)} haptic="selection" pressedScale={0.97} accessibilityRole="button" accessibilityLabel={`Select ${fmt} format`}>
              <Text style={s.formatBtnText}>{fmt.toUpperCase()}</Text>
            </PressableScale>
          ))}
          <PressableScale style={s.formatCancelBtn} onPress={() => setFormatFilm(null)} haptic="light" pressedScale={0.97}>
            <Text style={s.formatCancelText}>CANCEL</Text>
          </PressableScale>
        </View>
      )}

      {saving ? (
        <View style={s.centerItem}>
          <ActivityIndicator color={colors.sepia} />
          <Text style={s.savingText}>CATALOGING TO VAULT...</Text>
        </View>
      ) : !formatFilm ? (
        <FlashList
          data={results}
          keyExtractor={item => item.id.toString()}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ padding: 16 }}
          renderItem={renderRow}
          estimatedItemSize={90}
          ListEmptyComponent={
            query.trim().length > 0 && !loading ? (
              <View style={s.centerItem}>
                <Text style={s.savingText}>THE VAULT FINDS NOTHING</Text>
              </View>
            ) : null
          }
        />
      ) : null}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  // FIX #10: paddingTop is set dynamically via inline style — removed dead declaration
  dragHandleWrap: { alignItems: 'center' as const },
  dragHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ash,
  },
  closeBtn: { width: 70 },
  closeText: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 1, color: colors.fog },
  title: { fontFamily: fonts.display, fontSize: 18, color: colors.sepia },

  searchWrap: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ash, backgroundColor: colors.soot },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.ink, borderWidth: 1, borderColor: colors.ash, borderRadius: 2, paddingHorizontal: 12 },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, height: 44, color: colors.parchment, fontFamily: fonts.body, fontSize: 14 },

  centerItem: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  savingText: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 2, color: colors.sepia, marginTop: 12 },
  
  resultRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ash },
  poster: { width: 44, height: 66, borderRadius: 2, marginRight: 16, borderWidth: 1, borderColor: colors.ash },
  resultInfo: { flex: 1 },
  resultTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.bone, marginBottom: 4 },
  resultYear: { fontFamily: fonts.ui, fontSize: 11, color: colors.fog },

  // Format Selection Sheet
  formatSheet: { padding: 16, borderTopWidth: 1, borderTopColor: colors.ash, backgroundColor: colors.soot },
  formatTitle: { fontFamily: fonts.uiBold, fontSize: 9, letterSpacing: 3, color: colors.fog, marginBottom: 4 },
  formatFilmName: { fontFamily: fonts.display, fontSize: 16, color: colors.sepia, marginBottom: 16 },
  formatBtn: { backgroundColor: 'rgba(139,105,20,0.08)', borderWidth: 1, borderColor: colors.ash, borderRadius: 2, paddingVertical: 14, alignItems: 'center' as const, marginBottom: 8 },
  formatBtnText: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 2, color: colors.parchment },
  formatCancelBtn: { paddingVertical: 12, alignItems: 'center' as const, marginTop: 4 },
  formatCancelText: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 2, color: colors.fog },
});


VaultSearchResultRow.displayName = 'VaultSearchResultRow';