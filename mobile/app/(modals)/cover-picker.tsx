/**
 * CoverPicker — host-only salon cover selection.
 * Route: /cover-picker?loungeId=xxx   (registered in app/_layout.tsx)
 *
 * Presented via the native (modals) route-modal pattern — the same
 * cross-platform-proven presentation as list-modal — and reuses the shipped
 * LogSearchEngine, so it renders identically on iOS and Android. Pick a film →
 * its TMDB backdrop becomes the salon's cover via the host-gated set_lounge_cover RPC.
 */
import React, { useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import LogSearchEngine, { LogSearchResult } from '@/src/components/log/LogSearchEngine';
import { useLoungeStore } from '@/src/stores/lounge';
import { colors, fonts } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import reelToast from '@/src/utils/reelToast';

export default function CoverPicker() {
  const { loungeId } = useLocalSearchParams<{ loungeId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setLoungeCover = useLoungeStore(s => s.setLoungeCover);

  const handlePick = useCallback((film: LogSearchResult) => {
    if (!loungeId) { router.back(); return; }
    if (!film.backdrop_path) {
      reelToast.error('That title has no cover art — try another.');
      return;
    }
    // Optimistic patch fires synchronously inside setLoungeCover; dismiss immediately.
    setLoungeCover(loungeId, film.backdrop_path);
    router.back();
  }, [loungeId, router, setLoungeCover]);

  return (
    <View style={[s.container, { paddingTop: Math.max(insets.top + 8, 16) }]}>
      <View style={s.header}>
        <View style={s.headerText}>
          <Text style={s.eyebrow}>✦ THE SALON COVER</Text>
          <Text style={s.title}>Choose a Cover</Text>
        </View>
        <PressableScale
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          haptic="selection"
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <X size={22} color={colors.fog} strokeWidth={1.5} />
        </PressableScale>
      </View>
      <Text style={s.hint}>Pick a film — its still becomes the salon&apos;s face.</Text>
      <View style={s.searchWrap}>
        <LogSearchEngine onSelectFilm={handlePick} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink, paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 },
  headerText: { flex: 1 },
  eyebrow: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 3, color: colors.sepia, marginBottom: 6, includeFontPadding: false },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.parchment, letterSpacing: 1 },
  hint: { fontFamily: fonts.body, fontSize: 12, color: colors.fog, marginBottom: 16, lineHeight: 18 },
  searchWrap: { flex: 1 },
});
