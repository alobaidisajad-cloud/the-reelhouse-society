/**
 * pageInFront — a notice opened about the page already in front tells that page; it never stacks a
 * copy of it, and it never does nothing.
 * ─────────────────────────────────────────────────────────────────────────────
 * Round 4 stopped a tapped push stacking a second copy of the page in front, by comparing where it
 * leads with where the member stands. Two things were left (review round 12):
 *
 *   - The comparison read the whole address, query and all. A salon's notice leads to
 *     `/lounge/<id>?door=1`, the room opened from the corridor is `/lounge/<id>`: a host sitting in
 *     their salon who tapped "@X is asking to enter" had a second copy of the room stacked over it,
 *     and the two shared one live channel until the copy, leaving, took it from the room beneath.
 *     So the PATH is compared, the query left out.
 *   - The page in front was told nothing: a critique announced on the essay being read, or a ballot
 *     closed over the open ballot, was marked read and never read on the page. So the page in front
 *     is told, with the query the notice carried, and it reads again what the notice is about
 *     (useReadAgainWhenToldHere); a salon told `door=1` opens its door.
 *
 * Only the screen in front hears it: a copy of the same page under another screen is not told.
 */
import { currentPathname } from './openSociety';
import { nav } from './typedRouter';

/** One page listening: told only while it is the screen in front (`inFront`). */
interface Listener { inFront: () => boolean; told: (query: URLSearchParams) => void }

const listening = new Map<string, Set<Listener>>();

/** The path of a route: its query and fragment left out. */
export function pathOf(route: string): string {
  const end = route.search(/[?#]/);
  return end === -1 ? route : route.slice(0, end);
}

/** The query a route carries, read. */
export function queryOf(route: string): URLSearchParams {
  const at = route.indexOf('?');
  if (at === -1) return new URLSearchParams();
  const hash = route.indexOf('#', at);
  return new URLSearchParams(route.slice(at + 1, hash === -1 ? undefined : hash));
}

/** A page heard at `path` while `inFront` says it is the screen in front. Returns the stop. */
export function listenHere(path: string, inFront: () => boolean, told: (query: URLSearchParams) => void): () => void {
  const one: Listener = { inFront, told };
  const set = listening.get(path) ?? new Set<Listener>();
  listening.set(path, set);
  set.add(one);
  return () => {
    set.delete(one);
    if (set.size === 0 && listening.get(path) === set) listening.delete(path);
  };
}

/**
 * Whether `route` leads to the page the member is on (its path, the query left out). When it does,
 * the page is told, with the route's query, and true is returned: nothing is to be opened.
 */
export function tellThePageInFront(route: string): boolean {
  const path = pathOf(route);
  if (currentPathname() !== path) return false;
  const query = queryOf(route);
  for (const one of [...(listening.get(path) ?? [])]) {
    if (one.inFront()) one.told(query);
  }
  return true;
}

/** Opens `route`, or, when its page is the one in front, tells that page instead of stacking a copy. */
export function openOrTellHere(route: string): void {
  if (!tellThePageInFront(route)) nav.push(route);
}
