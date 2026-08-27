/**
 * FilmActionTray — the ticket the stub was torn from.
 *
 * ── WHY IT IS NOT A <Modal> ─────────────────────────────────────────────────
 * This is the load-bearing decision in the whole design, so it is stated here
 * rather than left to be rediscovered.
 *
 * `handleLog` and `handleRewatch` push `/log-modal`, an expo-router MODAL
 * ROUTE. `handleOpenTrailer` and `handleOpenShare` show native `<Modal>`s. Four
 * of the six acts therefore present a view controller. A native `<Modal>` and a
 * router modal are BOTH presented view controllers on iOS, and asking for the
 * second while the first is on screen is a conflict UIKit does not forgive —
 * the most likely cause of everything that went wrong with the old FAB.
 *
 * A `<View>` is not a presented view controller. Building the tray as an
 * in-screen overlay makes that entire class of bug impossible rather than
 * managed. What it costs is three things a `<Modal>` would have given free,
 * each done deliberately below:
 *
 *   · Android hardware back        → BackHandler while open
 *   · the reader beneath is hidden → accessibilityViewIsModal + the page's own
 *                                    importantForAccessibility, set by the caller
 *   · the page must not scroll     → the caller freezes its ScrollView
 *
 * ── THE ACTS ────────────────────────────────────────────────────────────────
 * Every act the console had, with a label saying what happens and one line of
 * why you would want it. Rows that do not apply are ABSENT, never disabled: no
 * trailer, no trailer row; never logged, no rewatch row. A greyed row is a
 * promise you are not keeping.
 */
import React, { memo, useCallback, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, BackHandler, Pressable, ScrollView } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown, ReduceMotion } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import {
  Plus, Pencil, RotateCcw, Bookmark, Play, Share2, MessageCircle, KeyRound, ArrowUpRight,
} from 'lucide-react-native';

import { colors, fonts, SEPIA_HASH } from '@/src/theme/theme';
import { BRASS, BRASS_STOPS, BRASS_START, BRASS_END, CROWN, CROWN_HEIGHT, ON_BRASS, ON_BRASS_RULE, ON_BRASS_MUTED } from '@/src/theme/brass';
import { scaledTextProps } from '@/src/constants/textScaling';
import PressableScale from '@/src/components/PressableScale';
import { tmdb } from '@/src/lib/tmdb';
import { trayMaxHeight } from './filmStubMetrics';

/** The scrim, matching the Concierge's. Not a blur — Android. */
const SCRIM = 'rgba(10,9,6,0.66)';
const RISE_MS = 260;

export interface TrayAct {
  key: string;
  Icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }>;
  label: string;
  gloss: string;
  onPress: () => void;
  /** The primary act — the only brass-filled row. */
  primary?: boolean;
  /** Brass type, for an act that is already true of you, or gated. */
  brass?: boolean;
  /** Leaves the page. `↗` is already this app's mark for travel. */
  travels?: boolean;
  /** State read at a glance rather than by re-reading the label. */
  chip?: string;
}

interface FilmActionTrayProps {
  visible: boolean;
  onDismiss: () => void;
  film: { title?: string; poster_path?: string | null };
  /** Pre-formatted by the caller; this component never touches a date. */
  subtitle: string;
  acts: TrayAct[];
  windowHeight: number;
  /** The dock's height, so the last act clears the stub sitting on top of it. */
  dockHeight: number;
}

const BrassFace = memo(function BrassFace() {
  return (
    <>
      <LinearGradient
        colors={BRASS} locations={BRASS_STOPS}
        start={BRASS_START} end={BRASS_END} style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={CROWN} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
        style={s.crown} pointerEvents="none"
      />
    </>
  );
});

