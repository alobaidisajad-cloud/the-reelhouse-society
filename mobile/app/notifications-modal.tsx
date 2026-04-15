import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Platform } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useNotificationStore, AppNotification } from '@/src/stores/social';
import { colors, fonts } from '@/src/theme/theme';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInUp, FadeOutDown } from 'react-native-reanimated';
import { Heart, MessageCircle, UserPlus, Star, Award, Bell } from 'lucide-react-native';
import { EmptyState } from '@/src/components/EmptyStates';

// Map notification types to icons
const TYPE_ICONS: Record<string, { Icon: typeof Heart; color: string }> = {
  endorse: { Icon: Heart, color: colors.sepia },
  comment: { Icon: MessageCircle, color: colors.bone },
  follow:  { Icon: UserPlus, color: colors.flicker || colors.sepia },
  rate:    { Icon: Star, color: colors.sepia },
  default: { Icon: Award, color: colors.fog },
};

function NotificationItem({ item, index, onRead, onDismiss }: { item: AppNotification; index: number; onRead: (id: string) => void; onDismiss: (id: string) => void }) {
  const isRead = item.read;
  const router = useRouter();
  const typeInfo = TYPE_ICONS[item.type] || TYPE_ICONS.default;
  const TypeIcon = typeInfo.Icon;
  
  const handlePress = () => {
    if (!isRead) {
      Haptics.selectionAsync();
      onRead(item.id);
    }
    // Navigate to film or user if available
    if (item.film_id) router.push(`/film/${item.film_id}`);
    else if (item.from_username) router.push(`/user/${item.from_username}`);
  };

  const posterUri = item.poster_path ? `https://image.tmdb.org/t/p/w92${item.poster_path}` : null;

  return (
    <Animated.View entering={FadeInUp.duration(300).delay(index * 50)} exiting={FadeOutDown.duration(200)}>
      <TouchableOpacity 
        style={[s.itemWrap, !isRead && s.itemUnread]} 
        onPress={handlePress}
        activeOpacity={0.7}
      >
        {/* Action icon */}
        <View style={[s.iconCircle, { borderColor: typeInfo.color }]}>
          <TypeIcon size={14} color={typeInfo.color} strokeWidth={1.5} />
        </View>

        {/* Content */}
        <View style={s.itemContent}>
          <Text style={s.itemMessage}>
            <Text style={s.itemUser}>@{item.from_username || 'system'}</Text> {item.message}
          </Text>
          <Text style={s.itemTime}>{new Date(item.created_at).toLocaleDateString()}</Text>
        </View>

        {/* Mini poster thumbnail */}
        {posterUri && (
          <Image source={{ uri: posterUri }} style={s.miniPoster} contentFit="cover" />
        )}

        <TouchableOpacity style={s.dismissBtn} onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onDismiss(item.id);
        }}>
          <Text style={s.dismissText}>✕</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function NotificationsModal() {
  const router = useRouter();
  const { notifications, loading, markRead, markAllRead, dismiss } = useNotificationStore();

  const handleMarkAllRead = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    markAllRead();
  };

  return (
    <View style={s.container}>
      {/* Drag handle */}
      <View style={s.dragHandleWrap}><View style={s.dragHandle} /></View>

      <View style={s.header}>
        <TouchableOpacity style={s.closeBtn} onPress={() => router.back()}>
          <Text style={s.closeText}>CLOSE</Text>
        </TouchableOpacity>
        <Text style={s.title}>Dispatches</Text>
        <TouchableOpacity 
           style={s.markReadBtn} 
           onPress={handleMarkAllRead}
           disabled={notifications.every(n => n.read)}
        >
          <Text style={[s.markReadText, notifications.every(n => n.read) && { opacity: 0.3 }]}>READ ALL</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={notifications}
        keyExtractor={n => n.id}
        contentContainerStyle={s.listContent}
        showsVerticalScrollIndicator={false}
        windowSize={7}
        maxToRenderPerBatch={15}
        initialNumToRender={12}
        removeClippedSubviews={true}
        ListEmptyComponent={
          <EmptyState
            icon={<Bell size={28} color={colors.sepia} strokeWidth={1} />}
            title="No New Transmissions"
            subtitle="Your frequency is silent."
          />
        }
        renderItem={({ item, index }) => (
          <NotificationItem 
            item={item}
            index={index}
            onRead={(id) => markRead(id)} 
            onDismiss={(id) => dismiss(id)} 
          />
        )}
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
    paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 16 : 24, paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ash,
  },
  closeBtn: { width: 80 },
  closeText: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 1, color: colors.fog },
  title: { fontFamily: fonts.display, fontSize: 18, color: colors.bone },
  markReadBtn: { width: 80, alignItems: 'flex-end' },
  markReadText: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 1, color: colors.sepia },

  listContent: { paddingBottom: 40 },
  
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
  
  dismissBtn: { padding: 8 },
  dismissText: { fontSize: 12, color: colors.fog },

  emptyState: { alignItems: 'center', marginTop: 100 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontFamily: fonts.sub, fontSize: 16, color: colors.bone, marginBottom: 4 },
  emptySub: { fontFamily: fonts.body, fontSize: 12, color: colors.fog, fontStyle: 'italic' }
});
