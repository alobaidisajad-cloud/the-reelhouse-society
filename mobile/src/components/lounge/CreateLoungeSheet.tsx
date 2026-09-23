import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, Modal, Switch, Keyboard, ActivityIndicator } from 'react-native';
import { nav } from '@/src/utils/typedRouter';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, Easing, runOnJS
} from 'react-native-reanimated';
import { useModalKeyboardPadding } from '@/src/hooks/useModalKeyboardPadding';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';
import TactileEngine from '@/src/utils/TactileEngine';
import { Lock, Globe } from 'lucide-react-native';
import { useLoungeStore } from '@/src/stores/lounge';
import { useClearance } from '@/src/hooks/useClearance';
import { colors, fonts, effects } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { ToastHost } from '@/src/components/ToastHost';

export function CreateLoungeSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {

  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [creating, setCreating] = useState(false);
  const createLounge = useLoungeStore(s => s.createLounge);
  /** Founding a PRIVATE room is the Auteur's; being admitted to one is not. */
  const privateRoom = useClearance('private-rooms', '/lounge');
  const wasSuccessRef = useRef(false);

  /**
   * ── THE ROPE INSIDE A SHEET ────────────────────────────────────────────────
   * This sheet is React Native's own <Modal>, which draws above the ENTIRE
   * navigator. Flipping the private switch without the rank used to call
   * `privateRoom.open()` straight away — so the Society page opened underneath
   * a sheet that was still on screen, and the member saw nothing happen.
   *
   * The Concierge's presentation law, applied here: park the intent, close the
   * sheet, and travel only once it is genuinely gone. "Gone" is the commit that
   * unmounts the Modal (`isRendered` false), not the moment close was asked for.
   * A backstop forces that unmount if the close animation never completes,
   * because a switch that silently does nothing is worse than a late one.
   *
   * The name and description survive the trip: they are only cleared after a
   * room is actually founded.
   */
  const societyPending = useRef(false);
  const openSocietyRef = useRef(privateRoom.open);
  openSocietyRef.current = privateRoom.open;

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    const id = await createLounge(name.trim(), description.trim(), isPrivate);
    if (id) {
      wasSuccessRef.current = true;
      onClose();
      nav.push(`/lounge/${id}`);
    } else {
      setCreating(false);
    }
  };

  const [isRendered, setIsRendered] = useState(visible);
  const translateY = useSharedValue(800);
  const opacity = useSharedValue(0);

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
    const frame = requestAnimationFrame(() => openSocietyRef.current());
    return () => cancelAnimationFrame(frame);
  }, [isRendered]);

  // The backstop: if the close animation is interrupted and never unmounts the
  // sheet, unmount it anyway so the parked trip is not lost under it.
  useEffect(() => {
    if (visible || !isRendered || !societyPending.current) return;
    const t = setTimeout(() => setIsRendered(false), 450);
    return () => clearTimeout(t);
  }, [visible, isRendered]);

  useEffect(() => {
    if (visible) {
      setIsRendered(true);
      translateY.value = 800;
      opacity.value = withTiming(1, { duration: 300 });
      translateY.value = withTiming(0, { duration: 350, easing: Easing.out(Easing.cubic) });
    } else {
      setCreating(false);
      if (isRendered) {
        opacity.value = withTiming(0, { duration: 250 });
        translateY.value = withTiming(800, { duration: 250, easing: Easing.out(Easing.cubic) }, () => {
          runOnJS(setIsRendered)(false);
          if (wasSuccessRef.current) {
            runOnJS(setName)('');
            runOnJS(setDescription)('');
            runOnJS(setIsPrivate)(false);
            wasSuccessRef.current = false;
          }
        });
      }
    }
  }, [visible, isRendered, opacity, translateY]);

  const pan = Gesture.Pan()
    .onChange((e) => {
      if (e.translationY > 0) translateY.value = e.translationY;
    })
    .onEnd((e) => {
      if (e.translationY > 100 || e.velocityY > 500) {
        opacity.value = withTiming(0, { duration: 250 });
        translateY.value = withTiming(800, { duration: 250, easing: Easing.out(Easing.cubic) }, () => {
          runOnJS(onClose)();
        });
      } else {
        translateY.value = withTiming(0, { duration: 250, easing: Easing.out(Easing.cubic) });
      }
    });

  const blurStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

  if (!isRendered) return null;

  return (
    <Modal statusBarTranslucent transparent visible={isRendered} animationType="none" onRequestClose={handleClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
      <Animated.View style={[s.sheetKeyboard, animatedContainerStyle]}>
        <Animated.View style={[StyleSheet.absoluteFill, blurStyle]}>
          <BlurView intensity={90} tint="dark" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(6,5,4,0.6)' }]}>
            <PressableScale style={s.sheetBackdrop} onPress={handleClose} accessibilityLabel="Close sheet" />
          </BlurView>
        </Animated.View>

          <Animated.View 
            style={[s.sheet, sheetStyle, { paddingBottom: Math.max(insets.bottom + 20, 24) }]}
          >
          <GestureDetector gesture={pan}>
            <View style={{ backgroundColor: 'transparent' }}>
              <View style={s.sheetHandle} />

              <View style={s.sheetHeaderWrap}>
                <Text style={s.sheetEyebrow}>✦ THE HOUSE LEDGER</Text>
                <Text style={s.sheetTitle}>Establish a Salon</Text>
              </View>
            </View>
          </GestureDetector>

          <View style={s.field}>
            <Text style={s.fieldLabel}>SALON NAME</Text>
            <TextInput
              style={s.fieldInput}
              placeholder="e.g., The Noir Corner..."
              placeholderTextColor={colors.fog}
              value={name}
              onChangeText={setName}
              maxLength={60}
              selectionColor={colors.sepia}
              keyboardAppearance="dark"
              accessibilityLabel="Salon name"
            />
            <Text style={s.fieldCharCount}>{name.length}/60</Text>
          </View>

          <View style={s.field}>
            <Text style={s.fieldLabel}>DESCRIPTION</Text>
            <TextInput
              style={[s.fieldInput, s.fieldTextarea]}
              placeholder="What kind of cinema lovers belong here?"
              placeholderTextColor={colors.fog}
              value={description}
              onChangeText={setDescription}
              maxLength={300}
              multiline
              selectionColor={colors.sepia}
              keyboardAppearance="dark"
              accessibilityLabel="Salon description"
            />
            <Text style={s.fieldCharCount}>{description.length}/300</Text>
          </View>

          <View style={s.toggleRow}>
            <View style={s.toggleInfo}>
              <View style={s.toggleLabelRow}>
                {isPrivate
                  ? <Lock size={12} color={colors.sepia} strokeWidth={1.5} />
                  : <Globe size={12} color={colors.fog} strokeWidth={1.5} />
                }
                <Text style={s.toggleLabel}>
                  {isPrivate ? 'PRIVATE SCREENING ROOM' : 'PUBLIC SALON'}
                </Text>
              </View>
              <Text style={s.toggleDesc}>
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
            <PressableScale style={s.sheetBtnGhost} onPress={onClose} disabled={creating} haptic="selection" accessibilityLabel="Cancel">
              <Text style={s.sheetBtnGhostText} numberOfLines={1}>[ CANCEL ]</Text>
            </PressableScale>
            <PressableScale
              style={[s.sheetBtnPrimary, (!name.trim() || creating) && s.sheetBtnDisabled]}
              onPress={handleCreate}
              disabled={!name.trim() || creating}
              haptic="medium"
              accessibilityLabel="Establish salon"
            >
              {creating
                ? <ActivityIndicator size="small" color={colors.ink} />
                : <Text style={s.sheetBtnPrimaryText} numberOfLines={1}>[ ESTABLISH ]</Text>
              }
            </PressableScale>
          </View>
          </Animated.View>
      </Animated.View>
      </GestureHandlerRootView>
      <ToastHost />
    </Modal>
  );
}

