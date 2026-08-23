/**
 * taste.ts — what a member's archive says about them, and when we may say it.
 *
 * The shape the server returns, and the one rule governing whether a section
 * is allowed to draw a conclusion from it.
 */

export interface TasteCount {
  name: string;
  count: number;
}

/**
 * A person, with the face the insights panel draws.
 *
 * The id is here because two people share a name more often than you would
 * think, and merging them would invent somebody who does not exist. The
 * profile path is here because that section shows PHOTOGRAPHS — storing only
 * names would have quietly deleted every face while the numbers got better.
 * Found by reading the render, not the data.
 */
export interface TastePerson {
  id: number;
  name: string;
  profile_path: string | null;
  count: number;
}

export interface TasteProfile {
  /** Distinct films the member has logged. A rewatch counts ONCE. */
  films_total: number;
  /** How many of those we have read the details of. */
  films_known: number;
  genres: TasteCount[];
  actors: TastePerson[];
  directors: TastePerson[];
  countries: { code: string; count: number }[];
  /** Minutes across every film we know — the "what fits in 90 minutes?" data. */
  total_runtime: number;
}

/**
 * How much of an archive must be read before a ranking drawn from it is
 * honest.
 *
 * ── WHY A THRESHOLD AT ALL ───────────────────────────────────────────────────
 * The films table fills in over time. On the first day this ships, a member
 * with two thousand films might have thirty read. Ranking those thirty would
 * produce a confident, beautifully drawn, completely false portrait of somebody
 * — which is the exact failure this whole pass exists to remove, reappearing in
 * a new place.
 *
 * ── WHY NINETY AND NOT A HUNDRED ─────────────────────────────────────────────
 * This is a RANKING, not a count, and the two deserve different rules. A count
 * from 90% of the data is simply wrong. A top-five drawn from 90% of a large
 * archive is the same top five — the missing tenth would have to be wildly
 * unrepresentative to move it, and it is a random tenth, not a chosen one.
 *
 * Waiting for the hundredth percent would mean one unreadable film — a title
 * TMDB has dropped, which is what `sync_failed` exists for — hiding a member's
 * entire taste profile for ever.
 *
 * Below the line the section says what it is doing instead of guessing.
 */
export const TASTE_COVERAGE_FLOOR = 0.9;

export interface TasteReadiness {
  /** May a section draw conclusions yet? */
  ready: boolean;
  /** 0–1. */
  coverage: number;
  known: number;
  total: number;
  /**
   * True once every film is read.
   *
   * Distinct from `ready`: between the floor and here, a section shows its
   * ranking AND says what it was drawn from. Never silently — a member should
   * always be able to tell the difference between "your taste" and "your taste
   * so far", and the line costs one row of small type.
   */
  complete: boolean;
}

/**
 * `Math.max(0, NaN)` is NaN, not 0 — so a single unexpected value would make
 * `total === 0` false, `known / total` NaN, and every comparison below false:
 * the panel would sit on "reading your archive" for ever with no error anywhere.
 * A count that is not a finite number is a count we do not have.
 */
function count(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

export function tasteReadiness(profile: TasteProfile | null | undefined): TasteReadiness {
  const total = count(profile?.films_total);
  const known = Math.min(total, count(profile?.films_known));

  // No films is not "not ready" — it is a member who has logged nothing, and
  // the section's own empty state is the honest answer there.
  if (total === 0) return { ready: false, coverage: 0, known: 0, total: 0, complete: false };

  const coverage = known / total;
  return {
    ready: coverage >= TASTE_COVERAGE_FLOOR,
    coverage,
    known,
    total,
    complete: known === total,
  };
}

/** "from 2,315 of your 2,481 films" — shown only while that is still true. */
export function coverageNote(r: TasteReadiness, tally: (n: number) => string): string | null {
  if (!r.ready || r.complete) return null;
  return `from ${tally(r.known)} of your ${tally(r.total)} films`;
}
