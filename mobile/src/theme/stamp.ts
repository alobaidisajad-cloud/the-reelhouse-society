/**
 * stamp.ts — the house's rank stamp, in one place.
 *
 * ── WHY THIS IS SHARED AND NOT COPIED ───────────────────────────────────────
 * Companion to `brass.ts`, and for the same reason. A rank mark is drawn on
 * every feed, every search row, the profile, the registry and the paywall — and
 * when four surfaces each solved it separately the app ended up with three
 * different golds for one rank and four different dresses. Stated once,
 * imported everywhere, it cannot drift.
 *
 * ── WHAT IT IS ──────────────────────────────────────────────────────────────
 * A letterpress stamp: a square-cornered box, struck at a hand's angle, with
 * the rank's own pigment washed inside it over the page's near-black. It is the
 * construction `profileStyles.tierStamp` already used — that style carries the
 * comment "this is where rank lives now" — with the two faults corrected that a
 * page drawing exactly ONE stamp could never reveal:
 *
 *   1. THE HIERARCHY WAS INVERTED. Both ranks sit together in a feed, and a
 *      brass hairline is brighter than a crimson one on near-black, so the
 *      LESSER rank read louder. The Auteur is struck at full pressure now and
 *      the Archivist as a lighter impression — which is what a lesser stamp IS
 *      in printing. The medium carries the rank; there is no second shape.
 *   2. THE WORD FAILED CONTRAST. `colors.crimson` on that ground measures
 *      3.16:1 — over the app's 3:1 floor, under the 4.5 that 8pt type wants.
 *      `crimsonInk` exists in the Ledger for exactly this, at 5.40:1. Sepia on
 *      the same ground is already 6.24:1.
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
 * The wash, per rank: the rank's own pigment falling to the page's own ink.
 *
 * Two stops. A third at two percent sat so close to the ground it was heading
 * for that it changed nothing visible — and its value collided with the tail of
 * the archive feed's tier rule, which is the theme naming one colour twice.
 */
export const STAMP_CRIMSON = [colors.stampCrimsonHead, colors.stampGround] as const;
export const STAMP_BRASS = [colors.stampBrassHead, colors.stampGround] as const;

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

/**
 * The edge, per rank: full pressure, or a lighter impression.
 *
 * The Archivist's is `sepiaBorderStrong`, which the Ledger already carries — a
 * strong brass border is precisely what this is, and inventing a second token a
 * hundredth away from it would be the drift this whole exercise is about.
 */
export const STAMP_RIM_AUTEUR = colors.crimson;
export const STAMP_RIM_ARCHIVIST = colors.sepiaBorderStrong;

/** The word, per rank. Both clear 4.5:1 on the stamp's ground. */
export const STAMP_INK_AUTEUR = colors.crimsonInk;
export const STAMP_INK_ARCHIVIST = colors.sepia;
