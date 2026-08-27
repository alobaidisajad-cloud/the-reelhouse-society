/**
 * brass.ts — the house's brass, in one place.
 *
 * ── WHY THIS IS SHARED AND NOT COPIED ───────────────────────────────────────
 * Brass is a RAMP, not a colour: four golds on a diagonal, lit from the top
 * left, with a crown highlight where a convex metal face catches a room's
 * light. A flat `colors.sepia` rectangle reads as yellow plastic.
 *
 * These values lived inside ConciergeButton, and the film page's stub is the
 * second brass object in the app. Copying them would have produced two brasses
 * that agree today and drift the first time either is touched — and nobody
 * would notice until the two sat on screen together, which is exactly when it
 * matters. So the ramp is stated once and imported.
 */
import { colors } from '@/src/theme/theme';

/** Light to aged. All four are Shade Ledger tokens. */
export const BRASS = [colors.marqueeGold, colors.champagne, colors.sepia, colors.tarnish] as const;

export const BRASS_STOPS = [0, 0.34, 0.62, 1] as const;

/** Lit from the top left, the way a plate on a counter is. */
export const BRASS_START = { x: 0.15, y: 0 } as const;
export const BRASS_END = { x: 0.85, y: 1 } as const;

/**
 * The crown: `flicker`, the palette's candlelight, falling off over the top of
 * the face. Without it the ramp reads as a gradient; with it, as metal.
 */
export const CROWN = ['rgba(240,232,176,0.40)', 'rgba(240,232,176,0.10)', 'transparent'] as const;

/** How far down the face the crown reaches. */
export const CROWN_HEIGHT = '48%' as const;

/**
 * The machined edge. Bright rather than dark: against near-black chrome a dark
 * rim is simply invisible, and real brass catches light all the way round.
 */
export const RIM = 'rgba(240,232,176,0.30)';

/**
 * Ink on brass. Every mark on a brass face — glyph, label, chevron — is the
 * page's own near-black, never a grey, because a grey on gold is the one
 * combination that fails contrast while looking fine in a mockup.
 */
export const ON_BRASS = colors.ink;

/** A rule drawn ON brass: ink at low alpha, so it reads as scored metal. */
export const ON_BRASS_RULE = 'rgba(10,9,6,0.42)';
export const ON_BRASS_MUTED = 'rgba(10,9,6,0.72)';
