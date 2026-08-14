import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { nav } from '@/src/utils/typedRouter';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Eye, Sparkles } from 'lucide-react-native';
import { colors, fonts } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';

import { OrnamentalRule } from '@/src/components/theme/OrnamentalRule';
import { CrestGlow } from '@/src/components/theme/CrestGlow';

export function LoungeGate() {

  return (
    <>
      <View style={s.gateContainer}>
        <Animated.View entering={FadeInDown.duration(900).delay(200)} style={s.gateCard}>
          <View style={s.gateCrestWrap}>
            <CrestGlow />
            <View style={s.gateCrest}>
              <Eye size={28} color={colors.sepia} strokeWidth={1} />
            </View>
          </View>

          <Text style={s.gateTitle} accessibilityRole="header">The Lounge</Text>
          {/* "EST. 1924" removed — sixth page it appeared on. The line that
              earns this spot is the one below, naming which ranks hold the key;
              a visitor stopped at this rope needs to know what would let them
              in, not when the house was founded. */}
          <OrnamentalRule />

          <Text style={s.gateSub}>[ CLEARANCE REQUIRED ]</Text>

          <Text style={s.gateDesc}>
            Beyond this door lies The Lounge — intimate cinema
            salons where the devoted gather to discuss, debate,
            and discover. Private screening rooms. Whispered
            critiques. {"\n\n"}A place where cinema lives between the frames,
            and every conversation is a love letter to the art.
          </Text>

          <PressableScale
            testID="lounge-gate-cta"
            style={s.gateCta}
            onPress={() => nav.push('/membership')}
            haptic="medium"
            accessibilityRole="button" accessibilityLabel="Ascend the ranks — opens membership"
          >
            <Sparkles size={11} color={colors.ink} strokeWidth={2} />
            <Text style={s.gateCtaText} numberOfLines={1}>✦ ASCEND THE RANKS</Text>
          </PressableScale>

          {/* Tier-neutral — the whole ladder, no rank pushed over another */}
          <Text style={s.gateKeyLine} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
            THE ARCHIVIST &amp; AUTEUR RANKS HOLD THE KEY
          </Text>

          <Text style={s.gateFootnote}>
            PRIVATE SCREENING ROOMS / PUBLIC SALONS / CINEMA DISCOURSE
          </Text>
        </Animated.View>
      </View>
    </>
  );
}

const s = StyleSheet.create({
  gateContainer: {
    flex: 1,
    backgroundColor: colors.ink,
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  gateCard: {
    alignItems: 'center',
  },
  gateCrestWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  gateCrest: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: 'rgba(184,137,26,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(184,137,26,0.03)',
  },
  gateTitle: {
    fontFamily: fonts.display,
    fontSize: 24,
    color: colors.parchment,
    marginBottom: 6,
  },
  // `gateEst` removed with the "EST. 1924" line it drew.
  gateSub: {
    fontFamily: fonts.sub,
    fontSize: 8,
    letterSpacing: 3,
    color: colors.sepia,
    marginBottom: 20,
  },
  gateDesc: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.bone,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 32,
    opacity: 0.8,
  },
  gateCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.sepia,
    paddingVertical: 15,
    paddingHorizontal: 36,
    borderRadius: 2,
    marginBottom: 28,
  },
  gateCtaText: {
    fontFamily: fonts.sub,
    fontSize: 9,
    letterSpacing: 2.5,
    color: colors.ink,
  },
  gateKeyLine: {
    fontFamily: fonts.sub,
    fontSize: 7,
    letterSpacing: 2.5,
    color: colors.sepia,
    // 0.6 was 2.90:1 in sepia. 0.85 = 4.78:1.
    opacity: 0.85,
    textAlign: 'center',
    marginTop: -18,
    marginBottom: 24,
  },
  gateFootnote: {
    fontFamily: fonts.sub,
    fontSize: 7,
    letterSpacing: 2.5,
    color: colors.fog,
    // 0.4 was 1.96:1. 0.8 = 4.59:1.
    opacity: 0.8,
    textAlign: 'center',
  },
});
