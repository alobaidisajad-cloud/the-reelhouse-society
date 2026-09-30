/**
 * I · NOW SHOWING — this week's film as a one-sheet in a brass display case,
 * and the rest of the bill pinned in a column beside it.
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ONE-SHEET is the film's own art with NO words on it (tmdb.keyArt), and the
 * house's type laid over it: its line at the head, the film's name, the billing
 * and NOW SHOWING at the foot, each on a shade that travels with the words, so
 * a name that grows never leaves its shade. Where the catalogue has no wordless
 * art, the film's own printed poster hangs whole instead, and the house lays NO
 * words over it — they stand above and below — because words printed inside a
 * picture cannot be seen, only collided with.
 */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, type Href } from 'expo-router';
import { Text } from '@/src/components/text';
import PressableScale from '@/src/components/PressableScale';
import { colors, fonts } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';
import { nav } from '@/src/utils/typedRouter';
import type { TMDBFilm } from '@/src/components/home/types';
import { HouseLine, typeStyle } from './parts';
import { BILL_ALL_H, BILL_GAP, BILL_HEAD_LINE, WALL, type WallPlan } from './measure';
import { BILL, ONE_SHEET, STATES } from './words';
import type { FeatureSheet } from './wallRead';

const SHADE = 'rgba(6,5,4,';
/**
 * A bill poster's reach: half the gap to each neighbour — the poster above and
 * below, the case to its left — and to its right the wall's own margin, where
 * nothing else stands.
 */
const BILL_HALO = { top: BILL_GAP / 2, bottom: BILL_GAP / 2, left: WALL.besideCase / 2, right: WALL.gutter } as const;
const SHEET_INSET = 16;
const FOOT_INSET = 12;

export const FeatureRow = memo(function FeatureRow({ plan, sheet, bill, dark, onRetry }: {
  plan: WallPlan;
  sheet: FeatureSheet | null;
  bill: TMDBFilm[];
  /** the programme could not be reached: the case keeps its size and says so */
  dark: boolean;
  onRetry: () => void;
}) {
  const router = useRouter();
  const { sheetW, sheetH, col, billCount } = plan;
  const posters = bill.slice(0, billCount);
  return (
    <View style={s.row}>
      <View style={s.case}>
        {/* the film stub's brass: champagne, sepia, tarnish */}
        <LinearGradient colors={[colors.champagne, colors.sepia, colors.tarnish]} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />
        {/* three states, never confused: arrived, still arriving (a still shape of the
            same size), and unreachable (the case says so) */}
        {sheet ? (
          <OneSheet sheet={sheet} width={sheetW} height={sheetH} plan={plan} />
        ) : dark ? (
          <DarkSheet width={sheetW} height={sheetH} onRetry={onRetry} />
        ) : (
          <View style={[s.sheet, { width: sheetW, height: sheetH }]} accessible accessibilityLabel="The programme is arriving" />
        )}
      </View>
      <View style={s.billCol}>
        <View accessible accessibilityRole="header" accessibilityLabel="Also on the bill">
          {BILL.head.map((line) => (
            <HouseLine key={line} type="billHead" text={line} room={col} style={s.billHead} spoken={false} />
          ))}
        </View>
        {posters.map((film) => (
          <PressableScale
            key={film.id}
            style={s.billPoster}
            hitSlop={BILL_HALO}
            onPress={() => nav.push(`/film/${film.id}`)}
            haptic="selection"
            accessibilityRole="link"
            accessibilityLabel={`${film.title ?? film.name ?? 'A film'}. Open the film.`}
          >
            {film.poster_path ? (
              <Image source={{ uri: tmdb.poster(film.poster_path, 'w185') ?? undefined }} style={StyleSheet.absoluteFill}
                contentFit="cover" contentPosition="top" cachePolicy="memory-disk" transition={150} accessible={false} />
            ) : null}
          </PressableScale>
        ))}
        {/* 48 tall: past the line under which a halo is added, so it can never reach the poster above */}
        <PressableScale
          style={s.all}
          hitSlop={{ ...BILL_HALO, top: 0, bottom: 0 }}
          onPress={() => router.navigate('/darkroom' as Href)}
          haptic="selection"
          accessibilityRole="link"
          accessibilityLabel="All films. Open the Darkroom."
        >
          <HouseLine type="cta" text={BILL.all} room={col - 4} style={s.allText} spoken={false} />
        </PressableScale>
      </View>
    </View>
  );
});

