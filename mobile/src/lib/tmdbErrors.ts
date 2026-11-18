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
  /**
   * `answered`: the house's proxy answered (a 5xx after its tries, or its own deadline for TMDB
   * spent, 504): the phone's connection is fine and TMDB is the one not answering.
   */
  constructor(readonly path: string, readonly why: string, readonly answered: boolean = false) {
    super(`The film catalogue could not be reached (${why})`);
    this.name = 'TmdbUnreachable';
  }
}

export function isTmdbUnreachable(e: unknown): e is TmdbUnreachable {
  return e instanceof TmdbUnreachable || (e as { name?: unknown } | null)?.name === 'TmdbUnreachable';
}

/**
 * The house's catalogue asked us to wait: this phone has asked TMDB more than its share for the
 * moment (the proxy's 429). The connection is fine, so it is never TmdbUnreachable: an import
 * waits `retryAfterMs` and goes on, and a screen asks again.
 */
export class TmdbBusy extends Error {
  constructor(readonly path: string, readonly retryAfterMs: number) {
    super(`The film catalogue asked us to wait ${Math.ceil(retryAfterMs / 1000)} s`);
    this.name = 'TmdbBusy';
  }
}

export function isTmdbBusy(e: unknown): e is TmdbBusy {
  return e instanceof TmdbBusy || (e as { name?: unknown } | null)?.name === 'TmdbBusy';
}
