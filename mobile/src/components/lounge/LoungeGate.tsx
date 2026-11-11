/**
 * The Lounge's closed door, for a visitor who is not signed in: the club's light, "The Lounge",
 * [ MEMBERS ONLY ], what lies beyond the door, and the way in. What stands at this door is a name,
 * not a rank: membership is free, and the rank waits at the seat inside.
 */
import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { Text } from '@/src/components/text';
import { askIn } from '@/src/utils/askIn';
import { colors, fonts } from '@/src/theme/theme';
import { scaledTextProps, displayTextProps } from '@/src/constants/textScaling';
import PressableScale from '@/src/components/PressableScale';
import { HungLight } from '@/src/components/atmosphere/HungLight';
import { useTabContentBottom, useTabContentTop } from '@/src/components/layout/navMetrics';
import { UNSPOKEN } from '@/src/components/dispatch/paper/paperMetrics';

/** `mark`: the screen's ready mark (useScreenReady), drawn inside the gate's own root. */
export function LoungeGate({ mark }: { mark?: React.ReactNode } = {}) {
  const top = useTabContentTop();
  const end = useTabContentBottom();
  // The door does not scroll away from its light: the light hangs still.
  const still = useSharedValue(0);
  return (
    <View style={s.room}>
      <HungLight source={require('@/assets/images/light-lounge.png')} top={top} scrollY={still} />
      {mark}
      {/* Hung from the top, as every tab's page is: its first line below the bar, its last above the tab bar. */}
      <ScrollView contentContainerStyle={[s.door, { paddingTop: top, paddingBottom: end }]} showsVerticalScrollIndicator={false}>
        <Text style={s.title} {...displayTextProps} accessibilityRole="header">The Lounge</Text>
        <View style={s.rule} {...UNSPOKEN} />
        <Text style={s.members} {...scaledTextProps}>[ MEMBERS ONLY ]</Text>

        <Text style={s.words} {...scaledTextProps}>
          Beyond this door lies The Lounge — intimate cinema salons where the devoted gather to discuss, debate, and
          discover. Private screening rooms. Whispered critiques.
        </Text>
        <Text style={s.words} {...scaledTextProps}>
          A place where cinema lives between the frames, and every conversation is a love letter to the art.
        </Text>

        {/* Sign-UP, not sign-in: the label promises membership, and a bare
            '/login' opens the sign-in form (authRouting.test pins this). */}
        <PressableScale touch="commit" testID="lounge-gate-cta" style={s.join} hitSlop={null}
          onPress={() => askIn('signup')} haptic="medium"
          accessibilityRole="button" accessibilityLabel="Join the Society — free. Opens sign up.">
          <Text style={s.joinWord} {...scaledTextProps}>✦ JOIN THE SOCIETY</Text>
        </PressableScale>

        {/* What the rank DOES buy here, in the corridor's own words: the ladder shown at the seat. */}
        <Text style={s.small} {...scaledTextProps}>FREE TO JOIN · ARCHIVISTS TAKE A SEAT</Text>
        <Text style={[s.small, s.smallAfter]} {...scaledTextProps}>PRIVATE SCREENING ROOMS · PUBLIC SALONS · CINEMA DISCOURSE</Text>
      </ScrollView>
    </View>
  );
}

const GATE = { drop: 40 } as const;

const s = StyleSheet.create({
  room: { flex: 1, backgroundColor: colors.ink },
  door: { alignItems: 'center', paddingHorizontal: 26 },
  // The door stands a little way down the room, under its light.
  title: { marginTop: GATE.drop, fontFamily: fonts.display, fontSize: 30, lineHeight: 36, color: colors.silverScreen, textAlign: 'center' },
  rule: { width: 60, height: StyleSheet.hairlineWidth * 2, marginTop: 12, backgroundColor: 'rgba(184,137,26,0.45)' },
  members: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 3, color: colors.sepia, marginTop: 12, textAlign: 'center', includeFontPadding: false },
  words: { fontFamily: fonts.bodyItalic, fontSize: 13, lineHeight: 21, color: colors.bone, textAlign: 'center', marginTop: 16 },
  join: {
    // The column's width up to 300, centred (auto margins would shrink it to its words).
    width: '100%', maxWidth: 300, alignSelf: 'center', marginTop: 22, minHeight: 52, borderRadius: 9,
    backgroundColor: colors.sepia, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16,
  },
  joinWord: { fontFamily: fonts.sub, fontSize: 12, letterSpacing: 2.4, color: colors.ink, textAlign: 'center', includeFontPadding: false },
  small: { fontFamily: fonts.sub, fontSize: 10, lineHeight: 18, letterSpacing: 2, color: colors.fog, textAlign: 'center', marginTop: 16 },
  smallAfter: { marginTop: 6 },
});
