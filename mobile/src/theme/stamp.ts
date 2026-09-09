/**
 * stamp.ts — the house's rank stamp, in one place.
 *
 * ── WHY THIS IS SHARED AND NOT COPIED ───────────────────────────────────────
 * Companion to `brass.ts`, and for the same reason. A rank mark is drawn on
 * every feed, every search row, the profile, the registry and the paywall — and
 * when four surfaces each solved it separately the app ended up with three
 * different golds for one rank and six different dresses. Stated once,
 * imported everywhere, it cannot drift.
 *
 * ── THE TWO RANKS ARE DIFFERENT KINDS OF OBJECT ─────────────────────────────
 * They used to differ only in HUE and in amounts nobody can see — a 0.5pt
 * hairline against a 1pt one at eight-point type, a wash of 0.06 against 0.09.
 * Measured, the Auteur was already the brighter of the two, so the trouble was
 * never brightness. Hue is a CODE, not a ladder: two boxes of the same size,
 * shape, tilt and construction, in two colours, read as two categories.
 *
 * And one fact settles it. `✦ ARCHIVIST` measures 83.9pt where `★ AUTEUR`
 * measures 67.1 — ARCHIVIST is simply a longer word — so **the lower rank's
 * mark is 25% bigger**, and size is the first thing the eye ranks. No amount of
 * colour argues with that.
 *
 * So they are now different KINDS:
 *
 *   ARCHIVIST — ink on paper. A hairline and a word, no wash at all.
 *   AUTEUR    — a framed plate. A wash, and a DOUBLE RULE: a second hairline
 *               set inside the first, which is the printer's own way of saying
 *               a higher grade of certificate. The frame is what gives the
 *               shorter mark MASS, the only way to outrank a wider box without
 *               making it wider still.
 *
 * Both rules are the rank's own crimson — outer at full strength, inner at
 * half — so the frame adds no colour. A gold star was drawn for this and
 * rejected: the house does not want two metals in one mark.
 *
 * ── TWO THINGS THAT LOOK LIKE DETAILS AND ARE NOT ───────────────────────────
 * NO RADIUS, AND THEREFORE NO CLIPPING. A letterpress stamp has square corners,
 * so there is no border radius — and with none, a gradient pinned to all four
 * edges of the padding box already fills exactly the area it should. Nothing is
 * left to clip, so the box needs no `overflow: 'hidden'`. That matters beyond
 * tidiness: `overflow: hidden` combined with a `transform` is the one
 * construction here that renders differently on Android, and there is no
 * Android device to prove otherwise on. The safe fix was to stop needing it.
 *
 * THE TILT COSTS WIDTH. A rotated box PAINTS wider than the box layout reserved
 * for it. Measured on the rendered page: 0.65–1.13pt across at normal type, and
 * it grows with the letters. `STAMP_BLEED` is the margin that covers it to the
 * 1.35 ceiling with room left over.
 */
import { colors } from '@/src/theme/theme';

/**
 * The Auteur's wash: their own pigment falling to the page's own ink.
 *
 * Two stops. A third at two percent sat so close to the ground it was heading
 * for that it changed nothing visible — and its value collided with the tail of
 * the archive feed's tier rule, which is the theme naming one colour twice.
 *
 * The ARCHIVIST HAS NO WASH. That is the point: one rank is printed on
 * something and the other is ink on the page. It also lifted that rank's word
 * from 4.35:1 to 6.24:1, because the wash came with an opacity.
 */
export const STAMP_CRIMSON = [colors.stampCrimsonHead, colors.stampGround] as const;

/**
 * Straight down the short axis.
 *
 * Not the diagonal `brass.ts` uses: that vector was set for a disc and a
 * near-square plate, and on a mark four times wider than it is tall it runs the
 * ramp end to end — which drops the label's last letters onto the darkest stop.
 * A stamp is inked across its height.
 */
export const STAMP_START = { x: 0.5, y: 0 } as const;
export const STAMP_END = { x: 0.5, y: 1 } as const;

/** A hand's angle. One value, so every mark in a column agrees. */
export const STAMP_TILT = '-3deg';

/** Margin that absorbs the width a tilt paints beyond its layout box. */
export const STAMP_BLEED = 1;

/** The gap between the Auteur's two rules. Measured cost of the frame: 3.2pt. */
export const STAMP_FRAME_GAP = 1.5;

/** The edges. The Auteur is framed; the Archivist is a single hairline. */
export const STAMP_RULE_AUTEUR = colors.crimson;
export const STAMP_RULE_AUTEUR_INNER = colors.stampRuleInner;
export const STAMP_RULE_ARCHIVIST = colors.sepiaBorderStrong;

/** The word, per rank. Both clear 4.5:1 on the ground they actually sit on. */
export const STAMP_INK_AUTEUR = colors.crimsonInk;
export const STAMP_INK_ARCHIVIST = colors.sepia;
