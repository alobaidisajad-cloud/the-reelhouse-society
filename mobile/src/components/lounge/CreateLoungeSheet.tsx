import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, Modal, Platform, Switch, Keyboard, ActivityIndicator } from 'react-native';
import { nav } from '@/src/utils/typedRouter';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, Easing, runOnJS, useAnimatedKeyboard
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';
import TactileEngine from '@/src/utils/TactileEngine';
import { Lock, Globe } from 'lucide-react-native';
import { useLoungeStore } from '@/src/stores/lounge';
import { colors, fonts, effects } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';

export function CreateLoungeSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {

  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [creating, setCreating] = useState(false);
  const createLounge = useLoungeStore(s => s.createLounge);
  const wasSuccessRef = useRef(false);

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

  const keyboard = useAnimatedKeyboard();
  const animatedContainerStyle = useAnimatedStyle(() => ({
    paddingBottom: Platform.OS === 'ios' ? keyboard.height.value : 0,
  }));

  const handleClose = () => {
    Keyboard.dismiss();
    onClose();
  };

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
    <Modal transparent visible={isRendered} animationType="none" onRequestClose={handleClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
      <Animated.View style={[s.sheetKeyboard, animatedContainerStyle]}>
        <Animated.View style={[StyleSheet.absoluteFill, blurStyle]}>
          <BlurView intensity={90} tint="dark" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(5,3,1,0.6)' }]}>
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
                <Text style={s.sheetEyebrow}>[ SUBMIT DESK LEDGER ]</Text>
                <Text style={s.sheetTitle}>Establish Parameter</Text>
              </View>
            </View>
          </GestureDetector>

          <View style={s.field}>
            <Text style={s.fieldLabel}>LOUNGE NAME</Text>
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
                {isPrivate ? 'By request — you admit members at the door' : 'Anyone with Archivist+ can take a seat'}
              </Text>
            </View>
            <Switch
              value={isPrivate}
              onValueChange={(val) => { TactileEngine.selection(); setIsPrivate(val); }}
              trackColor={{ false: colors.ash, true: colors.sepia }}
              thumbColor={colors.parchment}
              ios_backgroundColor={colors.ash}
            />
          </View>

          <View style={s.sheetActions}>
            <PressableScale style={s.sheetBtnGhost} onPress={onClose} disabled={creating} haptic="selection" accessibilityLabel="Cancel">
              <Text style={s.sheetBtnGhostText} numberOfLines={1}>[ ABORT ]</Text>
            </PressableScale>
            <PressableScale
              style={[s.sheetBtnPrimary, (!name.trim() || creating) && s.sheetBtnDisabled]}
              onPress={handleCreate}
              disabled={!name.trim() || creating}
              haptic="medium"
              accessibilityLabel="Create lounge"
            >
              {creating
                ? <ActivityIndicator size="small" color={colors.ink} />
                : <Text style={s.sheetBtnPrimaryText} numberOfLines={1}>[ INITIATE ]</Text>
              }
            </PressableScale>
          </View>
          </Animated.View>
      </Animated.View>
      </GestureHandlerRootView>
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
    backgroundColor: 'rgba(7,5,4,0.98)',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    padding: 24,
    borderWidth: 1.5,
    borderBottomWidth: 0,
    borderColor: 'rgba(139,105,20,0.3)',
    ...effects.shadowSurface,
    elevation: 20,
  },
  sheetHandle: {
    width: 48,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(139,105,20,0.2)',
    alignSelf: 'center',
    marginBottom: 24,
  },
  sheetHeaderWrap: { marginBottom: 28 },
  sheetEyebrow: {
    fontFamily: fonts.mono,
    fontWeight: '700',
    fontSize: 8,
    letterSpacing: 4,
    color: colors.fog,
    marginBottom: 8,
  },
  sheetTitle: {
    fontFamily: fonts.display,
    fontSize: 24,
    color: colors.parchment,
    letterSpacing: 1,
  },
  field: { marginBottom: 22 },
  fieldLabel: {
    fontFamily: fonts.mono,
    fontWeight: '700',
    fontSize: 9,
    letterSpacing: 3,
    color: colors.sepia,
    marginBottom: 8,
  },
  fieldInput: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(139,105,20,0.3)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontFamily: fonts.mono,
    fontWeight: '700',
    fontSize: 14,
    color: colors.parchment,
    borderRadius: 2,
  },
  fieldTextarea: {
    height: 80,
    textAlignVertical: 'top',
  },
  fieldCharCount: {
    fontFamily: fonts.ui,
    fontSize: 8,
    color: colors.fog,
    opacity: 0.3,
    textAlign: 'right',
    marginTop: 4,
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
    fontFamily: fonts.uiMedium,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.parchment,
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
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(139,105,20,0.3)',
  },
  sheetBtnGhostText: {
    fontFamily: fonts.mono,
    fontWeight: '700',
    fontSize: 10,
    letterSpacing: 3,
    color: colors.parchment,
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
    fontFamily: fonts.mono,
    fontWeight: '700',
    fontSize: 10,
    letterSpacing: 3,
    color: colors.ink,
  },
  sheetBtnDisabled: { opacity: 0.35 },
});
