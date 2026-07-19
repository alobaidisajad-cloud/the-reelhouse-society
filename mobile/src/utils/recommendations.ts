/**
 * recommendations.ts — the brain of "YOU MAY ALSO LIKE".
 * ─────────────────────────────────────────────────────────────
 * Pure, side-effect-free, unit-tested. Two stages, deliberately split so
 * the personal filter stays LIVE:
 *
 *   1. buildRecommendationPool — runs inside the cached film query. Blends
 *      TMDB's behaviour-based /recommendations (primary) with /similar
 *      (fallback for obscure titles), dedupes, drops the film itself and any
 *      poster-less entry. Stable TMDB data → safe to cache.
 *
 *   2. filterUnseenFilms — runs at RENDER time from the in-memory logged
 *      index. Excludes films you've already logged, so a film vanishes from
 *      the shelf the instant you log it (a cached filter would go stale).
 *
 * Never recommends the current film, a duplicate, a poster-less card, or a
 * film you've seen. Thins gracefully; the section hides itself only when
 * genuinely nothing remains.
 */

export interface RecFilm {
  id: number;
  title?: string;
  name?: string;
  poster_path?: string | null;
  [key: string]: unknown;
}

const POOL_CAP = 20;   // raw pool — headroom so the personal filter rarely thins the display
const DISPLAY_CAP = 12; // final shown

/**
 * Stage 1: blend recommendations + similar into a clean, deduped, self-free,
 * poster-only pool. Recommendations lead (higher quality); similar backfills.
 */
export function buildRecommendationPool(
  recommendations: unknown,
  similar: unknown,
  currentFilmId: number
): RecFilm[] {
  const recs = Array.isArray(recommendations) ? (recommendations as RecFilm[]) : [];
  const sim = Array.isArray(similar) ? (similar as RecFilm[]) : [];

  const seen = new Set<number>();
  const pool: RecFilm[] = [];

  for (const f of [...recs, ...sim]) {
    if (!f || typeof f.id !== 'number') continue;
    if (f.id === currentFilmId) continue;      // never recommend the film to itself
    if (!f.poster_path) continue;              // a poster-less card looks broken
    if (seen.has(f.id)) continue;              // dedupe across both sources
    seen.add(f.id);
    pool.push(f);
    if (pool.length >= POOL_CAP) break;
  }
  return pool;
}

/**
 * Stage 2: drop films the user has already logged. `loggedIndex` is the
 * in-memory map keyed by film id (useFilmStore._loggedIndex). Capped for
 * display. Returns whatever quality unseen films remain — never pads with
 * already-seen films.
 */
export function filterUnseenFilms(
  pool: RecFilm[] | undefined,
  loggedIndex: Record<number, unknown> | undefined
): RecFilm[] {
  if (!pool || pool.length === 0) return [];
  const idx = loggedIndex ?? {};
  const out: RecFilm[] = [];
  for (const f of pool) {
    if (idx[f.id]) continue; // already logged → already seen
    out.push(f);
    if (out.length >= DISPLAY_CAP) break;
  }
  return out;
}
