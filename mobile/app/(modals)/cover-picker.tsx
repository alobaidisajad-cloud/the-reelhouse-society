/**
 * CoverPicker — host-only salon cover selection.
 * Route: /cover-picker?loungeId=xxx   (registered in app/_layout.tsx)
 *
 * Presented via the native (modals) route-modal pattern — the same
 * cross-platform-proven presentation as list-modal — and reuses the shipped
 * LogSearchEngine, so it renders identically on iOS and Android. Pick a film →
 * its TMDB backdrop becomes the salon's cover via the host-gated set_lounge_cover RPC.
 *
 * Offered only to the salon's host: a link may name any salon (P4.4), and a pick changes the cover
 * on screen at once, before the house could refuse it.
 */
import React, { useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/src/components/text';
import { useLocalSearchParams } from 'expo-router';
import { useModalTop } from '@/src/components/layout/navMetrics';
import { X } from 'lucide-react-native';
import LogSearchEngine, { LogSearchResult } from '@/src/components/log/LogSearchEngine';
import { useLoungeStore } from '@/src/stores/lounge';
import { colors, fonts } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import reelToast from '@/src/utils/reelToast';
import { RoomLight } from '@/src/components/atmosphere/RoomLight';
import { nav } from '@/src/utils/typedRouter';
import { useAuthStore } from '@/src/stores/auth';
import { EmptyState } from '@/src/components/EmptyStates';
import { WayOut } from '@/src/components/TryAgain';
import { MembersOnly } from '@/src/components/MembersOnly';

export default function CoverPicker() {
  const { loungeId } = useLocalSearchParams<{ loungeId: string }>();
  const top = useModalTop();
  const setLoungeCover = useLoungeStore(s => s.setLoungeCover);
  const me = useAuthStore((st) => st.user?.id);
  const hosts = useLoungeStore((st) => !!me && st.lounges.some((l) => l.id === loungeId && l.creator_id === me));

  const handlePick = useCallback((film: LogSearchResult) => {
    if (!loungeId) { nav.back(); return; }
    if (!film.backdrop_path) {
      reelToast.error('That title has no cover art — try another.');
      return;
    }
    // Optimistic patch fires synchronously inside setLoungeCover; dismiss immediately.
    setLoungeCover(loungeId, film.backdrop_path);
    nav.back();
  }, [loungeId, setLoungeCover]);

  // A stranger is not told "not yours" of a salon: they are asked in, and brought back here.
  if (!me) {
    return <MembersOnly next={`/cover-picker?loungeId=${loungeId ?? ''}`} style={{ paddingTop: top }} />;
  }

  if (!hosts) {
    return (
      <View style={[s.container, s.notYours, { paddingTop: top }]}>
        <RoomLight room="default" />
        <EmptyState buster="suspicious" title="Not Yours to Change" subtitle="Only a salon's host may choose its cover." />
        <WayOut label="Close" onPress={() => nav.back()} belowAnAct={false} />
      </View>
    );
  }

  return (
    <View style={[s.container, { paddingTop: top }]}>
      <RoomLight room="default" />
      <View style={s.header}>
        <View style={s.headerText}>
          <Text style={s.eyebrow}>✦ THE SALON COVER</Text>
          <Text style={s.title}>Choose a Cover</Text>
        </View>
        <PressableScale touch="wayOut"
          onPress={() => nav.back()}
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
  /** Not the host: the notice, centred where the picker would stand. */
  notYours: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 },
  headerText: { flex: 1 },
  eyebrow: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.9, color: colors.sepia, marginBottom: 6, includeFontPadding: false },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.parchment, letterSpacing: 1 },
  hint: { fontFamily: fonts.body, fontSize: 12, color: colors.fog, marginBottom: 16, lineHeight: 18 },
  searchWrap: { flex: 1 },
});

// Expo Router per-route crash net — see src/components/RouteErrorBoundary.tsx
export { RouteErrorBoundary as ErrorBoundary } from '@/src/components/RouteErrorBoundary';