const OneSheet = memo(function OneSheet({ sheet, width, height, plan }: {
  sheet: FeatureSheet; width: number; height: number; plan: WallPlan;
}) {
  const room = width - SHEET_INSET * 2;
  const footRoom = width - FOOT_INSET * 2;
  const title = plan.titleSize(sheet.title);
  const credits = [sheet.year, sheet.runtime ? `${sheet.runtime} MIN` : null].filter(Boolean).join(' · ');
  const label = [
    sheet.title, sheet.director ? `directed by ${sheet.director}` : null, sheet.year, sheet.runtime ? `${sheet.runtime} minutes` : null,
  ].filter(Boolean).join(', ');
  const tagline = (
    <View style={sheet.art.titled ? s.tagStatic : s.tag}>
      {!sheet.art.titled ? <LinearGradient colors={[`${SHADE}0.88)`, `${SHADE}0.7)`, `${SHADE}0)`]} locations={[0, 0.55, 1]} style={s.tagShade} /> : null}
      <HouseLine type="tagline" text={ONE_SHEET.tagline[0].toUpperCase()} room={room} style={[s.tagLine, s.tagFirst]} spoken={false} />
      <HouseLine type="tagline" text={ONE_SHEET.tagline[1].toUpperCase()} room={room} style={s.tagLine} spoken={false} />
    </View>
  );
  const foot = (
    <View style={sheet.art.titled ? s.footStatic : s.foot}>
      {!sheet.art.titled ? <LinearGradient colors={[`${SHADE}0)`, `${SHADE}0.8)`, `${SHADE}0.95)`]} locations={[0, 0.42, 1]} style={s.footShade} /> : null}
      {!sheet.art.titled ? (
        <Text
          numberOfLines={5}
          // the size is chosen so the name is whole at the member's text size; it grows no further
          maxFontSizeMultiplier={1.35}
          style={[s.title, { fontSize: title.size, lineHeight: Math.round(title.size * 1.04) }]}
          accessibilityRole="header"
        >
          {sheet.title}
        </Text>
      ) : null}
      {sheet.director ? (
        <Text numberOfLines={1} style={[typeStyle('billing'), s.billing]}>{ONE_SHEET.directedBy(sheet.director)}</Text>
      ) : null}
      {credits ? <Text numberOfLines={1} style={[typeStyle('billing'), s.billing, s.billingQuiet]}>{credits}</Text> : null}
      <View style={s.nowRow}>
        <View style={s.nowRule} />
        <HouseLine type="now" text={ONE_SHEET.now} room={footRoom - 40} style={s.now} spoken={false} />
        <View style={s.nowRule} />
      </View>
    </View>
  );
  return (
    <PressableScale
      style={[s.sheet, { width, height }, sheet.art.titled && s.sheetTitled]}
      onPress={() => nav.push(`/film/${sheet.id}`)}
      pressedScale={0.985}
      haptic="selection"
      accessibilityRole="link"
      accessibilityLabel={`Now showing: ${label}. Open the film.`}
    >
      {!sheet.art.titled && sheet.art.path ? (
        <Image source={{ uri: tmdb.poster(sheet.art.path, 'w780') ?? undefined }} style={StyleSheet.absoluteFill}
          contentFit="cover" contentPosition={{ top: '30%' }} cachePolicy="memory-disk" transition={200} accessible={false} />
      ) : null}
      <View style={s.border} pointerEvents="none" />
      {tagline}
      {sheet.art.titled && sheet.art.path ? (
        <Image source={{ uri: tmdb.poster(sheet.art.path, 'w500') ?? undefined }} style={s.titledArt}
          contentFit="contain" cachePolicy="memory-disk" transition={200} accessible={false} />
      ) : null}
      {foot}
    </PressableScale>
  );
});

