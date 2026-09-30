/**
 * V · TAKE YOUR RANK — a paper banner with the house's own eye, and the
 * Society's own tickets (their stock, their perforated stub) for the ranks the
 * member does not hold. Each ticket opens the Society page with its rank
 * chosen. An Auteur holds everything: the house thanks them, once, and the
 * ticket is their own file.
 */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Line } from 'react-native-svg';
import { useRouter, type Href } from 'expo-router';
import { Text } from '@/src/components/text';
import PressableScale from '@/src/components/PressableScale';
import { ReelEyeIcon } from '@/src/components/ReelEyeIcon';
import { colors } from '@/src/theme/theme';
import { openSociety } from '@/src/utils/openSociety';
import type { Rank } from '@/src/components/RankBadge';
import { Halftone, HouseLine, Rays } from './parts';
import { WALL, type WallPlan } from './measure';
import { RANK_BILL, rankTicket } from './words';

/** Two tickets stand WALL.ticketGap apart, beside or above one another: each reaches half of that. */
const TICKET_HALO = WALL.ticketGap / 2;

const Ticket = memo(function Ticket({ rank, room, beside }: { rank: 'archivist' | 'auteur'; room: number; beside: boolean }) {
  const t = rankTicket(rank);
  const aut = rank === 'auteur';
  return (
    <PressableScale
      style={[s.ticket, beside && s.ticketBeside, aut && s.ticketAut]}
      hitSlop={TICKET_HALO}
      onPress={() => openSociety(`/membership?rank=${rank}`)}
      pressedScale={0.98}
      haptic="selection"
      accessibilityRole="link"
      accessibilityLabel={`Enlist as ${t.name}. ${t.lines.join(' ')} See the privileges.`}
    >
      <LinearGradient
        colors={aut ? [colors.ticketAuteurHead, colors.ticketAuteurFoot] : [colors.ticketHead, colors.frame]}
        style={StyleSheet.absoluteFill}
      />
      <View style={s.ticketBody}>
        <HouseLine type="ticketKick" text={RANK_BILL.enlistAs} room={room} style={s.ticketKick} spoken={false} />
        <HouseLine type="ticketName" text={t.name} room={room} style={[s.ticketName, aut && s.ticketNameAut]} spoken={false} />
        <View style={s.ticketLines}>
          {t.lines.map((line) => <HouseLine key={line} type="ticketLine" text={line} room={room} style={s.ticketLine} spoken={false} />)}
        </View>
        <View style={[s.ticketDoor, aut && s.ticketDoorAut]}>
          <HouseLine type="ticketDoor" text={RANK_BILL.privileges} room={room - 16} style={[s.ticketDoorText, aut && s.ticketDoorTextAut]} spoken={false} />
          <Text style={[s.ticketDoorText, aut && s.ticketDoorTextAut]} maxFontSizeMultiplier={1.2}>›</Text>
        </View>
      </View>
      <Stub auteur={aut} />
    </PressableScale>
  );
});

/**
 * The ticket's torn stub: a perforation and a punched hole. The perforation is
 * a drawn line, as the Society's own ticket draws it: iOS draws a dashed BORDER
 * only when all four sides have one.
 */
const Stub = memo(function Stub({ auteur }: { auteur: boolean }) {
  const ink = auteur ? colors.stampRuleInner : colors.sepiaBorderStrong;
  return (
    <View style={s.stub} pointerEvents="none">
      <Svg style={s.perforation} width={2} height="100%">
        <Line x1={1} y1={0} x2={1} y2="100%" stroke={ink} strokeWidth={1.5} strokeDasharray="4,3" />
      </Svg>
      <View style={[s.hole, { borderColor: ink }]} />
    </View>
  );
});

