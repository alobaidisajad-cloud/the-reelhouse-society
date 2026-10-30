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
import { Modal, StyleSheet, View } from 'react-native';
import { Text } from '@/src/components/text';
import { HouseBlur } from '@/src/components/HouseBlur';
// Reanimated's: it knows the setting on the first frame, so a member who asked
// for less motion never sees the entrance begin.
import Animated, { Easing, useSharedValue, useAnimatedStyle, withDelay, withTiming } from 'react-native-reanimated';
import { useReduceMotion } from '@/src/hooks/useReduceMotion';
import { Presence, PresenceView } from '@/src/components/motion/Presence';

import PressableScale from '@/src/components/PressableScale';
import { colors, fonts } from '@/src/theme/theme';
import TactileEngine from '@/src/utils/TactileEngine';
import { ToastHost } from '@/src/components/ToastHost';
import { CentredCard } from '@/src/components/layout/CentredCard';
import { Arrive } from '@/src/components/Arrive';

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
    // No private notes here: they are the Vault, an Archivist's, and a new
    // member's record begins without them.
    body: 'Log what you watch. Rate it on five reels. Write critiques worth keeping — rewatches, abandonments and all.',
  },
  {
    numeral: 'III',
    eyebrow: 'III · THE ROOMS',
    title: 'The house is larger than it looks.',
    // The brass key means a locked door, and the Lounge is not one: every
    // member walks in and listens; speaking is the Archivist's.
    body: 'The Reel, where the society talks. The Stacks, where taste is curated. The Lounge, where all listen and Archivists speak. The Darkroom, where you develop what to watch next.',
  },
  {
    numeral: 'IV',
    eyebrow: 'IV · THE FIRST ENTRY',
    title: 'Your record begins tonight.',
    body: '',
  },
];

/** The longest handle a stamp sets on one line: longer, one line could not hold it at the type
 *  floor on a 320pt phone at a large text (a handle may be 30 letters). */
export const STAMP_LINE = 18;

/**
 * A handle as the stamp sets it: one line, or a long one as two, broken after its own separator
 * nearest the middle (an underscore or a dot), or at the middle when it has none. Never left to the
 * phone, which would break it wherever the line ran out, or shrink it past what can be read. Each
 * line is its own label that shrinks to fit; split near the middle, the two land at one size.
 */
export function stampLines(handle: string): string[] {
  if (handle.length <= STAMP_LINE) return [handle];
  const middle = handle.length / 2;
  let at = -1;
  for (let i = 1; i < handle.length - 1; i++) {
    if ((handle.charAt(i) === '_' || handle.charAt(i) === '.') && (at === -1 || Math.abs(i + 1 - middle) < Math.abs(at - middle))) at = i + 1;
  }
  const cut = at === -1 ? Math.ceil(middle) : at;
  return [handle.slice(0, cut), handle.slice(cut)];
}

