import React, { useState, useEffect, useEffectEvent, useRef } from 'react';
import { characterCount } from '@/src/utils/text';
import { InColumn } from '@/src/components/layout/InColumn';
import { View, StyleSheet, Modal, Switch, Keyboard, ActivityIndicator } from 'react-native';
import { Text, TextInput } from '@/src/components/text';
import { nav } from '@/src/utils/typedRouter';
import * as Crypto from 'expo-crypto';
import Animated, {
  useAnimatedStyle, withTiming, Easing, runOnJS
} from 'react-native-reanimated';
import { useModalKeyboardPadding } from '@/src/hooks/useModalKeyboardPadding';
import { useSheetPresence } from '@/src/hooks/useSheetPresence';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { HouseBlur } from '@/src/components/HouseBlur';
import TactileEngine from '@/src/utils/TactileEngine';
import { Lock, Globe, KeyRound } from 'lucide-react-native';
import { useLoungeStore } from '@/src/stores/lounge';
import { useClearance } from '@/src/hooks/useClearance';
import { colors, fonts } from '@/src/theme/theme';
import { UNREADY } from '@/src/theme/unready';
import PressableScale from '@/src/components/PressableScale';
import { ToastHost } from '@/src/components/ToastHost';
import { MAX_LENGTHS, sanitizeInput } from '@/src/utils/sanitizeInput';
import { scaledTextProps, displayTextProps } from '@/src/constants/textScaling';
import { useSheetBottom } from '@/src/components/layout/navMetrics';

