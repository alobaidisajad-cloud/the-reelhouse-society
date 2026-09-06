/**
 * RankBadge — the house's rank, drawn once.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 * The words were never the problem. `✦ ARCHIVIST` and `★ AUTEUR` were identical
 * in all five places that drew them. Everything AROUND the words had drifted:
 *
 *   the archive feed  ink on the palette's gold, radius 2, tracking 1, no border
 *   the home pulse    ink on a goldenrod of its own, radius 3, tracking 2, bordered
 *   search            a third gold on a tint, its own pill
 *   the registry      no chip at all, a coloured word
 *   the Dispatch      no word at all — a 1.5pt ring, and CRIMSON for Auteur
 *
 * Three golds for one rank, and the app's highest honour wearing crimson on the
 * one surface where crimson also means STRUCK and REPORTED. None of that is a
 * style choice anybody made; it is five people solving the same problem five
 * times. So it is solved once, here, and imported.
 *
 * ── AUTEUR IS BRASS, AND BRASS IS A RAMP ────────────────────────────────────
 * `oneBrass.test.ts` states the house rule: any FILLED brass surface uses the
 * four-stop ramp, because a flat gold rectangle "reads as yellow plastic beside
 * the real thing". That test named this badge as its one known violation and
 * left it flat, saying the conversion was "a decision for whoever owns those".
 * This is that decision. The Auteur's plate is metal now: the ramp, and the
 * crown that separates a gradient from a face of brass — the same construction
 * as the Concierge disc and the Dispatch's own stamps.
 *
 * Lit ACROSS its height, not along its length. The house's diagonal was set for
 * a disc and a near-square stub; on a badge four times wider than it is tall it
 * runs the ramp end to end and drops the label's last letters onto `tarnish`,
 * measured at 3.91:1 — under the 4.5 small text needs. Across the height the
 * worst point under a glyph is 4.57:1, and a nameplate catches light on its
 * short axis anyway. Same colours, same stops; the direction follows the shape.
 * `theRankBadgeIsReadable` holds both numbers.
 *
 * The membership page sells this tier with `Gold Foil "Auteur" Badge` in its
 * feature list. Foil is metal. A flat fill was never what was promised.
 *
 * ── AND ARCHIVIST IS INK ────────────────────────────────────────────────────
 * Deliberately NOT a brass plate. Two reasons, and the second is the one that
 * decides it:
 *
 *   · a 15%-alpha tint is not a filled brass surface, so it is outside the ramp
 *     rule rather than an exception to it;
 *   · Archivist is the popular tier. A plate on every second byline is a wall
 *     of medals, and the rank stops meaning anything the moment it is common.
 *     The top rank is rare, so it gets metal; the middle rank is not, so it
 *     gets ink. That hierarchy is the point.
 *
 * ── WHAT IT SAYS ALOUD ──────────────────────────────────────────────────────
 * "Auteur", not "black star AUTEUR". The glyph is an ornament and a reader that
 * announces it is reading punctuation out of a badge. The label is set
 * explicitly so what is drawn and what is spoken can differ.
 *
 * Where the badge sits inside a control that carries its own label — a byline
 * that opens a member's room — the parent swallows this element on iOS, so the
 * rank has to be in the PARENT's label too. `rankWord` is exported for that.
 */
import { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { colors, fonts } from '@/src/theme/theme';
import {
  BRASS, BRASS_STOPS, BRASS_WIDE_START, BRASS_WIDE_END, CROWN, CROWN_HEIGHT, RIM, ON_BRASS,
} from '@/src/theme/brass';
import { scaledTextProps } from '@/src/constants/textScaling';
import { isArchivistPlusTier, isAuteurPlusTier, type TierInput } from '@/src/utils/tier';

export type Rank = 'auteur' | 'archivist' | null;

/**
 * The rank a member's row should draw, from anything that describes them.
 *
 * Goes through `resolveTier` rather than reading `tier` directly, so a FOUNDING
 * member reads as an Auteur — that mapping already exists and disagreeing with
 * it here would give one member two ranks depending on the screen.
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
 * The badge. Renders nothing at all for a member with no rank — an empty box
 * with padding still takes room in a row, and every byline in the app would
 * have paid for it.
 */
export const RankBadge = memo(function RankBadge({ rank, silent }: {
  rank: Rank;
  /**
   * The badge sits inside a control that already speaks the rank in its own
   * label. Hiding it here is what stops "Ana, Auteur. Open their room." from
   * being followed by a second "Auteur".
   */
  silent?: boolean;
}) {
  if (!rank) return null;

  const word = rankWord(rank) as string;
  const a11y = silent
    ? { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const }
    : { accessibilityLabel: word };

  if (rank === 'archivist') {
    return (
      <View style={s.chip} {...a11y}>
        <Text style={s.inkArchivist} numberOfLines={1} {...scaledTextProps}>✦ ARCHIVIST</Text>
      </View>
    );
  }

  return (
    <View style={s.plate} {...a11y}>
      {/* The ramp, then the crown. Both absolute so the plate's height is set by
          the type inside it and grows with the reader's text size. */}
      <LinearGradient
        colors={BRASS} locations={BRASS_STOPS} start={BRASS_WIDE_START} end={BRASS_WIDE_END}
        style={s.face}
      />
      <LinearGradient colors={CROWN} style={s.crown} />
      <Text style={s.inkAuteur} numberOfLines={1} {...scaledTextProps}>★ AUTEUR</Text>
    </View>
  );
});

/**
 * 8pt, tracked 1, radius 2. Taken from the archive feed's chip, which was the
 * only one of the four whose metrics had a reason written down.
 *
 * `includeFontPadding: false` on both faces: this badge renders inside the
 * Dispatch's recycling rows, where every style in the label face must strip it
 * (feedRowIsRecyclable). The face IS the label face, so the rule applies rather
 * than being an exception to argue about.
 */
const BADGE_TEXT = {
  fontFamily: fonts.sub,
  fontSize: 8,
  letterSpacing: 1,
  includeFontPadding: false,
} as const;

const s = StyleSheet.create({
  chip: {
    backgroundColor: colors.sepiaSubtle,
    borderRadius: 2,
    paddingHorizontal: 7,
    paddingVertical: 2,
    // Never gives way. In every row this appears in, the NAME and the trailing
    // facts are the things allowed to truncate; a rank that shrinks to three
    // letters is worse than no rank.
    flexShrink: 0,
  },
  inkArchivist: { ...BADGE_TEXT, color: colors.sepia },

  plate: {
    borderRadius: 2,
    paddingHorizontal: 7,
    paddingVertical: 2,
    overflow: 'hidden',
    // The machined edge — bright, because against near-black chrome a dark rim
    // is simply invisible and real brass catches light all the way round.
    borderWidth: 0.5,
    borderColor: RIM,
    flexShrink: 0,
  },
  /** Ink on brass, never a grey: brass.ts calls a grey on gold the one
   *  combination that fails contrast while looking fine in a mockup. */
  inkAuteur: { ...BADGE_TEXT, color: ON_BRASS },

  /* Written out rather than `StyleSheet.absoluteFill` so the crown can stop
     partway down the face — the same construction the Dispatch's own stamps
     use, which is the point of copying it rather than inventing a second one. */
  face: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  crown: { position: 'absolute', left: 0, right: 0, top: 0, height: CROWN_HEIGHT },
});