const ActRow = memo(function ActRow({ act }: { act: TrayAct }) {
  const tint = act.primary ? ON_BRASS : act.brass ? colors.sepia : colors.bone;
  return (
    <PressableScale
      onPress={act.onPress}
      pressedScale={0.985}
      /**
       * ── HORIZONTAL SLOP ONLY ──────────────────────────────────────────────
       * PressableScale back-fills any side you omit with 15pt, and adjacent
       * controls OVERLAP with the later one winning. Six stacked rows each
       * bleeding 15pt into their neighbours means pressing near a boundary
       * fires the wrong act — logging a film when you meant to share it. The
       * rows are 56pt, well past the 44pt minimum, so they need no vertical
       * reach at all.
       */
      hitSlop={{ top: 0, bottom: 0, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={`${act.label}. ${act.gloss}`}
      style={[s.row, act.primary && s.rowPrimary]}
    >
      {act.primary && <BrassFace />}
      <View style={s.rowIcon}><act.Icon size={16} color={tint} strokeWidth={1.75} /></View>
      {/* The perforation, rhyming with the stub's tear so the two read as one
          torn ticket rather than a sheet and a bar. */}
      <View style={[s.perfRule, act.primary && { borderLeftColor: ON_BRASS_RULE }]} />
      <View style={s.rowBody}>
        {/* Both capped at one line so every row keeps its height in any
            language and at any type size. */}
        <Text {...scaledTextProps} style={[s.rowLabel, { color: tint }]} numberOfLines={1}>{act.label}</Text>
        <Text {...scaledTextProps} style={[s.rowGloss, act.primary && s.rowGlossPrimary]} numberOfLines={1}>
          {act.gloss}
        </Text>
      </View>
      {act.chip ? <Text {...scaledTextProps} style={s.chip} numberOfLines={1}>{act.chip}</Text> : null}
      {act.travels ? <ArrowUpRight size={13} color={colors.fog} strokeWidth={1.75} /> : null}
    </PressableScale>
  );
});

export const FilmActionTray = memo(function FilmActionTray({
  visible, onDismiss, film, subtitle, acts, windowHeight, dockHeight,
}: FilmActionTrayProps) {
  /**
   * Android's hardware back closes the tray instead of leaving the film — the
   * behaviour a `<Modal>` would have given us and an overlay must earn.
   * Subscribed only while open, so it never swallows a back press otherwise.
   */
  useEffect(() => {
    if (!visible) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onDismiss();
      return true;
    });
    return () => sub.remove();
  }, [visible, onDismiss]);

  const maxHeight = useMemo(() => trayMaxHeight(windowHeight), [windowHeight]);
  const poster = film.poster_path ? tmdb.poster(film.poster_path, 'w185') : null;

  const handleScrim = useCallback(() => onDismiss(), [onDismiss]);

  if (!visible) return null;

  return (
    <View
      style={s.layer}
      // The page beneath must be invisible to a screen reader, and the closing
      // control must live INSIDE this region — the exact defect found when the
      // Concierge was audited, where the only way out was unreachable.
      accessibilityViewIsModal
      testID="film-action-tray"
    >
      <Animated.View
        style={s.scrim}
        entering={FadeIn.duration(RISE_MS).reduceMotion(ReduceMotion.System)}
        exiting={FadeOut.duration(180).reduceMotion(ReduceMotion.System)}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handleScrim}
          accessibilityRole="button"
          accessibilityLabel="Close film actions"
          testID="film-tray-scrim"
        />
      </Animated.View>

      <Animated.View
        style={[s.tray, { maxHeight, paddingBottom: dockHeight + 6 }]}
        entering={SlideInDown.duration(RISE_MS).reduceMotion(ReduceMotion.System)}
        exiting={SlideOutDown.duration(180).reduceMotion(ReduceMotion.System)}
      >
        {/* The tear line the stub was torn along. */}
        <View style={s.perf} pointerEvents="none">
          {PERF_HOLES.map((k) => <View key={k} style={s.perfHole} />)}
        </View>

        {/* THE HEAD — this film's poster and title, so the sheet is bespoke and
            you never have to close it to remember what you are acting on. */}
        <View style={s.head}>
          {poster ? (
            <Image source={{ uri: poster }} style={s.headPoster} contentFit="cover"
              cachePolicy="memory-disk" placeholder={{ blurhash: SEPIA_HASH }} transition={50} />
          ) : (
            <View style={[s.headPoster, s.headPosterEmpty]} />
          )}
          <View style={s.headText}>
            {/* Two lines: a long title truncated to one is a sheet that cannot
                say which film it belongs to. */}
            <Text {...scaledTextProps} style={s.headTitle} numberOfLines={2}>{film.title ?? ''}</Text>
            {subtitle ? (
              <Text {...scaledTextProps} style={s.headMeta} numberOfLines={1}>{subtitle}</Text>
            ) : null}
          </View>
        </View>

        {/**
         * The acts scroll and the head stays pinned. Measured: at 390x844 the
         * tray is 559pt and fits with 285 to spare — which is why every mockup
         * looked fine. On an iPhone SE at Dynamic Type 1.35 it is 751pt on a
         * 667pt screen, and the head, the title and the primary act are pushed
         * off the top. Capped, it is 567 with 100pt to spare and the list
         * scrolls. On an ordinary phone at ordinary type nothing scrolls.
         */}
        <ScrollView
          style={s.acts}
          contentContainerStyle={s.actsContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {acts.map((act, i) => (
            <View key={act.key}>
              {/* Inset past the perforation — never a full-width rule. And not
                  above the first act, nor between the brass row and the rest. */}
              {i > 1 && <View style={s.sep} />}
              <ActRow act={act} />
            </View>
          ))}
        </ScrollView>
      </Animated.View>
    </View>
  );
});

