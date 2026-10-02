/**
 * roomStyles — the one vocabulary the six rooms are furnished from: one inset,
 * one chip, one empty state, one picture frame (bone, as the profile's own
 * altarpiece frames films). What gives each room its meaning (the Oracle, the
 * spines, the shelves, the Certificate, the ledger row) stays in that room.
 */
import { StyleSheet, type TextStyle } from 'react-native';
import { colors, fonts, type } from '@/src/theme/theme';
import { isArchivistPlusTier, isAuteurPlusTier } from '@/src/utils/tier';
import { EDGE_LIT } from '@/src/theme/light';

// ════════════════════════════════════════════════════════════════════════════
// THE GRID — derived, never guessed
// ════════════════════════════════════════════════════════════════════════════
// A cell's width comes FROM the gap it is drawn with, floored so any remainder
// falls inside the row; a test sweeps every screen width to prove a row fits.
export const ROOM_INSET = 16;
export const GRID_GAP_4 = 8;
export const GRID_GAP_3 = 12;

export function posterColumns(windowWidth: number, columns: 3 | 4) {
  const gap = columns === 4 ? GRID_GAP_4 : GRID_GAP_3;
  // Never a negative cell: below ~200pt nothing legible fits anyway.
  const avail = Math.max(200, windowWidth - ROOM_INSET * 2);
  // FLOOR, not round: the leftover belongs to the page, never to the row.
  const width = Math.floor((avail - gap * (columns - 1)) / columns);
  return { width, gap, avail, rowW: width * columns + gap * (columns - 1) };
}

// ════════════════════════════════════════════════════════════════════════════
// THE TIER THREAD
// ════════════════════════════════════════════════════════════════════════════
/**
 * The owner's rank in their rooms (the profile's own brass, champagne, ruby),
 * on light and edges only. Chips, buttons and search stay brass, the colour of
 * ACTION; month rails describe films and the Physical Archive's shelves their
 * formats, so neither takes it. If everything carried rank, it would mean nothing.
 */
export function roomTier(tier?: string | null): { edge: string; ink: string } {
  if (isAuteurPlusTier(tier)) return { edge: 'rgba(180,45,45,0.45)', ink: colors.crimson };
  if (isArchivistPlusTier(tier)) return { edge: 'rgba(196,150,26,0.5)', ink: colors.champagne };
  return { edge: 'rgba(184,137,26,0.3)', ink: 'rgba(184,137,26,0.7)' };
}

/** Right-to-left member prose, as in the Ledger. */
export const rtlText: TextStyle = { writingDirection: 'rtl', textAlign: 'right' };

// ════════════════════════════════════════════════════════════════════════════
// THE SEARCH EMBER
// ════════════════════════════════════════════════════════════════════════════

// A live search's glow: 21 passes of 0.6s, then idle. ODD, as each pass
// reverses and an odd count ends BRIGHT, lit for as long as the search is.
export const EMBER_REST = 0.5;
export const EMBER_BEATS = 21;

// ════════════════════════════════════════════════════════════════════════════
// A YEAR IS A BOUNDARY, NOT A LABEL
// ════════════════════════════════════════════════════════════════════════════
/**
 * A year only on the rail where it CHANGES, and always on the first. A factory:
 * the Archive and the Ledger build their lists in one render and must never
 * see each other's last year.
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
 * A count only from the server's whole-collection shape, or none at all: a
 * count of what has loaded (fifty at a time) climbs as you scroll. Silence is
 * a fine answer; a wrong number is not.
 */
