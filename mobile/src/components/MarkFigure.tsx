/**
 * MarkFigure — a mark's icon, with its count hanging to the right of it.
 *
 * ── ONE ANATOMY, EVERY BAR ───────────────────────────────────────────────────
 * Every action bar in the house is a row of columns, each an icon over a word:
 * CERTIFY, CRITIQUE, SHARE, SAVE. A count belongs to its mark the way it does in
 * every app a member already knows — beside the icon — and it must not move
 * anything to get there:
 *
 *   · the ICON stays dead centre over its word. A count placed beside it in a
 *     row pushed the pair off centre by half the number's width, so the bar's
 *     icons stopped lining up with each other and with their own words;
 *   · the WORD stays where it was. `12 CERTIFIED` in the word's line was 12
 *     characters in a column built for 9, and shrank the word to fit;
 *   · the column's HEIGHT does not change. The count is laid over the icon's
 *     line, so a bar with counts and a bar without are the same bar.
 *
 * So the count hangs: it starts a few points right of the icon's edge.
 *
 * ── HOW FAR IT MAY REACH ─────────────────────────────────────────────────────
 * That depends on the bar, and the bar says so (`reach`):
 *
 *   'column'  the Reel's card, the log page and the stack page draw each column
 *             on its own ground with a seam or a rule between. A number laid
 *             across a seam reads as a rendering fault, so it stays inside its
 *             own column, half a point short of the edge.
 *   'open'    a filing's marks and the reader's dock are set on the page itself,
 *             no ground, no rule. There the number may run on to the gap short
 *             of the NEXT icon — at the icon's height the neighbouring column is
 *             empty to the left of its own centred icon.
 *
 * ── THE ROOM IT HAS, MEASURED ────────────────────────────────────────────────
 * The widest count `formatCount` makes is four characters (`999K`): 22.2pt in
 * this face at 10pt with no added tracking. The typewriter face already sets
 * its figures to one width; tracking them like capitals (0.6pt) is what made
 * `5.2K` not fit on a 320pt phone. The gap and the seam inset are as small as
 * they are for the same reason: the log page's column on a 320pt phone is the
 * tightest in the house, and rendered there `999K` needs 23.4pt.
 *
 *   320pt phone, 'column', the log page's 68.6pt column   15pt heart  24.3pt
 *                                                         16pt mark   23.8pt
 *   320pt phone, 'column', the Reel's 70.75pt column      room 25.4pt
 *   320pt phone, 'open', a filing's 61.5pt column         room 42.5pt
 *
 * Measured, not assumed: the layout audit renders these bars at 320, 360 and
 * 390pt, at every text size, and fails on any count that does not fit.
 *
 * At a larger text size the count grows to 12pt and shrink-to-fit takes it back
 * toward 10pt, never under (`minimumFontScale` = 1 ÷ the cap). The layout audit
 * (mockups/tools/layout.cjs, HANG) measures every rendered count at every size
 * and fails on one cut, crowding its icon, past its reach, or under 10pt.
 *
 * ── WHAT A SCREEN READER HEARS ───────────────────────────────────────────────
 * Nothing from here. The number is hidden, and the BUTTON says it — "Certify.
 * 12 members have certified this" — because a count read on its own, as a
 * separate stop after the button, is a number with no noun. `certifyLabel` and
 * `critiqueLabel` below are the only wording, so every bar says it the same way.
 */
import React, { memo, type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { formatCount, UNSPOKEN } from '@/src/components/dispatch/paper/paperMetrics';
import { counted } from '@/src/components/dispatch/paper/paperText';

/**
 * Points between the icon's BOX and the first figure — and, in an 'open' bar,
 * the next icon's box. The icons are drawn on a 24-unit grid with a 2-unit
 * margin inside it, so the box is ~1.3pt wider than the ink on each side:
 * 2pt from the box is ~3.3pt from the drawn icon.
 */
export const COUNT_GAP = 2;
/** Points kept clear at a seamed column's edge — a hairline seam's own width. */
export const COUNT_INSET = 0.5;
/** No tracking on top of the face's own even figures. */
export const COUNT_TRACKING = 0;
/** The count's own ceiling — the same as the words it sits over. */
export const COUNT_CAP = 1.2;

export const countTextProps = {
  allowFontScaling: true,
  maxFontSizeMultiplier: COUNT_CAP,
  numberOfLines: 1 as const,
  adjustsFontSizeToFit: true,
  // Never below the size it was set at: shrink only takes back what the
  // member's text size added.
  minimumFontScale: 1 / COUNT_CAP,
} as const;

export const MarkFigure = memo(function MarkFigure({
  children, iconSize, count, style, reach = 'column',
}: {
  /** The icon, exactly as the bar draws it (its own pulse wrapper included). */
  children: ReactNode;
  /** The icon's drawn size, so the count starts at its edge and not inside it. */
  iconSize: number;
  /** null or 0 draws no count at all: a bar never prints a zero. */
  count: number | null | undefined;
  /** The bar's own label style — the count is the same ink as its word. */
  style?: StyleProp<TextStyle>;
  /** How far the number may run — see HOW FAR IT MAY REACH above. */
  reach?: 'column' | 'open';
}) {
  const n = formatCount(count ?? 0);
  const edge = reach === 'open'
    // Half a column past this one's edge is the next column's centre; stop the
    // gap short of the next icon, which is the same size as this one.
    ? { right: '-50%' as const, marginRight: iconSize / 2 + COUNT_GAP }
    : { right: 0, marginRight: COUNT_INSET };
  return (
    // `mark-figure` and `mark-count` are what the layout audit
    // (mockups/tools/layout.cjs, HANG) finds a count and its reach by.
    <View testID="mark-figure" style={f.figure}>
      {children}
      {n ? (
        <View
          testID={reach === 'open' ? 'mark-count-open' : 'mark-count'}
          style={[f.hang, edge, { marginLeft: iconSize / 2 + COUNT_GAP }]}
          pointerEvents="none" {...UNSPOKEN}
        >
          <Text style={[style, f.count]} {...countTextProps}>{n}</Text>
        </View>
      ) : null}
    </View>
  );
});

/** "Certify this" / "Certified. 12 members have certified this", and the rest. */
export function certifyLabel(count: number | null | undefined, certified: boolean, what = 'this'): string {
  const c = count ?? 0;
  const others = c > 0 ? `${counted(c, 'member has', 'members have')} certified ${what}` : '';
  if (certified) return `Certified. ${others || `You certified ${what}`}`;
  return others ? `Certify ${what}. ${others}` : `Certify ${what}`;
}

/** "Critique. 3 critiques" — or just "Critique" when there are none, or no count is known. */
export function critiqueLabel(count: number | null | undefined, verb = 'Critique'): string {
  const c = count ?? 0;
  return c > 0 ? `${verb}. ${counted(c, 'critique', 'critiques')}` : verb;
}

const f = StyleSheet.create({
  // The whole column's width, so the count's box is measured from the column's
  // centre.
  figure: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  hang: {
    position: 'absolute',
    left: '50%', top: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'flex-start',
  },
  count: { letterSpacing: COUNT_TRACKING, includeFontPadding: false, textAlign: 'left' },
});
