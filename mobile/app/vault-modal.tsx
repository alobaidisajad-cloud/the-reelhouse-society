import { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import { tmdb } from '@/src/lib/tmdb';
import { colors, fonts } from '@/src/theme/theme';
import reelToast from '@/src/utils/reelToast';

interface VaultSearchResult {
  id: number;
  title?: string;
  poster_path?: string | null;
  release_date?: string;
  media_type?: string;
}

export default function VaultModal() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { fetchVault } = useFilmStore();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<VaultSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Debounced search — 300ms after last keystroke, not on every character
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const resp = await tmdb.search(query);
        const movies = (resp.results || []).filter((r) => r.media_type === 'movie' || r.media_type === undefined) as VaultSearchResult[];
        setResults(movies);
      } catch { }
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const handleSelectFormat = (film: VaultSearchResult) => {
    Alert.alert('Select Format', `What format of ${film.title} do you own?`, [
      { text: '4K Ultra HD', onPress: () => handleAddToVault(film, ['4K']) },
      { text: 'Blu-ray', onPress: () => handleAddToVault(film, ['Blu-ray']) },
      { text: 'DVD', onPress: () => handleAddToVault(film, ['DVD']) },
      { text: 'VHS', onPress: () => handleAddToVault(film, ['VHS']) },
      { text: 'Cancel', style: 'cancel' }
    ]);
  };

  const handleAddToVault = async (film: VaultSearchResult, formats: string[]) => {
    setSaving(true);
    try {
      const { error } = await supabase.from('physical_archive').insert({
        user_id: user?.id,
        film_id: film.id,
        title: film.title,
        poster_path: film.poster_path,
        formats: formats,
        notes: '',
        condition: 'Unknown'
      });
      if (error) throw error;
      
      reelToast.success(`${film.title} cataloged.`);
      fetchVault();
      router.back();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to catalog.';
      reelToast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.container}>
      {/* Drag handle */}
      <View style={s.dragHandleWrap}><View style={s.dragHandle} /></View>

      <View style={s.header}>
        <TouchableOpacity style={s.closeBtn} onPress={() => router.back()} activeOpacity={0.7} hitSlop={{ top: 15, right: 15, bottom: 15, left: 15 }}>
          <Text style={s.closeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>CANCEL</Text>
        </TouchableOpacity>
        <Text style={s.title}>Add to Vault</Text>
        <View style={{ width: 70 }} />
      </View>

      <View style={s.searchWrap}>
        <View style={s.searchBox}>
          <Text style={s.searchIcon}>◈</Text>
          <TextInput
            style={s.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search films to catalog..."
            placeholderTextColor={colors.fog}
            autoFocus
          />
        </View>
      </View>

      {loading ? (
        <View style={s.centerItem}><ActivityIndicator color={colors.sepia} /></View>
      ) : saving ? (
        <View style={s.centerItem}>
          <ActivityIndicator color={colors.sepia} />
          <Text style={s.savingText}>CATALOGING TO VAULT...</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={item => item.id.toString()}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => {
            const posterUri = item.poster_path ? tmdb.poster(item.poster_path) : null;
            return (
              <TouchableOpacity style={s.resultRow} onPress={() => handleSelectFormat(item)} activeOpacity={0.7}>
                {posterUri ? (
                  <Image source={{ uri: posterUri }} style={s.poster} contentFit="cover" />
                ) : (
                  <View style={[s.poster, { backgroundColor: colors.ash }]} />
                )}
                <View style={s.resultInfo}>
                  <Text style={s.resultTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.85}>{item.title}</Text>
                  <Text style={s.resultYear}>{item.release_date?.substring(0, 4)}</Text>
                </View>
              </TouchableOpacity>
            )
          }}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  dragHandleWrap: { alignItems: 'center' as const, paddingTop: 10 },
  dragHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 16 : 24, paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ash,
  },
  closeBtn: { width: 70 },
  closeText: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 1, color: colors.fog },
  title: { fontFamily: fonts.display, fontSize: 18, color: colors.sepia },

  searchWrap: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ash, backgroundColor: colors.soot },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.ink, borderWidth: 1, borderColor: colors.ash, borderRadius: 2, paddingHorizontal: 12 },
  searchIcon: { fontSize: 16, color: colors.sepia, marginRight: 8 },
  searchInput: { flex: 1, height: 44, color: colors.parchment, fontFamily: fonts.body, fontSize: 14 },

  centerItem: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  savingText: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 2, color: colors.sepia, marginTop: 12 },
  
  resultRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ash },
  poster: { width: 44, height: 66, borderRadius: 2, marginRight: 16, borderWidth: 1, borderColor: colors.ash },
  resultInfo: { flex: 1 },
  resultTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.bone, marginBottom: 4 },
  resultYear: { fontFamily: fonts.ui, fontSize: 11, color: colors.fog },
});
