import { colors } from '@/src/theme/theme';

/**
 * standing.ts — how far a member has come, decided in ONE place.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 * There were three ladders, and they disagreed:
 *
 *   films │ the Projector Room  │ the badge grid     │ the film store
 *   ──────┼─────────────────────┼────────────────────┼──────────────────
 *      0  │ FIRST REEL          │ FIRST REEL locked  │ FIRST REEL
 *     12  │ THE REGULAR         │ The Regular ✓      │ THE REGULAR
 *     30  │ MIDNIGHT DEVOTEE    │ Midnight Devotee ✓ │ THE DEVOTEE
 *     60  │ THE ORACLE          │ The Oracle LOCKED  │ THE DEVOTEE
 *
 * At sixty films the Projector Room crowned a member The Oracle while the badge
 * grid on the very same screen showed The Oracle as not yet earned. And at zero
 * films it congratulated them on a badge that requires one.
 *
 * The badge grid wins, because it is the only one that makes the member a
 * PROMISE they can read: "Log 100 films". A rank that contradicts a printed
 * promise is the rank that is wrong.
 *
 * ── THE RUNG AT ZERO ─────────────────────────────────────────────────────────
 * FIRST REEL is earned at one film, so it cannot also be what you are called
 * before you have logged any. UNSEATED is the honest name for a member who has
 * joined but not yet taken a seat — and it is the only rung that is not also a
 * badge, precisely because nothing has been earned yet.
 */

export interface Rung {
  /** Films required to hold this standing. */
  at: number;
  name: string;
  color: string;
}

/**
 * Ascending, and the thresholds ARE the badge thresholds — Achievements reads
 * them from here, so a change to one can never leave the other behind. That
 * divergence is the entire bug this file closes.
 */
export const STANDING_LADDER: readonly Rung[] = [
  { at: 0,   name: 'UNSEATED',         color: colors.fog },
  { at: 1,   name: 'FIRST REEL',       color: colors.bone },
  { at: 10,  name: 'THE REGULAR',      color: colors.flicker },
  { at: 25,  name: 'MIDNIGHT DEVOTEE', color: colors.crimson },
  { at: 100, name: 'THE ORACLE',       color: colors.sepia },
] as const;

/** The threshold a named badge is earned at — read by the Achievements grid. */
export function rungAt(name: string): number {
  return STANDING_LADDER.find((r) => r.name === name)?.at ?? Number.MAX_SAFE_INTEGER;
}

export interface Standing {
  name: string;
  color: string;
  /** Films needed for the rung currently held. */
  at: number;
  /** The next rung, or null at the top of the ladder. */
  next: Rung | null;
  /** Films still to log before the next rung. 0 at the top. */
  toNext: number;
  /**
   * How far along the CURRENT rung, 0–100.
   *
   * The old expression was `(films % 20) * 5` — a sawtooth with no relation to
   * the ladder it sat under. It reset to zero every twenty films, so a member
   * with 2,481 films opened their own stats page and saw an empty bar. It also
   * hit 95% at nineteen films and 0% at twenty, while the rank name did not
   * move at either.
   *
   * At the highest rung this is 100 and `isHighest` is true — and the room is
   * expected to draw NO BAR at all rather than a full one, because a full bar
   * still implies there is somewhere left to go.
   */
  progress: number;
  isHighest: boolean;
}

export function standingFor(films: number): Standing {
  const n = Number.isFinite(films) && films > 0 ? Math.floor(films) : 0;

  let i = 0;
  for (let k = 0; k < STANDING_LADDER.length; k++) {
    if (n >= STANDING_LADDER[k].at) i = k;
  }
  const held = STANDING_LADDER[i];
  const next = i + 1 < STANDING_LADDER.length ? STANDING_LADDER[i + 1] : null;

  if (!next) {
    return { name: held.name, color: held.color, at: held.at, next: null, toNext: 0, progress: 100, isHighest: true };
  }

  const span = next.at - held.at;
  const progress = span > 0 ? Math.max(0, Math.min(100, Math.round(((n - held.at) / span) * 100))) : 0;

  return {
    name: held.name,
    color: held.color,
    at: held.at,
    next,
    toNext: Math.max(0, next.at - n),
    progress,
    isHighest: false,
  };
}
