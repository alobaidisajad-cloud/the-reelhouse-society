import { StyleSheet, type TextStyle } from 'react-native';
import { colors, fonts, type } from '@/src/theme/theme';
import { isArchivistPlusTier, isAuteurPlusTier } from '@/src/utils/tier';

/**
 * roomStyles — the one vocabulary the six rooms are furnished from.
 *
 * The Archive, the Ledger, the Watchlist, the Stacks, the Vault and the
 * Projector were six different apps. Measured across the five list rooms before
 * this file existed:
 *
 *   empty title      20 / 20 / 20 / 15 / 15 pt
 *   empty body       italic 12 bone  ×3   ·   plain 10 fog  ×2
 *   filter chip      radius 2 ×3   ·   radius 16 pill ×1
 *   page inset       16 ×4   ·   8 ×1
 *   poster frame     brass, in every room — while the altarpiece on the
 *                    member's own profile frames films in BONE
 *
 * That last one is the tell: the house could not decide what a picture frame
 * is. Everything here is the profile's answer, carried through.
 *
 * WHAT THIS FILE DOES NOT OWN: the one object that gives each room its meaning.
 * The Oracle, the spines, the shelves, the Certificate and the ledger row live
 * in their own rooms. Coherence is the furniture, not the soul.
 */

// ════════════════════════════════════════════════════════════════════════════
// THE GRID — derived, never guessed
// ════════════════════════════════════════════════════════════════════════════
/**
 * The poster rows OVERFLOWED, on every phone, in three rooms.
 *
 * The cell width was computed reserving one gap and the row was drawn with
 * another: `(w - 32 - 18) / 4` cells laid out with `gap: 8` (= 24 of gaps, not
 * 18). At 375pt that is a 349pt row inside 343pt of space, and a fixed-width
 * child does not shrink — so the fourth poster in every Archive, Ledger and
 * Vault row was clipped by 6pt. The Watchlist was 8pt over.
 *
 * One source of truth, and the same shape as `triptychMetrics`: derive the
 * width FROM the gap, floor it so the remainder can only ever fall inward, and
 * let a test sweep every plausible screen width to prove the row fits.
 */
export const ROOM_INSET = 16;
export const GRID_GAP_4 = 8;
export const GRID_GAP_3 = 12;

export function posterColumns(windowWidth: number, columns: 3 | 4) {
  const gap = columns === 4 ? GRID_GAP_4 : GRID_GAP_3;
  // Below ~200pt of usable width nothing legible fits; clamp rather than
  // produce a negative cell.
  const avail = Math.max(200, windowWidth - ROOM_INSET * 2);
  // FLOOR, not round: the leftover belongs to the page, never to the row.
  const width = Math.floor((avail - gap * (columns - 1)) / columns);
  return { width, gap, avail, rowW: width * columns + gap * (columns - 1) };
}

// ════════════════════════════════════════════════════════════════════════════
// THE TIER THREAD
// ════════════════════════════════════════════════════════════════════════════
/**
 * The member's rank, carried from their profile into their rooms.
 *
 * These are the profile's own three values, not approximations of them — the
 * name rule, the corner stamp, the altarpiece hook and the picture rail all
 * already shift brass → champagne → ruby, and the rooms now shift with them.
 *
 * ── WHERE IT STOPS ───────────────────────────────────────────────────────────
 * Tier rides LIGHT AND EDGES. Brass stays the colour of ACTION. Chips, buttons
 * and search never take the tier: you have to know what is pressable at a
 * glance, and that has to mean the same thing on every member's profile. Month
 * rails never take it either — they describe the films, not the member. And the
 * Vault's shelf rails keep their FORMAT colours, because there the colour
 * describes the object, while the plate above still says whose vault it is.
 *
 * Three places is enough to feel it and few enough to notice it. If everything
 * carried the tier, the tier would stop meaning anything.
 */
export function roomTier(tier?: string | null): { edge: string; ink: string } {
  if (isAuteurPlusTier(tier)) return { edge: 'rgba(180,45,45,0.45)', ink: colors.crimson };
  if (isArchivistPlusTier(tier)) return { edge: 'rgba(196,150,26,0.5)', ink: colors.champagne };
  return { edge: 'rgba(184,137,26,0.3)', ink: 'rgba(184,137,26,0.7)' };
}

/**
 * Right-to-left member prose.
 *
 * Defined twice already, in two different style files. A member's own words
 * appear in the Ledger now, so this is the third place that needs it and the
 * first that can share it.
 */
