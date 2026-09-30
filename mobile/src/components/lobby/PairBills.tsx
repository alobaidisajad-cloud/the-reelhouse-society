/**
 * II · THE FEATURED LOG (printed on paper) and III · THE FEATURED STACK (printed
 * on brass) — side by side and of one height where each holds its words at the
 * member's text size; one above the other, each its own height, where it does
 * not (planWall).
 * ─────────────────────────────────────────────────────────────────────────────
 * The member's name, portrait and rank mark stand on a CREDIT STRIP at each
 * bill's foot, on the card's own dark ground: the rank mark (RankBadge) is made
 * for a dark ground — the Auteur's plate is a wash over near-black, the
 * Archivist's a hairline with no ground at all — and on paper or brass it
 * could not be read.
 *
 * No counts: the Lobby names the honoured; the log's own page counts them.
 */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from '@/src/components/text';
import PressableScale from '@/src/components/PressableScale';
import { ReelRating } from '@/src/components/Decorative';
import { colors, fonts } from '@/src/theme/theme';
import { EDGE_LIT } from '@/src/theme/light';
import { tmdb } from '@/src/lib/tmdb';
import { nav } from '@/src/utils/typedRouter';
import { isRTLText, RTL_MARK } from '@/src/utils/text';
import { UNSPOKEN } from '@/src/components/dispatch/paper/paperMetrics';
import { Halftone, HouseLine, Mark, Person, QuoteMark, Rays, Slab, typeStyle } from './parts';
import { balancedWidth, quoteSize, WALL, wholeSize, type WallPlan } from './measure';
import { LOG_BILL, STACK_BILL } from './words';
import type { WallLog, WallStack } from './wallRead';
import { KeepOff } from './KeepOff';

/** Between the credit's name and its mark's line. */
const CREDIT_GAP = 6;

/** The credit strip: a member's portrait, name and rank mark, on the card's own ground. */
const Credit = memo(function Credit({ author, keepOff }: { author: WallLog['author']; keepOff?: React.ReactNode }) {
  return (
    <View style={s.credit}>
      <View style={s.creditLine}>
        {/* its mark's line stands CREDIT_GAP below, where an admin's switch may be: half of that down */}
        <Person author={author} hitSlop={{ bottom: CREDIT_GAP / 2 }} />
      </View>
      <View style={s.creditLine2}>
        <Mark author={author} />
        {keepOff}
      </View>
    </View>
  );
});

