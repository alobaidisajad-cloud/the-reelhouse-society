/**
 * ConciergeButton — the house's primary action, cast in brass.
 * ─────────────────────────────────────────────────────────────
 * A turned brass disc in the top bar. Pressing it drops the Concierge card
 * from beneath the button: log a film, or curate a stack. It replaces the
 * floating action button, which offered the same two doors from the corner of
 * two screens and overlapped whatever sat under it.
 *
 * BRASS LAW: the disc is not a yellow circle. The Shade Ledger already holds
 * a full brass ramp — marqueeGold (polished), champagne, sepia (the house
 * brass), tarnish (aged) — and the disc runs through all four on a diagonal,
 * lit from the top-left, with a crown highlight over the upper third and a
 * fine light rim all round. That is how a real brass fitting reads. No
 * animated sheen: this button is mounted on every tab and a perpetual sweep
 * in permanent chrome is a frame cost with no purpose.
 *
 * PRESENTATION LAW: a native Modal and a router modal route are both
 * presented view controllers on iOS, and asking for the second while the
 * first is still on screen is a conflict UIKit does not forgive. The old FAB
 * fired `router.push` from inside `InteractionManager.runAfterInteractions`,
 * which drains almost immediately — a whole 160ms before its own sheet
 * finished closing. So the route is parked in a ref and only travelled once
 * the Modal is genuinely gone: `onDismiss` on iOS, the next frame on Android
 * (whose Modal is a separate window and never blocked a push). A timer backs
 * both up, because a menu item that silently does nothing is worse than one
 * that opens a frame late.
 *
 * ANIMATION LAW: no Reanimated entering/exiting inside the Modal — those
 * flash content at its final position for a frame. Open is driven from
 * `onShow`, so the first visible frame is the animation's first frame.
 *
 * BACKDROP LAW: iOS gets native blur; Android gets a plain scrim (expo-blur
 * on Android is a weak tint at best, and its experimental method flickers).
 */
import React, { memo, useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, Platform, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
  runOnJS,
  useReducedMotion,
  type SharedValue,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus, Film, ListPlus } from 'lucide-react-native';

import { colors, fonts } from '@/src/theme/theme';
import { displayTextProps } from '@/src/constants/textScaling';
import TactileEngine from '@/src/utils/TactileEngine';
import PressableScale from '@/src/components/PressableScale';
import { NAV_BTN_SIZE, NAV_H_PADDING, navButtonTop, navButtonBottom } from './navMetrics';

const OPEN_MS = 200;
const CLOSE_MS = 160;

/** Gap between the bottom of the disc and the top of the card. */
const CARD_GAP = 12;
/** Side of the notch square before it is turned 45°. */
const NOTCH = 12;

// The brass ramp, light to aged. All four are Shade Ledger tokens — this is
// the house's own brass, not a new colour.
const BRASS = [colors.marqueeGold, colors.champagne, colors.sepia, colors.tarnish] as const;
const BRASS_STOPS = [0, 0.34, 0.62, 1] as const;
// The crown: `flicker`, the palette's candlelight, falling off over the top of
// the disc — where a convex metal face catches a room's light.
const CROWN = ['rgba(240,232,176,0.40)', 'rgba(240,232,176,0.10)', 'transparent'] as const;
// The machined edge. Bright rather than dark: against near-black chrome a dark
// rim is simply invisible, and real brass hardware catches light all the way round.
const RIM = 'rgba(240,232,176,0.30)';

/**
 * Where everything lands, in screen coordinates.
 *
 * Exported so it can be asserted rather than eyeballed. The menu anchors by
 * COMPUTING the button's position instead of measuring it — measuring costs a
 * layout pass and makes the first open flicker into place — which is only
 * honest while the notch keeps pointing at the disc it belongs to. A test
 * calls this same function, so it checks the shipped arithmetic rather than a
 * copy of it.
 */
export function conciergeGeometry(insetTop: number, windowWidth: number) {
  const btnTop = navButtonTop(insetTop);
  // The disc's centre expressed from the card's own left edge. Both start at
  // NAV_H_PADDING, so this reduces to half a button less half a notch.
  const notchLeft = NAV_BTN_SIZE / 2 - NOTCH / 2;
  return {
    btnTop,
    notchLeft,
    // Where the turned square actually centres, from the card's left edge —
    // rotation is about the centre, so THIS is what must line up with the disc.
    // Derived from the same `notchLeft` the component renders with, so a wrong
    // notchLeft fails the check instead of hiding inside it.
    notchCentre: notchLeft + NOTCH / 2,
    /** Top of the disc's twin inside the Modal — identical to the real one. */
    discCenterX: NAV_H_PADDING + NAV_BTN_SIZE / 2,
    discBottom: navButtonBottom(insetTop),
    cardTop: navButtonBottom(insetTop) + CARD_GAP,
    cardLeft: NAV_H_PADDING,
    cardWidth: Math.min(300, windowWidth - NAV_H_PADDING * 2),
    /** How far the notch's turned corner reaches above the card's top edge. */
    notchReach: (NOTCH * Math.SQRT2) / 2,
  };
}

