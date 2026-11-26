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
import { HouseBlur } from '@/src/components/HouseBlur';
import { InColumn, useWindowFill } from '@/src/components/layout/InColumn';
import React, { useCallback, useRef, useState } from 'react';
import { useWindowDimensions, Modal, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Text, TextInput } from '@/src/components/text';
import { FieldError, useFieldRefusal } from '@/src/components/FieldError';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useModalKeyboardPadding, useSheetFootWhileTyping } from '@/src/hooks/useModalKeyboardPadding';
import { useSheetPresence } from '@/src/hooks/useSheetPresence';
import Animated, {
    Easing,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSequence,
    withTiming,
} from 'react-native-reanimated';

import PressableScale from '@/src/components/PressableScale';
import { Arrive } from '@/src/components/Arrive';
import { useAuthStore } from '@/src/stores/auth';
import { useReportStore } from '@/src/stores/reportStore';
import { colors, effects, fonts, radii, spacing } from '@/src/theme/theme';
import { UNREADY } from '@/src/theme/unready';
import {
    REPORT_REASON_LABELS,
    type ReportableContentType,
    type ReportReason,
    ReportReason as ReportReasonEnum,
} from '@/src/types/moderation';
import TactileEngine from '@/src/utils/TactileEngine';
import { ToastHost } from '@/src/components/ToastHost';
import { arrive, MS } from '@/src/theme/motion';
import { MAX_LENGTHS } from '@/src/utils/sanitizeInput';
import { useKeptWords } from '@/src/hooks/useKeptWords';
import { overlayTop, useSheetBottom } from '@/src/components/layout/navMetrics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

/**
 * The sheet fills three quarters of the window, read from `useWindowDimensions`
 * so a rotation or split-screen resizes it (a module-level `Dimensions.get` is
 * read once, at load). No worklet reads it: its one use is the sheet's height.
 */
const SHEET_HEIGHT_RATIO = 0.75;
const REASON_OPTIONS = ReportReasonEnum.options;
const MAX_DETAILS_LENGTH = MAX_LENGTHS.reportDetails;
const COUNTER_WARN_THRESHOLD = Math.floor(MAX_DETAILS_LENGTH * 0.9);

// ── Animated Components ─────────────────────────────────────────────────────

const AnimatedView = Animated.createAnimatedComponent(View);

// ── ReasonChip Sub-Component ────────────────────────────────────────────────

/**
 * WHAT YOU ACCUSE SOMEONE OF.
 *
 * The reason chips sit 8pt apart (`reasonList` gap: spacing.sm) and carried the
 * 15pt default, so each chip's target reached 15pt into the next and overlapped
 * it by 22 — and in an overlap the LATER sibling wins on both platforms. Aiming
 * at the lower edge of one reason selected the reason after it, and the report
 * that reached the Tribunal accused a member of something the reporter never
 * chose.
 *
 * 3 leaves 2pt clear between two chips, even while a pressed chip swells to
 * 1.02 (half the gap, 4, let it reach into the next). The chip is ~44pt tall,
 * so it still clears the 48dp floor with the halo (44 + 6), and it is the full
 * width of the sheet — no neighbour sideways.
 */
