/**
 * II · THE FEATURED LOG (printed on paper) and III · THE FEATURED STACK (printed
 * on brass) — side by side and of one height on every phone, at every text
 * size. Each half sets its words to its own width (planWall's `pair`): a phrase
 * too wide for a line breaks between its words, the stack's count stands over
 * SEE ALL, and a film's name too wide beside its poster goes under it.
 * ─────────────────────────────────────────────────────────────────────────────
 * The member's name, portrait and rank mark stand in a CREDIT BLOCK at each
 * bill's foot, printed in the bill's own ink with the stock round it: the rank
 * mark (RankBadge) is made for a dark ground — the Auteur's plate is a wash over
 * near-black, the Archivist's a hairline with no ground at all — and on paper or
 * brass it could not be read.
 *
 * No counts: the Lobby names the honoured; the log's own page counts them.
 */
import React, { memo } from 'react';
import { RemoteImage, PosterMark } from '@/src/components/Picture';
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from '@/src/components/text';
import PressableScale from '@/src/components/PressableScale';
import { ReelRating, reelsWidth } from '@/src/components/Decorative';
import { colors, fonts } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';
import { nav } from '@/src/utils/typedRouter';
import { isRTLText, RTL_MARK } from '@/src/utils/text';
import { UNSPOKEN } from '@/src/components/dispatch/paper/paperMetrics';
import { Halftone, HouseLine, Mark, Person, QuoteMark, Rays, Slab, typeStyle } from './parts';
import { balancedWidth, filmLine, nameLines, quoteSize, WALL, wholeName, type WallPlan } from './measure';
import { LOG_BILL, STACK_BILL } from './words';
import type { WallLog, WallStack } from './wallRead';
import { KeepOff } from './KeepOff';
import { counted } from '@/src/utils/counted';

/** Between the credit's name and its mark's line. */
const CREDIT_GAP = 6;

/** The credit block: a member's portrait, name and rank mark, printed in ink on the bill. */
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

/**
 * Words set in lines planWall broke them into, heard as the phrases they were
 * written as: one stop for a screen reader, never a stop per line.
 */
const Lines = memo(function Lines({ lines, said, type, room, style, box }: {
  lines: readonly string[];
  /** the words as written, for a screen reader */
  said: readonly string[];
  type: 'slogan' | 'vacant';
  room: number;
  style: StyleProp<TextStyle>;
  box: StyleProp<ViewStyle>;
}) {
  return (
    <View style={box} accessible accessibilityLabel={said.join(' ')}>
      {lines.map((line, i) => <HouseLine key={i} type={type} text={line} room={room} style={style} spoken={false} />)}
    </View>
  );
});

const Slogan = ({ lines, said, room, style }: {
  lines: readonly string[]; said: readonly string[]; room: number; style: StyleProp<TextStyle>;
}) => <Lines lines={lines} said={said} type="slogan" room={room} style={style} box={s.slogan} />;

/** A rating's reels, beside or under the film's poster. */
const REEL = 13;

