/**
 * FollowRequestsPanel — "At the Door" (incoming follow requests).
 * ────────────────────────────────────────────────────────────────
 * The stateful, source-of-truth surface for approving/declining follow
 * requests. Mirrors the lounge's AtTheDoorPanel language, but runs on the
 * notifications-grade engine: a virtualized FlashList with cursor pagination,
 * server-side search, optimistic resolve, and a one-statement bulk decline —
 * so it behaves identically at 3 requests or 3,000.
 */
import React from 'react';
import { Modal, View, Text, StyleSheet, TextInput, ActivityIndicator, Pressable } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyRound, X, Check, Search, User } from 'lucide-react-native';

import PressableScale from '@/src/components/PressableScale';
import { colors, fonts } from '@/src/theme/theme';
import { useFollowRequests } from '@/src/hooks/useFollowRequests';
import type { FollowRequest } from '@/src/services/FollowRequestService';

const AnimatedView = Animated.createAnimatedComponent(View);
const HITSLOP = { top: 10, bottom: 10, left: 10, right: 10 } as const;

const RequestRow = React.memo(function RequestRow({
  item, busy, onAccept, onDecline,
}: { item: FollowRequest; busy: boolean; onAccept: (r: FollowRequest) => void; onDecline: (r: FollowRequest) => void }) {
  return (
    <View style={s.row}>
      <View style={s.avatar}>
        {item.avatarUrl
          ? <Image source={{ uri: item.avatarUrl }} style={s.avatarImg} contentFit="cover" cachePolicy="memory-disk" recyclingKey={item.requesterId} />
          : <User size={15} color={colors.fog} strokeWidth={1.5} />}
      </View>
      <Text style={s.name} numberOfLines={1}>@{item.username?.toUpperCase()}</Text>
      <PressableScale
        style={[s.btn, s.declineBtn, busy && s.btnBusy]}
        onPress={() => onDecline(item)}
        disabled={busy}
        hitSlop={HITSLOP}
        haptic="selection"
        accessibilityRole="button"
        accessibilityLabel={`Decline ${item.username}`}
      >
        <X size={14} color={colors.crimson} strokeWidth={2} />
      </PressableScale>
      <PressableScale
        style={[s.btn, s.admitBtn, busy && s.btnBusy]}
        onPress={() => onAccept(item)}
        disabled={busy}
        hitSlop={HITSLOP}
        haptic="medium"
        accessibilityRole="button"
        accessibilityLabel={`Admit ${item.username}`}
      >
        <Check size={14} color={colors.ink} strokeWidth={2.5} />
        <Text style={s.admitText}>ADMIT</Text>
      </PressableScale>
    </View>
  );
});