export const rtlText: TextStyle = { writingDirection: 'rtl', textAlign: 'right' };

// ════════════════════════════════════════════════════════════════════════════
// A CHIP'S HALO
// ════════════════════════════════════════════════════════════════════════════
/**
 * How far a chip may reach, given the real gap it sits in.
 *
 * PressableScale defaults to 15pt on every side, and every side omitted from a
 * partial object ALSO stays 15. Between neighbours that is destructive: two
 * chips each grow into the other, the boxes overlap, and both platforms hand
 * the touch to whichever sibling comes LATER. Every filter and sort chip in
 * every room used to claim 10 on all four sides while sitting 8, 6 or 4pt from
 * its neighbour — the watchlist's sort row overlapped by 16pt, so tapping the
 * right-hand end of RECENT sorted A–Z instead.
 *
 * SIDEWAYS: half the gap, floored, so two expanded boxes meet and never cross.
 * VERTICALLY: 10 is free — these live in a horizontal scroller with nothing
 * above or below them — and it carries a ~27pt chip past the 44pt floor.
 *
 * Derived rather than written out, so respacing a row automatically respaces
 * its targets and the two can never drift apart again.
 */
// ════════════════════════════════════════════════════════════════════════════
// THE SEARCH EMBER
// ════════════════════════════════════════════════════════════════════════════
/**
 * How long the search icon glows while a search is live.
 *
 * It used to be `-1` — forever. Type a word, leave it in the box, and the
 * worklet pulsed for as long as the room stayed open, which is precisely what
 * every other animation in these files caps at 20 repeats to avoid ("so the UI
 * thread can idle"). The Vault had exactly this defect and it was fixed a batch
 * ago; the Ledger's and the Watchlist's were the same class, two files away,
 * and went unnoticed because that fix was applied where it was FILED.
 *
 * ODD, and that is the whole trick. `withRepeat(…, n, reverse)` alternates
 * direction each pass, so an EVEN count lands back on the value it started
 * from — the ember would have settled at REST while a search was still active,
 * telling the member their filter was off. An odd count finishes on the bright
 * end: it pulses for about thirteen seconds, makes its point, and then simply
 * stays lit for as long as the search does.
 */
export const EMBER_REST = 0.5;
export const EMBER_BEATS = 21;

// ════════════════════════════════════════════════════════════════════════════
// A YEAR IS A BOUNDARY, NOT A LABEL
// ════════════════════════════════════════════════════════════════════════════
/**
 * Print a year only on the rail where it CHANGES.
 *
 * Every rail used to carry one: JANUARY 2026, DECEMBER 2025, NOVEMBER 2025,
 * OCTOBER 2025 — the same four digits read eleven more times, in the loudest
 * face on the row, while the month that actually distinguishes one rail from
 * the next was the quietest thing on it.
 *
 * Removing the repetition is better than shrinking it. Scrolling a long archive
 * now passes a year only when a year turns over, which is the one moment it
 * means something.
 *
 * The FIRST rail always keeps its year — the tracker starts empty, so the top
 * of the list is a change — otherwise a member could scroll into a list with no
 * year anywhere on it.
 *
 * A factory rather than a shared variable: the Archive and the Ledger build
 * their lists independently and in the same render pass, and one memo must
 * never see the other's last year.
 */
export function yearMarker(): (year: string) => string {
  let last = '';
  return (year: string) => {
    if (!year || year === last) return '';
    last = year;
    return year;
  };
}

// ════════════════════════════════════════════════════════════════════════════
// A COUNT ONLY APPEARS WHEN IT IS COMPLETE
// ════════════════════════════════════════════════════════════════════════════
/**
 * The one rule that keeps every number in these rooms honest.
 *
 * Six numbers on this page used to be counted from whatever had loaded — the
 * app pages fifty rows at a time, so a month heading read "7 FILMS" when March
 * held forty, and it CLIMBED as the member scrolled. A number that changes
 * while you look at it is worse than no number: it teaches you not to trust
 * any of them.
 *
 * The server sends the true shape of a collection on every profile load. When
 * it is there, the count is stated. When it is not — the migration is not
 * applied yet, or the viewer may not see this member, or a filter is on that
 * the server was not asked about — this returns undefined and the room draws
 * the heading with NO NUMBER AT ALL.
 *
 * Silence is a fine answer. A wrong number is not.
 */
