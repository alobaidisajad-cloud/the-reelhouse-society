/**
 * gatedFeatures — what a rank buys, said once.
 * ─────────────────────────────────────────────────────────────────────────────
 * A rank is three things kept in three different places, and until this file
 * existed nothing had ever compared them:
 *
 *   THE PROMISE      `membership.ts` — the words on the Society page
 *   THE ENFORCEMENT  a database trigger — what the server actually withholds
 *   THE DOOR         a client gate — what a member sees when they are stopped
 *
 * Every real feature has all three, and each one going missing is its own kind
 * of wrong:
 *
 *   a promise with no enforcement   we charge for something we give away —
 *                                   or, as with "The Gilded Frame", for
 *                                   something that was never built at all
 *   an enforcement with no promise  we withhold something we never said we
 *                                   would, and the member cannot find out why
 *   a gate with no promise          a locked door with no sign on it
 *
 * `aRankIsSoldEnforcedAndExplained.test.ts` compares this table against the
 * other two and fails the build when any side goes missing. `npm run
 * gates:check` compares it against the LIVE database, because a migration file
 * is not proof of what production runs.
 *
 * ── THE RULE FOR WHETHER A SERVER GATE IS NEEDED ────────────────────────────
 * Server-enforce anything that creates content other members consume, or that
 * costs us resources. Client-enforce pure self-cosmetics. A trigger policing a
 * preferences blob would be awkward and would protect nothing worth the weight.
 */

/** The ranks, by the weight the database gives them — `profile_tier_weight`. */
export type Rank = 'archivist' | 'auteur';
export const RANK_WEIGHT: Record<Rank, number> = { archivist: 1, auteur: 2 };

/** How the server withholds a feature. Three kinds, and they are not alike. */
export type Enforcement =
  /** A trigger refuses the row outright, raising SQLSTATE 42501 with a message. */
  | { kind: 'refuses'; table: string; trigger: string }
  /** `enforce_log_tier_fields` blanks these columns and saves anyway — NO error. */
  | { kind: 'strips'; table: string; fields: string[] }
  /** Deliberately client-side. `why` must say why that is enough. */
  | { kind: 'client-only'; why: string };

export interface GatedFeature {
  /** How we refer to it among ourselves. Not shown to members. */
  id: string;
  rank: Rank;
  /**
   * The EXACT string from `membership.ts`. Not a paraphrase — the guard
   * compares it character for character, because a paraphrase is how the sales
   * page and the app start to disagree.
   */
  promise: string;
  enforcement: Enforcement;
  /** Every client file that stops a member short of this feature. */
  gates: string[];
}