export default function FollowRequestsPanel({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const {
    items, loading, loadingMore, hasMore, search, busyId,
    setSearch, loadMore, accept, decline, declineAll,
  } = useFollowRequests(visible);

  if (!visible) return null;

  const showSearch = items.length > 0 || search.length > 0;

  return (
    <Modal statusBarTranslucent transparent visible animationType="fade" onRequestClose={onClose}>
      <View style={s.host}>
        <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
        <Pressable style={s.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <AnimatedView entering={SlideInDown.springify().damping(18)} exiting={SlideOutDown} style={[s.sheet, { paddingBottom: Math.max(insets.bottom + 8, 24) }]}>
          <View style={s.handle} />

          <View style={s.headerRow}>
            <View style={s.titleRow}>
              <KeyRound size={18} color={colors.sepia} strokeWidth={1.5} />
              <Text style={s.title}>At the Door</Text>
            </View>
            <PressableScale onPress={onClose} hitSlop={HITSLOP} haptic="selection" accessibilityRole="button" accessibilityLabel="Close">
              <X size={20} color={colors.fog} strokeWidth={1.5} />
            </PressableScale>
          </View>
          <Text style={s.subtitle}>Petitions to follow your dossier.</Text>

          {showSearch && (
            <View style={s.searchWrap}>
              <Search size={14} color={colors.fog} strokeWidth={1.5} />
              <TextInput
                style={s.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Find a petitioner…"
                placeholderTextColor={colors.ash}
                selectionColor={colors.sepia}
                keyboardAppearance="dark"
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Search follow requests"
              />
              {search.length > 0 && (
                <PressableScale onPress={() => setSearch('')} hitSlop={HITSLOP} accessibilityLabel="Clear search">
                  <X size={13} color={colors.fog} />
                </PressableScale>
              )}
            </View>
          )}

          <View style={s.listArea}>
            {loading && items.length === 0 ? (
              <View style={s.center}>
                <ActivityIndicator size="small" color={colors.sepia} />
              </View>
            ) : items.length === 0 ? (
              <View style={s.center}>
                <Text style={s.emptyText}>{search ? 'No one by that name.' : "No one's at the door."}</Text>
              </View>
            ) : (
              <FlashList
                data={items}
                estimatedItemSize={58}
                keyExtractor={(it: FollowRequest) => it.requesterId}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                onEndReached={hasMore ? loadMore : undefined}
                onEndReachedThreshold={0.5}
                renderItem={({ item }: { item: FollowRequest }) => (
                  <RequestRow item={item} busy={busyId === item.requesterId} onAccept={accept} onDecline={decline} />
                )}
                ListFooterComponent={loadingMore ? <View style={s.footerLoad}><ActivityIndicator size="small" color={colors.sepia} /></View> : null}
              />
            )}
          </View>

          {items.length > 0 && (
            <PressableScale style={s.declineAll} onPress={declineAll} haptic="heavy" pressedScale={0.97} accessibilityRole="button" accessibilityLabel="Decline all remaining requests">
              <Text style={s.declineAllText}>DECLINE ALL REMAINING</Text>
            </PressableScale>
          )}
        </AnimatedView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  host: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { flex: 1 },
  sheet: {
    maxHeight: '85%', minHeight: '45%', backgroundColor: colors.ink,
    borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingHorizontal: 24, paddingTop: 10,
    borderWidth: 1, borderBottomWidth: 0, borderColor: 'rgba(184,137,26,0.15)',
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)', alignSelf: 'center', marginBottom: 18 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.parchment },
  subtitle: { fontFamily: fonts.body, fontStyle: 'italic', fontSize: 13, color: colors.fog, marginTop: 6 },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16,
    backgroundColor: 'rgba(18,14,9,0.9)', borderWidth: 1, borderColor: 'rgba(184,137,26,0.25)',
    borderRadius: 8, paddingHorizontal: 11, height: 40,
  },
  searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.parchment, padding: 0 },

  listArea: { flexGrow: 1, flexShrink: 1, minHeight: 140, marginTop: 12 },
  center: { flex: 1, minHeight: 140, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontFamily: fonts.body, fontStyle: 'italic', fontSize: 14, color: colors.fog },
  footerLoad: { paddingVertical: 16, alignItems: 'center' },

  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.soot },
  avatar: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: colors.soot, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.ash,
  },
  avatarImg: { width: '100%', height: '100%' },
  name: { flex: 1, fontFamily: fonts.sub, fontSize: 11, letterSpacing: 1, color: colors.bone, includeFontPadding: false },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 8 },
  btnBusy: { opacity: 0.4 },
  declineBtn: { width: 38, height: 34, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.crimsonBorder },
  admitBtn: { backgroundColor: colors.sepia, paddingHorizontal: 14, height: 34 },
  admitText: { fontFamily: fonts.sub, fontSize: 9.5, letterSpacing: 1.5, color: colors.ink, includeFontPadding: false },

  declineAll: { marginTop: 12, alignItems: 'center', paddingVertical: 12, borderWidth: 1, borderColor: colors.crimsonBorder, borderRadius: 8 },
  declineAllText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.crimson },
});
