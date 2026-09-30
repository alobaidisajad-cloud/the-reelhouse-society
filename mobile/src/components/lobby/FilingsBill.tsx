/**
 * IV · FEATURED FILINGS — the Dispatch's bill: a crimson head over the card, the
 * first filing across the whole bill, the next two side by side (one above the
 * other where a column cannot hold its kind's name at the member's size).
 * ─────────────────────────────────────────────────────────────────────────────
 * Three columns, always: a column the day has no filing for stands VACANT and
 * opens the composer ("The page has room. The house suggests you."). The kind
 * wears its own colour and name, from the Dispatch's own tables (KIND_RULE,
 * nameOf), and the opening is the Dispatch's own excerpt (excerptFor). Every
 * author wears their rank's mark. No counts.
 */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Text } from '@/src/components/text';
import PressableScale from '@/src/components/PressableScale';
import { colors, fonts } from '@/src/theme/theme';
import { EDGE_LIT } from '@/src/theme/light';
import { nav } from '@/src/utils/typedRouter';
import { isRTLText, RTL_MARK } from '@/src/utils/text';
import { KIND_RULE, nameOf, UNSPOKEN } from '@/src/components/dispatch/paper/paperMetrics';
import { excerptFor } from '@/src/components/dispatch/excerpt';
import { readTimeForWords } from '@/src/components/dispatch/readTime';
import { HouseLine, Mark, Person } from './parts';
import { WALL, type WallPlan } from './measure';
import { FILINGS_BILL } from './words';
import type { WallFiling } from './wallRead';
import { KeepOff } from './KeepOff';

/** A filing's number: its column, and the gap before its words. */
const NUM_W = 22;
const NUM_GAP = 10;
/** A kind's row: READ › or FILE › at its end, as wide as this at most, this far from the kind. */
const DOOR_WORDS = 60;
const KIND_GAP = 8;
/**
 * The byline's halo: none up or down (the row is 44 tall); to the left half the
 * inset, where a runner may stand beside it; to the right half the row's gap,
 * where the rank's mark or the admin's switch stands.
 */
const BY_GAP = 7;
const BY_HALO = { top: 0, bottom: 0, left: WALL.filingPad / 2, right: BY_GAP / 2 } as const;

const inkOf = (kind: string) => KIND_RULE[kind.toLowerCase() as keyof typeof KIND_RULE] ?? colors.parchment;
const kindLabel = (f: WallFiling) =>
  `✦ ${nameOf(f.kind)}${f.kind.toLowerCase() === 'dossier' ? ` · ${readTimeForWords(f.words)}` : ''}`;

const Filing = memo(function Filing({ filing, place, lead, room, admin }: {
  filing: WallFiling; place: number; lead: boolean; room: number; admin: boolean;
}) {
  const ink = inkOf(filing.kind);
  const opening = excerptFor(filing.text, 220);
  const title = filing.title?.trim() || null;
  const rtl = isRTLText(title ?? opening);
  // The byline stands OUTSIDE the filing's door, as its own row: a door is one
  // element to a screen reader, and a name inside it could never be reached.
  return (
    <View>
      <PressableScale
        style={[s.filing, !lead && s.runner]}
        // its box already holds its inset: a halo would only reach its neighbours
        hitSlop={0}
        onPress={() => nav.push(`/dispatch/${filing.id}`)}
        pressedScale={0.99}
        haptic="selection"
        accessibilityRole="link"
        accessibilityLabel={`Featured filing ${place}, a ${nameOf(filing.kind).toLowerCase()} by @${filing.author.username}${title ? `: ${title}` : ''}. Read it.`}
      >
        <Text style={[s.num, !lead && s.numRunner]} {...UNSPOKEN} maxFontSizeMultiplier={1.2}>{place}</Text>
        <View style={s.body}>
          <View style={s.kindRow}>
            <HouseLine type="kind" text={kindLabel(filing)} room={room - (lead ? DOOR_WORDS + KIND_GAP : 0)} style={{ color: ink, flexShrink: 1 }} spoken={false} />
            {lead ? <HouseLine type="cta" text={FILINGS_BILL.readOn} room={DOOR_WORDS} style={s.readOn} spoken={false} /> : null}
          </View>
          {title ? (
            <Text numberOfLines={lead ? 2 : 3} style={[s.title, !lead && s.titleRunner, rtl && s.rtl]}>
              {rtl ? RTL_MARK : null}{title}
            </Text>
          ) : null}
          {opening ? (
            <Text numberOfLines={2} style={[s.opening, !lead && s.openingRunner, rtl && s.rtlPlain]}>
              {rtl ? RTL_MARK : null}{opening}
            </Text>
          ) : null}
        </View>
      </PressableScale>
      <View style={[s.by, lead && s.byLead]}>
        {/* a full finger tall in its own row; its halo only sideways, and on the left no further than half its inset */}
        <Person author={filing.author} style={s.byPerson} hitSlop={BY_HALO} />
        <Mark author={filing.author} />
        {admin ? <KeepOff kind="post" id={filing.id} what="filing" /> : null}
      </View>
    </View>
  );
});

