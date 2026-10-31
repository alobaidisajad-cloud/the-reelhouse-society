/**
 * ContentActionSheet — Shared moderation trigger action sheet.
 * ─────────────────────────────────────────────────────────────
 * The bottom sheet for moderation acts (Report / Block / Mute) on every surface:
 * a blurred backdrop, a sheet that rises and falls with useSheetPresence and
 * closes on a downward drag.
 */
import { HouseBlur } from '@/src/components/HouseBlur';
import { InColumn } from '@/src/components/layout/InColumn';
import { Ban, ShieldAlert, Unlock, Volume2, VolumeX } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { Text } from '@/src/components/text';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
    Easing,
    runOnJS,
    useAnimatedStyle,
    withTiming,
} from 'react-native-reanimated';
import { useSheetPresence } from '@/src/hooks/useSheetPresence';

import PressableScale from '@/src/components/PressableScale';
import { colors, fonts } from '@/src/theme/theme';
import type { ReportableContentType } from '@/src/types/moderation';
import TactileEngine from '@/src/utils/TactileEngine';
import { ToastHost } from '@/src/components/ToastHost';
import { useSheetBottom } from '@/src/components/layout/navMetrics';
import { useAuthStore } from '@/src/stores/auth';
import { useBlockStore } from '@/src/stores/blockStore';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ContentActionSheetProps {
  visible: boolean;
  targetUserId: string;
  targetUsername: string;
  contentType: ReportableContentType;
  contentId: string;
  onClose: () => void;
  onReport: () => void;
  onBlock: () => void;
  /** Optional: a sheet given no handler draws no Mute row at all. A row that
   *  only closed the sheet would let a member tap Mute and be ignored. */
  onMute?: () => void;
  onUnblock?: () => void;
  onUnmute?: () => void;
  showUnblock?: boolean;
  showUnmute?: boolean;
  hideMute?: boolean;
}

// ── Component ──────────────────────────────────────────────────────────────

const AnimatedView = Animated.createAnimatedComponent(View);