export function CreateLoungeSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {

  const sheetFoot = useSheetBottom();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [creating, setCreating] = useState(false);
  const createLounge = useLoungeStore(s => s.createLounge);
  /** Founding a PRIVATE room is the Auteur's; being admitted to one is not. */
  const privateRoom = useClearance('private-rooms', '/lounge');
  const wasSuccessRef = useRef(false);
  /**
   * The room's id, made once and sent with every tap until a room is made: an answer lost on
   * the way back, and a tap again, finds the room the first made (create_lounge), never a second.
   * Kept across a close as the words are; a new one only once a room is made.
   */
  const [firstRoomId] = useState(() => Crypto.randomUUID());
  const roomId = useRef(firstRoomId);
  /** A name the house accepts: two letters at least once cleaned, as createLounge asks. */
  const ready = characterCount(sanitizeInput(name, 'loungeName')) >= LEAST_NAME;
  const descriptionRef = useRef<TextInput>(null);

  /**
   * ── THE ROPE INSIDE A SHEET ────────────────────────────────────────────────
   * This sheet is React Native's own <Modal>, which draws above the ENTIRE
   * navigator: a Society page opened while it is on screen opens underneath
   * it, and the member sees nothing happen.
   *
   * So the Concierge's presentation law: park the intent, close the sheet,
   * and travel only once it is genuinely gone. "Gone" is the commit that
   * unmounts the Modal (`isRendered` false), not the moment close was asked for.
   * A backstop forces that unmount if the close animation never completes,
   * because a switch that silently does nothing is worse than a late one.
   *
   * The name and description survive the trip: they are only cleared after a
   * room is actually founded.
   */
  const societyPending = useRef(false);
  const openSociety = useEffectEvent(() => privateRoom.open());

  const handleCreate = async () => {
    if (!ready) return;
    setCreating(true);
    const id = await createLounge(name.trim(), description.trim(), isPrivate, roomId.current);
    if (id) {
      wasSuccessRef.current = true;
      onClose();
      nav.push(`/lounge/${id}`);
    } else {
      setCreating(false);
    }
  };

  const { isRendered, setIsRendered, opacity, translateY } = useSheetPresence({
    visible,
    // A close during the founding leaves no spinner for the next opening.
    onOpen: () => setCreating(false),
    // A founded room's words go once the sheet has; a closed draft keeps them.
    onGone: () => {
      if (!wasSuccessRef.current) return;
      wasSuccessRef.current = false;
      setName(''); setDescription(''); setIsPrivate(false);
      roomId.current = Crypto.randomUUID();
    },
  });

  // KEYBOARD LAW (RN-Modal tier): Modal windows never resize on either
  // platform (Android's resize mode can't reach them) — pad on BOTH.
  const animatedContainerStyle = useModalKeyboardPadding();

  const handleClose = () => {
    Keyboard.dismiss();
    onClose();
  };

  const closeThenOpenSociety = () => {
    societyPending.current = true;
    handleClose();
  };

  // Travel once the sheet has left the screen — see THE ROPE INSIDE A SHEET.
  useEffect(() => {
    if (isRendered || !societyPending.current) return;
    societyPending.current = false;
    const frame = requestAnimationFrame(() => openSociety());
    return () => cancelAnimationFrame(frame);
  }, [isRendered]);

  // The backstop: if the close animation is interrupted and never unmounts the
  // sheet, unmount it anyway so the parked trip is not lost under it.
  useEffect(() => {
    if (visible || !isRendered || !societyPending.current) return;
    const t = setTimeout(() => setIsRendered(false), 450);
    return () => clearTimeout(t);
  }, [visible, isRendered, setIsRendered]);


  const pan = Gesture.Pan()
    .onChange((e) => {
      if (e.translationY > 0) translateY.set(e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 100 || e.velocityY > 500) {
        opacity.set(withTiming(0, { duration: 250 }));
        translateY.set(withTiming(800, { duration: 250, easing: Easing.out(Easing.cubic) }, () => {
          runOnJS(onClose)();
        }));
      } else {
        translateY.set(withTiming(0, { duration: 250, easing: Easing.out(Easing.cubic) }));
      }
    });

  const blurStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

  if (!isRendered) return null;

  return (
    <Modal statusBarTranslucent transparent visible={isRendered} animationType="none" onRequestClose={handleClose}>
      <InColumn>
      <GestureHandlerRootView style={{ flex: 1 }} onAccessibilityEscape={handleClose}>
      <Animated.View style={[s.sheetKeyboard, animatedContainerStyle]}>
        <Animated.View style={[StyleSheet.absoluteFill, blurStyle]}>
          <HouseBlur intensity={90} tint="dark" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(6,5,4,0.6)' }]}>
            <PressableScale touch="wayOut" style={s.sheetBackdrop} onPress={handleClose} accessibilityLabel="Close sheet" />
          </HouseBlur>
        </Animated.View>

          <Animated.View 
            style={[s.sheet, sheetStyle, { paddingBottom: sheetFoot }]}
          >
          <GestureDetector gesture={pan}>
            <View style={{ backgroundColor: 'transparent' }}>
              <View style={s.sheetHandle} />

              <View style={s.sheetHeaderWrap}>
                <Text style={s.sheetEyebrow} {...scaledTextProps}>✦ THE HOUSE LEDGER</Text>
                <Text style={s.sheetTitle} {...displayTextProps} accessibilityRole="header">Establish a Salon</Text>
              </View>
            </View>
          </GestureDetector>

          <View style={s.field}>
            <View style={s.labelLine}>
              <Text style={s.fieldLabel} {...scaledTextProps}>SALON NAME</Text>
              <Text style={s.fieldCharCount} {...scaledTextProps}>{name.length}/{MAX_LENGTHS.loungeName}</Text>
            </View>
            <TextInput
              style={s.fieldInput}
              placeholder="e.g., The Noir Corner..."
              placeholderTextColor={colors.fog}
              value={name}
              onChangeText={setName}
              maxLength={MAX_LENGTHS.loungeName}
              selectionColor={colors.sepia}
              keyboardAppearance="dark"
              // On to the description: Enter goes where the form goes next.
              returnKeyType="next"
              onSubmitEditing={() => descriptionRef.current?.focus()}
              blurOnSubmit={false}
              accessibilityLabel="Salon name"
            />
          </View>

          <View style={s.field}>
            <View style={s.labelLine}>
              <Text style={s.fieldLabel} {...scaledTextProps}>DESCRIPTION</Text>
              <Text style={s.fieldCharCount} {...scaledTextProps}>{description.length}/{MAX_LENGTHS.loungeDescription}</Text>
            </View>
            <TextInput
              ref={descriptionRef}
              style={[s.fieldInput, s.fieldTextarea]}
              placeholder="What kind of cinema lovers belong here?"
              placeholderTextColor={colors.fog}
              value={description}
              onChangeText={setDescription}
              maxLength={MAX_LENGTHS.loungeDescription}
              multiline
              selectionColor={colors.sepia}
              keyboardAppearance="dark"
              accessibilityLabel="Salon description"
            />
          </View>

          <View style={s.toggleRow}>
            <View style={s.toggleInfo}>
              <View style={s.toggleLabelRow}>
                {isPrivate
                  ? <Lock size={14} color={colors.sepia} strokeWidth={1.5} />
                  : <Globe size={14} color={colors.sepia} strokeWidth={1.5} />
                }
                <Text style={s.toggleLabel} {...scaledTextProps}>
                  {isPrivate ? 'PRIVATE SCREENING ROOM' : 'PUBLIC SALON'}
                </Text>
                {/* A private room is the Auteur's: below it, the house's key says so before the tap. */}
                {privateRoom.held ? null : <KeyRound size={14} color={colors.sepia} strokeWidth={1.5} />}
              </View>
              <Text style={s.toggleDesc} {...scaledTextProps}>
                {isPrivate
                  ? 'By request — you admit members at the door'
                  : privateRoom.held
                    ? 'Anyone with Archivist+ can take a seat'
                    // Said on the PUBLIC side, where a member who cannot found
                    // a private room is standing. The switch is shown either
                    // way — a control you cannot see is a feature you never
                    // learn exists — and this is the one line that explains it
                    // before the tap rather than after.
                    : 'Anyone with Archivist+ can take a seat. A private room is an Auteur’s.'}
              </Text>
            </View>
            <Switch
              value={isPrivate}
              /**
               * The switch is REAL for everyone and answers honestly on the
               * way up. Turning it on without the rank opens the Society page
               * instead of setting a value the database would refuse at
               * `create_lounge` — which is where a member would otherwise
               * discover it, after naming the room and writing its
               * description.
               *
               * Turning it back OFF is never gated: nobody needs a rank to
               * stop wanting something.
               */
              onValueChange={(val) => {
                TactileEngine.selection();
                if (val && !privateRoom.held) { closeThenOpenSociety(); return; }
                setIsPrivate(val);
              }}
              trackColor={{ false: colors.ash, true: colors.sepia }}
              thumbColor={colors.parchment}
              ios_backgroundColor={colors.ash}
              accessibilityLabel={privateRoom.held
                ? 'Make this a private screening room'
                : 'Make this a private screening room. The Auteur opens this. Opens the Society.'}
            />
          </View>

          <View style={s.sheetActions}>
            <PressableScale touch="wayOut" style={s.sheetBtnGhost} onPress={onClose} disabled={creating} haptic="selection" accessibilityLabel="Cancel">
              <Text style={s.sheetBtnGhostText} {...scaledTextProps} numberOfLines={1}>[ CANCEL ]</Text>
            </PressableScale>
            <PressableScale
              style={[s.sheetBtnPrimary, !ready && UNREADY.plate]}
              onPress={handleCreate}
              disabled={!ready || creating}
              haptic="medium"
              accessibilityLabel="Establish salon"
            >
              {creating
                ? <ActivityIndicator size="small" color={colors.ink} />
                : <Text style={[s.sheetBtnPrimaryText, !ready && UNREADY.words]} {...scaledTextProps} numberOfLines={1}>[ ESTABLISH ]</Text>
              }
            </PressableScale>
          </View>
          </Animated.View>
      </Animated.View>
      </GestureHandlerRootView>
      <ToastHost />
      </InColumn>
    </Modal>
  );
}