const Vacant = memo(function Vacant({ place, empty, anything, room }: { place: number; empty: 1 | 2 | 3; anything: boolean; room: number }) {
  const lines = anything ? FILINGS_BILL.roomLeft : FILINGS_BILL.nothingYet;
  return (
    <PressableScale
      style={[s.filing, s.vacant]}
      hitSlop={0}
      onPress={() => nav.push('/dispatch/compose')}
      haptic="selection"
      accessibilityRole="button"
      accessibilityLabel={`${FILINGS_BILL.vacant(empty).toLowerCase()}. ${lines.join(' ')} File one.`}
    >
      <Text style={[s.num, s.numVacant]} {...UNSPOKEN} maxFontSizeMultiplier={1.2}>{place}</Text>
      <View style={s.body}>
        <View style={s.kindRow}>
          <HouseLine type="kind" text={FILINGS_BILL.vacant(empty)} room={room - DOOR_WORDS - KIND_GAP} style={s.vacantKind} spoken={false} />
          <HouseLine type="cta" text={FILINGS_BILL.file} room={DOOR_WORDS} style={s.readOn} spoken={false} />
        </View>
        <View style={s.vacantSay}>
          {lines.map((line) => <HouseLine key={line} type="vacantFiling" text={line} room={room} style={s.vacantLine} spoken={false} />)}
        </View>
      </View>
    </PressableScale>
  );
});

export const FilingsBill = memo(function FilingsBill({ filings, plan, admin }: { filings: WallFiling[]; plan: WallPlan; admin: boolean }) {
  const router = useRouter();
  const [lead, ...runners] = filings;
  const empty = (3 - filings.length) as 0 | 1 | 2 | 3;
  const leadRoom = plan.wallW - 2 - WALL.filingPad * 2 - NUM_W - NUM_GAP;
  const runnerRoom = plan.runners ? (plan.wallW - 2) / 2 - WALL.filingPad * 2 : leadRoom;
  return (
    <View style={s.bill}>
      <View style={[s.banner, plan.bannerStacked && s.bannerStacked]}>
        <View style={s.bannerWords} accessible accessibilityRole="header" accessibilityLabel={`${FILINGS_BILL.name}, from the Dispatch`}>
          <HouseLine type="bannerKick" text={FILINGS_BILL.kick} room={plan.bannerWordsRoom} style={s.bannerKick} spoken={false} />
          <HouseLine type="bannerName" text={FILINGS_BILL.name} room={plan.bannerWordsRoom} style={s.bannerName} spoken={false} />
        </View>
        {/* a full finger tall, its halo only sideways: it can never reach the filing below */}
        <PressableScale
          style={s.bannerDoor}
          hitSlop={{ top: 0, bottom: 0 }}
          onPress={() => router.navigate('/dispatch' as Href)}
          haptic="selection"
          accessibilityRole="link"
          accessibilityLabel="Open the Dispatch"
        >
          <HouseLine type="cta" text={FILINGS_BILL.door} room={plan.bannerDoorRoom} style={s.bannerDoorText} spoken={false} />
        </PressableScale>
      </View>
      {lead ? <Filing filing={lead} place={1} lead room={leadRoom} admin={admin} /> : null}
      {runners.length ? (
        <View style={[s.runners, !plan.runners && s.runnersStacked]}>
          {runners.map((f, i) => (
            <View key={f.id} style={[plan.runners && s.runnerCell, i > 0 && (plan.runners ? s.runnerCellBeside : s.runnerCellBelow)]}>
              <Filing filing={f} place={i + 2} lead={false} room={runnerRoom} admin={admin} />
            </View>
          ))}
        </View>
      ) : null}
      {empty > 0 ? <Vacant place={filings.length + 1} empty={empty as 1 | 2 | 3} anything={filings.length > 0} room={leadRoom} /> : null}
      <View style={s.foot}>
        {FILINGS_BILL.slogan.map((line) => (
          <HouseLine key={line} type="slogan" text={line.toUpperCase()} room={plan.wallW - 30} style={s.footLine} />
        ))}
      </View>
    </View>
  );
});