export const RankBill = memo(function RankBill({ plan, viewer }: { plan: WallPlan; viewer: Rank }) {
  const router = useRouter();
  const banner = (lines: readonly string[], sub: readonly string[]) => {
    const room = plan.recruitStacked
      ? plan.wallW - WALL.recruitMargin * 2 - WALL.recruitPad * 2
      : plan.wallW - WALL.recruitMargin * 2 - WALL.recruitPad * 2 - WALL.recruitEye - WALL.recruitGap;
    return (
      <View style={[s.recruit, plan.recruitStacked && s.recruitStacked]}>
        <Halftone opacity={0.08} />
        <Rays color={colors.crimson} strength={0.12} cx={WALL.recruitPad + WALL.recruitEye / 2} cy={50} radius={130} />
        <ReelEyeIcon size={WALL.recruitEye} color={colors.crimson} />
        <View style={[s.recruitWords, plan.recruitStacked && s.recruitWordsStacked]} accessible accessibilityRole="header"
          accessibilityLabel={`${lines.join(' ')}. ${sub.join(' ')}`}>
          {lines.map((l) => <HouseLine key={l} type="recruitName" text={l} room={room} style={[s.recruitName, plan.recruitStacked && s.center]} spoken={false} />)}
          <View style={s.recruitSub}>
            {sub.map((l) => <HouseLine key={l} type="recruitSub" text={l} room={room} style={[s.recruitSubLine, plan.recruitStacked && s.center]} spoken={false} />)}
          </View>
        </View>
      </View>
    );
  };

  if (viewer === 'auteur') {
    return (
      <View style={s.rank}>
        {banner(RANK_BILL.thanks, RANK_BILL.thanksSub)}
        <PressableScale
          style={[s.ticket, s.ticketAut]}
          hitSlop={TICKET_HALO}
          onPress={() => router.navigate('/profile' as Href)}
          haptic="selection"
          accessibilityRole="link"
          accessibilityLabel="Your file"
        >
          <LinearGradient colors={[colors.ticketAuteurHead, colors.ticketAuteurFoot]} style={StyleSheet.absoluteFill} />
          <View style={[s.ticketBody, s.ticketBodyOnly]}>
            <View style={[s.ticketDoor, s.ticketDoorAut, s.ticketDoorOnly]}>
              <HouseLine type="ticketDoor" text={RANK_BILL.yourFile} room={plan.wallW - 60} style={[s.ticketDoorText, s.ticketDoorTextAut]} spoken={false} />
              <Text style={[s.ticketDoorText, s.ticketDoorTextAut]} maxFontSizeMultiplier={1.2}>›</Text>
            </View>
          </View>
          <Stub auteur />
        </PressableScale>
      </View>
    );
  }

  const ranks: ('archivist' | 'auteur')[] = viewer === 'archivist' ? ['auteur'] : ['archivist', 'auteur'];
  const beside = ranks.length === 2 && plan.tickets;
  const ticketW = beside ? (plan.wallW - WALL.ticketGap) / 2 : plan.wallW;
  const ticketRoom = ticketW - 2 - WALL.ticketStub - WALL.ticketPad * 2;
  return (
    <View style={s.rank}>
      {banner([RANK_BILL.name], viewer === 'archivist' ? RANK_BILL.subArchivist : RANK_BILL.sub)}
      <View style={[s.tickets, !beside && s.ticketsStacked]}>
        {ranks.map((r) => <Ticket key={r} rank={r} room={ticketRoom} beside={beside} />)}
      </View>
      <View style={s.fine}>
        {RANK_BILL.fine.map((l) => <HouseLine key={l} type="fine" text={l} room={plan.wallW} style={s.fineLine} />)}
      </View>
    </View>
  );
});

const s = StyleSheet.create({
  rank: { gap: WALL.gap },
  recruit: {
    marginHorizontal: WALL.recruitMargin, paddingHorizontal: WALL.recruitPad, paddingVertical: 12,
    backgroundColor: colors.parchment, flexDirection: 'row', alignItems: 'center', gap: WALL.recruitGap,
    transform: [{ rotate: '-1deg' }], overflow: 'hidden',
  },
  recruitStacked: { flexDirection: 'column' },
  recruitWords: { flex: 1, minWidth: 0 },
  recruitWordsStacked: { flex: 0, alignSelf: 'stretch', alignItems: 'center' },
  recruitName: { color: colors.ink, lineHeight: 26 },
  recruitSub: { marginTop: 5 },
  recruitSubLine: { color: colors.ink, lineHeight: 16.5 },
  center: { textAlign: 'center' },
  tickets: { flexDirection: 'row', gap: WALL.ticketGap },
  ticketsStacked: { flexDirection: 'column' },
  ticket: { flexDirection: 'row', borderWidth: 1, borderColor: colors.sepiaBorder, overflow: 'hidden', minHeight: 44 },
  // beside only: stacked, a ticket is as tall as its words
  ticketBeside: { flex: 1, minWidth: 0 },
  ticketAut: { borderColor: colors.crimsonBorder },
  ticketBody: { flex: 1, minWidth: 0, paddingHorizontal: WALL.ticketPad, paddingTop: 10 },
  ticketBodyOnly: { paddingTop: 0 },
  ticketKick: { color: colors.fog },
  ticketName: { color: colors.silverScreen, marginTop: 3 },
  ticketNameAut: { color: colors.crimsonInk },
  ticketLines: { marginTop: 4 },
  ticketLine: { color: colors.bone, lineHeight: 16 },
  ticketDoor: {
    marginTop: 8, borderTopWidth: 1, borderTopColor: colors.sepiaBorder, minHeight: 40,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  ticketDoorAut: { borderTopColor: colors.crimsonBorder },
  ticketDoorOnly: { marginTop: 0, borderTopWidth: 0, minHeight: 44 },
  ticketDoorText: { color: colors.sepia },
  ticketDoorTextAut: { color: colors.crimsonInk },
  stub: { width: WALL.ticketStub, alignItems: 'center', justifyContent: 'center' },
  perforation: { position: 'absolute', left: -1, top: 0, bottom: 0 },
  hole: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5 },
  fine: { alignItems: 'center' },
  fineLine: { color: colors.fog, lineHeight: 15, textAlign: 'center' },
});