// ── THE FEATURED LOG ────────────────────────────────────────────────────────
export const LogBill = memo(function LogBill({ log, plan, scale, admin }: {
  log: WallLog; plan: WallPlan; scale: number; admin: boolean;
}) {
  const rtl = isRTLText(log.words);
  const size = quoteSize(log.words.length);
  const room = plan.pairs ? plan.halfRoom : plan.wallW - WALL.halfPad * 2;
  // a short quote's lines come out even (React Native has no text-wrap: balance);
  // Arabic is set at the full width — its letters are not in the measured faces
  const quoteW = rtl ? room : balancedWidth(log.words, 'spectralItalic', size, scale, room);
  const film = wholeSize(LOG_BILL.on(log.film.title), 'elite', 10, 10, 2, room - 50, scale, 1.2);
  return (
    <View style={[s.half, plan.pairs && s.beside, s.paper]}>
      <Halftone opacity={0.08} />
      <Rays color={colors.crimson} strength={0.10} cx={room * 0.35} cy={140} radius={210} />
      <Slab lines={LOG_BILL.slab} ground={colors.crimson} ink={colors.silverScreen} room={room - WALL.slabPadX * 2} />
      <PressableScale
        style={s.words}
        // the film's row stands 4 below: half of that, and no more
        hitSlop={{ bottom: 2 }}
        onPress={() => nav.push(`/log/${log.id}`)}
        pressedScale={0.985}
        haptic="selection"
        accessibilityRole="link"
        accessibilityLabel={`Featured log by @${log.author.username}, on ${log.film.title}: ${log.words}. Read the log.`}
      >
        <QuoteMark size={52} color={colors.crimson} close={rtl} style={[s.quoteMark, rtl && s.quoteMarkRtl]} />
        <Text
          numberOfLines={6}
          style={[s.quote, { fontSize: size, lineHeight: Math.round(size * 1.32) }, rtl ? s.rtl : { maxWidth: quoteW }]}
        >
          {rtl ? RTL_MARK : null}{log.words}
        </Text>
        <View style={[s.readOn, rtl && s.readOnRtl]}>
          <HouseLine type="cta" text={LOG_BILL.readOn} room={room} style={s.readOnText} spoken={false} />
        </View>
      </PressableScale>
      <PressableScale
        style={[s.filmRow, rtl && s.filmRowRtl]}
        onPress={() => nav.push(`/film/${log.film.id}`)}
        haptic="selection"
        accessibilityRole="link"
        accessibilityLabel={`${log.film.title}${log.rating ? `, rated ${log.rating} of 5` : ''}. Open the film.`}
      >
        <View style={s.thumb}>
          {log.film.poster_path ? (
            <Image source={{ uri: tmdb.poster(log.film.poster_path, 'w92') ?? undefined }} style={StyleSheet.absoluteFill}
              contentFit="cover" cachePolicy="memory-disk" accessible={false} />
          ) : null}
        </View>
        <View style={s.filmMeta}>
          <Text numberOfLines={2} maxFontSizeMultiplier={1.35}
            style={[typeStyle('filmLine'), s.filmLine, { fontSize: film.size }, rtl && s.alignRight]}>
            {LOG_BILL.on(log.film.title)}
          </Text>
          {typeof log.rating === 'number' && log.rating > 0 ? (
            <View style={[s.reels, rtl && s.reelsRtl]}><ReelRating rating={log.rating} size={13} /></View>
          ) : null}
        </View>
      </PressableScale>
      <View style={s.slogan}>
        {LOG_BILL.slogan.map((line) => (
          <HouseLine key={line} type="slogan" text={line.toUpperCase()} room={room} style={s.sloganPaper} />
        ))}
      </View>
      <Credit author={log.author} keepOff={admin ? <KeepOff kind="log" id={log.id} what="log" /> : null} />
    </View>
  );
});

// ── THE FEATURED STACK ──────────────────────────────────────────────────────
const FAN = [{ turn: -12, shift: -30, z: 1 }, { turn: 0, shift: 0, z: 2 }, { turn: 12, shift: 30, z: 1 }] as const;
const FAN_W = 58;

