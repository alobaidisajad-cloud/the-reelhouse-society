/**
 * NoteSheet — a private note, opened.
 *
 * Tapping a note on a log opens it here: the whole note, which viewing it was
 * written about, and the two things a member can do with it.
 *
 * ── THE RULES IT DRAWS ─────────────────────────────────────────────────────
 *  · EDIT appears only where editing is real — on the viewing the log is on
 *    now, for a member who holds the rank. A note on a viewing that has passed
 *    is a record of that night, not a draft; and a lapsed member may read and
 *    take back their writing, but not change it. Both of those are the server's
 *    rules, drawn here so nothing is offered that would then be refused.
 *  · REMOVE is always here. Taking your own writing back is never gated.
 *  · REMOVE NOTE is parchment with a crimson mark rather than crimson text:
 *    bloodReel on ink measures about 1.3:1, which is unreadable. The
 *    confirmation that follows carries the red.
 *
 * Same ink, handle, backdrop and gesture as the house's other sheets.
 */
import { BlurView } from 'expo-blur';
import { Lock, Pencil, Trash2 } from 'lucide-react-native';
import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PressableScale from '@/src/components/PressableScale';
import { ToastHost } from '@/src/components/ToastHost';
import { colors, fonts } from '@/src/theme/theme';
import { isRTLText } from '@/src/utils/text';
import { scaledTextProps } from '@/src/constants/textScaling';
import TactileEngine from '@/src/utils/TactileEngine';

const AnimatedView = Animated.createAnimatedComponent(View);

export interface NoteSheetProps {
  visible: boolean;
  /** The note itself. */
  note: string;
  /** Which viewing it belongs to, in the chronicle's own words. */
  viewingLabel: string;
  /** True only for the current viewing, and only with the rank to write. */
  canEdit: boolean;
  onClose: () => void;
  onEdit?: () => void;
  onRemove: () => void;
}

export default function NoteSheet({
  visible,
  note,
  viewingLabel,
  canEdit,
  onClose,
  onEdit,
  onRemove,
}: NoteSheetProps) {
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
    } else if (isRendered) {
      opacity.value = withTiming(0, { duration: 250 });
      translateY.value = withTiming(800, { duration: 250, easing: Easing.out(Easing.cubic) }, () => {
        runOnJS(setIsRendered)(false);
      });
    }
  }, [visible, opacity, translateY, isRendered]);

  const blurStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

  const pan = Gesture.Pan()
    .onChange((e) => {
      if (e.translationY > 0) translateY.value = e.translationY;
    })
    .onEnd((e) => {
      if (e.translationY > 100 || e.velocityY > 500) runOnJS(onClose)();
      else translateY.value = withTiming(0, { duration: 250, easing: Easing.out(Easing.cubic) });
    });

  if (!isRendered) return null;

  const rtl = isRTLText(note);

  return (
    <Modal statusBarTranslucent transparent visible animationType="none" onRequestClose={onClose}>
      <GestureHandlerRootView style={StyleSheet.absoluteFill}>
        <Animated.View style={[StyleSheet.absoluteFill, blurStyle]}>
          <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill}>
            <PressableScale style={styles.backdrop} onPress={onClose} accessibilityLabel="Close the note" accessibilityRole="button">
              <View style={StyleSheet.absoluteFill} />
            </PressableScale>
          </BlurView>
        </Animated.View>

        <GestureDetector gesture={pan}>
          <AnimatedView style={[styles.sheet, sheetStyle, { paddingBottom: Math.max(insets.bottom + 20, 24) }]}>
            <View style={styles.handle} />

            <View style={styles.titleRow}>
              <Lock size={10} color={colors.sepia} strokeWidth={2} />
              <Text style={styles.title}>
                <Text style={styles.titleName}>THE VAULT</Text>
                <Text style={styles.titleWho}>  ·  ONLY YOU</Text>
              </Text>
            </View>
            <Text style={styles.viewing}>{viewingLabel}</Text>

            {/* A long note scrolls inside the sheet rather than pushing the two
                actions off the bottom of the screen. */}
            <ScrollView style={styles.bodyScroll} showsVerticalScrollIndicator={false} bounces={false}>
              <Text style={[styles.body, rtl && styles.rtl]} {...scaledTextProps}>{note}</Text>
            </ScrollView>

            <View style={styles.rule} />

            {canEdit && onEdit ? (
              <PressableScale
                style={styles.optionRow}
                hitSlop={null}
                onPress={() => { TactileEngine.selection(); onEdit(); }}
                accessibilityRole="button"
                accessibilityLabel="Edit this note"
              >
                <Pencil size={16} color={colors.sepia} strokeWidth={1.5} />
                <Text style={styles.optionText}>EDIT NOTE</Text>
              </PressableScale>
            ) : null}

            <PressableScale
              style={[styles.optionRow, styles.optionRowLast]}
              hitSlop={null}
              onPress={() => { TactileEngine.selection(); onRemove(); }}
              accessibilityRole="button"
              accessibilityLabel="Remove this note"
              accessibilityHint="The viewing stays. The note is gone for good."
            >
              <Trash2 size={16} color={colors.crimson} strokeWidth={1.5} />
              <Text style={styles.optionText}>REMOVE NOTE</Text>
            </PressableScale>
          </AnimatedView>
        </GestureDetector>
      </GestureHandlerRootView>
      <ToastHost />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.ink,
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    paddingHorizontal: 24, paddingTop: 12,
    borderWidth: 1, borderBottomWidth: 0, borderColor: 'rgba(196,150,26,0.15)',
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)', alignSelf: 'center', marginBottom: 22 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  title: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6, includeFontPadding: false },
  titleName: { color: colors.sepia },
  titleWho: { color: colors.fog },
  viewing: { fontFamily: fonts.sub, fontSize: 12, letterSpacing: 1.6, color: colors.parchment, marginBottom: 16 },
  // Capped so the actions stay reachable; a note runs to 1,000 characters.
  bodyScroll: { maxHeight: 280, marginBottom: 24 },
  body: { fontFamily: fonts.bodyItalic, fontSize: 15, lineHeight: 25, color: colors.bone },
  rtl: { textAlign: 'right', writingDirection: 'rtl' },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.soot },
  optionRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 16, gap: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.soot,
  },
  optionRowLast: { borderBottomWidth: 0 },
  optionText: { fontFamily: fonts.sub, fontSize: 12, letterSpacing: 2, color: colors.parchment },
});
