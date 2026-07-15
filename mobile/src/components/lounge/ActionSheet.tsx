import PressableScale from '@/src/components/PressableScale';
import { LoungeMessage, ReactionSummary } from '@/src/stores/lounge';
import { colors, fonts } from '@/src/theme/theme';
import { REACTION_META, REACTION_ORDER } from './reactions';
import { BlurView } from 'expo-blur';
import * as ExpoClipboard from 'expo-clipboard';
import TactileEngine from '@/src/utils/TactileEngine';
import { Ban, Copy, MinusCircle, Reply, ShieldAlert } from 'lucide-react-native';
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
  /** Whether the current user is an approved (non-muted) member who may react. */
  canReact?: boolean;
  /** The message's current reactions, so the picker can highlight your own. */
  currentReactions?: ReactionSummary[];
  onClose: () => void;
  onReply: (msg: LoungeMessage) => void;
  onReact?: (reaction: string) => void;
  /** Soft-delete (withdraw) the dispatch. */
  onDelete: (messageId: string) => void;
  onReport?: (msg: LoungeMessage) => void;
  onBlock?: (userId: string) => void;
}

function ActionSheet({ visible, msg, isSelf, canReact, currentReactions, onClose, onReply, onReact, onDelete, onReport, onBlock }: ActionSheetProps) {
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
    <Modal statusBarTranslucent transparent visible animationType="none" onRequestClose={onClose}>
      <GestureHandlerRootView style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, blurStyle]}>
        <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill}>
          <PressableScale style={s.actionBackdrop} onPress={onClose}><View style={StyleSheet.absoluteFill} /></PressableScale>
        </BlurView>
      </Animated.View>
      
      <GestureDetector gesture={pan}>
        <AnimatedView style={[s.actionSheet, sheetStyle, { paddingBottom: Math.max(insets.bottom + 20, 24) }]}>
          <View style={s.actionHandle} />

          {canReact && !internalMsg.deleted_at && onReact && (
            <View style={r.reactionPicker}>
              {REACTION_ORDER.map((key) => {
                const meta = REACTION_META[key];
                const Icon = meta.Icon;
                const mine = !!currentReactions?.find(rx => rx.reaction === key && rx.mine);
                return (
                  <PressableScale
                    key={key}
                    style={r.pick}
                    onPress={() => { TactileEngine.selection(); onReact(key); onClose(); }}
                    haptic="selection"
                    accessibilityRole="button"
                    accessibilityLabel={meta.label}
                  >
                    <View style={[r.pickIcon, mine && r.pickIconMine]}>
                      <Icon size={20} color={meta.tint} strokeWidth={2} />
                    </View>
                    <Text style={r.pickLabel}>{meta.label}</Text>
                  </PressableScale>
                );
              })}
            </View>
          )}

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
                <Ban size={18} color={colors.crimson} strokeWidth={1.5} />
                <Text style={[s.actionBtnText, s.actionBtnDanger]}>BLOCK @{internalMsg.username?.toUpperCase()}</Text>
              </PressableScale>
            </>
          )}
          {internalIsSelf && !internalMsg.id.startsWith('optimistic-') && !internalMsg.deleted_at && (
            <PressableScale
              style={[s.actionBtn, s.actionBtnLast]}
              onPress={() => {
                onClose();
                Alert.alert('Withdraw dispatch?', 'It will be replaced with a quiet "dispatch withdrawn" note.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Withdraw', style: 'destructive', onPress: () => {
                    TactileEngine.warn();
                    onDelete(internalMsg.id);
                  }},
                ]);
              }}
              accessibilityRole="button"
            >
              <MinusCircle size={18} color={colors.crimson} strokeWidth={1.5} />
              <Text style={[s.actionBtnText, s.actionBtnDanger]}>WITHDRAW DISPATCH</Text>
            </PressableScale>
          )}
        </AnimatedView>
      </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

const r = StyleSheet.create({
  reactionPicker: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingBottom: 16,
    marginBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.soot,
  },
  pick: { alignItems: 'center', flex: 1, gap: 7 },
  pickIcon: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'transparent',
  },
  pickIconMine: { backgroundColor: 'rgba(184,137,26,0.12)', borderColor: 'rgba(184,137,26,0.5)' },
  pickLabel: { fontFamily: fonts.sub, fontSize: 7, letterSpacing: 0.5, color: colors.fog, includeFontPadding: false },
});

export { ActionSheet };

