/**
 * ReportSheet.tsx — Society Report Form (Bottom Sheet Modal)
 * ──────────────────────────────────────────────────────────
 * Full-screen report form presented when a user selects "Report" on any
 * content. Captures reason, optional details, and block toggle, then
 * submits via ReportStore with offline fallback.
 *
 * Visual language: Nitrate Noir — aged tungsten tones, spring micro-interactions,
 * cinematic typography. Feels like filing a classified report in a 1940s film
 * noir bureau.
 */
import { BlurView } from 'expo-blur';
import React, { useCallback, useState } from 'react';
import {
    Dimensions,
    Modal,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
    Easing,
    FadeInDown,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PressableScale from '@/src/components/PressableScale';
import { useAuthStore } from '@/src/stores/auth';
import { useReportStore } from '@/src/stores/reportStore';
import { colors, effects, fonts, radii, spacing } from '@/src/theme/theme';
import {
    REPORT_REASON_LABELS,
    type ReportableContentType,
    type ReportReason,
    ReportReason as ReportReasonEnum,
} from '@/src/types/moderation';
import reelToast from '@/src/utils/reelToast';
import TactileEngine from '@/src/utils/TactileEngine';

// ── Types ───────────────────────────────────────────────────────────────────

export interface ReportSheetProps {
  visible: boolean;
  contentType: ReportableContentType;
  contentId: string;
  targetUserId: string;
  targetUsername: string;
  onDismiss: () => void;
}

// ── Constants ───────────────────────────────────────────────────────────────

const SCREEN_HEIGHT = Dimensions.get('window').height;
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.75;
const REASON_OPTIONS = ReportReasonEnum.options;
const MAX_DETAILS_LENGTH = 500;
const COUNTER_WARN_THRESHOLD = 450;

// ── Animated Components ─────────────────────────────────────────────────────

const AnimatedView = Animated.createAnimatedComponent(View);

// ── ReasonChip Sub-Component ────────────────────────────────────────────────

interface ReasonChipProps {
  reason: ReportReason;
  selected: boolean;
  onSelect: (reason: ReportReason) => void;
}

function ReasonChip({ reason, selected, onSelect }: ReasonChipProps) {
  const { label, sublabel } = REPORT_REASON_LABELS[reason];
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = useCallback(() => {
    scale.value = withSpring(1.02, { damping: 18, stiffness: 400, mass: 0.6 });
    setTimeout(() => {
      scale.value = withSpring(1, { damping: 18, stiffness: 400, mass: 0.6 });
    }, 150);
    TactileEngine.selection();
    onSelect(reason);
  }, [reason, onSelect, scale]);

  return (
    <AnimatedView style={animatedStyle}>
      <PressableScale
        style={[
          styles.chip,
          selected ? styles.chipSelected : styles.chipUnselected,
          selected && effects.glowSepia,
        ]}
        onPress={handlePress}
        pressedScale={0.98}
        accessibilityRole="radio"
        accessibilityLabel={label}
        accessibilityHint={sublabel}
        accessibilityState={{ selected }}
      >
        <View style={styles.chipContent}>
          <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
            {label}
          </Text>
          <Text style={styles.chipSublabel}>{sublabel}</Text>
        </View>
      </PressableScale>
    </AnimatedView>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

function ReportSheet({
  visible,
  contentType,
  contentId,
  targetUserId,
  targetUsername,
  onDismiss,
}: ReportSheetProps) {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const submitReport = useReportStore((s) => s.submitReport);
  const isSubmitting = useReportStore((s) => s.isSubmitting);

  // ── Local State ─────────────────────────────────────────────────────────
  const [selectedReason, setSelectedReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [blockToggle, setBlockToggle] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  // ── Sheet Animation ─────────────────────────────────────────────────────
  const [isRendered, setIsRendered] = React.useState(false);
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(800);

  React.useEffect(() => {
    if (visible) {
      // Reset form state on open
      setSelectedReason(null);
      setDetails('');
      setBlockToggle(false);
      setIsFocused(false);
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

  // ── Gesture Dismiss ─────────────────────────────────────────────────────
  const pan = Gesture.Pan()
    .onChange((e) => {
      if (e.translationY > 0) translateY.value = e.translationY;
    })
    .onEnd((e) => {
      if (e.translationY > 100 || e.velocityY > 500) {
        runOnJS(handleDismiss)();
      } else {
        translateY.value = withTiming(0, { duration: 250, easing: Easing.out(Easing.cubic) });
      }
    });

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleDismiss = useCallback(() => {
    TactileEngine.selection();
    onDismiss();
  }, [onDismiss]);

  const handleReasonSelect = useCallback((reason: ReportReason) => {
    setSelectedReason(reason);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!selectedReason || !user) return;

    if (selectedReason === 'other' && (!details || !details.trim())) {
      reelToast.error('Please describe the infraction.');
      return;
    }

    TactileEngine.mutate();

    const result = await submitReport({
      reporter_id: user.id,
      content_id: contentId,
      content_type: contentType,
      reason: selectedReason,
      details: details.trim() || null,
      block_target: blockToggle,
      target_user_id: targetUserId,
    });

    if (result.status === 'submitted' || result.status === 'queued') {
      onDismiss();
    }
  }, [selectedReason, user, submitReport, contentId, contentType, details, blockToggle, targetUserId, onDismiss]);

  // ── Computed Values ─────────────────────────────────────────────────────
  const isSubmitDisabled = !selectedReason || isSubmitting;
  const counterColor = details.length >= COUNTER_WARN_THRESHOLD ? colors.bloodReel : colors.fog;

  // ── Render Guard ────────────────────────────────────────────────────────
  if (!isRendered) return null;

  return (
    <Modal statusBarTranslucent transparent visible animationType="none" onRequestClose={handleDismiss}>
      <GestureHandlerRootView style={StyleSheet.absoluteFill}>
        {/* Backdrop */}
        <Animated.View style={[StyleSheet.absoluteFill, blurStyle]}>
          <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill}>
            <PressableScale
              style={styles.backdrop}
              onPress={handleDismiss}
              pressedScale={1}
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
            {/* Handle Bar */}
            <View style={styles.handle} />

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.scrollContent}
            >
              {/* Header */}
              <Text style={styles.header}>REPORT TO THE TRIBUNAL</Text>
              <Text style={styles.subtext}>
                Your report is confidential. The Tribunal will review within 24 hours.
              </Text>

              {/* Reason Chips */}
              <View style={styles.reasonList}>
                {REASON_OPTIONS.map((reason) => (
                  <ReasonChip
                    key={reason}
                    reason={reason}
                    selected={selectedReason === reason}
                    onSelect={handleReasonSelect}
                  />
                ))}
              </View>

              {/* Additional Context TextInput */}
              {selectedReason && (
                <Animated.View entering={FadeInDown.duration(300)} style={styles.detailsContainer}>
                  <TextInput
                    style={[
                      styles.detailsInput,
                      isFocused && styles.detailsInputFocused,
                    ]}
                    placeholder="Describe the infraction..."
                    placeholderTextColor={colors.fog}
                    selectionColor={colors.selection}
                    value={details}
                    onChangeText={setDetails}
                    maxLength={MAX_DETAILS_LENGTH}
                    multiline
                    textAlignVertical="top"
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    accessibilityLabel="Additional details"
                    accessibilityHint="Describe the infraction in more detail"
                  />
                  <Text style={[styles.counter, { color: counterColor }]}>
                    {details.length}/{MAX_DETAILS_LENGTH}
                  </Text>
                </Animated.View>
              )}

              {/* Block Toggle */}
              <View style={styles.blockRow}>
                <Text style={styles.blockLabel}>Also block this member</Text>
                <Switch
                  value={blockToggle}
                  onValueChange={setBlockToggle}
                  trackColor={{ false: colors.ash, true: colors.sepia }}
                  thumbColor={colors.parchment}
                  accessibilityLabel={`Also block ${targetUsername}`}
                />
              </View>

              {/* Submit Button */}
              <PressableScale
                style={[
                  styles.submitButton,
                  isSubmitDisabled && styles.submitButtonDisabled,
                ]}
                onPress={handleSubmit}
                disabled={isSubmitDisabled}
                pressedScale={0.97}
                accessibilityRole="button"
                accessibilityLabel="File report"
                accessibilityState={{ disabled: isSubmitDisabled }}
              >
                <Text style={styles.submitText}>FILE REPORT</Text>
              </PressableScale>

              {/* Dismiss Link */}
              <PressableScale
                style={styles.dismissLink}
                onPress={handleDismiss}
                pressedScale={0.95}
                accessibilityRole="button"
                accessibilityLabel="Dismiss report form"
              >
                <Text style={styles.dismissText}>DISMISS</Text>
              </PressableScale>
            </ScrollView>
          </AnimatedView>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SHEET_HEIGHT,
    backgroundColor: colors.ink,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(196,150,26,0.15)',
    padding: 24,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignSelf: 'center',
    marginBottom: 20,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  header: {
    fontFamily: fonts.display,
    fontSize: 20,
    letterSpacing: 2,
    color: colors.parchment,
    ...effects.textShadowDeep,
    marginBottom: spacing.md,
  },
  subtext: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.fog,
    marginBottom: spacing.lg,
  },
  reasonList: {
    gap: spacing.sm,
  },
  // ── Chip Styles ──
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  chipUnselected: {
    borderColor: colors.ash,
    backgroundColor: 'transparent',
  },
  chipSelected: {
    borderColor: colors.sepia,
    backgroundColor: colors.sepiaFaint,
  },
  chipContent: {
    flex: 1,
  },
  chipLabel: {
    fontFamily: fonts.sub,
    fontSize: 12,
    letterSpacing: 1,
    color: colors.bone,
  },
  chipLabelSelected: {
    color: colors.parchment,
  },
  chipSublabel: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.fog,
    marginTop: 2,
  },
  // ── Details Input ──
  detailsContainer: {
    marginTop: spacing.md,
    position: 'relative',
  },
  detailsInput: {
    backgroundColor: colors.soot,
    borderWidth: 1,
    borderColor: colors.ash,
    borderRadius: radii.sm,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.parchment,
    padding: 16,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  detailsInputFocused: {
    borderColor: colors.sepia,
  },
  counter: {
    position: 'absolute',
    bottom: 8,
    right: 12,
    fontFamily: fonts.sub,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  // ── Block Toggle ──
  blockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    marginTop: spacing.md,
  },
  blockLabel: {
    fontFamily: fonts.sub,
    fontSize: 12,
    color: colors.bone,
  },
  // ── Submit Button ──
  submitButton: {
    backgroundColor: colors.bloodReel,
    borderRadius: radii.sm,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: spacing.lg,
    shadowColor: colors.bloodReel,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  submitButtonDisabled: {
    opacity: 0.4,
  },
  submitText: {
    fontFamily: fonts.sub,
    fontSize: 12,
    letterSpacing: 3,
    color: colors.parchment,
  },
  // ── Dismiss Link ──
  dismissLink: {
    alignSelf: 'center',
    marginTop: spacing.md,
  },
  dismissText: {
    fontFamily: fonts.sub,
    fontSize: 11,
    letterSpacing: 1.5,
    color: colors.fog,
    textDecorationLine: 'underline',
  },
});

export default ReportSheet;
