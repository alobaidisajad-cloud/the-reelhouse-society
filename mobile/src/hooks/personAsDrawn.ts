/**
 * personAsDrawn — a person's catalogue answer cut to what their page draws, as filmAsDrawn is a film's.
 *
 * The person page kept every credit whole: each film's overview, original title, genres and the
 * rest, about 94 KB for Hayao Miyazaki's 220 credits (the repo's recorded answer, person 608). The
 * read is kept on the phone with the rest of the cache, and every write of the cache serialised it:
 * on the route walk, one write of 125 KB held the JS thread 118 ms and another 236 ms (nightly
 * 2026-11-24, right-to-left and tablet), past the 100 ms a write may hold it (screen-times.mjs).
 * The page draws each film's id, title, poster, backdrop, year, standing (its votes counted, its
 * popularity), the part played and the jobs held: those are kept, and the page draws the same from
 * them. A credit's own job is among its jobs; its rating the page never reads.
 */

/** A credit as the person page draws it. */
export interface PersonCredit {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  vote_count?: number;
  popularity?: number;
  character?: string;
  /** All crew jobs this person held on the film: the merge keeps every hat. */
  jobs?: string[];
  /** True when they appear on screen (a cast credit). */
  acted?: boolean;
}

/** The person as their page draws them. */
export interface PersonDetail {
  name: string;
  profile_path: string | null;
  birthday: string | null;
  deathday: string | null;
  place_of_birth: string | null;
  known_for_department: string | null;
  biography: string | null;
}

const CREDIT_DRAWN = ['id', 'title', 'name', 'poster_path', 'backdrop_path', 'release_date', 'vote_count', 'popularity',
  'character', 'jobs', 'acted'] as const satisfies readonly (keyof PersonCredit)[];
const PERSON_DRAWN = ['name', 'profile_path', 'birthday', 'deathday', 'place_of_birth', 'known_for_department',
  'biography'] as const satisfies readonly (keyof PersonDetail)[];

/** Only the fields named, those the answer holds. */
function pick<T>(from: Record<string, unknown>, keys: readonly string[]): T {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (from[k] !== undefined) out[k] = from[k];
  return out as T;
}

/** One credit, as the page draws it. */
export const creditAsDrawn = (credit: Record<string, unknown>): PersonCredit => pick<PersonCredit>(credit, CREDIT_DRAWN);

/** The person, as their page draws them. */
export const personAsDrawn = (person: Record<string, unknown>): PersonDetail => pick<PersonDetail>(person, PERSON_DRAWN);