export const StackBill = memo(function StackBill({ stack, plan, scale, admin }: {
  stack: WallStack; plan: WallPlan; scale: number; admin: boolean;
}) {
  const room = plan.pairs ? plan.halfRoom : plan.wallW - WALL.halfPad * 2;
  const name = wholeSize(stack.title, 'rye', 18, 14, 4, room, scale);
  // the fan: the stack's first three films, the first in the middle
  const order = [stack.posters[1], stack.posters[0], stack.posters[2]];
  const open = () => nav.push(`/stacks/${stack.id}`);
  return (
    <View style={[s.half, plan.pairs && s.beside, s.brassStock]}>
      <LinearGradient colors={[colors.marqueeGold, colors.sepia]} locations={[0, 0.7]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
      <Halftone opacity={0.10} />
      <Rays color={colors.ink} strength={0.07} cx={room / 2 + WALL.halfPad} cy={130} radius={210} />
      <Slab lines={STACK_BILL.slab} ground={colors.ink} ink={colors.marqueeGold} room={room - WALL.slabPadX * 2} />
      <PressableScale
        style={s.fan}
        onPress={open}
        pressedScale={0.985}
        haptic="selection"
        accessibilityRole="link"
        accessibilityLabel={`Featured stack: ${stack.title}, by @${stack.author.username}, ${stack.films} films. Open the stack.`}
      >
        {FAN.map((f, i) => {
          const p = order[i];
          return (
            <View key={i} style={[s.fanPoster, { zIndex: f.z, transform: [{ translateX: f.shift }, { rotate: `${f.turn}deg` }] }]}>
              {p?.poster_path ? (
                <Image source={{ uri: tmdb.poster(p.poster_path, 'w185') ?? undefined }} style={StyleSheet.absoluteFill}
                  contentFit="cover" cachePolicy="memory-disk" accessible={false} />
              ) : (
                <Text style={s.void} {...UNSPOKEN} maxFontSizeMultiplier={1}>✦</Text>
              )}
            </View>
          );
        })}
      </PressableScale>
      <PressableScale style={s.stackWords} onPress={open} haptic="selection" accessibilityRole="link"
        accessibilityLabel={`${stack.title}. See all ${stack.films} films.`}>
        <Text numberOfLines={4} maxFontSizeMultiplier={1.35}
          style={[s.stackName, { fontSize: name.size, lineHeight: Math.round(name.size * 1.12) }]}>
          {stack.title}
        </Text>
        <View style={s.facts}>
          <Text numberOfLines={1} style={[typeStyle('stackFacts'), s.factText]} {...UNSPOKEN}>{STACK_BILL.films(stack.films)}</Text>
          <HouseLine type="stackFacts" text={STACK_BILL.seeAll} room={room / 2} style={s.factText} spoken={false} />
        </View>
      </PressableScale>
      <View style={s.slogan}>
        {STACK_BILL.slogan.map((line) => (
          <HouseLine key={line} type="slogan" text={line.toUpperCase()} room={room} style={s.sloganInk} />
        ))}
      </View>
      <Credit author={stack.author} keepOff={admin ? <KeepOff kind="list" id={stack.id} what="stack" /> : null} />
    </View>
  );
});

// ── NOTHING YET TO FEATURE ──────────────────────────────────────────────────
export const VacantLogBill = memo(function VacantLogBill({ plan }: { plan: WallPlan }) {
  const room = plan.pairs ? plan.halfRoom : plan.wallW - WALL.halfPad * 2;
  return (
    <View style={[s.half, plan.pairs && s.beside, s.paper, s.vacant]}>
      <Halftone opacity={0.08} />
      <Rays color={colors.crimson} strength={0.10} cx={room * 0.35} cy={140} radius={210} />
      <Slab lines={LOG_BILL.slab} ground={colors.crimson} ink={colors.silverScreen} room={room - WALL.slabPadX * 2} />
      <View style={s.say}>
        {LOG_BILL.vacant.map((line) => <HouseLine key={line} type="vacant" text={line} room={room} style={s.sayPaper} />)}
      </View>
      <PressableScale style={[s.door, s.doorPaper]} onPress={() => nav.push('/log-modal')} haptic="selection"
        accessibilityRole="button" accessibilityLabel="Log a film">
        <HouseLine type="cta" text={LOG_BILL.vacantDoor} room={room - 24} style={s.doorPaperText} spoken={false} />
      </PressableScale>
    </View>
  );
});

export const VacantStackBill = memo(function VacantStackBill({ plan }: { plan: WallPlan }) {
  const room = plan.pairs ? plan.halfRoom : plan.wallW - WALL.halfPad * 2;
  return (
    <View style={[s.half, plan.pairs && s.beside, s.brassStock, s.vacant]}>
      <LinearGradient colors={[colors.marqueeGold, colors.sepia]} locations={[0, 0.7]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
      <Halftone opacity={0.10} />
      <Slab lines={STACK_BILL.slab} ground={colors.ink} ink={colors.marqueeGold} room={room - WALL.slabPadX * 2} />
      <View style={s.say}>
        {STACK_BILL.vacant.map((line) => <HouseLine key={line} type="vacant" text={line} room={room} style={s.sayInk} />)}
      </View>
      <PressableScale style={[s.door, s.doorInk]} onPress={() => nav.push('/list-modal')} haptic="selection"
        accessibilityRole="button" accessibilityLabel="Start a stack">
        <HouseLine type="cta" text={STACK_BILL.vacantDoor} room={room - 24} style={s.doorInkText} spoken={false} />
      </PressableScale>
    </View>
  );
});

const s = StyleSheet.create({
  half: { paddingHorizontal: WALL.halfPad, paddingTop: WALL.halfPad, overflow: 'hidden' },
  // side by side, the two share the row; stacked, each is as tall as its words (a flex: 1 in a column sized by
  // its content splits the height instead, and clips the taller bill)
  beside: { flex: 1, minWidth: 0 },
  paper: { backgroundColor: colors.parchment },
  brassStock: { backgroundColor: colors.sepia },
  vacant: { paddingBottom: WALL.halfPad },
  words: { marginTop: 10 },
  // where the 52pt letter's ink stood on its line, 5 under the slab's gap and 7 over the words
  quoteMark: { marginTop: 5, marginBottom: 7 },
  quoteMarkRtl: { alignSelf: 'flex-end' },
  quote: { fontFamily: fonts.serifItalic, color: colors.ink },
  rtl: { writingDirection: 'rtl', textAlign: 'right', fontFamily: fonts.serif },
  alignRight: { textAlign: 'right' },
  readOn: { flexDirection: 'row', justifyContent: 'flex-end', minHeight: 44, alignItems: 'center' },
  readOnRtl: { justifyContent: 'flex-start' },
  readOnText: { color: colors.bloodReel },
  filmRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, minHeight: 60 },
  filmRowRtl: { flexDirection: 'row-reverse' },
  thumb: {
    width: 40, height: 60, borderWidth: 2, borderColor: colors.silverScreen, backgroundColor: colors.inkwell,
    transform: [{ rotate: '4deg' }], overflow: 'hidden',
  },
  filmMeta: { flex: 1, minWidth: 0 },
  filmLine: { color: colors.bloodReel },
  reels: { flexDirection: 'row', marginTop: 4 },
  reelsRtl: { justifyContent: 'flex-end' },
  slogan: { marginTop: 'auto', paddingTop: 10 },
  sloganPaper: { color: colors.bloodReel, lineHeight: 15 },
  sloganInk: { color: colors.ink, lineHeight: 15 },
  credit: {
    ...EDGE_LIT,
    marginTop: 10, marginHorizontal: -WALL.halfPad, paddingHorizontal: WALL.halfPad, paddingTop: 8, paddingBottom: 9,
    backgroundColor: colors.soot,
  },
  creditLine: { flexDirection: 'row', alignItems: 'center', minHeight: 24 },
  creditLine2: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: CREDIT_GAP, minHeight: 18, paddingLeft: 2 },
  fan: { height: 112, marginTop: 12, alignItems: 'center', justifyContent: 'flex-end' },
  fanPoster: {
    position: 'absolute', bottom: 4, width: FAN_W, height: FAN_W * 1.5,
    borderWidth: 2, borderColor: colors.silverScreen, backgroundColor: colors.inkwell,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
  },
  void: { color: colors.sepia, fontSize: 14 },
  stackWords: { marginTop: 8 },
  stackName: { fontFamily: fonts.display, color: colors.ink },
  facts: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginTop: 4, minHeight: 20 },
  factText: { color: colors.ink },
  say: { marginTop: 16 },
  sayPaper: { color: colors.ink, lineHeight: 21 },
  sayInk: { color: colors.ink, lineHeight: 21 },
  door: { marginTop: 'auto', alignSelf: 'flex-start', minHeight: 44, borderWidth: 1, paddingHorizontal: 12, justifyContent: 'center', maxWidth: '100%' },
  doorPaper: { borderColor: colors.bloodReel },
  doorPaperText: { color: colors.bloodReel },
  doorInk: { borderColor: colors.ink },
  doorInkText: { color: colors.ink },
});