export const GATED_FEATURES: GatedFeature[] = [
  {
    id: 'editorial-desk',
    rank: 'archivist',
    promise: 'The Editorial\nDesk',
    enforcement: { kind: 'strips', table: 'logs', fields: ['drop_cap', 'editorial_header', 'pull_quote'] },
    gates: ['src/hooks/useLogFlow.ts', 'src/components/log/LogForm.tsx'],
  },
  {
    id: 'physical-archive',
    rank: 'archivist',
    promise: 'The Physical Archive\n(Track 4K/Blu-Ray/VHS)',
    enforcement: { kind: 'refuses', table: 'physical_archive', trigger: 'tr_tier_gate_archive' },
    gates: ['src/stores/domain/archiveSlice.ts'],
  },
  {
    id: 'the-vault',
    rank: 'archivist',
    promise: 'The Vault (Private Notes)',
    enforcement: { kind: 'refuses', table: 'log_private_notes', trigger: 'tr_tier_gate_private_notes' },
    gates: ['src/hooks/useLogFlow.ts', 'src/components/log/LogForm.tsx'],
  },
  {
    id: 'the-lounge',
    rank: 'archivist',
    promise: 'The Lounge\n(Exclusive Cinema Chat Rooms)',
    enforcement: { kind: 'refuses', table: 'lounge_members', trigger: 'tr_tier_gate_lounge_members' },
    gates: [
      'app/(tabs)/lounge.tsx',
      'src/components/layout/TopNavBar.tsx',
      'src/components/feed/ActionDeck.tsx',
      'app/film/[id].tsx',
      'app/person/[id].tsx',
    ],
  },
  {
    id: 'lounge-speaking',
    rank: 'archivist',
    // The Lounge was gated at the door and open inside the room: joining and
    // founding carried triggers, speaking and reacting carried none. Anybody
    // already admitted kept talking for ever at any rank.
    promise: 'The Lounge\n(Exclusive Cinema Chat Rooms)',
    enforcement: { kind: 'refuses', table: 'lounge_messages', trigger: 'tr_tier_gate_lounge_messages' },
    gates: ['app/(tabs)/lounge.tsx'],
  },
  {
    id: 'lounge-reacting',
    rank: 'archivist',
    promise: 'The Lounge\n(Exclusive Cinema Chat Rooms)',
    enforcement: { kind: 'refuses', table: 'lounge_message_reactions', trigger: 'tr_tier_gate_lounge_reactions' },
    gates: ['app/(tabs)/lounge.tsx'],
  },
  {
    id: 'vault-editing',
    rank: 'archivist',
    // Every tier trigger was BEFORE INSERT, and every ownership UPDATE policy
    // has no tier condition — so a lapsed member could keep editing their
    // notes for ever. The Vault is an ongoing instrument: changing a note IS
    // using it. DELETE stays open; taking your own records back is not a paid
    // act.
    promise: 'The Vault (Private Notes)',
    enforcement: { kind: 'refuses', table: 'log_private_notes', trigger: 'tr_tier_gate_private_notes_update' },
    gates: ['src/hooks/useLogFlow.ts'],
  },
  {
    id: 'shelf-editing',
    rank: 'archivist',
    promise: 'The Physical Archive\n(Track 4K/Blu-Ray/VHS)',
    enforcement: { kind: 'refuses', table: 'physical_archive', trigger: 'tr_tier_gate_archive_update' },
    gates: ['src/stores/domain/archiveSlice.ts'],
  },
  {
    id: 'create-a-lounge',
    rank: 'archivist',
    // Sold as part of the Lounge rather than separately: a member reads "the
    // Lounge" as the whole room, not as a right to enter distinct from a right
    // to open one. The server gates them separately, so both are listed.
    promise: 'The Lounge\n(Exclusive Cinema Chat Rooms)',
    enforcement: { kind: 'refuses', table: 'lounges', trigger: 'tr_tier_gate_lounges' },
    gates: ['app/(tabs)/lounge.tsx'],
  },
  {
    id: 'dispatch-archive',
    rank: 'archivist',
    promise: 'The Archive\n(Every Filing on One Film,\nGathered)',
    enforcement: {
      kind: 'client-only',
      why: 'A search across filings that are already public and already on the page — '
         + 'the rank buys the GATHERING, not the rows. There is nothing to withhold at '
         + 'the database: refusing the reads would mean refusing a member the very '
         + 'filings the feed hands them anyway.',
    },
    gates: ['app/dispatch/archive.tsx'],
  },
  {
    id: 'breakdown-engine',
    rank: 'auteur',
    promise: 'The Breakdown\nEngine',
    enforcement: { kind: 'strips', table: 'logs', fields: ['autopsy', 'is_autopsied'] },
    gates: ['src/hooks/useLogFlow.ts', 'src/components/log/LogForm.tsx'],
  },
  {
    id: 'essays',
    rank: 'auteur',
    promise: 'Publish Essays to The\nDispatch',
    enforcement: { kind: 'refuses', table: 'dispatch_posts', trigger: 'tr_tier_gate_dispatch' },
    gates: ['app/dispatch/compose.tsx'],
  },
  {
    id: 'essays-legacy',
    rank: 'auteur',
    // The same feature wearing its old plumbing. `dispatch_dossiers` is a VIEW
    // over `dispatch_dossiers_legacy`, and the offline mutation path still
    // writes through it, so the trigger on the base table is live — not an
    // orphan withholding something we never promised.
    promise: 'Publish Essays to The\nDispatch',
    enforcement: { kind: 'refuses', table: 'dispatch_dossiers_legacy', trigger: 'tr_tier_gate_dossiers' },
    gates: ['src/utils/mutationExecutor.ts'],
  },
  {
    id: 'curatorial-control',
    rank: 'auteur',
    promise: 'Curatorial Control\n(Select Alternative TMDB\nPosters)',
    enforcement: { kind: 'strips', table: 'logs', fields: ['alt_poster'] },
    gates: ['src/hooks/useLogFlow.ts', 'src/components/log/LogForm.tsx'],
  },
  {
    id: 'the-backdrop',
    rank: 'auteur',
    promise: 'The Backdrop\n(Your Room, Dressed by\nYour Own Film)',
    enforcement: {
      kind: 'client-only',
      why: 'A self-cosmetic written to the member’s own preferences blob. Nobody '
         + 'else’s experience changes and it costs nothing to serve, so a trigger '
         + 'on a JSON column would add weight to a hot table to protect a picture.',
    },
    gates: ['src/features/profile/EditProfileScreen.tsx'],
  },
];

