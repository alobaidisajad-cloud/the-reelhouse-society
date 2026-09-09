/**
 * RankBadge — the house's rank, drawn once.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 * The WORDS were never the problem: `✦ ARCHIVIST` and `★ AUTEUR` were identical
 * in every place that drew them. Everything around them had drifted — four
 * dresses and three different golds for one rank, because four surfaces each
 * solved the same problem separately. So it is solved once, here, and imported.
 *
 * The construction lives in `theme/stamp.ts`, which explains what it is and why
 * it is shaped that way. This file is only the drawing of it.
 *
 * ── IT IS THE SAME MARK IN EVERY PLACE ──────────────────────────────────────
 * One component, one construction, one size. The only thing that ever differs
 * between surfaces is WHICH rank it says. There is deliberately no `size` or
 * `variant` prop: a per-screen knob is exactly how the web ended up with the
 * same badge at four sizes, two of them set by inline overrides at the call
 * site. `style` exists for POSITION only — the profile stamps this onto the
 * corner of a print and animates it in — and never for colour or type.
 *
 * ── WHAT IT SAYS ALOUD ──────────────────────────────────────────────────────
 * "Auteur", not "black star AUTEUR". The glyph is an ornament, and a reader
 * that announces it is reading punctuation out of a badge. The label is set
 * explicitly so what is drawn and what is spoken can differ.
 *
 * Where the mark sits inside a control that carries its own label — a byline
 * that opens a member's room — iOS swallows this element, so the rank has to be
 * in the PARENT's label instead. `rankWord` is exported for that, and `silent`
 * stops the two from being said twice.
 */
import { memo } from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { fonts } from '@/src/theme/theme';
import {
  STAMP_CRIMSON, STAMP_START, STAMP_END, STAMP_TILT, STAMP_BLEED, STAMP_FRAME_GAP,
  STAMP_RULE_AUTEUR, STAMP_RULE_AUTEUR_INNER, STAMP_RULE_ARCHIVIST,
  STAMP_INK_AUTEUR, STAMP_INK_ARCHIVIST,
} from '@/src/theme/stamp';
import { scaledTextProps } from '@/src/constants/textScaling';
import { isArchivistPlusTier, isAuteurPlusTier, type TierInput } from '@/src/utils/tier';

export type Rank = 'auteur' | 'archivist' | null;

/**
 * The rank a member's row should draw, from anything that describes them.
 *
 * Goes through `resolveTier` rather than reading a column directly, so the
 * Highest Watermark rule applies: a FOUNDING member reads as an Auteur, and an
 * admin who pays keeps the tier they paid for. A name-equality check against
 * `role` would leave both of them unmarked — which is precisely the bug the web
 * client still has.
 */
export function rankOf(input?: TierInput): Rank {
  if (isAuteurPlusTier(input)) return 'auteur';
  if (isArchivistPlusTier(input)) return 'archivist';
  return null;
}

/** What a screen reader says. Sentence case: it is a word, not a heading. */
export function rankWord(rank: Rank): string | null {
  return rank === 'auteur' ? 'Auteur' : rank === 'archivist' ? 'Archivist' : null;
}

/**
 * The mark. Renders NOTHING for a member with no rank — not an empty box, which
 * would still take padding in every row in the app, and not a "CINEPHILE"
 * label, which is a word meaning "has not paid" printed on most of the house.
 */
export const RankBadge = memo(function RankBadge({ rank, silent, style }: {
  rank: Rank;
  /**
   * Inside a control that already speaks the rank in its own label. This is
   * what stops "Ana, Auteur. Open their room." being followed by "Auteur".
   */
  silent?: boolean;
  /** POSITION only. See the note at the top of this file. */
  style?: StyleProp<ViewStyle>;
}) {
  if (!rank) return null;

  const auteur = rank === 'auteur';
  const word = rankWord(rank) as string;
  const a11y = silent
    ? { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const }
    : { accessibilityLabel: word };

  // ── INK ON PAPER ──────────────────────────────────────────────────────────
  // A hairline and a word, and nothing behind them. Beside a framed plate this
  // reads as the plainer object, which is the whole hierarchy: the two ranks
  // are different KINDS, not the same box in two colours.
  if (!auteur) {
    return (
      <View style={[s.stamp, s.ruleArchivist, style]} {...a11y}>
        <Text style={[s.word, s.wordArchivist]} numberOfLines={1} {...scaledTextProps}>
          ✦ ARCHIVIST
        </Text>
      </View>
    );
  }

  // ── A FRAMED PLATE ────────────────────────────────────────────────────────
  // The double rule — the printer's higher grade of certificate. Both hairlines
  // are the rank's own crimson, so the frame adds no colour; it adds MASS,
  // which is the only answer to `✦ ARCHIVIST` being the physically wider word.
  return (
    <View style={[s.frame, style]} {...a11y}>
      <View style={s.plate}>
        <LinearGradient
          colors={STAMP_CRIMSON}
          start={STAMP_START} end={STAMP_END}
          style={s.wash}
        />
        <Text style={[s.word, s.wordAuteur]} numberOfLines={1} {...scaledTextProps}>
          ★ AUTEUR
        </Text>
      </View>
    </View>
  );
});

const s = StyleSheet.create({
  /** The Archivist: one hairline, no ground. */
  stamp: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    transform: [{ rotate: STAMP_TILT }],
    marginHorizontal: STAMP_BLEED,
    // Never gives way. In every row this appears in the NAME and the trailing
    // facts are the things allowed to truncate: a name is recognisable from its
    // opening letters and a count is on the screen twice, but a rank shortened
    // to `★ AUT` is simply wrong.
    flexShrink: 0,
  },
  ruleArchivist: { borderWidth: 0.5, borderColor: STAMP_RULE_ARCHIVIST },

  /** The Auteur: the outer rule, and the gap that makes it a PAIR of rules. */
  frame: {
    borderWidth: 1,
    borderColor: STAMP_RULE_AUTEUR,
    padding: STAMP_FRAME_GAP,
    transform: [{ rotate: STAMP_TILT }],
    marginHorizontal: STAMP_BLEED,
    flexShrink: 0,
  },
  /** The inner rule, and the plate the wash and the word sit on. */
  plate: {
    borderWidth: 0.5,
    borderColor: STAMP_RULE_AUTEUR_INNER,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },

  /** Pinned to the padding box, which with no radius needs no clipping. */
  wash: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },

  /**
   * `includeFontPadding: false` because this is the LABEL face, and every style
   * in that face must strip it — a rule `feedRowIsRecyclable` enforces, and one
   * this mark is subject to rather than exempt from, since it renders inside
   * the Dispatch's recycling rows.
   */
  word: {
    fontFamily: fonts.sub,
    fontSize: 7.5,
    letterSpacing: 1.8,
    includeFontPadding: false,
  },
  wordAuteur: { color: STAMP_INK_AUTEUR },
  /**
   * FULL opacity. This carried 0.82, which composited to 4.35:1 — under the 4.5
   * eight-point type needs — and the contrast guard tested the COLOUR without
   * the opacity, so it reported a pass on something that failed. At full
   * strength on the page's own ink it is 6.24:1, and the hierarchy is carried
   * by the frame rather than by dimming the lesser rank into illegibility.
   */
  wordArchivist: { color: STAMP_INK_ARCHIVIST },
});
