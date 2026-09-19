/**
 * membership.ts — what each rank of the Society holds, said once.
 * ─────────────────────────────────────────────────────────────────────────────
 * This is the price list, and a price list is the one document a member is
 * entitled to hold us to. Everything the Society page shows is read from here:
 * the tickets, the free seat, the ledger that compares them, and the line under
 * the poster when a locked door sent the member. There is no second copy.
 *
 * ── WHY ONE LIST OF PRIVILEGES, NOT A LIST PER RANK ─────────────────────────
 * The page draws every privilege twice — on its rank's ticket, and as a row of
 * the ledger — and the old page kept each rank's list separately, with hard
 * line breaks typed into the names to fit a card that no longer exists. Two
 * drawings of one fact is how they come to disagree. So each privilege is ONE
 * record: its name, the plain sentence that says what it does, the lowest rank
 * that holds it, and the ledger row it fills.
 *
 * ── WHAT IS CHECKED, AND WHERE ──────────────────────────────────────────────
 *   · every PAID name is a promise `gatedFeatures.ts` backs with a trigger,
 *     a stripping trigger, or a stated client-only reason — or is the rank's
 *     own mark, which is drawn from the rank itself (`RANK_MARKS`);
 *   · every FREE name is in `FREE_PROMISES`, whose tables may carry no tier gate;
 *   · the web's Society page sells exactly these names
 *     (`theTwoClientsSellTheSameThing`, in the web suite);
 *   · `npm run gates:check` holds the claims against production.
 *
 * ── REMOVED, AND WHY ────────────────────────────────────────────────────────
 *   "The Gilded Frame (Exclusive Animated Gold Borders)" — built nowhere, sold
 *   for months. "Poster Glow Profile Aesthetics" — named nothing a member could
 *   find (the feature is the Backdrop). "Gold Foil Badge" — the mark is not
 *   gold. "Early Access to New Features" — no mechanism existed that gave anyone
 *   early access to anything, so it was a promise nothing kept. "MOST POPULAR" —
 *   said of a rank nobody had yet bought.
 */

export type RankId = 'cinephile' | 'archivist' | 'auteur';
export type PaidRankId = Exclude<RankId, 'cinephile'>;

/** Where a privilege sits in the ledger. */
export type LedgerGroup = 'page' | 'shelf' | 'house';

export const LEDGER_GROUPS: { id: LedgerGroup; label: string }[] = [
  { id: 'page', label: 'ON THE PAGE' },
  { id: 'shelf', label: 'ON THE SHELF' },
  { id: 'house', label: 'IN THE HOUSE' },
];

export interface Privilege {
  /** A stable key. Never shown. */
  id: string;
  /**
   * The name a member reads. For a paid privilege this is the PROMISE that
   * `gatedFeatures.ts` quotes character for character; for a free one it is the
   * line on the free seat, quoted by `FREE_PROMISES`.
   */
  name: string;
  /** One plain sentence: what it does, in words nobody has to learn. */
  detail: string;
  /** The lowest rank that holds it. Every rank above holds it too. */
  rank: RankId;
  group: LedgerGroup;
  /**
   * The ledger's row label, short enough for one line beside three columns —
   * or null where another row already says it (the Auteur's plate IS "your
   * rank's mark", which the Archivist's row already carries for both ranks).
   */
  ledger: string | null;
}

