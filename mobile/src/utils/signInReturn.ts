/**
 * signInReturn — where a sign-in brings a member back to (P4.19, P4.21).
 *
 * A stranger is asked in from many places: a screen only members may open, a rope before an act
 * (useClearance, a guest's standing), the Society page, a film's LOG. Each sends them to the
 * sign-in carrying where they stood (`next`); signed in, they land there, not on the Lobby, and
 * everything they were doing is still in reach.
 *
 * The address comes from a link as well as from the app, so it is held to the shapes of the
 * app's own screens before the app goes there: each path one of RETURNS (a literal segment, or a
 * dynamic one of its kind), its query at most the names the screen reads, each value of plain
 * characters. Anything else lands on the Lobby. Never a door (the sign-in itself, the email
 * links' screens, the tribunal), never another host. aStrangerIsAskedInAndBroughtBack.test.tsx holds
 * RETURNS to app/'s routes: every route is in it or in NEVER, with its reason.
 */

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const TMDB = '[1-9][0-9]{0,9}';
const HANDLE = '[A-Za-z0-9_.-]{1,64}';

/** One screen a sign-in may return to: its path, and the query names it reads. */
interface Return { path: RegExp; query?: readonly string[] }
const at = (path: string, query?: readonly string[]): Return => ({ path: new RegExp(`^${path}$`), query });

/** Every screen a stranger can be asked in from, by its address's shape. */
export const RETURNS: readonly Return[] = [
  // The tabs, as the router names them (groups are not in a path).
  at('/'), at('/darkroom'), at('/dispatch'), at('/lounge'), at('/profile'), at('/reels'),
  // The presented screens.
  at('/notifications-modal'), at('/search-modal'),
  at('/list-modal', ['editId']),
  at('/cover-picker', ['loungeId']),
  at('/log-modal', ['filmId', 'editLogId', 'filmTitle', 'filmPoster', 'filmYear']),
  at('/membership', ['reason', 'rank']),
  at('/social-modal', ['userId', 'type', 'shareFilmId', 'shareFilmTitle', 'shareFilmPoster', 'shareFilmYear', 'personId', 'personName']),
  // The pushed screens.
  at('/dispatch/archive'), at('/dispatch/compose', ['kind']), at('/dispatch/rules'),
  at(`/dispatch/room/${HANDLE}`), at(`/dispatch/series/${UUID}`, ['from']), at(`/dispatch/${UUID}`),
  at(`/dossier/${UUID}`), at('/edit-profile'), at(`/film-reviews/${TMDB}`, ['title']), at(`/film/${TMDB}`),
  at(`/log/${UUID}`), at(`/lounge/${UUID}`, ['door']), at(`/person/${TMDB}`), at('/settings'),
  at(`/stacks/${UUID}`), at(`/user/${HANDLE}`), at('/year-in-cinema'),
];

/** The routes a sign-in never returns to, and why: each is a door, not a room. */
export const NEVER: Readonly<Record<string, string>> = {
  'app/(modals)/login.tsx': 'the sign-in itself: returning to it would ask again',
  'app/auth-callback.tsx': "an email link's landing: its code is spent once",
  'app/reset-password.tsx': "a recovery link's landing: it needs the recovery session, not a sign-in",
  'app/(admin)/tribunal.tsx': 'the house officers\' room: no link of a stranger leads there',
  'app/lounge.tsx': 'the Lounge tab\'s old address: it sends on to /lounge, which is returned to',
};

/**
 * A query value a sign-in carries back: words of any script (a film's title), never a control
 * character; the screen's own parser then reads it in its kind (routeParams).
 */
const PLAIN = /^[^\u0000-\u001f\u007f]{1,300}$/;

/** Where a sign-in goes: the screen that asked, when it is one of RETURNS, or the Lobby. */
export function returnAfterSignIn(next: string | null | undefined): string {
  // An address of more characters than any screen's is no screen's.
  if (!next || Array.from(next).length > 600) return '/(tabs)';
  const q = next.indexOf('?');
  const path = q < 0 ? next : next.slice(0, q);
  const query = q < 0 ? '' : next.slice(q + 1);
  const shape = RETURNS.find((r) => r.path.test(path));
  if (!shape) return '/(tabs)';
  if (q < 0) return next;
  if (query === '') return '/(tabs)';
  const pairs = query.split('&').map((p) => p.split('='));
  const named = new Set<string>();
  for (const pair of pairs) {
    const [name, raw] = pair;
    if (pair.length !== 2 || !name || raw === undefined || named.has(name) || !shape.query?.includes(name)) return '/(tabs)';
    let value: string;
    try { value = decodeURIComponent(raw.replace(/\+/g, ' ')); } catch { return '/(tabs)'; }
    if (!PLAIN.test(value)) return '/(tabs)';
    named.add(name);
  }
  return next;
}

/**
 * The sign-in, told where to bring the member back to (when it is one of RETURNS); with 'signup',
 * the door opens on joining.
 */
export function signInHref(next: string | null | undefined, action?: 'signup'): string {
  const to = returnAfterSignIn(next);
  const query = [...(action ? [`action=${action}`] : []), ...(to === '/(tabs)' ? [] : [`next=${encodeURIComponent(to)}`])];
  return query.length ? `/login?${query.join('&')}` : '/login';
}
