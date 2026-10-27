/**
 * I · NOW SHOWING — this week's film as a one-sheet in a brass display case,
 * and the rest of the bill pinned in a column beside it.
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ONE-SHEET is the film's own art with NO words on it (tmdb.keyArt), a
 * crimson snipe pasted across its top corner saying THIS WEEK, and the house's
 * type laid over its foot: the film's name, the billing, the house's line and
 * NOW SHOWING, on a shade that travels with the words, so a name that grows
 * never leaves its shade. Where the catalogue has no wordless
 * art, the film's own printed poster hangs whole instead, and the house lays NO
 * words over it — they stand above and below — because words printed inside a
 * picture cannot be seen, only collided with.
 */
import React, { memo } from 'react';
import { RemoteImage, PosterMark } from '@/src/components/Picture';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, type Href } from 'expo-router';
import { Text } from '@/src/components/text';
import PressableScale from '@/src/components/PressableScale';
import { colors, fonts } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';
import { nav } from '@/src/utils/typedRouter';
import type { TMDBFilm } from '@/src/components/home/types';
import { HouseLine, typeStyle } from './parts';
import { BILL_ALL_H, BILL_GAP, BILL_HEAD_LINE, SHEET_FOOT, SNIPE_H, SNIPE_REACH, WALL, type WallPlan } from './measure';
import { BILL, ONE_SHEET, STATES } from './words';
import type { FeatureSheet } from './wallRead';
import { counted } from '@/src/utils/counted';

const SHADE = 'rgba(6,5,4,';
/**
 * A bill poster's reach: half the gap to each neighbour — the poster above and
 * below, the case to its left — and to its right the wall's own margin, where
 * nothing else stands.
 */
const BILL_HALO = { top: BILL_GAP / 2, bottom: BILL_GAP / 2, left: WALL.besideCase / 2, right: WALL.gutter } as const;
const SHEET_INSET = 16;
const FOOT_INSET = 12;
/**
 * The snipe: a strip of crimson pasted across the sheet's top corner, as a house pasted its
 * notices over its bills (SNIPE_REACH and SNIPE_H, measure.ts). It runs past both edges,
 * where the sheet ends it.
 */
