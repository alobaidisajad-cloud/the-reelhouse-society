import { nav } from '@/src/utils/typedRouter';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, InteractionManager, Platform, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { AppNotification, useNotificationStore } from '@/src/stores/notificationStore';
import { colors, fonts, SEPIA_HASH } from '@/src/theme/theme';
import { DisplayItem, GroupedDisplayItem, groupNotifications } from '@/src/utils/groupNotifications';
import * as Notifications from 'expo-notifications';

import { EmptyState } from '@/src/components/EmptyStates';
import PressableScale from '@/src/components/PressableScale';
import TactileEngine from '@/src/utils/TactileEngine';
import { timeAgo } from '@/src/utils/timeAgo';
import { Award, Bell, Heart, MessageCircle, Star, UserPlus, X } from 'lucide-react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

// ── Hoisted Constants (P2-HITSLOP FIX) ──
const HITSLOP_15 = { top: 15, bottom: 15, left: 15, right: 15 } as const;
const HITSLOP_20 = { top: 20, bottom: 20, left: 15, right: 15 } as const;

// Map notification types to icons
const TYPE_ICONS: Record<string, { Icon: typeof Heart; color: string }> = {
  endorse: { Icon: Heart, color: colors.sepia },
  comment: { Icon: MessageCircle, color: colors.bone },
  follow:  { Icon: UserPlus, color: colors.flicker || colors.sepia },
  rate:    { Icon: Star, color: colors.sepia },
  default: { Icon: Award, color: colors.fog },
};

const NotificationItem = React.memo(function NotificationItem({ item, index }: { item: AppNotification; index: number }) {
  const isRead = item.read;

  const typeInfo = TYPE_ICONS[item.type] || TYPE_ICONS.default;
  const TypeIcon = typeInfo.Icon;
  
  const handlePress = () => {
    if (!isRead) {
      useNotificationStore.getState().markRead(item.id);
    }
    // Navigate to film or user if available (with strict modal teardown)
    // FIX #6: Use dismissAll to prevent stack corruption when navigating from notifications
    if (item.film_id) {
      nav.back();
      InteractionManager.runAfterInteractions(() => nav.push(`/film/${item.film_id}`));
    } else if (item.from_username) {
      nav.back();
      InteractionManager.runAfterInteractions(() => nav.push(`/user/${item.from_username}`));
    }
  };

  const posterUri = item.poster_path ? `https://image.tmdb.org/t/p/w92${item.poster_path}` : null;

  return (
    <Animated.View entering={FadeInUp.duration(300).delay(Math.min(index * 50, 400))}>
      <PressableScale 
        style={[s.itemWrap, !isRead && s.itemUnread]} 
        onPress={handlePress}
        haptic="light"
        pressedScale={0.96}
        accessibilityLabel={`Notification: ${item.message}`}
      >
        {/* Action icon */}
        <View style={[s.iconCircle, { borderColor: typeInfo.color }]}>
          <TypeIcon size={14} color={typeInfo.color} strokeWidth={1.5} />
        </View>

        {/* Content */}
        <View style={s.itemContent}>
          <Text style={s.itemMessage} numberOfLines={3} ellipsizeMode="tail">
            <Text style={s.itemUser}>@{item.from_username || 'system'}</Text> {item.message}
          </Text>
          <Text style={s.itemTime} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {timeAgo(item.created_at)}
          </Text>
        </View>

        {/* Mini poster thumbnail */}
        {posterUri ? (
          <Image source={{ uri: posterUri }} style={s.miniPoster} contentFit="cover" cachePolicy="memory-disk" placeholder={{ blurhash: SEPIA_HASH }} transition={200} />
        ) : item.film_id ? (
          <View style={[s.miniPoster, s.miniPosterEmpty]}>
            <Star size={10} color={colors.fog} />
          </View>
        ) : null}

        {/* TactileEngine.warn() before dismiss for destructive-action feedback */}
        <PressableScale style={s.dismissBtn} hitSlop={HITSLOP_20} onPress={() => {
            TactileEngine.warn();
            useNotificationStore.getState().dismiss(item.id);
        }} haptic="light" pressedScale={0.9} accessibilityRole="button" accessibilityLabel="Dismiss notification">
          <X size={12} color={colors.fog} />
        </PressableScale>
      </PressableScale>
    </Animated.View>
  );
});

