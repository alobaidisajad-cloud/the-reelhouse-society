/**
 * HearingSheet — the Tribunal's sheet for an act that needs the house's word to the member (round 14):
 * an appeal upheld or overturned, a ban or a suspension lifted. Drawn as the verdict sheet is (the
 * scrim, the handle, the title in the act's ink, a reason, one act 48 tall); the word is required,
 * cleaned and kept to what the member's notice holds.
 */
import React, { useCallback } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, StyleSheet, View } from 'react-native';
import { X } from 'lucide-react-native';
import { Text, TextInput } from '@/src/components/text';
import PressableScale from '@/src/components/PressableScale';
import { InColumn } from '@/src/components/layout/InColumn';
import { useSheetBottom } from '@/src/components/layout/navMetrics';
import { ToastHost } from '@/src/components/ToastHost';
import { colors, fonts, radii, spacing } from '@/src/theme/theme';
import { UNREADY } from '@/src/theme/unready';
import { MAX_LENGTHS, sanitizeInput } from '@/src/utils/sanitizeInput';

export interface Hearing {
  /** The sheet's title, in the act's ink. */
  title: string;
  ink: string;
  /** The act's fill. */
  fill: string;
  description: string;
  /** What the word is called above its box ("YOUR WORD TO THE MEMBER"). */
  wordLabel: string;
  placeholder: string;
  /** The words on the act, and the act as spoken (holding those words). */
  act: string;
  actSaid: string;
}

/**
 * The word is held by the docket that opens the sheet, kept per hearing as it is written
 * (useKeptWords, 'hearing'): closed, it opens on it again; each hearing opens on its own word or
 * none, so the word for one member is never carried to the next; the docket lets it go once the
 * house has heard it.
 */
export function HearingSheet({ hearing, word, onWord, busy, onClose, onSubmit }: {
  hearing: Hearing | null; word: string; onWord: (word: string) => void;
  busy: boolean; onClose: () => void; onSubmit: (word: string) => void;
}) {
  const sheetFoot = useSheetBottom();
  const ready = !!word.trim() && !busy;

  const close = useCallback(() => {
    if (busy) return;
    onClose();
  }, [busy, onClose]);

  const submit = useCallback(() => {
    if (!ready) return;
    // Told to the member in their notice: cleaned, and kept to what that notice can hold.
    onSubmit(sanitizeInput(word, 'modReason').trim());
  }, [ready, word, onSubmit]);

  if (!hearing) return null;
  return (
    <Modal statusBarTranslucent visible transparent animationType="fade" onRequestClose={close}>
      <InColumn scrim={{ color: 'rgba(0,0,0,0.7)' }}>
        <KeyboardAvoidingView onAccessibilityEscape={close} style={st.overlay} behavior="padding">
          <View style={[st.sheet, { paddingBottom: sheetFoot }]}>
            <View style={st.handle} />
            <View style={st.header}>
              <Text style={[st.title, { color: hearing.ink }]} accessibilityRole="header">{hearing.title}</Text>
              <PressableScale touch="wayOut" onPress={close} haptic="selection" pressedScale={0.9}
                accessibilityRole="button" accessibilityLabel="Close" disabled={busy}>
                <X size={20} color={colors.fog} />
              </PressableScale>
            </View>
            <Text style={st.description}>{hearing.description}</Text>
            <Text style={st.label}>{hearing.wordLabel}</Text>
            <TextInput
              style={st.input}
              value={word}
              onChangeText={onWord}
              placeholder={hearing.placeholder}
              placeholderTextColor={colors.fog}
              selectionColor={colors.selection}
              multiline
              textAlignVertical="top"
              maxLength={MAX_LENGTHS.modReason}
              editable={!busy}
              accessibilityLabel={hearing.wordLabel.toLowerCase()}
            />
            <PressableScale touch="destructive"
              style={[st.act, { backgroundColor: hearing.fill }, !ready && UNREADY.plate]}
              onPress={submit}
              disabled={!ready}
              haptic="medium"
              pressedScale={0.97}
              accessibilityRole="button"
              accessibilityLabel={hearing.actSaid}
              accessibilityState={{ disabled: !ready, busy }}
            >
              {busy
                ? <ActivityIndicator size="small" color={colors.parchment} />
                : <Text style={[st.actText, !ready && UNREADY.words]}>{hearing.act}</Text>}
            </PressableScale>
          </View>
        </KeyboardAvoidingView>
        <ToastHost />
      </InColumn>
    </Modal>
  );
}

const st = StyleSheet.create({
  // Its ground is the scrim InColumn draws across the window.
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.ink,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(196,150,26,0.15)',
    padding: spacing.lg,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)', alignSelf: 'center', marginBottom: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 },
  title: { flex: 1, fontFamily: fonts.display, fontSize: 20, letterSpacing: 1 },
  description: { fontFamily: fonts.body, fontSize: 12, color: colors.fog, marginBottom: spacing.lg, lineHeight: 18 },
  label: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6, color: colors.fog, marginBottom: 6 },
  input: {
    backgroundColor: colors.well,
    borderWidth: 1,
    borderColor: colors.ash,
    borderBottomColor: colors.fieldEdge,
    borderRadius: radii.sm,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.parchment,
    padding: 14,
    minHeight: 80,
  },
  // The act: 48 tall by its own box.
  act: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: radii.sm,
    marginTop: spacing.md,
  },
  actText: { fontFamily: fonts.sub, fontSize: 12, letterSpacing: 3, color: colors.parchment, textAlign: 'center' },
});
