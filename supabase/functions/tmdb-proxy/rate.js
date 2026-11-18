/**
 * How fast one address may make the proxy ask TMDB.
 *
 * Only a question the proxy must take to TMDB is counted (a miss): an answer
 * already in its cache costs TMDB nothing, and is never refused. Each address
 * has a pail of tokens: 1,200 at once, then 20 a second (1,200 a minute). Many
 * members share one address (a carrier, a campus, an office), so it is loose,
 * only a guard against one address asking without end: a screen of posters, a
 * search through every fallback, or an archive import of 500 films (the app's,
 * paced at 3 a second, or the website's) stays inside it. TMDB's own limit is
 * TMDB's to say: its 429 is passed on with its Retry-After.
 *
 * A caller refused is told when a token is next due (Retry-After), so the app
 * waits and asks again rather than telling the member the catalogue is gone.
 * In memory, so per edge instance; the cache absorbs most of the load.
 *
 * Kept as plain JavaScript with no imports so the mobile Jest suite can load it
 * (theCatalogueIsAskedAtItsPace.test.ts), as paths.js is.
 */

export const ADDRESS_BURST = 1200;
export const ADDRESS_PER_SECOND = 20;

/** How many addresses are remembered; the longest unseen is forgotten first. */
const REMEMBERED = 5000;

/**
 * Pails of tokens, one per key. `wait(key, now)` is how many ms until a token
 * is due (0: one is there); `take(key, now)` spends one.
 */
export function pails(burst, perSecond, remembered = REMEMBERED) {
  const held = new Map();
  const level = (key, now) => {
    const pail = held.get(key);
    if (!pail) return burst;
    return Math.min(burst, pail.tokens + ((now - pail.at) * perSecond) / 1000);
  };
  return {
    wait(key, now) {
      const tokens = level(key, now);
      return tokens >= 1 ? 0 : Math.ceil(((1 - tokens) * 1000) / perSecond);
    },
    take(key, now) {
      const tokens = level(key, now) - 1;
      // Moved to the end, so the first in the map is always the longest unseen.
      held.delete(key);
      if (held.size >= remembered) {
        const oldest = held.keys().next().value;
        if (oldest !== undefined) held.delete(oldest);
      }
      held.set(key, { tokens, at: now });
    },
  };
}

/**
 * The proxy's rule, one per edge instance. `admit({ address, now })` for a
 * question TMDB must answer: `{ ok: true }` and a token is spent, or
 * `{ ok: false, retryAfter }` in whole seconds (at least 1) and none is.
 */
export function rateRule() {
  const addresses = pails(ADDRESS_BURST, ADDRESS_PER_SECOND);
  return function admit({ address, now }) {
    const wait = addresses.wait(address, now);
    if (wait > 0) return { ok: false, retryAfter: Math.max(1, Math.ceil(wait / 1000)) };
    addresses.take(address, now);
    return { ok: true };
  };
}