/** The member stamp — their handle and real serial, in rotated crimson, set in two tiers as a
 *  rubber stamp is: the handle, and the serial beneath it. One line could not hold both at the
 *  largest text (largest-text run 40847116101: cut at its smallest size); each tier fits its own.
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

  const handle = `@${username.toUpperCase()}`;
  const serial = memberNo != null ? `MEMBER Nº ${String(memberNo).padStart(4, '0')}` : null;

  return (
    // Read as one stamp, as it is seen.
    <Animated.View style={[s.stamp, style]} accessible accessibilityLabel={serial ? `${handle} · ${serial}` : handle}>
      {stampLines(handle).map((line) => (
        <Text key={line} style={s.stampText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{line}</Text>
      ))}
      {serial ? <Text style={s.stampSerial} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{serial}</Text> : null}
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
  const reduceMotion = useReduceMotion();
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

  // Kept open while the last beat fades; nothing in it answers a touch as it goes.
  return (
    <Presence>
    {visible ? (
    <Modal key="initiation" statusBarTranslucent visible transparent animationType="fade" onRequestClose={handleQuiet}>
      <PresenceView name="initiation" style={s.overlay} accessibilityViewIsModal={true} onAccessibilityEscape={handleQuiet}>
        {/* The house is real, behind the door — the living Lobby, blurred. */}
        <HouseBlur intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={s.dim} />

        <CentredCard style={s.room}>
          <Arrive name="initiation-card" duration={420} easing={CURVE} rise={0} style={s.card}>
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

            <Presence>
            <PresenceView
              key={beat}
              name="initiation.beat"
              enter={reduceMotion ? undefined : { kind: 'FadeIn', duration: 320, easing: CURVE }}
              exit={reduceMotion ? undefined : { kind: 'FadeOut', duration: 180, easing: CURVE }}
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
            </PresenceView>
            </Presence>

            <View style={s.footer}>
              {!isFinal ? (
                <PressableScale room hitSlop={null} style={s.nextBtn} onPress={handleNext} haptic="selection" pressedScale={0.97} accessibilityRole="button" accessibilityLabel="Next">
                  <Text style={s.nextText}>NEXT&nbsp; →</Text>
                </PressableScale>
              ) : <View style={s.footerSpacer} />}

              <PressableScale room hitSlop={null} onPress={handleQuiet} haptic="selection" pressedScale={0.96} accessibilityRole="button" accessibilityLabel="Enter quietly: skip to the Lobby" testID="initiation-enter-quietly">
                <Text style={s.quietText}>ENTER QUIETLY</Text>
              </PressableScale>
            </View>

            <Text style={s.societyTag}>THE REELHOUSE SOCIETY · EST. 1924</Text>
          </Arrive>
        </CentredCard>
        <ToastHost />
      </PresenceView>
    </Modal>
    ) : null}
    </Presence>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1 },
  room: { alignItems: 'center', paddingHorizontal: 24 },
  dim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(6,5,4,0.55)' },
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
  eyebrow: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2.4, color: colors.sepia, marginBottom: 10 },
  title: { fontFamily: fonts.display, fontSize: 23, color: colors.parchment, textAlign: 'center', lineHeight: 30, marginBottom: 12 },
  body: { fontFamily: fonts.bodyItalic, fontSize: 13, color: colors.bone, textAlign: 'center', lineHeight: 21, maxWidth: 300 },

  stamp: {
    alignItems: 'center',
    borderWidth: 1.5, borderColor: colors.bloodReel, borderRadius: 4,
    paddingVertical: 7, paddingHorizontal: 16, marginBottom: 12, maxWidth: '100%',
  },
  stampText: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 2, color: colors.crimsonInk, includeFontPadding: false, textAlign: 'center' },
  // The serial beneath the handle: a step smaller, at the type floor, as a stamp's second tier is.
  stampSerial: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2.4, color: colors.crimsonInk, includeFontPadding: false, marginTop: 4 },

  firstLogBtn: {
    marginTop: 18, backgroundColor: colors.sepia, borderRadius: 3,
    paddingVertical: 13, paddingHorizontal: 26,
  },
  firstLogText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.ink, includeFontPadding: false },

  // NEXT and the quiet way in share a row while it holds them apart; on a narrow phone at a large
  // text the quiet one takes the next line, the rows far enough apart that each one's reach of 48
  // (NEXT's and the link's, grown above and below) stays its own.
  footer: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 24, rowGap: 24, marginTop: 24 },
  footerSpacer: { width: 1, height: 1 },
  nextBtn: { borderWidth: 1, borderColor: 'rgba(184,137,26,0.4)', borderRadius: 3, paddingVertical: 10, paddingHorizontal: 20 },
  nextText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.sepia, includeFontPadding: false },
  quietText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6, color: colors.fogQuiet, textDecorationLine: 'underline', includeFontPadding: false },

  societyTag: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.fogQuiet, textAlign: 'center', marginTop: 22 },
});