export function completeCount(
  shape: { count: number } | undefined | null,
  /**
   * False when something narrows the room that the server's figures do not
   * know about — a status filter on the Archive, say. The shape describes the
   * WHOLE collection, so under such a filter it cannot speak for what is on
   * screen and must not try.
   */
  serverKnows: boolean,
): number | undefined {
  if (!serverKnows) return undefined;
  if (!shape || typeof shape.count !== 'number' || shape.count < 0) return undefined;
  return shape.count;
}

/** "40 FILMS" / "1 FILM" / undefined — never "0 FILMS" where 0 means unknown. */
export function countLabel(n: number | undefined, one: string, many: string): string | undefined {
  if (n === undefined) return undefined;
  return `${n} ${n === 1 ? one : many}`;
}

export const CHIP_SLOP_Y = 10;
export function chipSlop(gap: number) {
  const side = Math.max(0, Math.floor(gap / 2));
  return { top: CHIP_SLOP_Y, bottom: CHIP_SLOP_Y, left: side, right: side };
}

export const r = StyleSheet.create({
  container: { flex: 1 },
  /**
   * `paddingBottom` was a hard-coded 100 in all five rooms — a guess that is
   * too much on a pushed route and too little under a tab bar. The call site
   * derives it now.
   */
  listContent: { paddingHorizontal: ROOM_INSET, paddingTop: 14 },
  /**
   * For the one room laid out with FlashList's own `numColumns`, which has no
   * gap of its own: half the inset lives on the list and half on each card, so
   * the outer margin still lands on ROOM_INSET and the gutter between two cards
   * comes out the same width. Derived from the same constant, so the Stacks can
   * never drift from the other five — it used to sit at 8 while they sat at 16.
   */
  listContentGrid: { paddingHorizontal: ROOM_INSET / 2, paddingTop: 14 },

  // ══════════════════════════════════════════════════════════════════════════
  // THE ROOM PLATE — the one threshold
  // ══════════════════════════════════════════════════════════════════════════
  // Six rooms opened six ways. This is a brass plate beside a door: which room,
  // whose room, and how much is in it — a number no room used to state, so you
  // entered the Archive with no idea whether it held twelve films or two
  // thousand until you had scrolled to the end.
  plate: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 12, paddingHorizontal: ROOM_INSET, paddingTop: 2 },
  plateBack: { width: 34, height: 34, alignItems: 'center' as const, justifyContent: 'center' as const, marginLeft: -8 },
  plateText: { flex: 1, minWidth: 0, paddingTop: 2 },
  plateName: { fontFamily: fonts.display, fontSize: 18, lineHeight: 22, color: colors.parchment, letterSpacing: 0.6 },
  plateSub: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.9, color: colors.fog, marginTop: 5 },
  plateCount: { color: colors.sepia },

  // The rail the plate stands on — the altarpiece's, and it takes the tier.
  plateRail: { flexDirection: 'row' as const, alignItems: 'center' as const, marginHorizontal: ROOM_INSET, marginTop: 11 },
  plateRailLine: { flex: 1, height: 1 },
  plateRailMark: { width: 3, height: 3, marginHorizontal: 5, opacity: 0.75, transform: [{ rotate: '45deg' }] },

  // ══════════════════════════════════════════════════════════════════════════
  // CHIPS — one chip, everywhere
  // ══════════════════════════════════════════════════════════════════════════
  chipRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  chipScroll: { marginBottom: 16 },
  chip: {
    paddingHorizontal: 12, paddingTop: 7, paddingBottom: 6,
    borderWidth: 1, borderColor: 'rgba(184,137,26,0.15)', borderRadius: 2,
    backgroundColor: 'transparent',
    position: 'relative' as const,
  },
  chipOn: { borderColor: 'rgba(184,137,26,0.30)' },
  chipText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.5, color: colors.fog },
  chipTextOn: { color: colors.sepia },
  chipCount: { fontFamily: fonts.body, fontSize: 9, color: colors.fog, opacity: 0.6 },
  /**
   * The live chip is underlined rather than filled — quieter, and it reads like
   * a tab in a ledger instead of a web button. It sits INSIDE the chip at
   * `bottom: 0`, not overhanging the border: Android clips a child that escapes
   * its parent, and an underline nobody can see on half the devices is worse
   * than no underline at all.
   *
   * The brighter border and text stay as well. An underline alone is a weak
   * signal for low vision; three signals cost nothing.
   */
  chipUnderline: { position: 'absolute' as const, left: 8, right: 8, bottom: 0, height: 2, backgroundColor: colors.sepia },
  /** Separates two GROUPS of chips sharing one scroller — see RoomChipDivider. */
  chipDivider: { width: 1, height: 16, backgroundColor: 'rgba(232,223,208,0.14)', alignSelf: 'center' as const },

  // ══════════════════════════════════════════════════════════════════════════
  // RAILS — a month, a shelf
  // ══════════════════════════════════════════════════════════════════════════
  rail: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 9, marginTop: 22, marginBottom: 12 },
  /**
   * ── THE RAIL, THE RIGHT WAY ROUND ──────────────────────────────────────────
   * The year used to be the display face at 13 and the month the typewriter at
   * 8.5. Within one archive the YEAR REPEATS across twelve rails and the month
   * is the only thing telling them apart, so the loud token was the one
   * carrying no information.
   *
   * Swapped. The month takes the display face and `type.rail`; the year becomes
   * a quiet typewriter tag — and prints only where it CHANGES, so a year is a
   * boundary marker rather than something read twelve times.
   *
   * No letter-spacing on the month: Rye is a display serif and already wide.
   * Spacing it was what pushed the rail to within 19pt of the screen edge on a
   * 320pt phone at maximum text size — see railFits.test.ts, which proves the
   * whole rail at every width and every scale.
   */
  railYear: { fontFamily: fonts.sub, fontSize: type.label, letterSpacing: 1.4, color: colors.fog },
  railLine: { flex: 1, height: 1, backgroundColor: 'rgba(184,137,26,0.15)' },
  railLabel: { fontFamily: fonts.display, fontSize: type.rail, color: colors.sepia },
  /**
   * 0.8, not 0.7. Measured against the page ground the old value came out at
   * 3.75:1 — under the 4.5:1 needed for text this size. 0.79 reaches it; 0.8
   * is the round number above.
   */
  railCount: { fontFamily: fonts.body, fontSize: 9, color: colors.fog, opacity: 0.8 },

  // The rhythm bar — see RoomRail. Indented past the year so the bars line up
  // with each other rather than with the varying width of "2026".
  railWrap: { marginTop: 22, marginBottom: 12 },
  railTight: { marginTop: 0, marginBottom: 0 },
  rhythm: { height: 2, marginTop: 5, marginLeft: 34, backgroundColor: 'rgba(184,137,26,0.13)' },
  rhythmFill: { height: 2, backgroundColor: colors.sepia, opacity: 0.5 },

  // ══════════════════════════════════════════════════════════════════════════
  // THE FRAME — bone, with the altarpiece's mount board
  // ══════════════════════════════════════════════════════════════════════════
  // Brass is the colour of action. A picture frame that glows like a button
  // reads as a control, and sixteen of them in a grid read as a toolbar.
  gridRow: { flexDirection: 'row' as const },
  /**
   * Four points of nothing, just inside the frame — the difference between a
   * picture on a wall and an image in a box. Scaled to 3 for a grid cell, which
   * is a third the width of the altarpiece's centre panel.
   */
  mountBoard: { position: 'absolute' as const, top: 3, left: 3, right: 3, bottom: 3, borderWidth: 1, borderColor: 'rgba(232,223,208,0.10)', zIndex: 3 },

  // ══════════════════════════════════════════════════════════════════════════
  // THE SPINE — a bound volume, a cased disc
  // ══════════════════════════════════════════════════════════════════════════
  /**
   * The two rooms that hold OBJECTS rather than films — the Stacks (bound
   * volumes) and the Vault (cased discs) — each get a spine down the left edge.
   * It is what makes a thing on a shelf read as a thing on a shelf, and it is
   * the only structural difference between those two rooms and the three grids.
   *
   * The Stacks take the MEMBER's rank; the Vault takes the FORMAT's colour,
   * because there the colour describes the object, not its owner.
   */
  spine: { position: 'absolute' as const, left: 0, top: 0, bottom: 0, width: 3 },
  /** The dark seam where a spine meets the face of the case. */
  spineSeam: { position: 'absolute' as const, left: 3, top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  /** The shelf a row of cases stands on. */
  shelfBoard: { height: 1, backgroundColor: 'rgba(232,223,208,0.07)', marginTop: 10 },

  // ══════════════════════════════════════════════════════════════════════════
  // SEARCH
  // ══════════════════════════════════════════════════════════════════════════
  search: { flexDirection: 'row' as const, alignItems: 'center' as const, height: 40, paddingHorizontal: 12, gap: 10, backgroundColor: 'rgba(8,6,4,0.7)', borderWidth: 1, borderColor: 'rgba(184,137,26,0.2)', borderRadius: 2 },
  searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.parchment, height: '100%' as const },
  searchClear: { padding: 4, opacity: 0.8 },

  // ══════════════════════════════════════════════════════════════════════════
  // STATES — a room must never describe itself before it knows what it holds
  // ══════════════════════════════════════════════════════════════════════════
  state: {
    marginTop: 18, paddingVertical: 34, paddingHorizontal: 26,
    alignItems: 'center' as const, justifyContent: 'center' as const,
    borderWidth: 1, borderColor: 'rgba(184,137,26,0.2)', borderRadius: 3,
    backgroundColor: 'rgba(8,6,4,0.98)',
  },
  /** Your own empty room, and the seal — an invitation, not a verdict. */
  stateInvite: { borderStyle: 'dashed' as const, borderColor: 'rgba(184,137,26,0.30)', backgroundColor: 'rgba(184,137,26,0.06)' },
  stateIcon: { opacity: 0.85 },
  stateTitle: { fontFamily: fonts.display, fontSize: 17, color: colors.parchment, marginTop: 12, textAlign: 'center' as const },
  stateBody: { fontFamily: fonts.bodyItalic, fontSize: 11, lineHeight: 17, color: colors.bone, opacity: 0.7, marginTop: 8, textAlign: 'center' as const },
  stateAct: { marginTop: 16, minHeight: 44, justifyContent: 'center' as const, paddingHorizontal: 22, borderWidth: 1, borderColor: colors.sepia, borderRadius: 2, backgroundColor: 'rgba(184,137,26,0.06)' },
  stateActText: { fontFamily: fonts.sub, fontSize: 9.5, letterSpacing: 2.4, color: colors.sepia },
  stateSeal: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2.6, color: colors.sepia },

  /**
   * YOUR OWN empty room.
   *
   * Each of the four keeps its own STAGING — the Archive's import signpost, the
   * Stacks' pile of unopened dossiers, the Vault's pattern, the Ledger's
   * breathing rule — because that is the part with something to say. What they
   * must not each keep is the TYPE: all four had defined these two rules
   * privately and identically, which is four places for the next change to go
   * wrong in. The staging is the room's; the voice is the house's.
   */
  ownTitle: { fontFamily: fonts.display, fontSize: 24, color: colors.parchment, marginBottom: 24, textAlign: 'center' as const, letterSpacing: 1 },
  ownAct: { minHeight: 46, justifyContent: 'center' as const, paddingHorizontal: 30, borderWidth: 1, borderColor: 'rgba(184,137,26,0.45)', borderRadius: 2, backgroundColor: colors.sepiaFaint },
  ownActText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2.5, color: colors.sepia, textAlign: 'center' as const },
  ownIcon: { marginBottom: 16, opacity: 0.8 },

  /**
   * The moment before the data lands.
   *
   * A room decided it was empty by asking one question — is the list empty? —
   * and never whether the data had ARRIVED. So the first time a member with 286
   * discs opened their Vault they were told "nothing on the shelves yet", and
   * then the shelves filled. That is the profile's "0 films" again, in six new
   * places. The room now says nothing about itself until it can say something
   * true, in the same voice the profile uses: RETRIEVING DOSSIER.
   */
  retrieve: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 9, paddingVertical: 74 },
  retrieveText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 3, color: colors.sepia, opacity: 0.85 },
  retrieveMark: { fontSize: 8, color: colors.sepia, opacity: 0.5 },

  // ══════════════════════════════════════════════════════════════════════════
  // THE FOOT — every room closes, as the profile does
  // ══════════════════════════════════════════════════════════════════════════
  foot: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 12, paddingTop: 26, paddingBottom: 24 },
  footRule: { width: 32, height: 1 },
  footMark: { fontSize: 9, lineHeight: 11 },

  // Shared by the load-more button the Stacks and the Vault use.
  loadMore: { alignSelf: 'stretch' as const, minHeight: 48, alignItems: 'center' as const, justifyContent: 'center' as const, marginTop: 16, borderWidth: 1, borderColor: 'rgba(184,137,26,0.2)', borderRadius: 2 },
  loadMoreText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.sepia },
});