/** Stable keys so the perforation never re-keys on a re-render. */
const PERF_HOLES = Array.from({ length: 26 }, (_, i) => `perf-${i}`);

const s = StyleSheet.create({
  layer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 60, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: SCRIM },
  tray: {
    backgroundColor: colors.surfaceRaised,
    borderTopWidth: 1, borderTopColor: colors.sepiaBorder,
    overflow: 'hidden',
  },
  /** Dashes, not dots: a dark dot on a dark tray is invisible. */
  perf: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 13, paddingBottom: 13 },
  perfHole: { width: 9, height: 1, backgroundColor: 'rgba(184,137,26,0.42)' },

  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 14 },
  headPoster: {
    width: 34, height: 51, borderRadius: 2,
    borderWidth: 1, borderColor: colors.sepiaBorder, backgroundColor: colors.surface,
  },
  headPosterEmpty: { backgroundColor: 'rgba(8,6,4,0.98)' },
  headText: { flex: 1, minWidth: 0 },
  headTitle: { fontFamily: fonts.display, fontSize: 15, color: colors.parchment, includeFontPadding: false },
  headMeta: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1.4, color: colors.fog, marginTop: 3, includeFontPadding: false },

  acts: { flexShrink: 1 },
  actsContent: { paddingBottom: 2 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 11, paddingHorizontal: 20, marginHorizontal: 12,
    borderRadius: 2, overflow: 'hidden',
  },
  rowPrimary: { marginBottom: 6 },
  rowIcon: { width: 20, alignItems: 'center' },
  perfRule: {
    width: 1, alignSelf: 'stretch', marginLeft: -2,
    borderLeftWidth: 1, borderStyle: 'dashed', borderLeftColor: 'rgba(184,137,26,0.2)',
  },
  rowBody: { flex: 1, minWidth: 0 },
  sep: { height: 1, marginLeft: 67, marginRight: 12, backgroundColor: 'rgba(215,205,190,0.07)' },
  rowLabel: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 1.6, marginBottom: 3, includeFontPadding: false },
  rowGloss: { fontFamily: fonts.bodyItalic, fontSize: 11.5, color: colors.fog, opacity: 0.85, includeFontPadding: false },
  rowGlossPrimary: { color: ON_BRASS_MUTED, opacity: 1 },
  chip: {
    fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1.4, color: colors.sepia,
    borderWidth: 1, borderColor: colors.sepiaBorderStrong, borderRadius: 2,
    backgroundColor: colors.sepiaSubtle,
    paddingHorizontal: 6, paddingVertical: 3, overflow: 'hidden', includeFontPadding: false,
  },
  crown: { position: 'absolute', top: 0, left: 0, right: 0, height: CROWN_HEIGHT },
});

/**
 * The act glyphs, re-exported so the layout can build its list without
 * reaching into lucide a second time and risking a different icon for the
 * same act.
 */
export const TrayIcons = { Plus, Pencil, RotateCcw, Bookmark, Play, Share2, MessageCircle, KeyRound };