export function ContentActionSheet({
  visible,
  targetUsername,
  onClose,
  onReport,
  onBlock,
  onMute,
  onUnblock,
  onUnmute,
  showUnblock = false,
  showUnmute = false,
  hideMute = false,
}: ContentActionSheetProps) {
  const sheetFoot = useSheetBottom();
  const { isRendered, opacity, translateY } = useSheetPresence({ visible });

  // The member's own blocks, read before any is offered: unknown, a block looked like none, and
  // MUTE turned it into a mute. Asked for here when the sheet opens on a list not yet read.
  // Reading from the frame the sheet opens: the refusal line never shows before the read begins.
  const blocksKnown = useBlockStore((s) => s.blocksKnown);
  const wantsBlocks = visible && !blocksKnown;
  const [askingBlocks, setAskingBlocks] = useState(wantsBlocks);
  const [wanted, setWanted] = useState(wantsBlocks);
  if (wanted !== wantsBlocks) {
    setWanted(wantsBlocks);
    if (wantsBlocks) setAskingBlocks(true);
  }
  const readBlocks = useCallback(() => {
    const me = useAuthStore.getState().user?.id;
    void (me ? useBlockStore.getState().syncFromServer(me) : Promise.resolve()).then(() => setAskingBlocks(false));
  }, []);
  useEffect(() => {
    // Not awaited: its answer lands in the store, which draws this sheet.
    if (wantsBlocks) readBlocks();
  }, [wantsBlocks, readBlocks]);
  const askBlocks = useCallback(() => { setAskingBlocks(true); readBlocks(); }, [readBlocks]);

  const blurStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

  const pan = Gesture.Pan()
    .onChange((e) => {
      if (e.translationY > 0) translateY.set(e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 100 || e.velocityY > 500) {
        runOnJS(onClose)();
      } else {
        translateY.set(withTiming(0, { duration: 250, easing: Easing.out(Easing.cubic) }));
      }
    });

  if (!isRendered) return null;

  // ── Build dynamic options ────────────────────────────────────────────────

  type OptionRow = {
    key: string;
    label: string;
    icon: React.ReactNode;
    destructive: boolean;
    onPress: () => void;
    accessibilityLabel: string;
    /** A row that cannot act yet: the member's blocks still being read. */
    disabled?: boolean;
  };

  const options: OptionRow[] = [];

  // Report — always shown
  options.push({
    key: 'report',
    label: 'REPORT TO THE TRIBUNAL',
    icon: <ShieldAlert size={18} color={colors.fog} strokeWidth={1.5} />,
    destructive: false,
    onPress: onReport,
    accessibilityLabel: `Report ${targetUsername} to the Tribunal`,
  });

  // Block, mute and their undoing only over the member's own blocks, read.
  if (!blocksKnown) {
    options.push(askingBlocks ? {
      key: 'blocks-reading',
      label: 'READING YOUR BLOCKS…',
      icon: <Ban size={18} color={colors.fog} strokeWidth={1.5} />,
      destructive: false,
      onPress: () => {},
      accessibilityLabel: 'Reading your blocks',
      disabled: true,
    } : {
      key: 'blocks-unread',
      label: 'YOUR BLOCKS COULD NOT BE READ · ASK AGAIN',
      icon: <Ban size={18} color={colors.fog} strokeWidth={1.5} />,
      destructive: false,
      onPress: askBlocks,
      accessibilityLabel: 'Your blocks could not be read. Ask for them again',
    });
  } else if (showUnblock) {
    options.push({
      key: 'unblock',
      label: `UNBLOCK @${targetUsername.toUpperCase()}`,
      icon: <Unlock size={18} color={colors.sepia} strokeWidth={1.5} />,
      destructive: false,
      onPress: onUnblock ?? onClose,
      accessibilityLabel: `Unblock ${targetUsername}`,
    });
  } else {
    options.push({
      key: 'block',
      label: `BLOCK @${targetUsername.toUpperCase()}`,
      icon: <Ban size={18} color={colors.bloodReel} strokeWidth={1.5} />,
      destructive: true,
      onPress: onBlock,
      accessibilityLabel: `Block ${targetUsername}`,
    });
  }

  // Mute / Unmute
  // Only over the member's blocks, read (the one row above reads them).
  if (blocksKnown && showUnmute) {
    options.push({
      key: 'unmute',
      label: `UNMUTE @${targetUsername.toUpperCase()}`,
      icon: <Volume2 size={18} color={colors.sepia} strokeWidth={1.5} />,
      destructive: false,
      onPress: onUnmute ?? onClose,
      accessibilityLabel: `Unmute ${targetUsername}`,
    });
  } else if (blocksKnown && !showUnblock && !hideMute && onMute) {
    // Mute only visible when NOT showing unblock (per spec condition), and only
    // with a handler behind it: no row that silently closes instead of muting.
    options.push({
      key: 'mute',
      label: `MUTE @${targetUsername.toUpperCase()}`,
      icon: <VolumeX size={18} color={colors.fog} strokeWidth={1.5} />,
      destructive: false,
      onPress: onMute,
      accessibilityLabel: `Mute ${targetUsername}`,
    });
  }

  const handleOptionPress = (option: OptionRow) => {
    TactileEngine.selection();
    option.onPress();
    // onClose() removed — consumers handle their own close
  };

  return (
    <Modal statusBarTranslucent transparent visible animationType="none" onRequestClose={onClose}>
      <InColumn>
      <GestureHandlerRootView style={StyleSheet.absoluteFill} onAccessibilityEscape={onClose}>
        {/* Backdrop */}
        <Animated.View style={[StyleSheet.absoluteFill, blurStyle]}>
          <HouseBlur intensity={30} tint="dark" style={StyleSheet.absoluteFill}>
            <PressableScale touch="wayOut"
              style={styles.backdrop}
              onPress={onClose}
              accessibilityLabel="Close action sheet"
              accessibilityRole="button"
            >
              <View style={StyleSheet.absoluteFill} />
            </PressableScale>
          </HouseBlur>
        </Animated.View>

        {/* Sheet */}
        <GestureDetector gesture={pan}>
          <AnimatedView
            style={[
              styles.sheet,
              sheetStyle,
              { paddingBottom: sheetFoot },
            ]}
          >
            {/* Handle */}
            <View style={styles.handle} />

            {/* Option Rows */}
            {options.map((option, index) => {
              const isLast = index === options.length - 1;
              return (
                <PressableScale
                  key={option.key}
                  // Every option reports, blocks or mutes: each a step a slip costs.
                  touch="destructive"
                  style={[styles.optionRow, isLast && styles.optionRowLast]}
                  // PressableScale's default 15pt slop makes adjacent rows
                  // OVERLAP by 30pt, and the later row wins — so the bottom of
                  // one option fires the next one down. These rows are ~50pt
                  // tall already. Same fix as ActionSheet.tsx.
                  hitSlop={null}
                  onPress={option.disabled ? undefined : () => handleOptionPress(option)}
                  disabled={option.disabled}
                  haptic="selection"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !!option.disabled, busy: !!option.disabled }}
                  accessibilityLabel={option.accessibilityLabel}
                >
                  {option.icon}
                  <Text
                    style={[
                      styles.optionText,
                      option.destructive && styles.optionTextDestructive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </PressableScale>
              );
            })}
          </AnimatedView>
        </GestureDetector>
      </GestureHandlerRootView>
      <ToastHost />
      </InColumn>
    </Modal>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.ink,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(196,150,26,0.15)',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignSelf: 'center',
    marginBottom: 20,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    gap: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.soot,
  },
  optionRowLast: {
    borderBottomWidth: 0,
  },
  optionText: {
    fontFamily: fonts.sub,
    fontSize: 12,
    letterSpacing: 2,
    color: colors.parchment,
  },
  optionTextDestructive: {
    color: colors.crimsonInk,
  },
});

export default ContentActionSheet;