export const PRIVILEGES: Privilege[] = [
  // ── the free seat ──────────────────────────────────────────────────────────
  // Verified: `tr_tier_gate_dispatch` fires only WHEN kind IN ('ballot',
  // 'dossier'); dispatch_comments, _certifications, _votes, lists, list_items,
  // list_comments and the archive import carry no tier gate; the open salons
  // are readable by every member (a tier trigger never fires on a read).
  { id: 'log', name: 'Log, rate and review every film', detail: 'As many films, as many times, as you like.', rank: 'cinephile', group: 'page', ledger: 'Log, rate & review' },
  { id: 'lists', name: 'The Diary, Watchlist and lists', detail: 'Keep what you saw, what you mean to see, and lists without limit.', rank: 'cinephile', group: 'page', ledger: 'Diary, Watchlist, lists' },
  { id: 'import', name: 'Import and export your archive', detail: 'Bring your history in; take all of it with you.', rank: 'cinephile', group: 'page', ledger: 'Import & export' },
  { id: 'filings', name: 'File takes, seekings and wires', detail: 'The three free forms of the Dispatch.', rank: 'cinephile', group: 'house', ledger: 'Takes, seekings, wires' },
  { id: 'critique', name: 'Critique, certify and vote', detail: 'On any filing in the Dispatch, and in any ballot.', rank: 'cinephile', group: 'house', ledger: 'Critique, certify, vote' },
  { id: 'listen', name: 'Listen in on the open salons', detail: 'Read every open salon in the Lounge.', rank: 'cinephile', group: 'house', ledger: 'Listen in the Lounge' },

  // ── the Archivist ──────────────────────────────────────────────────────────
  { id: 'the-vault', name: 'The Vault', detail: 'Private notes on each viewing. Nobody reads them but you.', rank: 'archivist', group: 'page', ledger: 'The Vault' },
  { id: 'editorial-desk', name: 'The Editorial Desk', detail: 'Dress a review with a film still, a pull-quote and a drop cap.', rank: 'archivist', group: 'page', ledger: 'The Editorial Desk' },
  { id: 'the-lounge', name: 'The Lounge', detail: 'Take a seat in the salons, speak, and open a salon of your own.', rank: 'archivist', group: 'house', ledger: 'Speak & open salons' },
  { id: 'physical-archive', name: 'The Physical Archive', detail: 'Your 4K, Blu-ray and VHS shelf, kept on your profile.', rank: 'archivist', group: 'shelf', ledger: 'The Physical Archive' },
  { id: 'dispatch-archive', name: 'The Archive', detail: 'Every filing on a film, gathered on one page.', rank: 'archivist', group: 'shelf', ledger: 'The Archive' },
  { id: 'archivist-mark', name: 'The Archivist’s Mark', detail: 'Pressed beside your name, wherever it appears.', rank: 'archivist', group: 'shelf', ledger: 'Your rank’s mark' },

  // ── the Auteur ─────────────────────────────────────────────────────────────
  { id: 'breakdown-engine', name: 'The Breakdown Engine', detail: 'Score a film on six counts: story, script, acting, cinematography, editing, sound.', rank: 'auteur', group: 'page', ledger: 'The Breakdown Engine' },
  { id: 'essays', name: 'Essays & Ballots', detail: 'Publish long essays and open ballots in the Dispatch.', rank: 'auteur', group: 'house', ledger: 'Essays & ballots' },
  { id: 'private-rooms', name: 'Private Screening Rooms', detail: 'Found a salon behind a door. You admit each guest.', rank: 'auteur', group: 'house', ledger: 'Private screening rooms' },
  { id: 'curatorial-control', name: 'Curatorial Control', detail: 'Hang a different poster on any film you log.', rank: 'auteur', group: 'page', ledger: 'Curatorial Control' },
  { id: 'the-backdrop', name: 'The Backdrop', detail: 'Your profile, dressed in a still from a film you love.', rank: 'auteur', group: 'shelf', ledger: 'The Backdrop' },
  { id: 'auteur-plate', name: 'The Auteur’s Plate', detail: 'The framed mark, beside your name.', rank: 'auteur', group: 'shelf', ledger: null },
];

/** The order the ranks stand in. Holding one means holding every one below it. */
export const RANK_ORDER: RankId[] = ['cinephile', 'archivist', 'auteur'];

export const rankIncludes = (held: RankId, needed: RankId): boolean =>
  RANK_ORDER.indexOf(held) >= RANK_ORDER.indexOf(needed);

/** What a ticket lists: only what this rank adds over the one below it. */
export const privilegesOf = (rank: RankId): Privilege[] => PRIVILEGES.filter((p) => p.rank === rank);

export interface Rank {
  id: RankId;
  /** As it is written on the ticket. */
  name: string;
  /** One line of character under the name. */
  character: string;
  /** The line above the list: what this rank adds to. */
  includes: string | null;
  /**
   * Static prices — ONLY the fallback for when the store cannot be reached.
   * The live, localized store price is always preferred (useMembershipPricing).
   */
  priceMonthly: string | null;
  priceAnnual: string | null;
  cta: string;
  /** The house's recommendation — an opinion, stated as one. */
  recommended?: boolean;
}

export const RANKS: Rank[] = [
  {
    id: 'cinephile',
    name: 'The Cinephile',
    character: 'Free. For good. We checked.',
    includes: null,
    priceMonthly: null,
    priceAnnual: null,
    cta: 'JOIN FREE',
  },
  {
    id: 'archivist',
    name: 'The Archivist',
    character: 'For those who keep things.',
    includes: 'EVERYTHING FREE, AND —',
    priceMonthly: '1.99',
    priceAnnual: '19.99',
    cta: 'BECOME AN ARCHIVIST',
    recommended: true,
  },
  {
    id: 'auteur',
    name: 'The Auteur',
    character: 'For opinions, at length.',
    includes: 'EVERYTHING IN THE ARCHIVIST, AND —',
    priceMonthly: '4.99',
    priceAnnual: '49.99',
    cta: 'BECOME AN AUTEUR',
  },
];

export const rankById = (id: RankId): Rank => RANKS.find((r) => r.id === id) as Rank;

/**
 * "The Vault, The Editorial Desk and The Lounge" — the first three things a
 * rank adds, in the order its ticket lists them. For any sentence elsewhere in
 * the app that says what a rank opens: read from here, it cannot name a
 * privilege that does not exist. (Settings once promised "the gold Dispatch
 * badge" at Auteur — gold being the colour the mark is not.)
 */
export function firstPrivilegesOf(rank: PaidRankId, count = 3): string {
  const names = privilegesOf(rank).slice(0, count).map((p) => p.name);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names.join('');
}

/** The founding seat: the Auteur rank for life, one payment, a hundred seats. */
export const FOUNDING = {
  seats: 100,
  /** Static fallback only; the store's own localized price is preferred. */
  price: '49',
} as const;
