/**
 * InitiationModal — THE INITIATION.
 * ─────────────────────────────────
 * The Society's once-ever induction, shown the first time a NEW member arrives
 * in the house after signing the register. Four beats over the blurred living
 * Lobby, crowned by the member's own handle + real MEMBER Nº, ending in the
 * invitation that makes members stay: LOG YOUR FIRST FILM.
 *
 * Anti-annoyance is law here (see useInitiation for the triple lock):
 *   • fires once per account, ever — the flag burns at OPEN, not completion
 *   • "ENTER QUIETLY" skip on every beat
 *   • zero sales pitch — the ranks are geography, not an offer
 *   • ~20s unskipped, 2s skipped
 * Motion: transform/opacity only, house timing curves, no bounce anywhere.
 */
import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { FadeIn, FadeOut, Easing, useSharedValue, useAnimatedStyle, withDelay, withTiming } from 'react-native-reanimated';

import PressableScale from '@/src/components/PressableScale';
import { colors, fonts } from '@/src/theme/theme';
import TactileEngine from '@/src/utils/TactileEngine';
import { useReducedMotion } from '@/src/hooks/useReducedMotion';

const CURVE = Easing.bezier(0.33, 0, 0.15, 1);

interface Beat {
  numeral: string;
  eyebrow: string;
  title: string;
  body: string;
}

const BEATS: Beat[] = [
  {
    numeral: 'I',
    eyebrow: 'I · THE DOORS OPEN',
    title: 'The Society admits you.',
    body: 'Your dossier has been opened. What you watch from this night on becomes part of the permanent record.',
  },
  {
    numeral: 'II',
    eyebrow: 'II · THE LEDGER',
    title: 'Every film, in ink.',
    body: 'Log what you watch. Rate it on five reels. Write critiques worth keeping — rewatches, abandonments, private notes and all.',
  },
  {
    numeral: 'III',
    eyebrow: 'III · THE ROOMS',
    title: 'The house is larger than it looks.',
    body: 'The Reel, where the society talks. The Stacks, where taste is curated. The Lounge, behind the brass key. The Darkroom, where you develop what to watch next.',
  },
  {
    numeral: 'IV',
    eyebrow: 'IV · THE FIRST ENTRY',
    title: 'Your record begins tonight.',
    body: '',
  },
];

/** The member stamp — their handle and real serial, in rotated crimson.
 *  Never a fake number: if the serial hasn't landed yet, the handle stands alone. */
function MemberStamp({ username, memberNo, reduceMotion }: { username: string; memberNo: number | null; reduceMotion: boolean }) {
  const opacity = useSharedValue(reduceMotion ? 1 : 0);
  const scale = useSharedValue(reduceMotion ? 1 : 1.06);

  useEffect(() => {
    if (reduceMotion) return;
    // The stamp lands: a single weighted press, one soft tick when it settles
    // (haptic scheduled from JS so the worklets stay pure).
    opacity.value = withDelay(350, withTiming(1, { duration: 320, easing: CURVE }));
    scale.value = withDelay(350, withTiming(1, { duration: 320, easing: CURVE }));
    const tick = setTimeout(() => TactileEngine.selection(), 680);
    return () => clearTimeout(tick);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ rotate: '-2deg' }, { scale: scale.value }],
  }));

  const line = memberNo != null
    ? `@${username.toUpperCase()} · MEMBER Nº ${String(memberNo).padStart(4, '0')}`
    : `@${username.toUpperCase()}`;

  return (
    <Animated.View style={[s.stamp, style]}>
      <Text style={s.stampText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{line}</Text>
    </Animated.View>
  );
}

interface InitiationModalProps {
  visible: boolean;
  username: string;
  memberNo: number | null;
  /** 'log' → open the log modal; 'quiet' → simply enter the house. */
  onComplete: (action: 'log' | 'quiet') => void;
}

