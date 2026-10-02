import PressableScale from '@/src/components/PressableScale';
import { LoungeMessage, ReactionSummary } from '@/src/stores/lounge';
import { colors, fonts } from '@/src/theme/theme';
import { REACTION_META, REACTION_ORDER } from './reactions';
import { BlurView } from 'expo-blur';
import * as ExpoClipboard from 'expo-clipboard';
import TactileEngine from '@/src/utils/TactileEngine';
import { Ban, Copy, MinusCircle, Reply, ShieldAlert } from 'lucide-react-native';
import React from 'react';
import { Alert, Modal, StyleSheet, View } from 'react-native';
import { Text } from '@/src/components/text';
import Animated, { Easing, runOnJS, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useSheetPresence } from '@/src/hooks/useSheetPresence';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { s } from './LoungeStyles';

import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { ToastHost } from '@/src/components/ToastHost';

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
  
  const [internalMsg, setInternalMsg] = React.useState<LoungeMessage | null>(null);
  const [internalIsSelf, setInternalIsSelf] = React.useState(false);

  // The message is held from the moment it opens, so the sheet keeps its words
  // while it falls after the caller has let go of them.
  const { isRendered, opacity, translateY } = useSheetPresence({
    visible: visible && !!msg,
    onOpen: () => { setInternalMsg(msg); setInternalIsSelf(isSelf); },
  });

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
      <GestureHandlerRootView style={StyleSheet.absoluteFill} onAccessibilityEscape={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, blurStyle]}>
        <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill}>
          {/* The sheet's only close besides a drag, so a screen reader is given it by name. */}
          <PressableScale style={s.actionBackdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
            <View style={StyleSheet.absoluteFill} />
          </PressableScale>
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

          {/* Every row below passes hitSlop={null}. PressableScale defaults to
              15pt on all sides, which on rows stacked a hairline apart makes
              their targets OVERLAP by 30pt — and the later row in the JSX wins.
              Here that meant the bottom of REPORT MESSAGE fired BLOCK @user:
              a destructive action stolen by a benign one. The rows are ~50pt
              tall and need no help. */}
          {!internalMsg.id.startsWith('optimistic-') && (
            <PressableScale style={s.actionBtn} hitSlop={null} onPress={() => { onReply(internalMsg); onClose(); }} haptic="selection" accessibilityRole="button">
              <Reply size={18} color={colors.bone} strokeWidth={1.5} />
              <Text style={s.actionBtnText}>REPLY</Text>
            </PressableScale>
          )}
          {!!internalMsg.content?.trim() && (
            <PressableScale style={s.actionBtn} hitSlop={null} onPress={handleCopy} accessibilityRole="button">
              <Copy size={18} color={colors.bone} strokeWidth={1.5} />
              <Text style={s.actionBtnText}>COPY TEXT</Text>
            </PressableScale>
          )}
          {/* A departed member's words have no account behind them to report or
              block (as the Dispatch says of its own): no row that cannot work. */}
          {!internalIsSelf && !!internalMsg.user_id && (
            <>
              <PressableScale style={s.actionBtn} hitSlop={null} onPress={() => { onReport?.(internalMsg); onClose(); }} accessibilityRole="button">
                <ShieldAlert size={18} color={colors.fog} strokeWidth={1.5} />
                <Text style={s.actionBtnText}>REPORT MESSAGE</Text>
              </PressableScale>
              <PressableScale style={[s.actionBtn, s.actionBtnLast]} hitSlop={null} onPress={() => { if (internalMsg.user_id) onBlock?.(internalMsg.user_id); onClose(); }} accessibilityRole="button">
                <Ban size={18} color={colors.crimson} strokeWidth={1.5} />
                <Text style={[s.actionBtnText, s.actionBtnDanger]}>{internalMsg.username ? `BLOCK @${internalMsg.username.toUpperCase()}` : 'BLOCK THIS MEMBER'}</Text>
              </PressableScale>
            </>
          )}
          {internalIsSelf && !internalMsg.id.startsWith('optimistic-') && !internalMsg.deleted_at && (
            <PressableScale
              style={[s.actionBtn, s.actionBtnLast]} hitSlop={null}
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
      <ToastHost />
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
  pickLabel: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.2, color: colors.fog, includeFontPadding: false },
});

export { ActionSheet };