const GroupedNotificationItem = React.memo(function GroupedNotificationItem({ item, index }: { item: GroupedDisplayItem; index: number }) {
  const posterUri = item.poster_path ? `https://image.tmdb.org/t/p/w92${item.poster_path}` : null;

  const handlePress = () => {
    if (item.hasUnread) {
      useNotificationStore.getState().markGroupRead(item.ids);
    }
    nav.back();
    InteractionManager.runAfterInteractions(() => {
      if (item.film_id) nav.push(`/film/${item.film_id}`);
    });
  };

  const handleDismiss = () => {
    TactileEngine.warn();
    useNotificationStore.getState().dismissGroup(item.ids);
  };

  return (
    <Animated.View entering={FadeInUp.duration(300).delay(Math.min(index * 50, 400))}>
      <PressableScale
        style={[s.itemWrap, item.hasUnread && s.itemUnread]}
        onPress={handlePress}
        haptic="light"
        pressedScale={0.96}
        accessibilityLabel={`Grouped notification: ${item.message}`}
      >
        {/* Count badge */}
        <View style={s.groupBadge}>
          <Text style={s.groupCount}>{item.count}</Text>
        </View>

        {/* Content */}
        <View style={s.itemContent}>
          <Text style={s.itemMessage} numberOfLines={2} ellipsizeMode="tail">
            {item.message}
          </Text>
          <Text style={s.itemTime} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {timeAgo(item.created_at)}
          </Text>
        </View>

        {/* Mini poster thumbnail */}
        {posterUri ? (
          <Image source={{ uri: posterUri }} style={s.miniPoster} contentFit="cover" cachePolicy="memory-disk" placeholder={{ blurhash: SEPIA_HASH }} transition={200} />
        ) : null}

        {/* Dismiss button */}
        <PressableScale style={s.dismissBtn} hitSlop={HITSLOP_20} onPress={handleDismiss} haptic="light" pressedScale={0.9} accessibilityRole="button" accessibilityLabel="Dismiss grouped notification">
          <X size={12} color={colors.fog} />
        </PressableScale>
      </PressableScale>
    </Animated.View>
  );
});