// ── THE FEATURED LOG ────────────────────────────────────────────────────────
export const LogBill = memo(function LogBill({ log, plan, scale, admin }: {
  log: WallLog; plan: WallPlan; scale: number; admin: boolean;
}) {
  const { pair } = plan;
  const room = pair.room;
  const rtl = isRTLText(log.words);
  const size = quoteSize(log.words.length);
  // a short quote's lines come out even (React Native has no text-wrap: balance);
  // Arabic is set at the full width — its letters are not in the measured faces
  const quoteW = rtl ? room : balancedWidth(log.words, 'spectralItalic', size, scale, room);
  const rating = typeof log.rating === 'number' && log.rating > 0 ? log.rating : 0;
  const film = filmLine(log.film.title, room, scale, rating ? reelsWidth(REEL) : 0);
  const filmName = (
    <Text numberOfLines={film.lines} maxFontSizeMultiplier={film.cap}
      style={[typeStyle('filmLine'), s.filmLine, { fontSize: film.size }, !film.beside && s.filmUnder, rtl && s.alignRight]}>
      {LOG_BILL.on(log.film.title)}
    </Text>
  );
  // beside the poster, under its name; else under the poster and the name, across the half
  const reels = rating ? (
    <View style={[s.reels, film.reelsBeside ? film.beside && s.reelsUnder : s.reelsBelow, rtl && s.reelsRtl]}>
      <ReelRating rating={rating} size={REEL} />
    </View>
  ) : null;
  return (
    <View style={[s.half, s.paper]}>
      <Halftone opacity={0.08} />
      <Rays color={colors.crimson} strength={0.10} cx={room * 0.35} cy={140} radius={210} />
      <Slab lines={LOG_BILL.slab} ground={colors.crimson} ink={colors.silverScreen} room={pair.slabRoom} />
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
          numberOfLines={pair.quoteLines}
          style={[s.quote, { fontSize: size, lineHeight: Math.round(size * 1.32) }, rtl ? s.rtl : { maxWidth: quoteW }]}
        >
          {rtl ? RTL_MARK : null}{log.words}
        </Text>
        <View style={[s.readOn, rtl && s.readOnRtl]}>
          <HouseLine type="cta" text={LOG_BILL.readOn} room={room} style={s.readOnText} spoken={false} />
        </View>
      </PressableScale>
      <PressableScale
        style={s.film}
        onPress={() => nav.push(`/film/${log.film.id}`)}
        haptic="selection"
        accessibilityRole="link"
        accessibilityLabel={`${log.film.title}${log.rating ? `, rated ${log.rating} of 5` : ''}. Open the film.`}
      >
        <View style={[s.filmRow, rtl && s.filmRowRtl]}>
          <View style={s.thumb}>
            <RemoteImage uri={tmdb.poster(log.film.poster_path, 'w92')} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} fallback={<PosterMark style={StyleSheet.absoluteFill} size={12} ground={false} />} />
          </View>
          <View style={s.filmMeta}>
            {film.beside ? filmName : null}
            {film.reelsBeside ? reels : null}
          </View>
        </View>
        {film.beside ? null : filmName}
        {film.reelsBeside ? null : reels}
      </PressableScale>
      <Slogan lines={pair.log.slogan} said={LOG_BILL.slogan} room={room} style={s.sloganPaper} />
      <Credit author={log.author} keepOff={admin ? <KeepOff kind="log" id={log.id} what="log" room={plan.switchRoom.credit} lines={pair.keepOff} /> : null} />
    </View>
  );
});

// ── THE FEATURED STACK ──────────────────────────────────────────────────────
const FAN_W = 58;
const FAN_TURN = 12;
const FAN = [{ turn: -FAN_TURN, side: -1, z: 1 }, { turn: 0, side: 0, z: 2 }, { turn: FAN_TURN, side: 1, z: 1 }] as const;
/** A turned poster's width: its own width turned, and what its height brings in. */
const TURNED_W = FAN_W * Math.cos((FAN_TURN * Math.PI) / 180) + FAN_W * 1.5 * Math.sin((FAN_TURN * Math.PI) / 180);
/** The outer posters' shift from the middle: 30 at most, fanEdge clear of each edge. */
const fanShift = (halfW: number) => Math.min(30, (halfW - WALL.fanEdge * 2 - TURNED_W) / 2);

