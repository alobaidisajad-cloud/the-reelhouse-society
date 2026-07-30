/**
 * ContentActionSheet — Shared moderation trigger action sheet.
 * ─────────────────────────────────────────────────────────────
 * Reusable bottom sheet for content moderation actions (Report / Block / Mute).
 * Extends the Lounge ActionSheet pattern to all surfaces.
 *
 * Visual language: Nitrate Noir — BlurView backdrop, spring animations,
 * gesture-dismissible, sepia border glow on ink surface.
 */
import { BlurView } from 'expo-blur';
import { Ban, ShieldAlert, Unlock, Volume2, VolumeX } from 'lucide-react-native';
import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
    Easing,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PressableScale from '@/src/components/PressableScale';
import { colors, fonts } from '@/src/theme/theme';
import type { ReportableContentType } from '@/src/types/moderation';
import TactileEngine from '@/src/utils/TactileEngine';

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
  /** Optional: callers that pass `hideMute` never render the Mute row, so they
   *  have no handler to give. Mirrors onUnblock/onUnmute below. */
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
  const insets = useSafeAreaInsets();

  const [isRendered, setIsRendered] = React.useState(false);

  const opacity = useSharedValue(0);
  const translateY = useSharedValue(800);

  React.useEffect(() => {
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
  }, [visible, opacity, translateY, isRendered]);

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

  if (!isRendered) return null;

  // ── Build dynamic options ────────────────────────────────────────────────

  type OptionRow = {
    key: string;
    label: string;
    icon: React.ReactNode;
    destructive: boolean;
    onPress: () => void;
    accessibilityLabel: string;
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

  // Block / Unblock
  if (showUnblock) {
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
  if (showUnmute) {
    options.push({
      key: 'unmute',
      label: `UNMUTE @${targetUsername.toUpperCase()}`,
      icon: <Volume2 size={18} color={colors.sepia} strokeWidth={1.5} />,
      destructive: false,
      onPress: onUnmute ?? onClose,
      accessibilityLabel: `Unmute ${targetUsername}`,
    });
  } else if (!showUnblock && !hideMute) {
    // Mute only visible when NOT showing unblock (per spec condition)
    options.push({
      key: 'mute',
      label: `MUTE @${targetUsername.toUpperCase()}`,
      icon: <VolumeX size={18} color={colors.fog} strokeWidth={1.5} />,
      destructive: false,
      onPress: onMute ?? onClose,
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
      <GestureHandlerRootView style={StyleSheet.absoluteFill}>
        {/* Backdrop */}
        <Animated.View style={[StyleSheet.absoluteFill, blurStyle]}>
          <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill}>
            <PressableScale
              style={styles.backdrop}
              onPress={onClose}
              accessibilityLabel="Close action sheet"
              accessibilityRole="button"
            >
              <View style={StyleSheet.absoluteFill} />
            </PressableScale>
          </BlurView>
        </Animated.View>

        {/* Sheet */}
        <GestureDetector gesture={pan}>
          <AnimatedView
            style={[
              styles.sheet,
              sheetStyle,
              { paddingBottom: Math.max(insets.bottom + 20, 24) },
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
                  style={[styles.optionRow, isLast && styles.optionRowLast]}
                  onPress={() => handleOptionPress(option)}
                  haptic="selection"
                  accessibilityRole="button"
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
    color: colors.bloodReel,
  },
});

export default ContentActionSheet;