export default function NotificationsModal() {

  // loading is now used for the list loading state
  const { notifications, loading, markAllRead, fetchNotifications, loadMoreNotifications } = useNotificationStore();
  // FIX #4: Single-source derived value instead of double .every() computation
  const allRead = useNotificationStore(s => s._unreadCount) === 0;

  // Pure view-layer grouping transformation — recomputes only when notifications[] changes
  const displayItems = useMemo(() => groupNotifications(notifications), [notifications]);

  // Pull-to-refresh state (local — not persisted)
  const [refreshing, setRefreshing] = useState(false);

  // Fetch existing notifications from server on mount
  React.useEffect(() => { 
    fetchNotifications(); 
    // Optimistically clear the iOS springboard badge instantly
    if (Platform.OS === 'ios') {
      Notifications.setBadgeCountAsync(0);
    }
  }, [fetchNotifications]);

  const handleMarkAllRead = () => {
    TactileEngine.success();
    markAllRead();
  };

  // Pull-to-refresh handler matching dispatch.tsx pattern
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchNotifications();
    setRefreshing(false);
  }, [fetchNotifications]);

  // Infinite scroll handler — wires to existing cursor pagination in store
  const handleLoadMore = useCallback(() => {
    loadMoreNotifications();
  }, [loadMoreNotifications]);

  // FIX #3: Stable renderItem reference to prevent FlashList cell reconciliation
  const renderNotification = useCallback(({ item, index }: { item: DisplayItem; index: number }) => {
    if (item.kind === 'group') {
      return <GroupedNotificationItem item={item} index={index} />;
    }
    return <NotificationItem item={item.notification} index={index} />;
  }, []);

  return (
    <View style={s.container} accessibilityViewIsModal={true}>
      {/* Drag handle */}
      <View style={s.dragHandleWrap}><View style={s.dragHandle} /></View>

      <View style={s.header}>
        <PressableScale style={s.closeBtn} onPress={() => { nav.back(); }} hitSlop={HITSLOP_15} haptic="selection" pressedScale={0.95} accessibilityLabel="Close notifications">
          <Text style={s.closeText} adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.75}>CLOSE</Text>
        </PressableScale>
        <Text style={s.title}>Dispatches</Text>
        <PressableScale 
           style={s.markReadBtn} 
           onPress={handleMarkAllRead}
           disabled={allRead}
           hitSlop={HITSLOP_15}
           haptic="selection"
           accessibilityLabel="Mark all as read"
           pressedScale={0.95}
        >
          <Text style={[s.markReadText, allRead && { opacity: 0.3 }]} adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.75}>READ ALL</Text>
        </PressableScale>
      </View>

      <FlashList
        data={displayItems}
        estimatedItemSize={80}
        keyExtractor={(item: DisplayItem) => item.kind === 'group' ? item.groupKey : item.notification.id}
        contentContainerStyle={s.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.sepia}
            colors={[colors.sepia]}
            progressBackgroundColor={colors.ink}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          // Show header spinner ONLY on cold start (no cached data).
          // During loadMore pagination, the footer spinner handles it instead.
          // Matches the dispatch.tsx pattern: footer uses `loading && data.length > 0`.
          loading && notifications.length === 0 ? (
            <View style={s.loadingWrap}>
              <ActivityIndicator size="small" color={colors.sepia} />
              <Text style={s.loadingText}>TUNING FREQUENCY…</Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          // Footer spinner for loadMore pagination.
          // Only visible when loading AND we already have data (i.e., not initial fetch).
          loading && notifications.length > 0 ? (
            <View style={s.footerLoadingWrap}>
              <ActivityIndicator size="small" color={colors.sepia} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          loading ? null : (
            <EmptyState
              icon={<Bell size={28} color={colors.sepia} strokeWidth={1} />}
              title="No New Transmissions"
              subtitle="Your frequency is silent."
            />
          )
        }
        renderItem={renderNotification}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  dragHandleWrap: { alignItems: 'center', paddingTop: 10 },
  dragHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ash,
  },
  closeBtn: { width: 80 },
  closeText: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 1, color: colors.fog },
  title: { fontFamily: fonts.display, fontSize: 18, color: colors.bone },
  markReadBtn: { width: 80, alignItems: 'flex-end' },
  markReadText: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 1, color: colors.sepia },

  listContent: { paddingBottom: 40, flexGrow: 1 },
  
  itemWrap: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ash,
    backgroundColor: colors.ink, gap: 10,
  },
  itemUnread: {
    backgroundColor: 'rgba(196,150,26,0.06)',
    borderLeftWidth: 3, borderLeftColor: colors.bloodReel,
  },
  iconCircle: {
    width: 30, height: 30, borderRadius: 15,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(11,10,8,0.6)',
  },
  itemContent: { flex: 1 },
  itemMessage: { fontFamily: fonts.body, fontSize: 13, color: colors.bone, lineHeight: 20 },
  itemUser: { fontFamily: fonts.sub, color: colors.parchment },
  itemTime: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 1, color: colors.fog, marginTop: 4 },
  miniPoster: {
    width: 24, height: 36, borderRadius: 2,
    backgroundColor: colors.soot,
  },
  miniPosterEmpty: {
    alignItems: 'center', justifyContent: 'center'
  },
  
  dismissBtn: { padding: 8 },

  groupBadge: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: colors.sepia,
    alignItems: 'center', justifyContent: 'center',
  },
  groupCount: {
    fontFamily: fonts.uiBold, fontSize: 12, color: '#fff',
  },

  loadingWrap: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  loadingText: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 2, color: colors.fog },

  // Footer loading indicator for pagination
  footerLoadingWrap: { alignItems: 'center', paddingVertical: 16 },

});