export default function InitiationModal({ visible, username, memberNo, onComplete }: InitiationModalProps) {
  const [beat, setBeat] = useState(0);
  const reduceMotion = useReducedMotion();
  const current = BEATS[beat];
  const isFinal = beat === BEATS.length - 1;

  const handleNext = () => {
    TactileEngine.navigate();
    setBeat((b) => Math.min(b + 1, BEATS.length - 1));
  };
  const handleQuiet = () => {
    TactileEngine.selection();
    onComplete('quiet');
  };
  const handleFirstLog = () => {
    TactileEngine.success();
    onComplete('log');
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={handleQuiet}>
      <View style={s.overlay} accessibilityViewIsModal={true}>
        {/* The house is real, behind the door — the living Lobby, blurred. */}
        <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={s.dim} />

        <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(420).easing(CURVE)} style={s.card}>
          {/* Certificate corner brackets — the Register's language. */}
          <View style={[s.bracket, s.bracketTL]} />
          <View style={[s.bracket, s.bracketTR]} />
          <View style={[s.bracket, s.bracketBL]} />
          <View style={[s.bracket, s.bracketBR]} />

          {/* Beat markers — four diamonds, brass for the lit one. */}
          <View style={s.markers}>
            {BEATS.map((b, i) => (
              <View key={b.numeral} style={[s.marker, i === beat && s.markerActive, i < beat && s.markerDone]} />
            ))}
          </View>

          <Animated.View
            key={beat}
            entering={reduceMotion ? undefined : FadeIn.duration(320).easing(CURVE)}
            exiting={reduceMotion ? undefined : FadeOut.duration(180).easing(CURVE)}
            style={s.beatContent}
          >
            <Text style={s.eyebrow} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{current.eyebrow}</Text>
            <Text style={s.title}>{current.title}</Text>

            {beat === 0 && (
              <MemberStamp username={username} memberNo={memberNo} reduceMotion={reduceMotion} />
            )}

            {current.body ? <Text style={s.body}>{current.body}</Text> : null}

            {isFinal && (
              <PressableScale
                style={s.firstLogBtn}
                onPress={handleFirstLog}
                haptic="medium"
                pressedScale={0.97}
                accessibilityRole="button"
                accessibilityLabel="Log your first film"
              >
                <Text style={s.firstLogText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>✦&nbsp; LOG YOUR FIRST FILM</Text>
              </PressableScale>
            )}
          </Animated.View>

          <View style={s.footer}>
            {!isFinal ? (
              <PressableScale style={s.nextBtn} onPress={handleNext} haptic="selection" pressedScale={0.97} accessibilityRole="button" accessibilityLabel="Next">
                <Text style={s.nextText}>NEXT&nbsp; →</Text>
              </PressableScale>
            ) : <View style={s.footerSpacer} />}

            <PressableScale onPress={handleQuiet} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} haptic="selection" pressedScale={0.96} accessibilityRole="button" accessibilityLabel="Skip and enter the lobby">
              <Text style={s.quietText}>ENTER QUIETLY</Text>
            </PressableScale>
          </View>

          <Text style={s.societyTag}>THE REELHOUSE SOCIETY · EST. 1924</Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  dim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,3,2,0.55)' },
  card: {
    width: '100%', maxWidth: 380, backgroundColor: colors.ink,
    borderWidth: 1, borderColor: 'rgba(184,137,26,0.45)', borderRadius: 6,
    paddingVertical: 30, paddingHorizontal: 26,
  },

  bracket: { position: 'absolute', width: 16, height: 16, borderColor: 'rgba(184,137,26,0.6)' },
  bracketTL: { top: 6, left: 6, borderTopWidth: 1.5, borderLeftWidth: 1.5 },
  bracketTR: { top: 6, right: 6, borderTopWidth: 1.5, borderRightWidth: 1.5 },
  bracketBL: { bottom: 6, left: 6, borderBottomWidth: 1.5, borderLeftWidth: 1.5 },
  bracketBR: { bottom: 6, right: 6, borderBottomWidth: 1.5, borderRightWidth: 1.5 },

  markers: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 26 },
  marker: { width: 6, height: 6, backgroundColor: colors.soot, transform: [{ rotate: '45deg' }] },
  markerActive: { backgroundColor: colors.sepia },
  markerDone: { backgroundColor: 'rgba(184,137,26,0.4)' },

  beatContent: { alignItems: 'center', minHeight: 208, justifyContent: 'center' },
  eyebrow: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 3, color: colors.sepia, marginBottom: 10 },
  title: { fontFamily: fonts.display, fontSize: 23, color: colors.parchment, textAlign: 'center', lineHeight: 30, marginBottom: 12 },
  body: { fontFamily: fonts.body, fontStyle: 'italic', fontSize: 13, color: colors.bone, textAlign: 'center', lineHeight: 21, maxWidth: 300, opacity: 0.9 },

  stamp: {
    borderWidth: 1.5, borderColor: colors.bloodReel, borderRadius: 4,
    paddingVertical: 7, paddingHorizontal: 16, marginBottom: 12, maxWidth: '100%',
  },
  stampText: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 2, color: colors.crimson, includeFontPadding: false },

  firstLogBtn: {
    marginTop: 18, backgroundColor: colors.sepia, borderRadius: 3,
    paddingVertical: 13, paddingHorizontal: 26,
  },
  firstLogText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.ink, includeFontPadding: false },

  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24 },
  footerSpacer: { width: 1, height: 1 },
  nextBtn: { borderWidth: 1, borderColor: 'rgba(184,137,26,0.4)', borderRadius: 3, paddingVertical: 10, paddingHorizontal: 20 },
  nextText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.sepia, includeFontPadding: false },
  quietText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2, color: colors.fog, opacity: 0.7, textDecorationLine: 'underline', includeFontPadding: false },

  societyTag: { fontFamily: fonts.sub, fontSize: 7, letterSpacing: 4, color: colors.fog, opacity: 0.35, textAlign: 'center', marginTop: 22 },
});