/** The fewest letters a salon's name may have (createLounge). */
const LEAST_NAME = 2;

const s = StyleSheet.create({
  sheetKeyboard: { flex: 1 },
  sheetBackdrop: { flex: 1 },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surfaceRaised,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 10,
    paddingHorizontal: 20,
    boxShadow: 'inset 0px 1px 0px 0px rgba(255,226,176,0.075)',
  },
  sheetHandle: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(232,223,208,0.25)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetHeaderWrap: { alignItems: 'center', marginBottom: 18 },
  sheetEyebrow: {
    fontFamily: fonts.sub,
    fontSize: 10,
    letterSpacing: 3,
    color: colors.sepia,
    textAlign: 'center',
    includeFontPadding: false,
  },
  sheetTitle: {
    fontFamily: fonts.display,
    fontSize: 22,
    lineHeight: 28,
    color: colors.silverScreen,
    textAlign: 'center',
    marginTop: 6,
  },
  field: { marginBottom: 18 },
  // A field's name, and how much of it is used, on one line above it.
  labelLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 8 },
  fieldLabel: {
    flexShrink: 1,
    fontFamily: fonts.sub,
    fontSize: 10,
    letterSpacing: 2.4,
    color: colors.bone,
    includeFontPadding: false,
  },
  fieldInput: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: 'rgba(184,137,26,0.75)',
    backgroundColor: colors.well,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.parchment,
    borderRadius: 6,
  },
  fieldTextarea: {
    minHeight: 84,
    textAlignVertical: 'top',
  },
  fieldCharCount: {
    fontFamily: fonts.sub,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.fogQuiet,
    // The thing that tells you how much room is left, so it is solid fogQuiet:
    // a word never borrows its contrast from the ground behind it.
    includeFontPadding: false,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 6,
    backgroundColor: colors.soot,
    marginBottom: 22,
  },
  toggleInfo: { flex: 1 },
  toggleLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  toggleLabel: {
    flexShrink: 1,
    fontFamily: fonts.sub,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.parchment,
    includeFontPadding: false,
  },
  toggleDesc: {
    fontFamily: fonts.bodyItalic,
    fontSize: 12,
    lineHeight: 17,
    color: colors.bone,
    marginTop: 4,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: 10,
  },
  sheetBtnGhost: {
    flex: 1,
    minHeight: 50,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(232,223,208,0.2)',
  },
  sheetBtnGhostText: {
    fontFamily: fonts.sub,
    fontSize: 11,
    letterSpacing: 2.4,
    color: colors.bone,
    includeFontPadding: false,
  },
  sheetBtnPrimary: {
    flex: 1,
    minHeight: 50,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 6,
    backgroundColor: colors.sepia,
  },
  sheetBtnPrimaryText: {
    fontFamily: fonts.sub,
    fontSize: 11,
    letterSpacing: 2.4,
    color: colors.ink,
    includeFontPadding: false,
  },
});