const s = StyleSheet.create({
  bill: { ...EDGE_LIT, backgroundColor: colors.soot, borderWidth: 1, borderColor: colors.sepiaBorder, overflow: 'hidden' },
  banner: {
    backgroundColor: colors.crimson, paddingHorizontal: WALL.bannerPad, paddingTop: 11, paddingBottom: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: WALL.bannerGap,
  },
  bannerStacked: { flexDirection: 'column', alignItems: 'flex-start' },
  bannerWords: { flexShrink: 1, minWidth: 0 },
  bannerKick: { color: colors.parchment },
  bannerName: { color: colors.silverScreen, lineHeight: 23 },
  bannerDoor: { minHeight: 44, borderWidth: 1, borderColor: colors.parchmentDim, paddingHorizontal: WALL.doorPadX, justifyContent: 'center' },
  bannerDoorText: { color: colors.silverScreen },
  filing: { flexDirection: 'row', gap: NUM_GAP, paddingHorizontal: WALL.filingPad, paddingTop: 12, paddingBottom: 0 },
  runner: { flexDirection: 'column', gap: 4 },
  num: { fontFamily: fonts.display, fontSize: 34, lineHeight: 34, color: colors.crimsonInk, minWidth: NUM_W, textAlign: 'center' },
  numRunner: { fontSize: 26, lineHeight: 28, textAlign: 'left' },
  numVacant: { color: colors.fog },
  body: { flex: 1, minWidth: 0 },
  kindRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: KIND_GAP, minHeight: 16 },
  readOn: { color: colors.sepia },
  title: { fontFamily: fonts.display, fontSize: 17, lineHeight: 20.5, color: colors.silverScreen, marginTop: 4 },
  titleRunner: { fontSize: 15, lineHeight: 18 },
  opening: { fontFamily: fonts.serifItalic, fontSize: 13.5, lineHeight: 19, color: colors.bone, marginTop: 3 },
  openingRunner: { fontSize: 13, lineHeight: 18.5 },
  rtl: { writingDirection: 'rtl', textAlign: 'right' },
  rtlPlain: { writingDirection: 'rtl', textAlign: 'right', fontFamily: fonts.serif },
  // 44 tall, the byline's own tap: its name stands 11 under the words and 12 over the rule below
  by: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: BY_GAP,
    paddingLeft: WALL.filingPad + 2, paddingRight: WALL.filingPad, paddingTop: 1, paddingBottom: 2,
  },
  byLead: { paddingLeft: WALL.filingPad + NUM_W + NUM_GAP + 2 },
  byPerson: { minHeight: 44 },
  runners: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.sepiaBorder },
  runnersStacked: { flexDirection: 'column' },
  // beside only: stacked, a runner is as tall as its words
  runnerCell: { flex: 1, minWidth: 0 },
  runnerCellBeside: { borderLeftWidth: 1, borderLeftColor: colors.sepiaBorder },
  runnerCellBelow: { borderTopWidth: 1, borderTopColor: colors.sepiaBorder },
  vacant: { paddingBottom: 11, borderTopWidth: 1, borderTopColor: colors.sepiaBorder },
  vacantKind: { color: colors.fog, flexShrink: 1 },
  vacantSay: { marginTop: 4 },
  vacantLine: { color: colors.fogQuiet, lineHeight: 20 },
  foot: { borderTopWidth: 1, borderTopColor: colors.sepiaBorder, paddingVertical: 9, paddingHorizontal: 14, alignItems: 'center' },
  footLine: { color: colors.sepia, lineHeight: 15, textAlign: 'center' },
});
