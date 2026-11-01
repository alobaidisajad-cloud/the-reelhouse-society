/**
 * UnsentChanges — the changes the house would not take, kept for the member (WORKLIST P4.14).
 *
 * A write the house refused for good is held in the queue for its member, never sent again on its
 * own (offlineQueue's sortRefused). While any is held, a plate says how many above the offline
 * plate; pressed, a sheet lists each in plain words, with why the house refused it, to send again
 * or let go. Nothing the member wrote or did is lost without their say.
 */
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { RotateCcw, X } from 'lucide-react-native';
import PressableScale from '@/src/components/PressableScale';
import { InColumn } from '@/src/components/layout/InColumn';
import { HouseBlur } from '@/src/components/HouseBlur';
import { Text } from '@/src/components/text';
import { ToastHost } from '@/src/components/ToastHost';
import { Arrive } from '@/src/components/Arrive';
import { Presence, PresenceView } from '@/src/components/motion/Presence';
import { useSheetBottom } from '@/src/components/layout/navMetrics';
import { useRefused } from '@/src/stores/offlineQueueStore';
import { colors, fonts } from '@/src/theme/theme';
import { leave, MS } from '@/src/theme/motion';
import { letRefusedGo, sendRefusedAgain, type QueuedMutation } from '@/src/utils/offlineQueue';
import { HELD_NOUN, heldDetail, whyRefused } from '@/src/utils/queueOwnership';

/** "1 change not taken", "3 changes not taken": the plate's words, said as they are drawn. */
const heldSaid = (n: number) => (n === 1 ? '1 change not taken' : `${n} changes not taken`);

/** "1 CHANGE NOT TAKEN", "3 CHANGES NOT TAKEN". */
export const notTaken = (n: number) => heldSaid(n).toUpperCase();

/** The plate, while any change is held; it opens the sheet. Drawn in the house's notice frame. */
export function UnsentChangesPlate() {
  const held = useRefused();
  const [open, setOpen] = useState(false);
  if (held.length === 0 && !open) return null;
  return (
    <>
      {/* Not drawn while its sheet is open: the sheet says it all, and the plate would stand over it. */}
      {held.length > 0 && !open && (
        <PressableScale style={s.plate} onPress={() => setOpen(true)} haptic="selection"
          accessibilityRole="button"
          accessibilityLabel={`${heldSaid(held.length)}. Review: the house did not take ${held.length === 1 ? 'it' : 'them'}.`}>
          <Text style={s.plateTitle}>{notTaken(held.length)}</Text>
          <Text style={s.plateLine}>REVIEW</Text>
        </PressableScale>
      )}
      <UnsentChangesSheet visible={open && held.length > 0} held={held} onClose={() => setOpen(false)} />
    </>
  );
}

