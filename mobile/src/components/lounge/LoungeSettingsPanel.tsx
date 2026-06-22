import React, { useEffect, useCallback, useState } from 'react';
import { View, Text, Alert, Modal, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TactileEngine from '@/src/utils/TactileEngine';
import * as ExpoClipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Copy, Crown, LogOut, Trash2, X, Users } from 'lucide-react-native';
import { FlashList } from '@shopify/flash-list';
import { useLoungeStore, LoungeRoom } from '@/src/stores/lounge';
import { LoungeMember } from '@/src/types';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { colors, fonts, SEPIA_HASH } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { s } from './LoungeStyles';

import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming, 
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  withSpring, 
  Easing, 
  runOnJS 
} from 'react-native-reanimated';

export interface LoungeSettingsPanelProps {
  lounge: LoungeRoom | null;
  members: LoungeMember[];
  visible: boolean;
  onClose: () => void;
  isCreator: boolean;
}

export function LoungeSettingsPanel({ lounge, members, visible, onClose, isCreator }: LoungeSettingsPanelProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { leaveLounge, deleteLounge } = useLoungeStore();
  
  const [isRendered, setIsRendered] = useState(false);
  const translateY = useSharedValue(800);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setIsRendered(true);
      translateY.value = 800;
      opacity.value = withTiming(1, { duration: 300 });
      translateY.value = withTiming(0, { duration: 350, easing: Easing.out(Easing.cubic) });
    } else {
      if (isRendered) {
        opacity.value = withTiming(0, { duration: 250 });
        translateY.value = withTiming(800, { duration: 250, easing: Easing.out(Easing.cubic) }, () => {
          runOnJS(setIsRendered)(false);
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const pan = Gesture.Pan()
    .onChange((e) => {
      if (e.translationY > 0) translateY.value = e.translationY;
    })
    .onEnd((e) => {
      if (e.translationY > 100 || e.velocityY > 500) {
        opacity.value = withTiming(0, { duration: 250 });
        translateY.value = withTiming(800, { duration: 250, easing: Easing.out(Easing.cubic) }, () => {
          runOnJS(handleClose)();
        });
      } else {
        translateY.value = withTiming(0, { duration: 250, easing: Easing.out(Easing.cubic) });
      }
    });

  const animatedSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const animatedBgStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const handleCopyCode = useCallback(async () => {
    if (!lounge?.invite_code) return;
    await ExpoClipboard.setStringAsync(lounge.invite_code);
    TactileEngine.success();
  }, [lounge?.invite_code]);

  const onLeave = useCallback(() => {
    if (!lounge) return;
    Alert.alert(
      'Leave Lounge',
      'Are you sure you want to leave this cinematic space?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Leave', 
          style: 'destructive', 
          onPress: async () => {
            TactileEngine.mutate();
            handleClose();
            await leaveLounge(lounge.id);
            (router.replace as any)('/(tabs)/lounge');
          } 
        }
      ]
    );
  }, [lounge, leaveLounge, handleClose, router]);

  const onDelete = useCallback(() => {
    if (!lounge) return;
    Alert.alert(
      'Destroy Lounge',
      'This will permanently obliterate this space and all its history. Proceed?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Destroy', 
          style: 'destructive', 
          onPress: async () => {
            TactileEngine.destroy();
            handleClose();
            const success = await deleteLounge(lounge.id);
            if (success) {
              (router.replace as any)('/(tabs)/lounge');
            }
          } 
        }
      ]
    );
  }, [lounge, deleteLounge, handleClose, router]);

  const renderMember = useCallback(({ item }: { item: LoungeMember }) => {
    const isOwner = item.user_id === lounge?.creator_id;
    return (
      <View style={s.memberRow}>
        <View style={s.memberAvatar}>
          {item.avatar_url ? (
            <Image source={{ uri: item.avatar_url }} style={s.memberAvatarImg} cachePolicy="memory-disk" />
          ) : (
            <Text style={[s.memberAvatarLetter, { color: colors.fog }]}>{item.username?.[0]?.toUpperCase() || '?'}</Text>
          )}
        </View>
        <Text style={s.memberName} numberOfLines={1}>{item.username}</Text>
        {isOwner && (
          <View style={s.memberBadge}>
            <Crown size={10} color={colors.sepia} strokeWidth={2} />
            <Text style={s.memberBadgeText}>OWNER</Text>
          </View>
        )}
      </View>
    );
  }, [lounge?.creator_id]);

  if (!isRendered || !lounge) return null;

  return (
    <Modal visible={isRendered} transparent animationType="none" onRequestClose={handleClose} hardwareAccelerated>
      <GestureHandlerRootView style={StyleSheet.absoluteFill}>
        <Animated.View style={[StyleSheet.absoluteFill, animatedBgStyle]}>
          <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill}>
            <PressableScale style={s.actionBackdrop} onPress={handleClose} accessibilityRole="button">
              <View style={StyleSheet.absoluteFill} />
            </PressableScale>
          </BlurView>
        </Animated.View>

          <Animated.View 
            style={[
              s.settingsSheet, 
              animatedSheetStyle, 
              { paddingBottom: Math.max(insets.bottom + 28, 48) }
            ]}
          >
            <GestureDetector gesture={pan}>
              <View style={{ backgroundColor: 'transparent' }}>
                <View style={s.actionHandle} />

                <View style={s.settingsHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.settingsTitle} numberOfLines={1}>{lounge.name}</Text>
                {lounge.description ? (
                  <Text style={[s.settingsLabel, { marginTop: 4 }]} numberOfLines={2}>{lounge.description}</Text>
                ) : null}
              </View>
              <PressableScale style={s.headerBtn} onPress={handleClose} haptic="light">
                <X size={24} color={colors.parchment} strokeWidth={1.5} />
              </PressableScale>
            </View>

            <View style={s.settingsListHeader}>
              {lounge.is_private && lounge.invite_code && (
                <View style={s.settingsSection}>
                  <Text style={s.settingsLabel}>INVITE CODE</Text>
                  <PressableScale style={s.inviteCodeBtn} onPress={handleCopyCode} haptic="medium">
                    <Text style={s.inviteCodeText}>{lounge.invite_code}</Text>
                    <Copy size={16} color={colors.sepia} strokeWidth={1.5} />
                  </PressableScale>
                </View>
              )}

              <View style={s.settingsSection}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={s.settingsLabel}>MEMBERS</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Users size={12} color={colors.fog} strokeWidth={1.5} />
                    <Text style={[s.settingsLabel, { color: colors.parchment }]}>{members.length}</Text>
                  </View>
                </View>
              </View>
            </View>
              </View>
            </GestureDetector>

            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.03)' }}>
              <FlashList
                data={members}
                renderItem={renderMember}
                estimatedItemSize={56}
                keyExtractor={item => item.user_id}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16 }}
              />
            </View>

            <View style={s.settingsFooter}>
              {isCreator ? (
                <PressableScale style={s.leaveBtn} onPress={onDelete} haptic="medium">
                  <Trash2 size={16} color={colors.bloodReel} strokeWidth={1.5} />
                  <Text style={[s.leaveBtnText, { color: colors.bloodReel }]}>DESTROY LOUNGE</Text>
                </PressableScale>
              ) : (
                <PressableScale style={s.leaveBtn} onPress={onLeave} haptic="medium">
                  <LogOut size={16} color={colors.bloodReel} strokeWidth={1.5} />
                  <Text style={[s.leaveBtnText, { color: colors.bloodReel }]}>LEAVE LOUNGE</Text>
                </PressableScale>
              )}
            </View>
          </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}
