/**
 * A stack on the Reel, as a can of film: up to three of its posters fanned above a paper label
 * that names it, counts its reels and says whose it is. The cans stand two to a row (three on a
 * wide window), every can in a row as tall as the row's tallest label, planned from the words'
 * own widths, so no label is cut and no row is ragged. The empty can at the head of the grid is
 * where a member curates one.
 */
import React, { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/src/components/text';
import { RemoteImage, PosterMark } from '@/src/components/Picture';
import PressableScale from '@/src/components/PressableScale';
import { colors, fonts, SEPIA_HASH } from '@/src/theme/theme';
import { scaledTextProps, displayTextProps } from '@/src/constants/textScaling';
import { ceilingFor, lineWidth, linesAt } from '@/src/components/lobby/measure';
import { breakHandle } from '@/src/utils/breakHandle';
import { useMarkCount } from '@/src/stores/markCounts';
import { formatCount, UNSPOKEN } from '@/src/components/dispatch/paper/paperMetrics';
import { counted } from '@/src/components/dispatch/paper/paperText';
import { isRTLText } from '@/src/utils/text';
import { FRAME, FRAME_RADIUS } from '@/src/components/feed/frame/metrics';
import type { StackData, StackFilm } from './types';

const POSTER = 'https://image.tmdb.org/t/p/w185';

export const CAN = {
  gap: 8,
  fan: 128,
  /** The empty can and a can's least height. */
  least: 226,
  label: { inset: 8, pad: 9, padBottom: 8, title: { size: 14, line: 17, lines: 3 }, small: { size: 10, line: 14 }, gapTitle: 6, gapCurator: 3 },
} as const;

/** How many cans stand in a row, and each one's width, in the reading column. */
export function canGrid(column: number) {
  const cols = column >= 520 ? 3 : 2;
  const room = column - FRAME.margin * 2;
  const can = (room - CAN.gap * (cols - 1)) / cols;
  const share = column / cols;
  // The list gives every column an equal share; each cell is padded so the cans sit on the frames'
  // margins with one gap between them.
  const pad = (i: number) => {
    const left = FRAME.margin + i * (can + CAN.gap) - i * share;
    return { paddingLeft: left, paddingRight: share - can - left };
  };
  return { cols, can, pad };
}

const reelsLine = (s: StackData) =>
  (s.count > 0 ? `${s.count} ${s.count === 1 ? 'REEL' : 'REELS'}` : 'AN EMPTY CAN') + (s.isRanked ? ' · ✦ RANKED' : '');
/** A label's line width in a can `can` points wide. */
const labelRoom = (can: number) => can - CAN.label.inset * 2 - CAN.label.pad * 2;

/** Where a handle may break: after its own separators, and a run too long for any line at its middle (breakHandle). */
const BREAK = '\u200B';
function handlePieces(handle: string, room: number): string[] {
  const fits = (p: string) => lineWidth(p, 'elite', CAN.label.small.size, 1, 1) <= room;
  const runs: string[] = [];
  let run = '';
  for (const ch of handle) {
    run += ch;
    if (ch === '_' || ch === '.') { runs.push(run); run = ''; }
  }
  if (run) runs.push(run);
  const out: string[] = [];
  const halve = (p: string) => {
    if (fits(p) || p.length < 2) { out.push(p); return; }
    const [a, b] = breakHandle(p);
    halve(a); halve(b);
  };
  runs.forEach(halve);
  return out;
}

/**
 * The curator's line, as drawn and as planned (each place it may break a space), and the most its
 * text may grow while every piece of the handle still fits a line whole.
 */
function curatorLine(s: StackData, certified: string | null, room: number) {
  const pieces = handlePieces(`@${(s.curator ?? 'society').toUpperCase()}`, room);
  const tail = certified ? ` · ${certified} CERTIFY` : '';
  const cap = Math.min(scaledTextProps.maxFontSizeMultiplier, ...pieces.map((p) => ceilingFor(p, 'elite', CAN.label.small.size, 1, room)));
  return { text: pieces.join(BREAK) + tail, planned: pieces.join(' ') + tail, cap };
}

/** The most the title may grow while its longest word still fits a line whole. */
const titleCap = (title: string, room: number) =>
  Math.min(displayTextProps.maxFontSizeMultiplier, ...title.split(/\s+/).filter(Boolean).map((w) => ceilingFor(w, 'rye', CAN.label.title.size, 0, room)));

/**
 * The member's text size, as a can's label grows by it: `d` and `t` the title's and the small
 * lines' font (useTextScale at each ceiling), `lineD` and `lineT` their SET line heights
 * (useLineScale), which on Android grow past the font's ceiling.
 */
export interface CanScale { d: number; t: number; lineD: number; lineT: number }

/** A label's height at this width and text size: every line it takes, the title held to three. */
export function labelHeight(s: StackData, can: number, { d, t, lineD, lineT }: CanScale, certified = formatCount(s.certifyCount ?? 0)): number {
  const L = CAN.label;
  const width = labelRoom(can);
  // A right-to-left title is drawn in the phone's own face: its three lines are kept for it.
  const titleLines = isRTLText(s.title) ? L.title.lines
    : Math.min(L.title.lines, Math.max(1, linesAt(s.title, 'rye', L.title.size, Math.min(d, titleCap(s.title, width)), 0, width)));
  const curator = curatorLine(s, certified, width);
  const small = (text: string, spacing: number, at: number) => linesAt(text, 'elite', L.small.size, at, spacing, width) * L.small.line * lineT;
  return L.pad + titleLines * L.title.line * lineD + L.gapTitle + small(reelsLine(s), 1.4, t)
    + L.gapCurator + small(curator.planned, 1, Math.min(t, curator.cap)) + L.padBottom;
}

/** A row's height: the fan above its tallest label, never under the least. */
export const rowHeight = (row: StackData[], can: number, scale: CanScale) =>
  Math.max(CAN.least, CAN.fan + CAN.label.inset + Math.max(0, ...row.map((s) => labelHeight(s, can, scale))));

export const StackCan = memo(function StackCan({ stack, width, height, onPress }: { stack: StackData; width: number; height: number; onPress: () => void }) {
  const posters = (stack.films ?? []).filter((f: StackFilm) => f.poster_path).slice(0, 3);
  // Live: certifying on the stack's own page moves this can's number too.
  const certifyCount = useMarkCount('certify', stack.id, stack.certifyCount);
  const certified = formatCount(certifyCount ?? 0);
  const reels = reelsLine(stack);
  const room = labelRoom(width);
  const curator = curatorLine(stack, certified, room);
  return (
    <PressableScale onPress={onPress} haptic hitSlop={null} style={[st.can, { minHeight: height }]}
      accessibilityLabel={`${stack.title || 'A stack'}. ${reels.toLowerCase().replace(' · ✦ ', ', ')}, curated by @${stack.curator ?? 'society'}${certifyCount ? `, ${counted(certifyCount, 'certification', 'certifications')}` : ''}. Opens the stack.`}>
      <Fan posters={posters} />
      <View style={st.label}>
        <Text style={st.title} allowFontScaling maxFontSizeMultiplier={titleCap(stack.title, room)} numberOfLines={CAN.label.title.lines}>{stack.title}</Text>
        <Text style={st.reels} {...scaledTextProps}>{reels}</Text>
        <Text style={st.curator} allowFontScaling maxFontSizeMultiplier={curator.cap}>{curator.text}</Text>
      </View>
    </PressableScale>
  );
});

/** The posters fanned: the first in front, the next two behind it to either side. */
function Fan({ posters }: { posters: StackFilm[] }) {
  const slots = posters.length === 3 ? [st.left, st.right, st.front] : posters.length === 2 ? [st.left, st.right] : [st.front];
  const [first, second, third] = posters;
  const shown = first && second && third ? [second, third, first] : posters;
  return (
    <View style={st.fan} {...UNSPOKEN}>
      {shown.length === 0 ? <PosterMark style={[st.poster, st.front]} size={22} /> : shown.map((f, i) => (
        <View key={`${f.id}-${i}`} style={[st.poster, slots[i]]}>
          <RemoteImage uri={`${POSTER}${f.poster_path}`} style={StyleSheet.absoluteFill} contentFit="cover"
            placeholder={{ blurhash: SEPIA_HASH }} transition={100} fallback={<PosterMark style={StyleSheet.absoluteFill} />} />
        </View>
      ))}
    </View>
  );
}

/** The empty can at the head of the grid: where a stack is begun. */
export const CurateCan = memo(function CurateCan({ height, onPress }: { height: number; onPress: () => void }) {
  return (
    <PressableScale testID="reel-curate-stack" onPress={onPress} hitSlop={null} style={[st.curate, { minHeight: height }]}
      accessibilityRole="button" accessibilityLabel="Curate a collection">
      <View style={st.ring}><Text style={st.plus} {...UNSPOKEN}>+</Text></View>
      <Text style={st.curateText} {...scaledTextProps}>{'CURATE\nA COLLECTION'}</Text>
    </PressableScale>
  );
});

/** A can while the cans are read: still, nothing loops. */
export const CanSkeleton = memo(function CanSkeleton() {
  return (
    <View style={[st.can, st.skeleton]} {...UNSPOKEN}>
      <View style={[st.bar, { height: 120, width: '60%', alignSelf: 'center', marginTop: 8 }]} />
      <View style={[st.bar, { height: 12, marginTop: 22 }]} />
      <View style={[st.bar, { height: 10, width: '60%', marginTop: 8 }]} />
    </View>
  );
});

const L = CAN.label;
const st = StyleSheet.create({
  // Its planned height is its least: a label the plan misjudged grows the can, never loses a line.
  can: { backgroundColor: colors.soot, borderRadius: FRAME_RADIUS, marginBottom: CAN.gap },
  fan: { height: CAN.fan, overflow: 'hidden' },
  poster: {
    position: 'absolute', width: 60, height: 90, bottom: 12, left: '50%', marginLeft: -30,
    borderWidth: 1, borderColor: colors.inkwell, borderRadius: 2, overflow: 'hidden', backgroundColor: colors.inkwell,
  },
  left: { transform: [{ translateX: -33 }, { rotate: '-9deg' }] },
  right: { transform: [{ translateX: 33 }, { rotate: '9deg' }] },
  front: { bottom: 18, zIndex: 2 },
  // The paper label, at the can's foot whatever the row's height.
  label: {
    marginTop: 'auto', marginHorizontal: L.inset, marginBottom: L.inset,
    backgroundColor: colors.paper, borderRadius: 2, paddingHorizontal: L.pad, paddingTop: L.pad, paddingBottom: L.padBottom,
  },
  title: { fontFamily: fonts.display, fontSize: L.title.size, lineHeight: L.title.line, color: colors.onBrassQuiet },
  reels: { fontFamily: fonts.sub, fontSize: L.small.size, lineHeight: L.small.line, letterSpacing: 1.4, color: colors.onBrassQuiet, marginTop: L.gapTitle },
  curator: { fontFamily: fonts.sub, fontSize: L.small.size, lineHeight: L.small.line, letterSpacing: 1, color: colors.onBrassQuiet, marginTop: L.gapCurator },

  curate: {
    borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(184,137,26,0.45)', borderRadius: FRAME_RADIUS,
    alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: CAN.gap,
  },
  ring: {
    width: 64, height: 64, borderRadius: 32, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(184,137,26,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  plus: { fontFamily: fonts.display, fontSize: 24, color: colors.sepia },
  curateText: { fontFamily: fonts.sub, fontSize: 10, lineHeight: 16, letterSpacing: 2.4, color: colors.sepia, textAlign: 'center' },

  skeleton: { height: CAN.least, padding: 14 },
  bar: { backgroundColor: colors.surfaceRaised, borderRadius: 2 },
});