export const StackBill = memo(function StackBill({ stack, plan, scale, admin }: {
  stack: WallStack; plan: WallPlan; scale: number; admin: boolean;
}) {
  const { pair } = plan;
  const room = pair.room;
  const lines = nameLines(room);
  const name = wholeName(stack.title, 'rye', 18, 14, lines, room, scale);
  const shift = fanShift(pair.width);
  // the fan: the stack's first three films, the first in the middle
  const order = [stack.posters[1], stack.posters[0], stack.posters[2]];
  const open = () => nav.push(`/stacks/${stack.id}`);
  return (
    <View style={[s.half, s.brassStock]}>
      <LinearGradient colors={[colors.marqueeGold, colors.sepia]} locations={[0, 0.7]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
      <Halftone opacity={0.10} />
      <Rays color={colors.ink} strength={0.07} cx={room / 2 + WALL.halfPad} cy={130} radius={210} />
      <Slab lines={STACK_BILL.slab} ground={colors.ink} ink={colors.marqueeGold} room={pair.slabRoom} />
      <PressableScale
        style={s.fan}
        onPress={open}
        pressedScale={0.985}
        haptic="selection"
        accessibilityRole="link"
        accessibilityLabel={`Featured stack: ${stack.title}, by @${stack.author.username}, ${counted(stack.films, 'film', 'films')}. Open the stack.`}
      >
        {FAN.map((f, i) => {
          const p = order[i];
          return (
            <View key={i} style={[s.fanPoster, { zIndex: f.z, transform: [{ translateX: f.side * shift }, { rotate: `${f.turn}deg` }] }]}>
              <RemoteImage uri={tmdb.poster(p?.poster_path, 'w185')} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} fallback={<Text style={s.void} {...UNSPOKEN} maxFontSizeMultiplier={1}>✦</Text>} />
            </View>
          );
        })}
      </PressableScale>
      <PressableScale style={s.stackWords} onPress={open} haptic="selection" accessibilityRole="link"
        accessibilityLabel={`${stack.title}. See all ${counted(stack.films, 'film', 'films')}.`}>
        <Text numberOfLines={lines} maxFontSizeMultiplier={name.cap}
          style={[s.stackName, { fontSize: name.size, lineHeight: Math.round(name.size * 1.12) }]}>
          {stack.title}
        </Text>
        <View style={[s.facts, pair.factsStacked && s.factsStacked]}>
          <Text numberOfLines={1} style={[typeStyle('stackFacts'), s.factText]} {...UNSPOKEN}>{STACK_BILL.films(stack.films)}</Text>
          <HouseLine type="stackFacts" text={STACK_BILL.seeAll} room={pair.seeAllRoom}
            style={[s.factText, pair.factsStacked && s.seeAllUnder]} spoken={false} />
        </View>
      </PressableScale>
      <Slogan lines={pair.stack.slogan} said={STACK_BILL.slogan} room={room} style={s.sloganInk} />
      <Credit author={stack.author} keepOff={admin ? <KeepOff kind="list" id={stack.id} what="stack" room={plan.switchRoom.credit} lines={pair.keepOff} /> : null} />
    </View>
  );
});

// ── NOTHING YET TO FEATURE ──────────────────────────────────────────────────
/** A vacant bill's door: its words in the lines planWall set them in, centred on one another. */
const Door = ({ lines, room, style }: { lines: readonly string[]; room: number; style: StyleProp<TextStyle> }) => (
  <>{lines.map((line, i) => <HouseLine key={i} type="cta" text={line} room={room} style={style} spoken={false} />)}</>
);

export const VacantLogBill = memo(function VacantLogBill({ plan }: { plan: WallPlan }) {
  const { pair } = plan;
  return (
    <View style={[s.half, s.paper, s.vacant]}>
      <Halftone opacity={0.08} />
      <Rays color={colors.crimson} strength={0.10} cx={pair.room * 0.35} cy={140} radius={210} />
      <Slab lines={LOG_BILL.slab} ground={colors.crimson} ink={colors.silverScreen} room={pair.slabRoom} />
      <Lines lines={pair.log.vacant} said={LOG_BILL.vacant} type="vacant" room={pair.room} style={s.sayPaper} box={s.say} />
      <PressableScale style={s.door} onPress={() => nav.push('/log-modal')} haptic="selection"
        accessibilityRole="button" accessibilityLabel="Log a film">
        <View style={[s.doorPlate, s.doorPaper]}>
          <Door lines={pair.log.door} room={pair.doorRoom} style={s.doorPaperText} />
        </View>
      </PressableScale>
    </View>
  );
});