const REASON_SLOP = { top: 3, bottom: 3, left: 3, right: 3 } as const;

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
    scale.set(withSequence(
      withTiming(1.02, { duration: MS.strike, easing: arrive() }),
      withTiming(1, { duration: MS.quick, easing: arrive() }),
    ));
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
        hitSlop={REASON_SLOP}
        pressedScale={0.98}
        accessibilityRole="radio"
        accessibilityLabel={`${label}. ${sublabel}`}
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
  const sheetFoot = useSheetBottom();
  // Reactive, so a rotation or a split-screen resize re-measures. See the note
  // on SHEET_HEIGHT_RATIO.
  const { height: windowHeight } = useWindowDimensions();
  const user = useAuthStore((s) => s.user);
  const submitReport = useReportStore((s) => s.submitReport);
  const isSubmitting = useReportStore((s) => s.isSubmitting);

  // ── Local State ─────────────────────────────────────────────────────────
  const [selectedReason, setSelectedReason] = useState<ReportReason | null>(null);
  // The details are kept per piece as they are written, and at once as the sheet closes: a sheet
  // closed, or a report the house did not take, opens on them again; let go once the house or the
  // queue holds the report.
  const [details, setDetails, letGoDetails] = useKeptWords(user?.id, 'report', visible ? `${contentType}:${contentId}` : null);
  const detailsRef = useRef<TextInput>(null);
  // A refused filing says why under the details, with them, and goes there.
  const { refuse, wrongWith } = useFieldRefusal([details, selectedReason], { details: detailsRef });
  const [blockToggle, setBlockToggle] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  // Where the details field stands in the form: where the form's scroll goes while the details
  // are typed, once the room above the keys is shorter than the sheet.
  const form = useRef<ScrollView>(null);
  const detailsAt = useRef(0);

  // ── Sheet Animation ─────────────────────────────────────────────────────
  /**
   * Off-screen by the window's own height. This was a hardcoded 800, and the
   * sheet is three quarters of the window: on anything taller than ~1067pt (an
   * iPad in portrait is 1366) about 224pt of it never left the screen. The
   * hook reads it when it moves, so a rotation re-measures without replaying
   * the entry mid-use.
   */
  const { isRendered, opacity, translateY } = useSheetPresence({
    visible,
    offscreen: windowHeight,
    // Every report starts on its choices clean, and on the details kept for its piece, or none.
    onOpen: () => { setSelectedReason(null); setBlockToggle(false); setIsFocused(false); },
  });

  const blurStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  // The scrim reaches the window’s edges on a wide window (InColumn): the room lit around the
  // column dims with the page.
  const fill = useWindowFill();
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  // KEYBOARD LAW (RN-Modal tier): Modal windows never resize on either
  // platform — the sheet rises with the keyboard on BOTH. Its frame, from below
  // the status bar to the foot, is padded by the keys, and the sheet stands at
  // the frame's foot at its own height: it rises whole and keeps its room, and
  // only where the room above the keys is shorter than the sheet does it give
  // up the difference, never past the status bar. The keys were padded INTO
  // the sheet's fixed height, which left a 65-95pt strip for the form on a short
  // window, smaller than its own details field (round 14).
  const kbPad = useModalKeyboardPadding();
  // Its foot clears the home indicator, and on iOS gives that room to the form while the keys cover it.
  const foot = useSheetFootWhileTyping(sheetFoot);
  const frameTop = overlayTop(useSafeAreaInsets().top);

  // ── Gesture Dismiss ─────────────────────────────────────────────────────
  const pan = Gesture.Pan()
    .onChange((e) => {
      if (e.translationY > 0) translateY.set(e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 100 || e.velocityY > 500) {
        runOnJS(handleDismiss)();
      } else {
        translateY.set(withTiming(0, { duration: 250, easing: Easing.out(Easing.cubic) }));
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
      refuse('details', 'Please describe the infraction.');
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

    // Already reported is done too: the house holds that report, and says so.
    if (result.status === 'submitted' || result.status === 'queued' || result.status === 'duplicate') {
      letGoDetails();
      onDismiss();
    }
  }, [selectedReason, user, submitReport, contentId, contentType, details, blockToggle, targetUserId, onDismiss, refuse, letGoDetails]);

  // ── Computed Values ─────────────────────────────────────────────────────
  const isSubmitDisabled = !selectedReason || isSubmitting;
  // The count is a word; near the limit it warns in the red INK (the bloodReel
  // pigment is 1.48:1, which would make the warning the least visible state).
  const counterColor = details.length >= COUNTER_WARN_THRESHOLD ? colors.crimsonInk : colors.fog;

  // ── Render Guard ────────────────────────────────────────────────────────
  if (!isRendered) return null;

  return (
    <Modal statusBarTranslucent transparent visible animationType="none" onRequestClose={handleDismiss}>
      <InColumn>
      <GestureHandlerRootView style={StyleSheet.absoluteFill} onAccessibilityEscape={handleDismiss}>
        {/* Backdrop: closes it for a finger; a screen reader has the named DISMISS. */}
        <Animated.View style={[fill, blurStyle]}>
          <HouseBlur intensity={30} tint="dark" style={StyleSheet.absoluteFill}>
            <PressableScale
              style={styles.backdrop}
              onPress={handleDismiss}
              pressedScale={1}
              accessible={false}
              importantForAccessibility="no-hide-descendants"
            >
              <View style={StyleSheet.absoluteFill} />
            </PressableScale>
          </HouseBlur>
        </Animated.View>

        {/* Sheet, at the foot of the room above the keys */}
        <AnimatedView testID="report-frame" style={[styles.frame, { top: frameTop }, kbPad]} pointerEvents="box-none">
        <GestureDetector gesture={pan}>
          <AnimatedView
            style={[
              styles.sheet,
              // Measured now, not at bundle load — so the sheet is correct after
              // a rotation and in split-screen.
              { height: windowHeight * SHEET_HEIGHT_RATIO },
              foot,
              sheetStyle,
            ]}
          >
            {/* Handle Bar */}
            <View style={styles.handle} />

            <ScrollView
              ref={form}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.scrollContent}
              // The form's room cut by the keys while the details are typed: the field stays in view,
              // with FILE REPORT under it, a scroll away at most.
              onLayout={() => { if (isFocused) form.current?.scrollTo({ y: Math.max(0, detailsAt.current - 12), animated: false }); }}
            >
              {/* Header */}
              <Text style={styles.header}>REPORT TO THE TRIBUNAL</Text>
              {/* No promised review time: nothing in the house keeps one. What
                  is true is the order (`get_priority_reports` ranks by members
                  reporting), said in the words of clause V of the house rules. */}
              <Text style={styles.subtext}>
                Your report is confidential. The Tribunal reads what is reported,
                most-reported first — a report is not a verdict, and neither is
                the number of them.
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
                <Arrive name="report.details" duration={300} style={styles.detailsContainer} onLayout={(e) => { detailsAt.current = e.nativeEvent.layout.y; }}>
                  <TextInput
                    ref={detailsRef}
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
                    accessibilityHint={wrongWith('details') ?? 'Describe the infraction in more detail'}
                  />
                  <Text style={[styles.counter, { color: counterColor }]}>
                    {details.length}/{MAX_DETAILS_LENGTH}
                  </Text>
                  <FieldError message={wrongWith('details')} />
                </Arrive>
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
              <PressableScale touch="commit"
                style={[
                  styles.submitButton,
                  !selectedReason && UNREADY.plate,
                ]}
                onPress={handleSubmit}
                disabled={isSubmitDisabled}
                pressedScale={0.97}
                accessibilityRole="button"
                accessibilityLabel="File report"
                accessibilityState={{ disabled: isSubmitDisabled }}
              >
                <Text style={[styles.submitText, !selectedReason && UNREADY.words]}>FILE REPORT</Text>
              </PressableScale>

              {/* Dismiss Link */}
              <PressableScale touch="wayOut"
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
        </AnimatedView>
      </GestureHandlerRootView>
      <ToastHost />
      </InColumn>
    </Modal>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  // From below the status bar to the foot of the window; its foot is padded by the keys.
  frame: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: 'flex-end',
  },
  sheet: {
    // height is applied inline from useWindowDimensions: a stylesheet is
    // evaluated once. It gives way only where the room above the keys is shorter.
    flexShrink: 1,
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
  detailsInput: { borderBottomWidth: 1, borderBottomColor: colors.fieldEdge,
    backgroundColor: colors.well,
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
    borderBottomColor: colors.sepia,
  },
  counter: {
    position: 'absolute',
    bottom: 8,
    right: 12,
    fontFamily: fonts.sub,
    fontSize: 10,
    letterSpacing: 0.4,
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
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: radii.sm,
    // Its own 48pt, so it needs no halo reaching over DISMISS below it.
    minHeight: 48,
    justifyContent: 'center',
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: spacing.lg,
    shadowColor: colors.bloodReel,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  submitText: {
    fontFamily: fonts.sub,
    fontSize: 12,
    letterSpacing: 3,
    color: colors.parchment,
  },
  // ── Dismiss Link ──
  // A target of its own, 48pt tall: a bare line of 11pt text borrowed the 15pt
  // default halo, which reached 14pt into FILE REPORT above it. The target's own
  // height now spaces the text from the button, where its margin did.
  dismissLink: {
    alignSelf: 'center',
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    marginTop: 0,
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
