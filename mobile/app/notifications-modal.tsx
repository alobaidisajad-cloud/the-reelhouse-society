import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useNotificationStore, AppNotification } from '@/src/stores/social';
import { colors, fonts } from '@/src/theme/theme';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInUp, FadeOutDown } from 'react-native-reanimated';

function NotificationItem({ item, onRead, onDismiss }: { item: AppNotification; onRead: (id: string) => void; onDismiss: (id: string) => void }) {
  const isRead = item.read;
  
  const handlePress = () => {
    if (!isRead) {
      Haptics.selectionAsync();
      onRead(item.id);
    }
  };

  return (
    <Animated.View entering={FadeInUp.duration(300)} exiting={FadeOutDown.duration(200)}>
      <TouchableOpacity 
        style={[s.itemWrap, !isRead && s.itemUnread]} 
        onPress={handlePress}
        activeOpacity={0.7}
      >
        <View style={s.itemContent}>
          <Text style={s.itemMessage}><Text style={s.itemUser}>@{item.from_username || 'system'}</Text> {item.message}</Text>
          <Text style={s.itemTime}>{new Date(item.created_at).toLocaleDateString()}</Text>
        </View>
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
      <View style={s.header}>
        <TouchableOpacity style={s.closeBtn} onPress={() => router.back()}>
          <Text style={s.closeText}>CLOSE</Text>
        </TouchableOpacity>
        <Text style={s.title}>Notifications</Text>
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
        ListEmptyComponent={
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>📭</Text>
            <Text style={s.emptyTitle}>No New Transmissions</Text>
            <Text style={s.emptySub}>Your frequency is silent.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <NotificationItem 
            item={item} 
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
    flexDirection: 'row', alignItems: 'center', padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ash,
    backgroundColor: colors.ink,
  },
  itemUnread: {
    backgroundColor: 'rgba(196,150,26,0.06)',
    borderLeftWidth: 3, borderLeftColor: colors.bloodReel,
  },
  itemContent: { flex: 1, paddingRight: 10 },
  itemMessage: { fontFamily: fonts.body, fontSize: 13, color: colors.bone, lineHeight: 20 },
  itemUser: { fontFamily: fonts.sub, color: colors.parchment },
  itemTime: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 1, color: colors.fog, marginTop: 4 },
  
  dismissBtn: { padding: 8 },
  dismissText: { fontSize: 12, color: colors.fog },

  emptyState: { alignItems: 'center', marginTop: 100 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontFamily: fonts.sub, fontSize: 16, color: colors.bone, marginBottom: 4 },
  emptySub: { fontFamily: fonts.body, fontSize: 12, color: colors.fog, fontStyle: 'italic' }
});