export const VacantStackBill = memo(function VacantStackBill({ plan }: { plan: WallPlan }) {
  const { pair } = plan;
  return (
    <View style={[s.half, s.brassStock, s.vacant]}>
      <LinearGradient colors={[colors.marqueeGold, colors.sepia]} locations={[0, 0.7]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
      <Halftone opacity={0.10} />
      <Slab lines={STACK_BILL.slab} ground={colors.ink} ink={colors.marqueeGold} room={pair.slabRoom} />
      <Lines lines={pair.stack.vacant} said={STACK_BILL.vacant} type="vacant" room={pair.room} style={s.sayInk} box={s.say} />
      <PressableScale style={s.door} onPress={() => nav.push('/list-modal')} haptic="selection"
        accessibilityRole="button" accessibilityLabel="Start a stack">
        <View style={[s.doorPlate, s.doorInk]}>
          <Door lines={pair.stack.door} room={pair.doorRoom} style={s.doorInkText} />
        </View>
      </PressableScale>
    </View>
  );
});

const s = StyleSheet.create({
  // the two share the row, half each (flex: 1 in a row: an equal share, never its words' width)
  half: { flex: 1, minWidth: 0, paddingHorizontal: WALL.halfPad, paddingTop: WALL.halfPad, overflow: 'hidden' },
  paper: { backgroundColor: colors.paper },
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
  // 60 tall at least, so PressableScale adds no halo that would reach the quote's door above
  film: { marginTop: 4, minHeight: 60 },
  filmRow: { flexDirection: 'row', alignItems: 'center', gap: WALL.filmGap, minHeight: 60 },
  filmRowRtl: { flexDirection: 'row-reverse' },
  thumb: {
    width: WALL.filmThumb, height: 60, borderWidth: 2, borderColor: colors.silverScreen, backgroundColor: colors.inkwell,
    transform: [{ rotate: '4deg' }], overflow: 'hidden',
  },
  filmMeta: { flex: 1, minWidth: 0 },
  filmLine: { color: colors.bloodReel },
  // under the poster and its reels, across the half
  filmUnder: { marginTop: 8 },
  reels: { flexDirection: 'row' },
  reelsUnder: { marginTop: 4 },
  reelsBelow: { marginTop: 8 },
  reelsRtl: { justifyContent: 'flex-end' },
  slogan: { marginTop: 'auto', paddingTop: 10 },
  sloganPaper: { color: colors.bloodReel, lineHeight: 15 },
  sloganInk: { color: colors.ink, lineHeight: 15 },
  // a block printed in the bill's own ink, the stock round it: the mark keeps the dark ground it is made for
  credit: {
    marginTop: 10, marginBottom: WALL.halfPad, paddingHorizontal: WALL.creditPad, paddingTop: 7, paddingBottom: 8,
    backgroundColor: colors.ink,
  },
  creditLine: { flexDirection: 'row', alignItems: 'center', minHeight: 24 },
  creditLine2: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: CREDIT_GAP, minHeight: 18, paddingLeft: WALL.creditInset },
  fan: { height: 112, marginTop: 12, alignItems: 'center', justifyContent: 'flex-end' },
  fanPoster: {
    position: 'absolute', bottom: 4, width: FAN_W, height: FAN_W * 1.5,
    borderWidth: 2, borderColor: colors.silverScreen, backgroundColor: colors.inkwell,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
  },
  void: { color: colors.sepia, fontSize: 14 },
  stackWords: { marginTop: 8 },
  stackName: { fontFamily: fonts.display, color: colors.ink },
  facts: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: WALL.factsGap, marginTop: 4, minHeight: 20 },
  // the count over SEE ALL, which stands at the right as the log's READ does
  factsStacked: { flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'flex-start', gap: 2 },
  seeAllUnder: { alignSelf: 'flex-end' },
  factText: { color: colors.ink },
  say: { marginTop: 16 },
  sayPaper: { color: colors.ink, lineHeight: 21 },
  sayInk: { color: colors.ink, lineHeight: 21 },
  // a full finger tall; in it, a plate printed at the slab's slant, as the bill's name is: two lines where its
  // words need them, centred on one another (the slant is the plate's: PressableScale's own transform is the press)
  door: { marginTop: 'auto', alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', maxWidth: '100%' },
  doorPlate: {
    paddingHorizontal: WALL.halfDoorPad, paddingTop: 6, paddingBottom: 5, alignItems: 'center',
    transform: [{ rotate: '-3deg' }],
  },
  doorPaper: { backgroundColor: colors.bloodReel },
  doorPaperText: { color: colors.paper },
  doorInk: { backgroundColor: colors.ink },
  doorInkText: { color: colors.marqueeGold },
});
