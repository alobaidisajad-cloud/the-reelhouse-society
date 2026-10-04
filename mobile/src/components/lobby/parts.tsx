/**
 * The Lobby's small parts: a line of the house's words, a member's portrait and
 * name, and the three marks of a printed bill — its sunburst, its dots, its
 * slanted slab. Every colour is the theme's own.
 */
import React, { memo } from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Circle, Defs, Path, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Text } from '@/src/components/text';
import PressableScale from '@/src/components/PressableScale';
import { RankBadge, rankOf, rankWord } from '@/src/components/RankBadge';
import { colors, fonts } from '@/src/theme/theme';
import { UNSPOKEN } from '@/src/components/dispatch/paper/paperMetrics';
import { nav } from '@/src/utils/typedRouter';
import { useSvgId } from '@/src/utils/svgId';
import { initialOf } from '@/src/utils/text';
import { ceilingOf, TYPE, type Face, type TypeKey } from './measure';
import type { WallAuthor } from './wallRead';

const FACE: Record<Face, string> = {
  rye: fonts.display,
  elite: fonts.sub,
  courierItalic: fonts.bodyItalic,
  spectralItalic: fonts.serifItalic,
};

/** The Text style of a type: its face, size and letter spacing, as measure.ts measures it. */
export const typeStyle = (key: TypeKey): TextStyle => ({
  fontFamily: FACE[TYPE[key].face],
  fontSize: TYPE[key].size,
  letterSpacing: TYPE[key].spacing,
});

/**
 * The ledger of lines drawn: null in the app; a list a test opens to hold every
 * house line the wall ACTUALLY draws, with the room it was actually given — so
 * the width guard checks the page, not a list somebody remembered to keep.
 */
export const lineLedger: { lines: { type: TypeKey; text: string; room: number }[] | null } = { lines: null };

/**
 * A line of the house's own words: one line, always. It grows with the member's
 * text size until `room` is full, then stops (measure.ts, ceilingFor).
 */
export const HouseLine = memo(function HouseLine({ type, text, room, style, header, spoken = true }: {
  type: TypeKey;
  text: string;
  /** the width the line is given, in points */
  room: number;
  style?: StyleProp<TextStyle>;
  header?: boolean;
  /** false for a line a screen reader already hears in its parent's label */
  spoken?: boolean;
}) {
  lineLedger.lines?.push({ type, text, room });
  return (
    <Text
      numberOfLines={1}
      maxFontSizeMultiplier={ceilingOf(type, text, room)}
      style={[typeStyle(type), style]}
      accessibilityRole={header ? 'header' : undefined}
      {...(spoken ? null : UNSPOKEN)}
    >
      {text}
    </Text>
  );
});

// ── A MEMBER ────────────────────────────────────────────────────────────────
export const Avatar = memo(function Avatar({ author, size }: { author: WallAuthor; size: number }) {
  const box = { width: size, height: size, borderRadius: size / 2 };
  return author.avatar_url ? (
    <Image source={{ uri: author.avatar_url }} style={[s.avatar, box]} contentFit="cover" cachePolicy="memory-disk" accessible={false} />
  ) : (
    <View style={[s.avatar, box]} {...UNSPOKEN}>
      <Text style={[s.initial, { fontSize: Math.round(size * 0.45) }]} maxFontSizeMultiplier={1}>
        {initialOf(author.username)}
      </Text>
    </View>
  );
});

/**
 * A member's portrait and name: ONE door to their file, a full finger tall with
 * its halo (PressableScale adds 15 on an axis under 48). Their rank's mark is
 * drawn beside it by the caller — the Society's promise: "wherever it appears".
 */
export const Person = memo(function Person({ author, size = 22, nameStyle, style, hitSlop }: {
  author: WallAuthor;
  size?: number;
  nameStyle?: StyleProp<TextStyle>;
  /** a row that gives the name its own full finger (the filings' byline) */
  style?: StyleProp<ViewStyle>;
  hitSlop?: { top?: number; bottom?: number; left?: number; right?: number };
}) {
  const rank = rankWord(rankOf(author));
  return (
    <PressableScale
      style={[s.person, style]}
      hitSlop={hitSlop}
      onPress={() => nav.push(`/user/${author.username}`)}
      haptic="selection"
      accessibilityRole="link"
      accessibilityLabel={`@${author.username}${rank ? `, ${rank}` : ''}. Open their file.`}
    >
      <Avatar author={author} size={size} />
      <Text numberOfLines={1} style={[s.name, nameStyle]}>@{author.username}</Text>
    </PressableScale>
  );
});

/** A member's rank mark — the app's own badge — or nothing for a member without one. */
export const Mark = memo(function Mark({ author }: { author: WallAuthor }) {
  const rank = rankOf(author);
  return rank ? <RankBadge rank={rank} silent /> : null;
});

// ── THE PRINT ───────────────────────────────────────────────────────────────

/**
 * The bill's sunburst: wedges from a point, fading to nothing. Drawn once,
 * still (nothing on the wall moves), behind what the bill honours.
 */