/**
 * Sold but not mechanically enforceable, and listed so the guard does not report
 * it as an unbacked promise every time it runs.
 */
export const UNENFORCEABLE_PROMISES = [
  'Early Access to New\nFeatures',
];

/**
 * ── THE OTHER DIRECTION: WHAT WE PROMISE IS FREE ────────────────────────────
 * Every check above asks "is this paid thing really withheld?". None of them
 * asked the reverse — is this FREE thing really free? — and that is the easier
 * mistake to make, because gating something is a one-line trigger and nobody
 * re-reads the Cinephile list afterwards.
 *
 * A Cinephile who finds a locked door where we promised an open one has been
 * lied to just as surely as one who pays for a Gilded Frame that does not
 * exist. So each free promise names the tables it rests on, and those tables
 * must carry NO tier trigger — checked in the repo by
 * `aRankIsSoldEnforcedAndExplained` and against production by `gates:check`.
 */
export const FREE_PROMISES: { promise: string; tables: string[] }[] = [
  {
    promise: 'Log, Rate & Review\nEvery Film You See',
    // `logs` carries enforce_log_tier_fields, which STRIPS premium columns but
    // never refuses the row — so logging itself is free and the promise holds.
    // It is named here anyway, so that turning that trigger into a refusal
    // would break this rather than pass quietly.
    tables: [],
  },
  {
    promise: 'File to The Dispatch\n(Takes, Seekings & Wires)',
    // dispatch_posts DOES carry a tier trigger, but only WHEN the kind is a
    // ballot or an essay. The three free forms are untouched by it, which is
    // why this promise names no table: the guard for it is the WHEN clause,
    // asserted in `gates:check`.
    tables: [],
  },
  {
    promise: 'Critique, Certify\n& Vote on Any Filing',
    tables: ['dispatch_comments', 'dispatch_certifications', 'dispatch_votes'],
  },
  {
    promise: 'The Diary, The Watchlist\n& Unlimited Lists',
    tables: ['lists', 'list_items', 'list_comments'],
  },
  {
    promise: 'Import & Export\nYour Own Archive',
    tables: [],
  },
];

/** Every table a free promise rests on. Nothing here may ever be tier-gated. */
export const MUST_STAY_FREE = [...new Set(FREE_PROMISES.flatMap((f) => f.tables))];

/**
 * Client gates that are NOT paywalls, kept here so the guard can tell the
 * difference between a door with no sign and something that was never a door.
 */
export const NOT_A_GATE: { file: string; why: string }[] = [
  { file: 'src/components/home/SocialPulse.tsx', why: 'tints the rail crimson for an Auteur — an accent, nothing withheld' },
  { file: 'src/components/profile/ProfileBackdrop.tsx', why: 'asks about the profile being VIEWED, not the viewer' },
];

export const findFeature = (id: string): GatedFeature | undefined =>
  GATED_FEATURES.find((f) => f.id === id);
