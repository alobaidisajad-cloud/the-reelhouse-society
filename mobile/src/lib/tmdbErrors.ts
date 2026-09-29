/**
 * The film catalogue could not be reached: no connection, or the proxy failed
 * after its retries. Different from "not there" (a film TMDB does not have),
 * which the catalogue answers with its fallback. A screen that draws "nothing
 * found" for this one tells the member something false.
 *
 * Its own module, not tmdb.ts: the tests replace tmdb.ts wholesale, and a
 * screen's check for this error must still be the real one there.
 */
export class TmdbUnreachable extends Error {
  constructor(readonly path: string, readonly why: string) {
    super(`The film catalogue could not be reached (${why})`);
    this.name = 'TmdbUnreachable';
  }
}

export function isTmdbUnreachable(e: unknown): e is TmdbUnreachable {
  return e instanceof TmdbUnreachable || (e as { name?: unknown } | null)?.name === 'TmdbUnreachable';
}