const s = StyleSheet.create({
  sheetKeyboard: { flex: 1 },
  sheetBackdrop: { flex: 1 },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.inkwell,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    padding: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.sepiaBorder,
    ...effects.shadowSurface,
    elevation: 20,
  },
  sheetHandle: {
    width: 48,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(184,137,26,0.2)',
    alignSelf: 'center',
    marginBottom: 24,
  },
  sheetHeaderWrap: { marginBottom: 28 },
  sheetEyebrow: {
    fontFamily: fonts.sub,
    fontSize: 8,
    letterSpacing: 3,
    color: colors.sepia,
    marginBottom: 8,
    includeFontPadding: false,
  },
  sheetTitle: {
    fontFamily: fonts.display,
    fontSize: 24,
    color: colors.parchment,
    letterSpacing: 1,
  },
  field: { marginBottom: 22 },
  fieldLabel: {
    fontFamily: fonts.sub,
    fontSize: 8,
    letterSpacing: 2.5,
    color: colors.sepia,
    marginBottom: 8,
    includeFontPadding: false,
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: colors.sepiaBorder,
    backgroundColor: colors.well,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.parchment,
    borderRadius: 2,
  },
  fieldTextarea: {
    height: 80,
    textAlignVertical: 'top',
  },
  fieldCharCount: {
    fontFamily: fonts.sub,
    fontSize: 7,
    color: colors.fog,
    // 0.35 measured 1.75:1 — effectively invisible, while being the thing
    // that tells you how much room is left. 0.8 = 4.59:1.
    opacity: 0.8,
    textAlign: 'right',
    marginTop: 4,
    includeFontPadding: false,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 28,
  },
  toggleInfo: { flex: 1, marginRight: 16 },
  toggleLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  toggleLabel: {
    fontFamily: fonts.sub,
    fontSize: 9,
    letterSpacing: 1.5,
    color: colors.parchment,
    includeFontPadding: false,
  },
  toggleDesc: {
    fontFamily: fonts.bodyItalic,
    fontSize: 11,
    color: colors.fog,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: 12,
  },
  sheetBtnGhost: {
    flex: 1,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 2,
    borderWidth: 1,
    borderColor: colors.sepiaBorder,
  },
  sheetBtnGhostText: {
    fontFamily: fonts.sub,
    fontSize: 9,
    letterSpacing: 2.5,
    color: colors.parchment,
    includeFontPadding: false,
  },
  sheetBtnPrimary: {
    flex: 1,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 2,
    backgroundColor: colors.sepia,
    ...effects.shadowSurface,
  },
  sheetBtnPrimaryText: {
    fontFamily: fonts.sub,
    fontSize: 9,
    letterSpacing: 2.5,
    color: colors.ink,
    includeFontPadding: false,
  },
  sheetBtnDisabled: { opacity: 0.35 },
});
