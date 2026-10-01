import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/src/components/text';
import { nav } from '@/src/utils/typedRouter';
import { Arrive } from '@/src/components/Arrive';
import { Eye, Sparkles } from 'lucide-react-native';
import { colors, fonts } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';

import { OrnamentalRule } from '@/src/components/theme/OrnamentalRule';
import { CrestGlow } from '@/src/components/theme/CrestGlow';
import { RoomLight } from '@/src/components/atmosphere/RoomLight';

/** `mark`: the screen's ready mark (useScreenReady), drawn inside the gate's own root. */
export function LoungeGate({ mark }: { mark?: React.ReactNode } = {}) {

  return (
    <>
      <View style={s.gateContainer}>
        <RoomLight room="default" />
        {mark}
        <Arrive name="lounge-gate" duration={900} delay={200} style={s.gateCard}>
          <View style={s.gateCrestWrap}>
            <CrestGlow />
            <View style={s.gateCrest}>
              <Eye size={28} color={colors.sepia} strokeWidth={1} />
            </View>
          </View>

          <Text style={s.gateTitle} accessibilityRole="header">The Lounge</Text>
          {/* No "EST. 1924" here: a visitor stopped at this rope needs to know
              what would let them in, not when the house was founded. */}
          <OrnamentalRule />

          {/* ── WHAT STANDS AT THIS DOOR IS A NAME, NOT A RANK ─────────────────
              Only a visitor who is not signed in meets this gate. Any member
              walks in and reads every public salon, and the rank waits at the
              seat inside, so what the visitor lacks is membership, which is
              free; it never sells them a paid rank. */}
          <Text style={s.gateSub}>[ MEMBERS ONLY ]</Text>

          <Text style={s.gateDesc}>
            Beyond this door lies The Lounge — intimate cinema
            salons where the devoted gather to discuss, debate,
            and discover. Private screening rooms. Whispered
            critiques. {"\n\n"}A place where cinema lives between the frames,
            and every conversation is a love letter to the art.
          </Text>

          {/* Sign-UP, not sign-in: the label promises membership, and a bare
              '/login' opens the sign-in form (authRouting.test pins this). */}
          <PressableScale
            testID="lounge-gate-cta"
            style={s.gateCta}
            onPress={() => nav.push('/login', { action: 'signup' })}
            haptic="medium"
            accessibilityRole="button" accessibilityLabel="Join the Society — free. Opens sign up."
          >
            <Sparkles size={11} color={colors.ink} strokeWidth={2} />
            <Text style={s.gateCtaText} numberOfLines={1}>✦ JOIN THE SOCIETY</Text>
          </PressableScale>

          {/* What the rank DOES buy here, in the corridor's own words — so the
              ladder is still shown, at the seat where it applies. */}
          <Text style={s.gateKeyLine} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
            FREE TO JOIN · ARCHIVISTS TAKE A SEAT
          </Text>

          <Text style={s.gateFootnote}>
            PRIVATE SCREENING ROOMS / PUBLIC SALONS / CINEMA DISCOURSE
          </Text>
        </Arrive>
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
  gateSub: {
    fontFamily: fonts.sub,
    fontSize: 10,
    letterSpacing: 1.9,
    color: colors.sepia,
    marginBottom: 20,
  },
  gateDesc: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.fog,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 32,
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
    fontSize: 10,
    letterSpacing: 2,
    color: colors.ink,
  },
  gateKeyLine: {
    fontFamily: fonts.sub,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.sepia,
    // Solid sepia: a word never borrows its contrast from the ground behind it.
    textAlign: 'center',
    marginTop: -18,
    marginBottom: 24,
  },
  gateFootnote: {
    fontFamily: fonts.sub,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.fogQuiet,
    // Solid fogQuiet: a word never borrows its contrast from the ground behind it.
    textAlign: 'center',
  },
});