function UnsentChangesSheet({ visible, held, onClose }: { visible: boolean; held: readonly QueuedMutation[]; onClose: () => void }) {
  const sheetFoot = useSheetBottom();
  // Kept open while the sheet slides away.
  return (
    <Presence>
    {visible ? (
    <Modal key="unsent" statusBarTranslucent transparent visible animationType="fade" onRequestClose={onClose}>
      <InColumn>
      <HouseBlur intensity={50} tint="dark" style={StyleSheet.absoluteFill}>
        {/* The ground closes it for a finger; a screen reader has the named Close. */}
        <PressableScale style={s.backdrop} onPress={onClose} accessible={false} importantForAccessibility="no-hide-descendants"><View /></PressableScale>
      </HouseBlur>
      <PresenceView name="unsent.leave" style={s.frame} pointerEvents="box-none"
        exit={{ kind: 'SlideOutDown', duration: MS.quick, easing: leave() }}>
      <Arrive name="unsent.sheet" duration={MS.considered} rise={SHEET_RISE} style={[s.sheet, { paddingBottom: sheetFoot }]}>
      <View style={s.body} onAccessibilityEscape={onClose}>
        <View style={s.handle} />
        <View style={s.headerRow}>
          <Text style={s.title}>Unsent Changes</Text>
          <PressableScale touch="wayOut" onPress={onClose} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }} haptic="selection" accessibilityRole="button" accessibilityLabel="Close">
            <X size={20} color={colors.fog} strokeWidth={1.5} />
          </PressableScale>
        </View>
        <Text style={s.subtitle}>The house did not take these. Send one again, or let it go.</Text>
        <ScrollView showsVerticalScrollIndicator={false} style={s.list}>
          {held.map((m) => {
            const what = HELD_NOUN[m.type] ?? 'A change';
            const detail = heldDetail(m);
            return (
              <View key={m.id} style={s.row}>
                <View style={s.words}>
                  <Text style={s.what}>{detail ? `${what}: ${detail}` : what}</Text>
                  <Text style={s.why}>{whyRefused(m._refusal)}</Text>
                </View>
                <View style={s.acts}>
                  <PressableScale touch="destructive" style={[s.btn, s.letGo]} hitSlop={BUTTON_REACH} onPress={() => letRefusedGo(m.id)} haptic="selection"
                    accessibilityRole="button" accessibilityLabel={`Let go: ${what}`}>
                    <Text style={s.letGoText}>LET GO</Text>
                  </PressableScale>
                  <PressableScale touch="commit" style={[s.btn, s.again]} hitSlop={BUTTON_REACH} onPress={() => sendRefusedAgain(m.id)} haptic="medium"
                    accessibilityRole="button" accessibilityLabel={`Send again: ${what}`}>
                    <RotateCcw size={12} color={colors.ink} strokeWidth={2} />
                    <Text style={s.againText}>SEND AGAIN</Text>
                  </PressableScale>
                </View>
              </View>
            );
          })}
        </ScrollView>
      </View>
      </Arrive>
      </PresenceView>
      <ToastHost />
      </InColumn>
    </Modal>
    ) : null}
    </Presence>
  );
}

/** How far the sheet rises as it arrives: most of a short sheet's height. */
const SHEET_RISE = 320;
/** A 34pt button, reached to 50pt, as the house's other sheets reach theirs. */
const BUTTON_REACH = { top: 8, bottom: 8, left: 5, right: 5 };

const s = StyleSheet.create({
  // The notice frame's own plate (StandingNotice), pressable: crimson-edged soot, the house's notice.
  plate: {
    backgroundColor: colors.soot, borderWidth: 1, borderColor: colors.bloodReel, borderRadius: 4,
    // 48pt of its own: the notice frame holds it to its own size, so reach past its edge is cut.
    minHeight: 48, justifyContent: 'center',
    paddingHorizontal: 16, paddingVertical: 8, maxWidth: 360, alignItems: 'center', gap: 2, elevation: 8,
  },
  plateTitle: { color: colors.crimsonInk, fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, textAlign: 'center' },
  plateLine: { color: colors.parchment, fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6, textAlign: 'center' },

  backdrop: { flex: 1 },
  frame: { ...StyleSheet.absoluteFill },
  // Shrinks with the sheet's height cap, so the changes scroll inside it.
  body: { flexShrink: 1 },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: '80%', backgroundColor: colors.ink,
    borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 24,
    borderWidth: 1, borderBottomWidth: 0, borderColor: 'rgba(184,137,26,0.15)',
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)', alignSelf: 'center', marginBottom: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.parchment },
  subtitle: { fontFamily: fonts.serif, fontSize: 13, color: colors.fog, marginTop: 6 },
  list: { marginTop: 16 },

  row: { gap: 10, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.soot },
  words: { gap: 3 },
  what: { fontFamily: fonts.serif, fontSize: 14, color: colors.bone },
  why: { fontFamily: fonts.serifItalic, fontSize: 12, color: colors.fog },
  acts: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 8, height: 34, paddingHorizontal: 14 },
  letGo: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.crimsonBorder },
  letGoText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.4, color: colors.crimsonInk, includeFontPadding: false },
  again: { backgroundColor: colors.sepia },
  againText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.4, color: colors.ink, includeFontPadding: false },
});