// ── The disc ─────────────────────────────────────────────────────
// Rendered twice: once in the bar, once inside the Modal at the identical
// coordinates. The copy sits above the scrim so the ＋ turning into an ✕ is
// actually visible — under the old FAB that rotation happened beneath its own
// 66%-opacity backdrop, where nobody ever saw it.
const BrassDisc = memo(function BrassDisc({ rotation }: { rotation: SharedValue<number> }) {
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    // overflow:'hidden' clips the gradients to the circle, and a view that
    // clips cannot also cast a shadow on iOS — hence the outer shadow host.
    <View style={s.discFace}>
      <LinearGradient
        colors={BRASS}
        locations={BRASS_STOPS}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={CROWN}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={s.discCrown}
        pointerEvents="none"
      />
      <Animated.View style={iconStyle}>
        <Plus size={19} color={colors.ink} strokeWidth={3} />
      </Animated.View>
    </View>
  );
});

export const ConciergeButton = memo(function ConciergeButton() {
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const reducedMotion = useReducedMotion();

  const rotation = useSharedValue(0);
  const progress = useSharedValue(0);

  // Where the chosen door leads. Held here rather than pushed immediately —
  // see PRESENTATION LAW above.
  const pending = useRef<Href | null>(null);

  const flush = useCallback(() => {
    const route = pending.current;
    pending.current = null;
    if (route) (router.push as (href: Href) => void)(route);
  }, [router]);

  const finishClose = useCallback(() => {
    setVisible(false);
    // iOS waits for onDismiss, which fires after the presentation has actually
    // torn down. Android's Modal is a separate window that never blocked a
    // push, so one frame is enough.
    if (Platform.OS !== 'ios') requestAnimationFrame(flush);
  }, [flush]);

  // The backstop. If onDismiss never arrives the chosen action would silently
  // do nothing — a dead menu item, which is worse than a late one. flush()
  // clears the ref, so this can never fire a second navigation.
  React.useEffect(() => {
    if (visible || !pending.current) return;
    const t = setTimeout(flush, 450);
    return () => clearTimeout(t);
  }, [visible, flush]);

  const openSheet = useCallback(() => {
    // The haptic is NOT fired here. PressableScale fires it on finger-down,
    // which is what every other button in this bar does; firing it on release
    // made the one brass button feel a beat slower than its neighbours.
    rotation.value = reducedMotion ? 45 : withSpring(45, { damping: 14, stiffness: 200 });
    setOpen(true);
    setVisible(true);
    // progress animates in onShow so frame 1 is animation frame 1
  }, [rotation, reducedMotion]);

  const closeSheet = useCallback(() => {
    setOpen(false);
    rotation.value = reducedMotion ? 0 : withSpring(0, { damping: 14, stiffness: 200 });
    progress.value = withTiming(0, { duration: CLOSE_MS, easing: Easing.in(Easing.quad) }, (finished) => {
      if (finished) runOnJS(finishClose)();
    });
  }, [rotation, progress, reducedMotion, finishClose]);

  const onModalShow = useCallback(() => {
    progress.value = withTiming(1, { duration: OPEN_MS, easing: Easing.out(Easing.quad) });
  }, [progress]);

  const handleAction = useCallback((route: Href) => {
    TactileEngine.selection();
    pending.current = route;
    closeSheet();
  }, [closeSheet]);

  const onLog = useCallback(() => handleAction('/log-modal' as Href), [handleAction]);
  const onStack = useCallback(() => handleAction('/list-modal' as Href), [handleAction]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  const cardStyle = useAnimatedStyle(() => {
    if (reducedMotion) return { opacity: progress.value };
    return {
      opacity: progress.value,
      transform: [
        // Starts a touch above its resting place and settles down, so the card
        // reads as having come out from under the button.
        { translateY: (1 - progress.value) * -10 },
        { scale: 0.96 + progress.value * 0.04 },
      ],
    };
  });

  const { btnTop, cardTop, cardWidth, notchLeft } = conciergeGeometry(insets.top, windowWidth);

  return (
    <>
      {/* The disc in the bar. Hidden while the sheet is open: its twin inside
          the Modal stands in the same place, and two discs a pixel apart would
          show a doubled edge through the scrim. */}
      <PressableScale
        style={[s.discShadow, open && s.discHidden]}
        onPress={openSheet}
        pressedScale={0.9}
        haptic="medium"
        // Asymmetric on purpose. To the LEFT is the screen edge — nothing to
        // collide with, so the full 15 stays and edge taps still land. To the
        // RIGHT sits the Lounge key, 6pt away in the same cluster; at 15 the
        // two overlapped by 17pt and the key, being later in the JSX, took it —
        // the right edge of this button opened the Lounge instead of the
        // Concierge. Half the gap is the ceiling there.
        hitSlop={{ top: 15, bottom: 15, left: 15, right: 3 }}
        // No debounce: this opens a sheet rather than pushing a route, so the
        // guard against double-pushes only buys a dead tap here.
        debounceMs={0}
        accessibilityLabel="Create"
        accessibilityHint="Opens the concierge: log a film, or curate a stack"
      >
        <BrassDisc rotation={rotation} />
      </PressableScale>

      <Modal
        statusBarTranslucent
        visible={visible}
        transparent
        animationType="none"
        onShow={onModalShow}
        onDismiss={flush}
        onRequestClose={closeSheet}
      >
        {/* Backdrop — iOS: native blur; Android: plain scrim */}
        <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
          {Platform.OS === 'ios' ? (
            <BlurView tint="dark" intensity={40} style={StyleSheet.absoluteFill} />
          ) : null}
          <View style={[StyleSheet.absoluteFill, s.scrim]} />
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={closeSheet}
            accessible={false}
            importantForAccessibility="no-hide-descendants"
          />
        </Animated.View>

        {/* Both the card AND the disc's twin live inside this region. Marking
            only the card modal would have left the ✕ — the one control that
            closes this — invisible to VoiceOver. */}
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none" accessibilityViewIsModal>
          <Animated.View style={[s.cardWrap, { top: cardTop, width: cardWidth }, cardStyle]}>
            <View style={s.card}>
              {/* Hairline brass glow along the top — the same law as the login form card */}
              <View style={s.cardGlow} />
              {/* Archival registration brackets */}
              <View style={[s.bracket, s.bracketTL]} />
              <View style={[s.bracket, s.bracketTR]} />
              <View style={[s.bracket, s.bracketBL]} />
              <View style={[s.bracket, s.bracketBR]} />

              <Text style={s.sheetTitle} {...displayTextProps}>✦ THE CONCIERGE ✦</Text>
              <Text style={s.sheetLore} {...displayTextProps}>At your service.</Text>
              <View style={s.headRule} />

              {/* hitSlop null, deliberately. PressableScale defaults to 15pt on
                  every side, which on two rows stacked a hairline apart makes
                  their targets OVERLAP by 30pt — and the later row in the JSX
                  wins, so the bottom of "Log a Film" would have opened "Curate a
                  Stack". These rows are 66pt tall; they need no help. */}
              <PressableScale style={s.actionRow} onPress={onLog} hitSlop={null} accessibilityLabel="Log a film">
                <View style={[s.actionIconWrap, s.actionIconLog]}>
                  <Film size={18} color={colors.sepia} strokeWidth={1.5} />
                </View>
                <View style={s.actionTextCol}>
                  <Text style={s.actionTitle} {...displayTextProps}>Log a Film</Text>
                  <Text style={s.actionDesc} {...displayTextProps}>Set down what you&apos;ve seen.</Text>
                </View>
              </PressableScale>

              <View style={s.rowDivider} />

              <PressableScale style={s.actionRow} onPress={onStack} hitSlop={null} accessibilityLabel="Curate a stack">
                <View style={[s.actionIconWrap, s.actionIconStack]}>
                  <ListPlus size={18} color={colors.bone} strokeWidth={1.5} />
                </View>
                <View style={s.actionTextCol}>
                  <Text style={s.actionTitle} {...displayTextProps}>Curate a Stack</Text>
                  <Text style={s.actionDesc} {...displayTextProps}>Gather films under one theme.</Text>
                </View>
              </PressableScale>
            </View>

            {/* The notch, pointing back at the button. Drawn AFTER the card so its
                soot fill erases the segment of card border it crosses; drawn
                before the disc so the disc still sits on top. */}
            <View style={[s.notch, { left: notchLeft }]} pointerEvents="none" />
          </Animated.View>

          {/* The disc's twin, above the scrim, at the identical coordinates. */}
          <View style={[s.discInModal, { top: btnTop }]} pointerEvents="box-none">
            <PressableScale
              style={s.discShadow}
              onPress={closeSheet}
              pressedScale={0.9}
              haptic="selection"
              debounceMs={0}
              // The twin stands exactly where the real disc stands, so it takes
              // exactly the real disc's target. Nothing sits beside it up here,
              // but matching means the button does not quietly change size the
              // moment the sheet opens under your finger.
              hitSlop={{ top: 15, bottom: 15, left: 15, right: 3 }}
              accessibilityLabel="Close"
            >
              <BrassDisc rotation={rotation} />
            </PressableScale>
          </View>
        </View>
      </Modal>
    </>
  );
});

ConciergeButton.displayName = 'ConciergeButton';

const s = StyleSheet.create({
  // Shadow host. Seats the disc in the bar the way a fitting sits in a panel —
  // a dark shadow, not a glow, which would fight the bar's own blur.
  discShadow: {
    width: NAV_BTN_SIZE,
    height: NAV_BTN_SIZE,
    borderRadius: NAV_BTN_SIZE / 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 3,
  },
  discHidden: { opacity: 0 },
  discFace: {
    width: NAV_BTN_SIZE,
    height: NAV_BTN_SIZE,
    borderRadius: NAV_BTN_SIZE / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RIM,
  },
  discCrown: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '48%',
    // Purely a highlight painted on the disc; it has no z-order to win, and
    // an elevation here would lift it off the face it is painted on.
    elevation: 0,
  },
  discInModal: {
    position: 'absolute',
    left: NAV_H_PADDING,
    // Above the card (10) and its notch (11) on Android, where paint order
    // follows elevation rather than JSX.
    elevation: 12,
    zIndex: 12,
  },

  scrim: { backgroundColor: 'rgba(4,3,2,0.66)' },

  cardWrap: {
    position: 'absolute',
    left: NAV_H_PADDING,
    // The card grows out of the button's own corner rather than its middle.
    transformOrigin: 'top left',
  },
  card: {
    backgroundColor: colors.soot,
    borderWidth: 1,
    borderColor: colors.sepiaBorder,
    borderRadius: 6,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 6,
    // NO overflow:'hidden' here, deliberately. It sets clipsToBounds, and a
    // layer that masks to its bounds cannot draw a shadow OUTSIDE them — so the
    // card below declared a shadow that iOS silently never rendered. (This is
    // the same rule that made discFace and discShadow two views instead of
    // one.) Nothing in this card overflows: the glow is inset 22, the brackets
    // 6, and the rows wrap rather than spill.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 10,
  },
  notch: {
    position: 'absolute',
    top: -NOTCH / 2,
    width: NOTCH,
    height: NOTCH,
    backgroundColor: colors.soot,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: colors.sepiaBorder,
    transform: [{ rotate: '45deg' }],
    elevation: 11,
    zIndex: 11,
    // It has a background and an elevation, so on Android it would cast its own
    // shadow — a small turned diamond that does not match the card's. The card
    // carries the silhouette's shadow; this only wants the z-order.
    shadowColor: 'transparent',
  },
  cardGlow: {
    position: 'absolute', top: 0, left: 22, right: 22, height: 1,
    backgroundColor: colors.sepia, opacity: 0.3,
  },
  bracket: {
    position: 'absolute', width: 10, height: 10,
    borderColor: 'rgba(184,137,26,0.45)',
  },
  bracketTL: { top: 6, left: 6, borderLeftWidth: 1, borderTopWidth: 1 },
  bracketTR: { top: 6, right: 6, borderRightWidth: 1, borderTopWidth: 1 },
  bracketBL: { bottom: 6, left: 6, borderLeftWidth: 1, borderBottomWidth: 1 },
  bracketBR: { bottom: 6, right: 6, borderRightWidth: 1, borderBottomWidth: 1 },

  sheetTitle: {
    fontFamily: fonts.sub, fontSize: 11, letterSpacing: 3, color: colors.sepia, textAlign: 'center',
  },
  sheetLore: {
    // 0.6 measured 3.04:1 on soot. This line is a flourish, but a flourish
    // nobody can read is just noise taking up room.
    fontFamily: fonts.bodyItalic, fontSize: 10, color: colors.fog, opacity: 0.8,
    marginTop: 5, textAlign: 'center',
  },
  // What EST. 1924 left behind: the rule stays, the words go. It still divides
  // the card's name from the doors it offers.
  headRule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(184,137,26,0.18)',
    marginTop: 12,
  },

  actionRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 12,
  },
  rowDivider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(184,137,26,0.18)' },
  actionIconWrap: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  actionIconLog: { backgroundColor: colors.sepiaFaint, borderColor: 'rgba(184,137,26,0.35)' },
  actionIconStack: { backgroundColor: 'rgba(232,223,200,0.06)', borderColor: 'rgba(215,205,190,0.2)' },
  actionTextCol: { flex: 1, minWidth: 0 },
  actionTitle: {
    fontFamily: fonts.display, fontSize: 15, color: colors.parchment, marginBottom: 3,
  },
  actionDesc: {
    fontFamily: fonts.body, fontSize: 11, lineHeight: 16, color: colors.fog,
  },
});
