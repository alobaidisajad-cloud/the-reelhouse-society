import PressableScale from '@/src/components/PressableScale';
import { LoungeMessage } from '@/src/stores/lounge';
import { colors } from '@/src/theme/theme';
import { BlurView } from 'expo-blur';
import * as ExpoClipboard from 'expo-clipboard';
import TactileEngine from '@/src/utils/TactileEngine';
import { Ban, Copy, Reply, ShieldAlert, Trash2 } from 'lucide-react-native';
import React from 'react';
import { Alert, Modal, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { s } from './LoungeStyles';

import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';

const AnimatedView = Animated.createAnimatedComponent(View);

interface ActionSheetProps {
  visible: boolean;
  msg: LoungeMessage | null;
  isSelf: boolean;
  onClose: () => void;
  onReply: (msg: LoungeMessage) => void;
  onDelete: (messageId: string) => void;
  onReport?: (msg: LoungeMessage) => void;
  onBlock?: (userId: string) => void;
}

function ActionSheet({ visible, msg, isSelf, onClose, onReply, onDelete, onReport, onBlock }: ActionSheetProps) {
  const insets = useSafeAreaInsets();
  
  const [isRendered, setIsRendered] = React.useState(false);
  const [internalMsg, setInternalMsg] = React.useState<LoungeMessage | null>(null);
  const [internalIsSelf, setInternalIsSelf] = React.useState(false);

  const opacity = useSharedValue(0);
  const translateY = useSharedValue(800);

  React.useEffect(() => {
    if (visible && msg) {
      setInternalMsg(msg);
      setInternalIsSelf(isSelf);
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
  }, [visible, msg, isSelf, opacity, translateY, isRendered]);

  const blurStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

  const pan = Gesture.Pan()
    .onChange((e) => {
      if (e.translationY > 0) translateY.value = e.translationY;
    })
    .onEnd((e) => {
      if (e.translationY > 100 || e.velocityY > 500) {
        runOnJS(onClose)();
      } else {
        translateY.value = withTiming(0, { duration: 250, easing: Easing.out(Easing.cubic) });
      }
    });

  if (!isRendered || !internalMsg) return null;

  const handleCopy = async () => {
    ExpoClipboard.setStringAsync(internalMsg.content || '');
    TactileEngine.success();
    onClose();
  };

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <GestureHandlerRootView style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, blurStyle]}>
        <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill}>
          <PressableScale style={s.actionBackdrop} onPress={onClose}><View style={StyleSheet.absoluteFill} /></PressableScale>
        </BlurView>
      </Animated.View>
      
      <GestureDetector gesture={pan}>
        <AnimatedView style={[s.actionSheet, sheetStyle, { paddingBottom: Math.max(insets.bottom + 20, 24) }]}>
          <View style={s.actionHandle} />
          {!internalMsg.id.startsWith('optimistic-') && (
            <PressableScale style={s.actionBtn} onPress={() => { onReply(internalMsg); onClose(); }} haptic="selection" accessibilityRole="button">
              <Reply size={18} color={colors.bone} strokeWidth={1.5} />
              <Text style={s.actionBtnText}>REPLY</Text>
            </PressableScale>
          )}
          {!!internalMsg.content?.trim() && (
            <PressableScale style={s.actionBtn} onPress={handleCopy} accessibilityRole="button">
              <Copy size={18} color={colors.bone} strokeWidth={1.5} />
              <Text style={s.actionBtnText}>COPY TEXT</Text>
            </PressableScale>
          )}
          {!internalIsSelf && (
            <>
              <PressableScale style={s.actionBtn} onPress={() => { onReport?.(internalMsg); onClose(); }} accessibilityRole="button">
                <ShieldAlert size={18} color={colors.fog} strokeWidth={1.5} />
                <Text style={s.actionBtnText}>REPORT MESSAGE</Text>
              </PressableScale>
              <PressableScale style={[s.actionBtn, s.actionBtnLast]} onPress={() => { onBlock?.(internalMsg.user_id); onClose(); }} accessibilityRole="button">
                <Ban size={18} color={colors.bloodReel} strokeWidth={1.5} />
                <Text style={[s.actionBtnText, s.actionBtnDanger]}>BLOCK @{internalMsg.username?.toUpperCase()}</Text>
              </PressableScale>
            </>
          )}
          {internalIsSelf && !internalMsg.id.startsWith('optimistic-') && (
            <PressableScale
              style={[s.actionBtn, s.actionBtnLast]}
              onPress={() => {
                onClose();
                Alert.alert('Delete Message?', 'This message will be permanently removed.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => {
                    TactileEngine.warn();
                    onDelete(internalMsg.id);
                  }},
                ]);
              }}
              accessibilityRole="button"
            >
              <Trash2 size={18} color={colors.bloodReel} strokeWidth={1.5} />
              <Text style={[s.actionBtnText, s.actionBtnDanger]}>DELETE MESSAGE</Text>
            </PressableScale>
          )}
        </AnimatedView>
      </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════
// SETTINGS PANEL
// ════════════════════════════════════════════════════════════

export { ActionSheet };