export const Rays = memo(function Rays({ color, strength, cx, cy, radius }: {
  /** a solid colour: react-native-svg DROPS a stop colour's own alpha (extractGradient), so an rgba() here would paint solid */
  color: string;
  /** how strongly the wedges are printed at their centre, 0–1 */
  strength: number;
  cx: number; cy: number; radius: number;
}) {
  const id = useSvgId('rays');
  const wedges: string[] = [];
  for (let a = 0; a < 360; a += 12) {
    const r0 = (a * Math.PI) / 180, r1 = ((a + 5) * Math.PI) / 180;
    wedges.push(`M${cx},${cy} L${cx + radius * Math.cos(r0)},${cy + radius * Math.sin(r0)} L${cx + radius * Math.cos(r1)},${cy + radius * Math.sin(r1)} Z`);
  }
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none" {...UNSPOKEN}>
      <Defs>
        <RadialGradient id={id} cx={cx} cy={cy} r={radius} gradientUnits="userSpaceOnUse">
          <Stop offset="0.2" stopColor={color} stopOpacity={strength} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Path d={wedges.join(' ')} fill={`url(#${id})`} />
    </Svg>
  );
});

/** The print's own dots, on a coloured stock. */
export const Halftone = memo(function Halftone({ opacity }: { opacity: number }) {
  const id = useSvgId('dots');
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none" {...UNSPOKEN}>
      <Defs>
        <Pattern id={id} width={6} height={6} patternUnits="userSpaceOnUse">
          <Circle cx={3} cy={3} r={1} fill={colors.ink} fillOpacity={opacity} />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
});

/** A slab: the bill's name printed on a block set at a slant. */
export const Slab = memo(function Slab({ lines, ground, ink, room }: {
  lines: readonly string[];
  ground: string;
  ink: string;
  /** the width the slab's words are given, inside its own inset */
  room: number;
}) {
  return (
    <View style={[s.slab, { backgroundColor: ground }]} accessible accessibilityRole="header" accessibilityLabel={lines.join(' ')}>
      {lines.map((line) => (
        <HouseLine key={line} type="slab" text={line} room={room} style={[s.slabLine, { color: ink }]} spoken={false} />
      ))}
    </View>
  );
});

/**
 * Spectral Italic's own “ and ”, read from the font file by
 * mockups/tools/quote-ink.cjs: the outline in ems, its ink's top-left at 0,0.
 */
const QUOTE_MARKS = {
  open: 'M0.219 0L0.106 0.247L0 0.247L0.002 0.234L0.198 0L0.219 0ZM0.399 0L0.286 0.247L0.18 0.247L0.182 0.234L0.378 0L0.399 0Z',
  close: 'M0 0.247L0.113 0L0.219 0L0.217 0.013L0.021 0.247L0 0.247ZM0.18 0.247L0.293 0L0.399 0L0.397 0.013L0.201 0.247L0.18 0.247Z',
  w: 0.399,
  h: 0.247,
} as const;

/**
 * A quote's great mark, drawn from the face's own outline in a box exactly as
 * big as its ink — so it never stands in a box that reaches over the words it
 * opens (a 52pt letter's line is 52 tall; its ink, 13).
 */
export const QuoteMark = memo(function QuoteMark({ size, color, close, style }: {
  size: number; color: string; close?: boolean; style?: StyleProp<ViewStyle>;
}) {
  return (
    <Svg width={QUOTE_MARKS.w * size} height={QUOTE_MARKS.h * size} viewBox={`0 0 ${QUOTE_MARKS.w} ${QUOTE_MARKS.h}`}
      style={style} pointerEvents="none" {...UNSPOKEN}>
      <Path d={close ? QUOTE_MARKS.close : QUOTE_MARKS.open} fill={color} />
    </Svg>
  );
});

/** A row of marquee bulbs, as wide as it is given. */
export const Bulbs = memo(function Bulbs({ style }: { style?: StyleProp<ViewStyle> }) {
  const id = useSvgId('bulb');
  return (
    <Svg height={5} style={[s.bulbs, style]} pointerEvents="none" {...UNSPOKEN}>
      <Defs>
        <Pattern id={id} width={11} height={5} patternUnits="userSpaceOnUse">
          <Circle cx={5.5} cy={2.5} r={1.8} fill={colors.marqueeGold} fillOpacity={0.85} />
        </Pattern>
      </Defs>
      <Rect width="100%" height={5} fill={`url(#${id})`} />
    </Svg>
  );
});

const s = StyleSheet.create({
  avatar: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.sepiaBorderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initial: { fontFamily: fonts.display, color: colors.sepia },
  person: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 24, flexShrink: 1, minWidth: 0 },
  name: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 0.8, color: colors.parchment, flexShrink: 1 },
  slab: {
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingTop: 5,
    paddingBottom: 6,
    transform: [{ rotate: '-3deg' }],
    transformOrigin: 'left center',
    maxWidth: '100%',
  },
  slabLine: { lineHeight: 17 * 1.08 },
  bulbs: { flex: 1, minWidth: 0 },
});
