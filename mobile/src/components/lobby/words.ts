/**
 * THE LOBBY'S OWN WORDS — every line the house prints on its wall, in one place.
 * ─────────────────────────────────────────────────────────────────────────────
 * Each is set LINE BY LINE: a line is one line, always. It grows with the
 * member's text size until the room it is given is full, and no further; where
 * even its normal size would not fit, the layout gives way (measure.ts). So a
 * line here is never wrapped, cut, or shrunk below the size it was set at — and
 * `theWallHasNoDeadEnds.test.tsx` fails if one the wall draws is wider than the
 * room it is given, on any phone, at any text size.
 *
 * The house voice: an order, then the house's deadpan answer. No borrowed
 * lines: nothing here quotes a film, a programme or another poster.
 */
import { type PaidRankId, rankById } from '@/src/constants/membership';

export const MASTHEAD = {
  kick: 'NOW ENTERING',
  name: 'The Lobby',
} as const;

export const ONE_SHEET = {
  tagline: ['Attendance is voluntary.', 'Enthusiasm is expected.'],
  now: 'NOW SHOWING',
  directedBy: (director: string) => `DIRECTED BY ${director.toUpperCase()}`,
} as const;

export const BILL = {
  head: ['ALSO', 'ON THE', 'BILL'],
  all: 'ALL ›',
} as const;

export const LOG_BILL = {
  slab: ['Featured', 'Log'],
  readOn: 'READ ›',
  on: (film: string) => `ON ${film.toUpperCase()}`,
  slogan: ['A certified opinion', 'is a public service.'],
  vacant: ['No log yet.', 'The first one', 'hangs here.'],
  vacantDoor: 'LOG A FILM ›',
} as const;

export const STACK_BILL = {
  slab: ['Featured', 'Stack'],
  films: (n: number) => `${n} FILMS`,
  seeAll: 'SEE ALL ›',
  slogan: ['Every stack', 'is a confession.'],
  vacant: ['No stack yet.', 'The first one', 'hangs here.'],
  vacantDoor: 'START A STACK ›',
} as const;

export const FILINGS_BILL = {
  kick: 'FROM THE DISPATCH',
  name: 'Featured Filings',
  door: 'THE DISPATCH ›',
  readOn: 'READ ›',
  file: 'FILE ›',
  vacant: (empty: 1 | 2 | 3) => (['', 'ONE COLUMN VACANT', 'TWO COLUMNS VACANT', 'THREE COLUMNS VACANT'] as const)[empty],
  roomLeft: ['The page has room.', 'The house suggests you.'],
  nothingYet: ['Nothing has been filed yet.', 'The first filing hangs here.'],
  slogan: ['Report all good cinema', 'to the Dispatch.'],
} as const;

export const RANK_BILL = {
  name: 'Take Your Rank',
  sub: ['The house has seen your taste.', 'It would like to see more of it.'],
  subArchivist: ['You keep the record.', 'Now write at length.'],
  thanks: ['The House', 'Thanks You'],
  thanksSub: ['For your service as an Auteur.', 'It will not say so again.'],
  enlistAs: 'ENLIST AS',
  privileges: 'THE PRIVILEGES',
  yourFile: 'YOUR FILE',
  fine: ['YOUR MARK IS PRESSED BESIDE', 'YOUR NAME, WHEREVER IT APPEARS.'],
} as const;

/** A rank's name and its two lines on the Lobby, read from the Society's own list. */
export function rankTicket(rank: PaidRankId): { name: string; lines: readonly [string, string] } {
  const r = rankById(rank);
  return { name: r.name, lines: r.lobbyLine as readonly [string, string] };
}

/** An admin's switch, on each piece that hangs. */
export const KEEP_OFF = 'KEEP OFF THE LOBBY';

export const STATES = {
  refreshFailed: ['Could not refresh —', 'check your connection.'],
  tryAgain: 'TRY AGAIN',
  programmeDark: ['Transmission', 'Interrupted'],
  programmeDarkSub: ['The programme', 'could not be reached.'],
} as const;

export const SIGNOFF = 'The projection booth never closes.';