const SNIPE_LEN = SNIPE_REACH * 2 * Math.SQRT2 + 40;
/** Its words' room: the strip's shorter, outer edge inside the corner, less its own height at the ends. */
const SNIPE_ROOM = SNIPE_REACH * 2 * Math.SQRT2 - SNIPE_H - 8;

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
            <RemoteImage uri={tmdb.poster(film.poster_path, 'w185')} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" transition={150} accessible={false} fallback={<PosterMark style={StyleSheet.absoluteFill} size={16} ground={false} />} />
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
  const credits = [sheet.year, sheet.runtime ? `${sheet.runtime} MIN` : null].filter(Boolean).join(' · ');
  // what of the foot stands on this sheet at this text size: it never rises off the sheet
  const fit = plan.foot(sheet.title, sheet.director ?? null, Boolean(credits));
  const label = [
    sheet.title, sheet.director ? `directed by ${sheet.director}` : null, sheet.year, sheet.runtime ? counted(sheet.runtime, 'minute', 'minutes') : null,
  ].filter(Boolean).join(', ');
  const titled = sheet.art.titled;
  // over wordless art the house's line stands at the sheet's foot, under the billing, and the snipe takes its corner
  const tagLines = (
    <>
      <HouseLine type="tagline" text={ONE_SHEET.tagline[0].toUpperCase()} room={titled ? room : footRoom} style={[s.tagLine, s.tagFirst, !titled && s.tagAtFoot]} spoken={false} />
      <HouseLine type="tagline" text={ONE_SHEET.tagline[1].toUpperCase()} room={titled ? room : footRoom} style={[s.tagLine, !titled && s.tagAtFoot]} spoken={false} />
    </>
  );
  const tagline = titled ? <View style={s.tagStatic}>{tagLines}</View> : null;
  const foot = (
    <View style={titled ? s.footStatic : s.foot}>
      {/* The shade rises over a fixed 70pt above the words, then holds at 0.8 or more behind every
          line: a proportional ramp left a tall foot's title (the largest text) on the faint part. */}
      {!titled ? <LinearGradient colors={[`${SHADE}0)`, `${SHADE}0.8)`]} style={s.footRamp} /> : null}
      {!titled ? <LinearGradient colors={[`${SHADE}0.8)`, `${SHADE}0.95)`]} style={s.footShade} /> : null}
      {!sheet.art.titled ? (
        <Text
          numberOfLines={5}
          // the size is chosen so the name is whole at the member's text size; it grows no further
          maxFontSizeMultiplier={1.35}
          style={[s.title, { fontSize: fit.size, lineHeight: Math.round(fit.size * SHEET_FOOT.titleLine) }]}
          accessibilityRole="header"
        >
          {sheet.title}
        </Text>
      ) : null}
      {sheet.director ? (
        // two lines where the member's text size needs them: a director's name is never cut short
        <Text numberOfLines={2} style={[typeStyle('billing'), s.billing]}>{ONE_SHEET.directedBy(sheet.director)}</Text>
      ) : null}
      {credits && (titled || fit.credits) ? <Text numberOfLines={1} style={[typeStyle('billing'), s.billing, s.billingQuiet]}>{credits}</Text> : null}
      {titled || !fit.tags ? null : <View style={s.tagFoot}>{tagLines}</View>}
      <View style={s.nowRow}>
        <View style={s.nowRule} />
        <HouseLine type="now" text={ONE_SHEET.now} room={footRoom - 40} style={s.now} spoken={false} />
        <View style={s.nowRule} />
      </View>
    </View>
  );
  const snipe = titled || !plan.snipe(sheet.title, sheet.director ?? null, Boolean(credits)) ? null : (
    <View style={[s.snipe, { left: width - SNIPE_REACH - SNIPE_LEN / 2 }]} pointerEvents="none">
      <HouseLine type="now" text={ONE_SHEET.snipe} room={SNIPE_ROOM} style={s.snipeWords} spoken={false} />
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
      {/* Wordless key art: lost, the sheet's own colour shows, and its foot prints the title. */}
      <RemoteImage uri={!sheet.art.titled && sheet.art.path ? tmdb.poster(sheet.art.path, 'w780') : null} style={StyleSheet.absoluteFill}
        contentFit="cover" contentPosition={{ top: '30%' }} transition={200} accessible={false} fallback={null} />
      <View style={s.border} pointerEvents="none" />
      {tagline}
      {snipe}
      {/* Art that carries the title, and no title printed for it: lost, the title is printed in its place. */}
      <RemoteImage uri={sheet.art.titled && sheet.art.path ? tmdb.poster(sheet.art.path, 'w500') : null} style={s.titledArt}
        contentFit="contain" transition={200} accessible={false}
        fallback={sheet.art.titled ? (
          <View style={[s.titledArt, s.titledLost]}>
            <Text numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.6} maxFontSizeMultiplier={1.35}
              style={[s.title, s.titledLostTitle]} accessibilityRole="header">{sheet.title}</Text>
          </View>
        ) : null} />
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
  tagStatic: {},
  tagLine: { color: colors.parchment, lineHeight: SHEET_FOOT.tagLine, textAlign: 'left' },
  tagFirst: { color: colors.marqueeGold },
  tagFoot: { marginTop: SHEET_FOOT.tagGap, alignSelf: 'stretch', alignItems: 'center' },
  tagAtFoot: { textAlign: 'center' },
  snipe: {
    position: 'absolute', top: SNIPE_REACH - SNIPE_H / 2, width: SNIPE_LEN, height: SNIPE_H,
    backgroundColor: colors.crimson, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '45deg' }],
  },
  snipeWords: { color: colors.silverScreen },
  foot: { position: 'absolute', left: FOOT_INSET, right: FOOT_INSET, bottom: SHEET_FOOT.bottom, alignItems: 'center' },
  footStatic: { alignItems: 'center' },
  footRamp: { position: 'absolute', left: -FOOT_INSET, right: -FOOT_INSET, top: -70, height: 70 },
  footShade: { position: 'absolute', left: -FOOT_INSET, right: -FOOT_INSET, top: 0, bottom: -18 },
  title: {
    fontFamily: fonts.display, color: colors.silverScreen, textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.65)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 14,
    // The shadow's room inside the box a phone cuts it at; the margins keep the layout.
    paddingTop: 12, paddingBottom: 16, paddingHorizontal: 14, marginTop: -12, marginBottom: -16, marginHorizontal: -14,
  },
  billing: { color: colors.bone, marginTop: SHEET_FOOT.billingGap, lineHeight: SHEET_FOOT.billingLine, textAlign: 'center' },
  billingQuiet: { color: colors.fog, marginTop: SHEET_FOOT.quietGap },
  nowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: SHEET_FOOT.nowGap, alignSelf: 'stretch' },
  nowRule: { flex: 1, minWidth: 0, height: 1, backgroundColor: colors.sepiaBorderStrong },
  now: { color: colors.marqueeGold, lineHeight: SHEET_FOOT.nowLine, paddingLeft: 4 },
  titledArt: { flex: 1, minHeight: 0, marginTop: 10, marginBottom: 2 },
  titledLost: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  titledLostTitle: { fontSize: 30, lineHeight: 34 },
  dark: { alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 20 },
  darkName: { color: colors.silverScreen, textAlign: 'center' },
  darkSub: { color: colors.fog, textAlign: 'center' },
  darkDoor: { minHeight: 44, borderWidth: 1, borderColor: colors.sepiaBorderStrong, paddingHorizontal: 14, justifyContent: 'center' },
  darkDoorText: { color: colors.sepia },
  billCol: { flex: 1, minWidth: 0, gap: BILL_GAP },
  billHead: { color: colors.bone, lineHeight: BILL_HEAD_LINE },
  billPoster: { flex: 1, minHeight: 0, width: '100%', borderWidth: 1, borderColor: colors.sepiaBorderStrong, backgroundColor: colors.inkwell, overflow: 'hidden' },
  // a plate printed in the case's brass, its words in ink
  all: { minHeight: BILL_ALL_H, height: BILL_ALL_H, backgroundColor: colors.sepia, alignItems: 'center', justifyContent: 'center' },
  allText: { color: colors.ink },
});