/** The programme could not be reached: the case keeps its size, says so in the house's words, and asks again. */
const DarkSheet = memo(function DarkSheet({ width, height, onRetry }: { width: number; height: number; onRetry: () => void }) {
  const room = width - 40;
  return (
    <View style={[s.sheet, s.dark, { width, height }]}>
      <View accessible accessibilityRole="header" accessibilityLabel="Transmission interrupted">
        {STATES.programmeDark.map((line) => (
          <HouseLine key={line} type="darkName" text={line} room={room} style={s.darkName} spoken={false} />
        ))}
      </View>
      <View>
        {STATES.programmeDarkSub.map((line) => (
          <HouseLine key={line} type="darkSub" text={line} room={room} style={s.darkSub} />
        ))}
      </View>
      <PressableScale style={s.darkDoor} onPress={onRetry} haptic="selection" accessibilityRole="button" accessibilityLabel="Try again">
        <HouseLine type="cta" text={STATES.tryAgain} room={room - 30} style={s.darkDoorText} spoken={false} />
      </PressableScale>
    </View>
  );
});

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: WALL.besideCase, alignItems: 'stretch' },
  case: { padding: WALL.rim, overflow: 'hidden' },
  sheet: { overflow: 'hidden', backgroundColor: colors.inkwell },
  sheetTitled: { paddingHorizontal: SHEET_INSET, paddingTop: 16, paddingBottom: 18 },
  border: { position: 'absolute', top: 7, left: 7, right: 7, bottom: 7, borderWidth: 1, borderColor: colors.sepiaBorderStrong },
  tag: { position: 'absolute', left: SHEET_INSET, right: SHEET_INSET, top: 18 },
  tagStatic: {},
  tagShade: { position: 'absolute', left: -SHEET_INSET, right: -SHEET_INSET, top: -18, bottom: -34 },
  tagLine: { color: colors.parchment, lineHeight: 15.5, textAlign: 'left' },
  tagFirst: { color: colors.marqueeGold },
  foot: { position: 'absolute', left: FOOT_INSET, right: FOOT_INSET, bottom: 18, alignItems: 'center' },
  footStatic: { alignItems: 'center' },
  footShade: { position: 'absolute', left: -FOOT_INSET, right: -FOOT_INSET, top: -70, bottom: -18 },
  title: {
    fontFamily: fonts.display, color: colors.silverScreen, textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.65)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 14,
  },
  billing: { color: colors.bone, marginTop: 7, textAlign: 'center' },
  billingQuiet: { color: colors.fog, marginTop: 2 },
  nowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 9, alignSelf: 'stretch' },
  nowRule: { flex: 1, minWidth: 0, height: 1, backgroundColor: colors.sepiaBorderStrong },
  now: { color: colors.marqueeGold, paddingLeft: 4 },
  titledArt: { flex: 1, minHeight: 0, marginTop: 10, marginBottom: 2 },
  dark: { alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 20 },
  darkName: { color: colors.silverScreen, textAlign: 'center' },
  darkSub: { color: colors.fog, textAlign: 'center' },
  darkDoor: { minHeight: 44, borderWidth: 1, borderColor: colors.sepiaBorderStrong, paddingHorizontal: 14, justifyContent: 'center' },
  darkDoorText: { color: colors.sepia },
  billCol: { flex: 1, minWidth: 0, gap: BILL_GAP },
  billHead: { color: colors.bone, lineHeight: BILL_HEAD_LINE },
  billPoster: { flex: 1, minHeight: 0, width: '100%', borderWidth: 1, borderColor: colors.sepiaBorderStrong, backgroundColor: colors.inkwell, overflow: 'hidden' },
  all: { minHeight: BILL_ALL_H, height: BILL_ALL_H, borderWidth: 1, borderColor: colors.sepiaBorderStrong, alignItems: 'center', justifyContent: 'center' },
  allText: { color: colors.sepia },
});
