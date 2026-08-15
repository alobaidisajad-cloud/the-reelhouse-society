import PressableScale from '@/src/components/PressableScale';
import { useLoungeStore } from '@/src/stores/lounge';
import { colors, fonts } from '@/src/theme/theme';
import { LoungeMember } from '@/src/types/social.types';
import TactileEngine from '@/src/utils/TactileEngine';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { Check, DoorOpen, Users, X } from 'lucide-react-native';
import React, { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const AnimatedView = Animated.createAnimatedComponent(View);
const BLOOD = colors.crimson;

interface Props {
  visible: boolean;
  loungeId: string;
  pending: LoungeMember[];
  onClose: () => void;
  onResolved: () => void;
}

export function AtTheDoorPanel({ visible, loungeId, pending, onClose, onResolved }: Props) {
  const insets = useSafeAreaInsets();
  const { approveMember, declineMember } = useLoungeStore();
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (userId: string, admit: boolean) => {
    setBusy(userId);
    if (admit) TactileEngine.success(); else TactileEngine.selection();
    const ok = admit ? await approveMember(loungeId, userId) : await declineMember(loungeId, userId);
    setBusy(null);
    if (ok) onResolved();
  };

  if (!visible) return null;

  return (
    <Modal statusBarTranslucent transparent visible animationType="fade" onRequestClose={onClose}>
      <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill}>
        <PressableScale style={s.backdrop} onPress={onClose} accessibilityRole="button"><View /></PressableScale>
      </BlurView>
      <AnimatedView entering={SlideInDown.springify()} exiting={SlideOutDown} style={[s.sheet, { paddingBottom: Math.max(insets.bottom + 8, 28) }]}>
        <View style={s.handle} />
        <View style={s.headerRow}>
          <View style={s.titleRow}>
            <DoorOpen size={18} color={colors.sepia} strokeWidth={1.5} />
            <Text style={s.title}>At the Door</Text>
          </View>
          <PressableScale onPress={onClose} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }} haptic="selection" accessibilityRole="button" accessibilityLabel="Close">
            <X size={20} color={colors.fog} strokeWidth={1.5} />
          </PressableScale>
        </View>
        <Text style={s.subtitle}>Requests for admission to your salon.</Text>

        {pending.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyText}>No one&apos;s at the door.</Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 16 }}>
            {pending.map(m => (
              <View key={m.user_id} style={s.row}>
                <View style={s.avatar}>
                  {m.avatar_url
                    ? <Image source={{ uri: m.avatar_url }} style={s.avatarImg} contentFit="cover" cachePolicy="memory-disk" transition={150} />
                    : <Users size={14} color={colors.fog} strokeWidth={1.5} />}
                </View>
                <Text style={s.name} numberOfLines={1}>@{m.username?.toUpperCase()}</Text>
                <PressableScale hitSlop={{ top: 8, bottom: 8, left: 5, right: 5 }}
                  style={[s.btn, s.declineBtn]}
                  onPress={() => act(m.user_id, false)}
                  disabled={busy === m.user_id}
                  haptic="selection"
                  accessibilityRole="button"
                  accessibilityLabel={`Decline ${m.username}`}
                >
                  <X size={14} color={BLOOD} strokeWidth={2} />
                </PressableScale>
                <PressableScale hitSlop={{ top: 8, bottom: 8, left: 5, right: 5 }}
                  style={[s.btn, s.admitBtn]}
                  onPress={() => act(m.user_id, true)}
                  disabled={busy === m.user_id}
                  haptic="medium"
                  accessibilityRole="button"
                  accessibilityLabel={`Admit ${m.username}`}
                >
                  <Check size={14} color={colors.ink} strokeWidth={2.5} />
                  <Text style={s.admitText}>ADMIT</Text>
                </PressableScale>
              </View>
            ))}
          </ScrollView>
        )}
      </AnimatedView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1 },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: '80%', backgroundColor: colors.ink,
    borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 24,
    borderWidth: 1, borderBottomWidth: 0, borderColor: 'rgba(184,137,26,0.15)',
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)', alignSelf: 'center', marginBottom: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.parchment },
  subtitle: { fontFamily: fonts.serif, fontSize: 13, color: colors.fog, marginTop: 6 },

  empty: { paddingVertical: 44, alignItems: 'center' },
  emptyText: { fontFamily: fonts.serifItalic, fontSize: 14, color: colors.fog },

  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.soot },
  avatar: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: colors.soot, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.ash,
  },
  avatarImg: { width: '100%', height: '100%' },
  name: { flex: 1, fontFamily: fonts.sub, fontSize: 11, letterSpacing: 1, color: colors.bone, includeFontPadding: false },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 8 },
  declineBtn: { width: 38, height: 34, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.crimsonBorder },
  admitBtn: { backgroundColor: colors.sepia, paddingHorizontal: 14, height: 34 },
  admitText: { fontFamily: fonts.sub, fontSize: 9.5, letterSpacing: 1.5, color: colors.ink, includeFontPadding: false },
});
