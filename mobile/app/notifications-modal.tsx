import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator, InteractionManager } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useNotificationStore, AppNotification } from '@/src/stores/social';
import { colors, fonts, SEPIA_HASH } from '@/src/theme/theme';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Heart, MessageCircle, UserPlus, Star, Award, Bell, X } from 'lucide-react-native';
import { EmptyState } from '@/src/components/EmptyStates';
import PressableScale from '@/src/components/PressableScale';

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
  const router = useRouter();
  const typeInfo = TYPE_ICONS[item.type] || TYPE_ICONS.default;
  const TypeIcon = typeInfo.Icon;
  
  const handlePress = () => {
    if (!isRead) {
      useNotificationStore.getState().markRead(item.id);
    }
    // Navigate to film or user if available (with strict modal teardown)
    // FIX #6: Use dismissAll to prevent stack corruption when navigating from notifications
    if (item.film_id) {
      router.dismissAll();
      InteractionManager.runAfterInteractions(() => router.push(`/film/${item.film_id}` as any));
    } else if (item.from_username) {
      router.dismissAll();
      InteractionManager.runAfterInteractions(() => router.push(`/user/${item.from_username}` as any));
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
            {new Date(item.created_at).toLocaleDateString()} · {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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

        <PressableScale style={s.dismissBtn} hitSlop={{top: 20, bottom: 20, left: 15, right: 15}} onPress={() => {
            useNotificationStore.getState().dismiss(item.id);
        }} haptic="light" pressedScale={0.9} accessibilityRole="button" accessibilityLabel="Dismiss notification">
          <X size={12} color={colors.fog} />
        </PressableScale>
      </PressableScale>
    </Animated.View>
  );
});

export default function NotificationsModal() {
  const router = useRouter();
  // H-11 AUDIT FIX: loading is now used for the list loading state
  const { notifications, loading, markAllRead, fetchNotifications } = useNotificationStore();
  // FIX #4: Single-source derived value instead of double .every() computation
  const allRead = useNotificationStore(s => s._unreadCount) === 0;

  // C4 FIX: Fetch existing notifications from server on mount
  React.useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const handleMarkAllRead = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    markAllRead();
  };

  // FIX #3: Stable renderItem reference to prevent FlashList cell reconciliation
  const renderNotification = useCallback(({ item, index }: { item: AppNotification; index: number }) => (
    <NotificationItem item={item} index={index} />
  ), []);

  return (
    <View style={s.container}>
      {/* Drag handle */}
      <View style={s.dragHandleWrap}><View style={s.dragHandle} /></View>

      <View style={s.header}>
        <PressableScale style={s.closeBtn} onPress={() => { router.back(); }} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}} haptic="selection" pressedScale={0.95}>
          <Text style={s.closeText} adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.75}>CLOSE</Text>
        </PressableScale>
        <Text style={s.title}>Dispatches</Text>
        <PressableScale 
           style={s.markReadBtn} 
           onPress={handleMarkAllRead}
           disabled={allRead}
           hitSlop={{top: 15, bottom: 15, left: 15, right: 15}}
           haptic="selection"
           pressedScale={0.95}
        >
          <Text style={[s.markReadText, allRead && { opacity: 0.3 }]} adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.75}>READ ALL</Text>
        </PressableScale>
      </View>

      <FlashList
        data={notifications}
        estimatedItemSize={80}
        keyExtractor={n => n.id}
        contentContainerStyle={s.listContent}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
        ListHeaderComponent={
          loading ? (
            <View style={s.loadingWrap}>
              <ActivityIndicator size="small" color={colors.sepia} />
              <Text style={s.loadingText}>TUNING FREQUENCY…</Text>
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

  loadingWrap: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  loadingText: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 2, color: colors.fog },

});