export function completeCount(
  shape: { count: number } | undefined | null,
  /** False under a filter the server's figures do not know about. */
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

// A chip's reach: sideways, half the real gap (two reaches meet, never cross,
// and the later sibling cannot steal a tap); up and down, 10, free in a
// one-row scroller and enough to carry a chip past 44pt.
export const CHIP_SLOP_Y = 10;
export function chipSlop(gap: number) {
  const side = Math.max(0, Math.floor(gap / 2));
  return { top: CHIP_SLOP_Y, bottom: CHIP_SLOP_Y, left: side, right: side };
}

export const r = StyleSheet.create({
  container: { flex: 1 },
  /** No bottom padding: the call site knows whether a tab bar is below. */
  listContent: { paddingHorizontal: ROOM_INSET, paddingTop: 14 },
  /** FlashList `numColumns` has no gap: half the inset here, half on each card. */
  listContentGrid: { paddingHorizontal: ROOM_INSET / 2, paddingTop: 14 },

  // ══════════════════════════════════════════════════════════════════════════
  // THE ROOM PLATE — the one threshold
  // ══════════════════════════════════════════════════════════════════════════
  // A brass plate by the door: which room, whose, and how much is in it.
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
  chipCount: { fontFamily: fonts.body, fontSize: 9, color: colors.fogQuiet },
  /** Underlined like a ledger's tab, INSIDE the chip (Android clips overhangs). */
  chipUnderline: { position: 'absolute' as const, left: 8, right: 8, bottom: 0, height: 2, backgroundColor: colors.sepia },
  /** Separates two GROUPS of chips sharing one scroller — see RoomChipDivider. */
  chipDivider: { width: 1, height: 16, backgroundColor: 'rgba(232,223,208,0.14)', alignSelf: 'center' as const },

  // ══════════════════════════════════════════════════════════════════════════
  // RAILS — a month, a shelf
  // ══════════════════════════════════════════════════════════════════════════
  rail: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 9, marginTop: 22, marginBottom: 12 },
  // The MONTH is loud and the year a quiet tag: the month tells rails apart.
  // Rye is wide unspaced; railFits.test.ts proves the rail at every size.
  railYear: { fontFamily: fonts.sub, fontSize: type.label, letterSpacing: 1.4, color: colors.fog },
  railLine: { flex: 1, height: 1, backgroundColor: 'rgba(184,137,26,0.15)' },
  railLabel: { fontFamily: fonts.display, fontSize: type.rail, color: colors.sepia },
  /** A solid ink, not see-through fog (3.75:1 at 0.7 on this ground). */
  railCount: { fontFamily: fonts.body, fontSize: 9, color: colors.fogQuiet },

  // The rhythm bar — see RoomRail. Indented past the year so the bars line up
  // with each other rather than with the varying width of "2026".
  railWrap: { marginTop: 22, marginBottom: 12 },
  railTight: { marginTop: 0, marginBottom: 0 },
  rhythm: { height: 2, marginTop: 5, marginLeft: 34, backgroundColor: 'rgba(184,137,26,0.13)' },
  rhythmFill: { height: 2, backgroundColor: colors.sepia, opacity: 0.5 },

  // ══════════════════════════════════════════════════════════════════════════
  // THE FRAME — bone, not brass: sixteen brass frames would read as a toolbar
  // ══════════════════════════════════════════════════════════════════════════
  gridRow: { flexDirection: 'row' as const },

  // ══════════════════════════════════════════════════════════════════════════
  // THE SPINE — a bound volume, a cased disc
  // ══════════════════════════════════════════════════════════════════════════
  /** A spine for OBJECTS: the Stacks' in the owner's rank, the Physical Archive's in its format. */
  spine: { position: 'absolute' as const, left: 0, top: 0, bottom: 0, width: 3 },
  /** The dark seam where a spine meets the face of the case. */
  spineSeam: { position: 'absolute' as const, left: 3, top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  /** The shelf a row of cases stands on. */
  shelfBoard: { height: 1, backgroundColor: 'rgba(232,223,208,0.07)', marginTop: 10 },

  // ══════════════════════════════════════════════════════════════════════════
  // SEARCH
  // ══════════════════════════════════════════════════════════════════════════
  search: { flexDirection: 'row' as const, alignItems: 'center' as const, height: 40, paddingHorizontal: 12, gap: 10, backgroundColor: 'rgba(30,25,20,0.7)', borderWidth: 1, borderColor: 'rgba(184,137,26,0.2)', borderRadius: 2 },
  searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.parchment, height: '100%' as const },
  searchClear: { padding: 4, opacity: 0.8 },

  // ══════════════════════════════════════════════════════════════════════════
  // STATES — a room must never describe itself before it knows what it holds
  // ══════════════════════════════════════════════════════════════════════════
  state: { ...EDGE_LIT,
    marginTop: 18, paddingVertical: 34, paddingHorizontal: 26,
    alignItems: 'center' as const, justifyContent: 'center' as const,
    borderWidth: 1, borderColor: 'rgba(184,137,26,0.2)', borderRadius: 3,
    backgroundColor: colors.soot,
  },
  /** Your own empty room, and the seal — an invitation, not a verdict. */
  stateInvite: { borderStyle: 'dashed' as const, borderColor: 'rgba(184,137,26,0.30)', backgroundColor: 'rgba(184,137,26,0.06)' },
  stateIcon: { opacity: 0.85 },
  stateTitle: { fontFamily: fonts.display, fontSize: 17, color: colors.parchment, marginTop: 12, textAlign: 'center' as const },
  stateBody: { fontFamily: fonts.bodyItalic, fontSize: 11, lineHeight: 17, color: colors.fogQuiet, marginTop: 8, textAlign: 'center' as const },
  stateRetry: { marginTop: 10, alignSelf: 'center' as const },
  stateAct: { marginTop: 16, minHeight: 44, justifyContent: 'center' as const, paddingHorizontal: 22, borderWidth: 1, borderColor: colors.sepia, borderRadius: 2, backgroundColor: 'rgba(184,137,26,0.06)' },
  stateActText: { fontFamily: fonts.sub, fontSize: 9.5, letterSpacing: 2.4, color: colors.sepia },
  stateSeal: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2.6, color: colors.sepia },

  /** YOUR OWN empty room's type; each room keeps its own staging. */
  ownTitle: { fontFamily: fonts.display, fontSize: 24, color: colors.parchment, marginBottom: 24, textAlign: 'center' as const, letterSpacing: 1 },
  ownAct: { minHeight: 46, justifyContent: 'center' as const, paddingHorizontal: 30, borderWidth: 1, borderColor: 'rgba(184,137,26,0.45)', borderRadius: 2, backgroundColor: colors.sepiaFaint },
  ownActText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2.5, color: colors.sepia, textAlign: 'center' as const },
  ownIcon: { marginBottom: 16, opacity: 0.8 },

  /** Before the data lands, RETRIEVING DOSSIER, never "empty" too soon. */
  retrieve: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 9, paddingVertical: 74 },
  retrieveText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 3, color: colors.sepia },
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
