/**
 * RankTicket — a rank, sold as an admission ticket.
 * ─────────────────────────────────────────────────────────────────────────────
 * Card stock with a stub torn along a perforation. The punched hole on the stub
 * is the selector: filled, this is the rank the button below will buy. Only
 * the chosen ticket opens its list; the other stays closed and says how much
 * is inside, so the page is short enough to compare two tickets at a glance.
 *
 * The Auteur is the higher GRADE, and looks it: oxblood stock and a double rule,
 * the same double rule its plate wears beside a member's name. Its name is set
 * in `crimsonInk` — the legible red for words — never the stamp's `crimson`,
 * which reads 2.5:1 as type.
 *
 * ── WHAT A SCREEN READER MEETS ──────────────────────────────────────────────
 * The top of the ticket is one radio: "The Archivist, $19.99 a year, renews
 * yearly. For those who keep things." The list is NOT inside it — a pressable
 * swallows everything it contains into its own label — so each privilege is
 * its own readable line after it. The stub, its hole and the pips are print,
 * and are hidden.
 */
import { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { LinearTransition } from 'react-native-reanimated';
import Svg, { Line } from 'react-native-svg';

import PressableScale from '@/src/components/PressableScale';
import { RankBadge } from '@/src/components/RankBadge';
import { colors, fonts } from '@/src/theme/theme';
import { deckLabelProps, displayTextProps, scaledTextProps } from '@/src/constants/textScaling';
import { UNSPOKEN } from '@/src/components/dispatch/paper/paperMetrics';
import { privilegesOf, type PaidRankId, type Rank } from '@/src/constants/membership';
import type { TicketPrice } from './societyPricing';
import { EDGE_LIT } from '@/src/theme/light';

export type TicketState = 'offer' | 'held' | 'included';

/** The stub's width, and so the inset of everything printed on the ticket. */
export const STUB = 42;

const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

export const RankTicket = memo(function RankTicket({
  rank, price, state, selected, includes, onSelect,
}: {
  rank: Rank & { id: PaidRankId };
  price: TicketPrice | null;
  state: TicketState;
  selected: boolean;
  /** The line over the list — "EVERYTHING FREE, AND —", or "EVERYTHING YOU HAVE, AND —". */
  includes: string;
  onSelect: () => void;
}) {
  const auteur = rank.id === 'auteur';
  const privileges = privilegesOf(rank.id);
  const open = state === 'offer' && selected;
  const count = NUMBER_WORDS[privileges.length] ?? String(privileges.length);

  // ── a rank already held: a plain stub, no price, nothing to choose ──────────
  if (state !== 'offer') {
    return (
      <View style={[s.ticket, auteur && s.ticketAuteur]}>
        <TicketStock auteur={auteur} />
        <Stub auteur={auteur} selected={false} quiet />
        <View style={s.main} accessible accessibilityLabel={`${rank.name}. ${state === 'held' ? 'Your rank. Everything in it is already yours.' : 'Included in your rank.'}`}>
          <View style={s.top}>
            <RankBadge rank={rank.id} silent />
            <View style={s.yours}><Text style={s.yoursText} {...deckLabelProps}>{state === 'held' ? 'YOUR RANK' : 'INCLUDED'}</Text></View>
          </View>
          <Text style={[s.nameHeld, auteur && s.nameAuteur]} {...displayTextProps} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{rank.name}</Text>
          <Text style={s.terms} {...scaledTextProps}>
            {state === 'held' ? 'Everything in it is already yours.' : 'Included in your rank.'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <Animated.View layout={LinearTransition.duration(220)} style={[s.ticket, auteur && s.ticketAuteur, selected && (auteur ? s.selAuteur : s.sel)]}>
      <TicketStock auteur={auteur} />
      <Stub auteur={auteur} selected={selected} />

      <PressableScale
        style={s.head}
        onPress={onSelect}
        haptic="selection"
        pressedScale={0.99}
        hitSlop={null}
        accessibilityRole="radio"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={`${rank.name}, ${price?.spoken ?? ''}. ${rank.character}`}
        accessibilityHint={selected ? undefined : 'Chooses this rank. The button at the bottom buys it.'}
      >
        <View style={s.top}>
          <RankBadge rank={rank.id} silent />
          {rank.recommended ? (
            <View style={s.recommend}><Text style={s.recommendText} {...deckLabelProps} maxFontSizeMultiplier={1.2}>THE HOUSE RECOMMENDS</Text></View>
          ) : null}
        </View>
        <Text style={[s.name, auteur && s.nameAuteur]} {...displayTextProps} maxFontSizeMultiplier={1.1} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{rank.name}</Text>
        <Text style={s.character} {...scaledTextProps}>{rank.character}</Text>
        {price ? (
          <>
            <View style={s.priceRow}>
              <Text style={s.amount} {...displayTextProps} maxFontSizeMultiplier={1.1} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{price.amount}</Text>
              <Text style={s.per} {...deckLabelProps}>{price.per}</Text>
            </View>
            <Text style={s.terms} {...scaledTextProps}>{price.terms}</Text>
          </>
        ) : null}
      </PressableScale>

      {open ? (
        <View style={s.body}>
          <View style={[s.rule, auteur && s.ruleAuteur]} {...UNSPOKEN} />
          <Text style={[s.includes, auteur && s.inkAuteur]} {...deckLabelProps} accessibilityRole="header">{includes}</Text>
          {privileges.map((p, i) => (
            <View key={p.id} style={[s.priv, i > 0 && (auteur ? s.privRuleAuteur : s.privRule)]} accessible accessibilityLabel={`${p.name}. ${p.detail}`}>
              <View style={[s.pip, auteur && s.pipAuteur]} />
              <View style={s.privText}>
                <Text style={s.privName} {...scaledTextProps}>{p.name}</Text>
                <Text style={s.privDetail} {...scaledTextProps}>{p.detail}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <PressableScale
          style={[s.more, auteur && s.moreAuteur]}
          onPress={onSelect}
          haptic="selection"
          pressedScale={0.99}
          hitSlop={null}
          accessibilityRole="button"
          accessibilityLabel={`Show ${rank.name.replace(/^The /, 'the ')}'s ${count} privileges`}
        >
          <Text style={[s.moreText, auteur && s.inkAuteur]} {...deckLabelProps}>SHOW ITS {count.toUpperCase()} PRIVILEGES</Text>
          <Text style={[s.moreMark, auteur && s.inkAuteur]} {...UNSPOKEN}>＋</Text>
        </PressableScale>
      )}
    </Animated.View>
  );
});

/** The card stock itself: a warm head falling to the page's frame. */
function TicketStock({ auteur }: { auteur: boolean }) {
  return (
    <>
      <LinearGradient
        colors={auteur ? [colors.ticketAuteurHead, colors.ticketAuteurFoot] : [colors.ticketHead, colors.frame]}
        start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.7 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      {auteur ? <View style={s.innerRule} pointerEvents="none" /> : null}
    </>
  );
}

/** The stub: a hole punched for the chosen ticket, and ADMIT ONE along its length. */
function Stub({ auteur, selected, quiet }: { auteur: boolean; selected: boolean; quiet?: boolean }) {
  return (
    <View style={s.stub} pointerEvents="none" {...UNSPOKEN}>
      {/* The perforation. iOS draws a dashed border only when all four sides
          match, so a one-sided dashed edge would come out solid; a dashed line
          is the same on both platforms. */}
      <Svg style={s.perforation} width={2} height="100%">
        <Line x1={1} y1={0} x2={1} y2="100%" stroke={auteur ? colors.stampRuleInner : colors.sepiaBorderStrong} strokeWidth={1.5} strokeDasharray="4,3" />
      </Svg>
      <View style={[s.punch, s.punchTop, auteur && s.punchAuteur]} />
      <View style={[s.punch, s.punchBottom, auteur && s.punchAuteur]} />
      <View style={[s.hole, auteur && s.holeAuteur, selected && (auteur ? s.holeSelAuteur : s.holeSel), quiet && s.holeQuiet]}>
        {selected ? <View style={[s.holeFill, auteur && s.holeFillAuteur]} /> : null}
      </View>
      {!quiet ? (
        <View style={s.admitBox}>
          <Text
            style={[s.admit, auteur && s.admitAuteur, selected && (auteur ? s.admitSelAuteur : s.admitSel)]}
            allowFontScaling={false}
            numberOfLines={1}
          >
            ADMIT ONE
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const PUNCH = 12;

const s = StyleSheet.create({
  ticket: { ...EDGE_LIT,
    marginHorizontal: 16,
    borderWidth: 1, borderColor: colors.sepiaBorder,
    backgroundColor: colors.frame,
    overflow: 'visible',
  },
  ticketAuteur: { borderColor: colors.crimsonBorder },
  sel: {
    borderColor: colors.sepia,
    shadowColor: colors.sepia, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.28, shadowRadius: 14,
  },
  selAuteur: {
    borderColor: colors.crimson,
    shadowColor: colors.crimson, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 14,
  },
  innerRule: {
    position: 'absolute', top: 4, left: 4, right: 4, bottom: 4,
    borderWidth: 0.5, borderColor: colors.stampRuleInner,
  },

  // ── the stub ──
  stub: {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: STUB,
    alignItems: 'center', paddingTop: 18,
  },
  perforation: { position: 'absolute', right: -1, top: 0, bottom: 0 },
  punch: {
    position: 'absolute', right: -PUNCH / 2 - 0.75, width: PUNCH, height: PUNCH, borderRadius: PUNCH / 2,
    backgroundColor: colors.ink, borderColor: colors.sepiaBorder,
  },
  punchTop: { top: -PUNCH / 2 - 1, borderBottomWidth: 1 },
  punchBottom: { bottom: -PUNCH / 2 - 1, borderTopWidth: 1 },
  punchAuteur: { borderColor: colors.crimsonBorder },
  hole: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.sepiaBorderStrong,
    alignItems: 'center', justifyContent: 'center',
  },
  holeAuteur: { borderColor: colors.stampRuleInner },
  holeSel: { borderColor: colors.sepia },
  holeSelAuteur: { borderColor: colors.crimsonInk },
  holeQuiet: { borderColor: colors.sepiaBorder },
  holeFill: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.sepia },
  holeFillAuteur: { backgroundColor: colors.crimsonInk },
  // A fixed box the rotated words turn inside, so they never push the ticket taller.
  admitBox: { width: STUB, height: 96, marginTop: 14, alignItems: 'center', justifyContent: 'center' },
  // Unchosen, the words are fog — quiet, and still 6:1 on the stock. Tarnish
  // looked right and measured 3.0:1, which is not a colour anyone can read.
  admit: {
    width: 96, textAlign: 'center', transform: [{ rotate: '-90deg' }],
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 3, color: colors.fog, includeFontPadding: false,
  },
  admitAuteur: { color: colors.fog },
  admitSel: { color: colors.sepia },
  admitSelAuteur: { color: colors.crimsonInk },

  // ── the face ──
  head: { paddingLeft: STUB + 16, paddingRight: 18, paddingTop: 16 },
  main: { paddingLeft: STUB + 16, paddingRight: 18, paddingTop: 16, paddingBottom: 16 },
  top: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 24 },
  recommend: { backgroundColor: colors.marqueeGold, paddingHorizontal: 7, paddingVertical: 4 },
  recommendText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.ink, includeFontPadding: false },
  yours: { borderWidth: 1, borderColor: colors.sepiaBorderStrong, paddingHorizontal: 7, paddingVertical: 4 },
  yoursText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.sepia, includeFontPadding: false },
  name: { fontFamily: fonts.display, fontSize: 30, lineHeight: 36, color: colors.silverScreen, marginTop: 10 },
  nameHeld: { fontFamily: fonts.display, fontSize: 24, lineHeight: 29, color: colors.silverScreen, marginTop: 8 },
  nameAuteur: { color: colors.crimsonInk },
  character: { fontFamily: fonts.bodyItalic, fontSize: 14, lineHeight: 20, color: colors.bone, marginTop: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 12 },
  amount: { fontFamily: fonts.display, fontSize: 38, lineHeight: 46, color: colors.parchment, flexShrink: 1 },
  per: { fontFamily: fonts.sub, fontSize: 13, letterSpacing: 1.5, color: colors.bone, includeFontPadding: false },
  terms: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.bone, marginTop: 4, paddingBottom: 16 },

  // ── the list ──
  body: { paddingLeft: STUB + 16, paddingRight: 18, paddingBottom: 18 },
  rule: { height: 1, backgroundColor: colors.sepiaBorderStrong, marginBottom: 12 },
  ruleAuteur: { backgroundColor: colors.stampRuleInner },
  includes: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 2.5, color: colors.sepia, marginBottom: 6, includeFontPadding: false },
  inkAuteur: { color: colors.crimsonInk },
  priv: { flexDirection: 'row', gap: 11, paddingVertical: 9 },
  privRule: { borderTopWidth: 1, borderTopColor: colors.ash },
  privRuleAuteur: { borderTopWidth: 1, borderTopColor: colors.crimsonBorder },
  pip: { width: 6, height: 6, marginTop: 7, backgroundColor: colors.sepia, transform: [{ rotate: '45deg' }] },
  pipAuteur: { backgroundColor: colors.crimsonInk },
  privText: { flex: 1 },
  privName: { fontFamily: fonts.sub, fontSize: 15, lineHeight: 20, color: colors.parchment },
  privDetail: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.bone, marginTop: 1 },

  more: {
    marginLeft: STUB + 16, marginRight: 18, marginBottom: 6,
    minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    borderTopWidth: 1, borderTopColor: colors.ash,
  },
  moreAuteur: { borderTopColor: colors.crimsonBorder },
  moreText: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 2, color: colors.sepia, flexShrink: 1, includeFontPadding: false },
  moreMark: { fontFamily: fonts.body, fontSize: 16, color: colors.sepia },
});
