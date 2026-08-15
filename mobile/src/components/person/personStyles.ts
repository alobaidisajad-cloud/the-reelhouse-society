/**
 * PersonDetailScreen styles — THE ARTIST'S FILE.
 *
 * Layout laws:
 *  · ONE RAIL — every card and section stands on the same 20px shoulders.
 *  · FOUR BEATS — the hero column groups as identity → record → action →
 *    progress, not seven equal gaps.
 *  · Typewriter voice (fonts.sub) on every label; Rye keeps the name;
 *    Courier keeps the biography prose.
 *
 * Two style-sheets:
 *  • `s`  — main screen styles (hero, dossier, bio, sections, etc.)
 *  • `st` — shared sub-component styles (shimmer, badges, grid & defining cards)
 */
import { StyleSheet } from 'react-native';
import { colors, fonts, effects } from '@/src/theme/theme';

const PORTRAIT_W = 130;
const POSTER_GRID_GAP = 10;
const RAIL = 20;

// ════════════════════════════════════════════════════════════
//  MAIN STYLES — NITRATE NOIR
// ════════════════════════════════════════════════════════════
export const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  scrollContent: { paddingBottom: 100 },

  // ── Shimmer (mirrors the real anatomy exactly) ──
  shimmerBackdrop: { minHeight: 240, maxHeight: 300, backgroundColor: 'rgba(8,6,4,0.98)', position: 'relative' },
  shimmerContent: { alignItems: 'center', marginTop: -75, paddingHorizontal: RAIL, zIndex: 2 },
  shimmerPortrait: { width: PORTRAIT_W, height: PORTRAIT_W * 1.5, borderRadius: 2, marginBottom: 12 },
  shimmerDeptBadge: { width: 90, height: 22, borderRadius: 2, marginBottom: 10 },
  shimmerName: { width: 220, height: 38, borderRadius: 2, marginBottom: 14 },
  // Mirrors the record CARD now, not the four caption lines it replaced. A
  // skeleton that promises a shape the page no longer has is worse than none.
  shimmerRecordCard: { width: '100%', height: 78, borderRadius: 3, marginBottom: 14 },
  shimmerLoungeBtn: { width: 190, height: 39, borderRadius: 2 },

  // ── Not Found / Error ──
  notFoundContainer: { justifyContent: 'center', alignItems: 'center', padding: 32 },
  notFoundLabel: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 4, color: colors.sepia, marginBottom: 8, includeFontPadding: false },
  notFoundTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.parchment, marginBottom: 8, ...effects.textGlowSepia },
  notFoundBody: { fontFamily: fonts.body, fontSize: 14, color: colors.fog, textAlign: 'center', lineHeight: 22 },

  // ── Floating Back ──
  floatingBack: {
    position: 'absolute', top: 54, left: 16, zIndex: 100,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(10,7,3,0.65)', borderWidth: 1, borderColor: colors.sepiaBorder,
    alignItems: 'center', justifyContent: 'center',
    // Must out-rank the veil (90). Android orders by elevation, not zIndex, so
    // giving the veil an elevation without raising this one would have hidden
    // the only way off the page behind its own backdrop.
    elevation: 100,
  },

  // ── The veil ──
  // The back button is pinned and the list runs underneath it, so every heading
  // and poster used to collide with it, and the clock sat on bare content. This
  // is the ground for both: invisible at rest so the backdrop is untouched, and
  // faded in by scroll on the UI thread. Below the button (100), above the list.
  topVeil: {
    position: 'absolute', top: 0, left: 0, right: 0,
    zIndex: 90,
    // The list beneath carries elevated content of its own — the portrait card
    // sits at 16 — and on Android elevation beats zIndex. Without this the veil
    // would have been drawn under the very thing it exists to cover. 90 clears
    // everything in the list and still sits below the back button at 100.
    elevation: 90,
    // Elevation also DRAWS a shadow. This wants the z-order, not the mark.
    shadowColor: 'transparent',
  },

  // ── Hero Backdrop ──
  heroWrap: { minHeight: 240, maxHeight: 300, position: 'relative', overflow: 'hidden' },
  heroBg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  heroSepia: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,7,3,0.5)' },
  // The film leader runs along the TOP of the frame, not the bottom. The title
  // block is pulled 75pt up over the hero, so a strip anywhere in the hero's
  // lower region crosses the portrait's face — measured, not guessed. Moving it
  // down cannot help; only moving it clear can.
  perfBar: { position: 'absolute', top: 6, left: 0, right: 0, zIndex: 2 },

  // ── Dossier Section (the title block — four beats) ──
  dossierSection: { alignItems: 'center', marginTop: -75, paddingHorizontal: RAIL, zIndex: 2 },

  // ── Portrait ──
  portraitWrap: { marginBottom: 12, position: 'relative' },
  portraitGlow: {
    position: 'absolute', top: -10, left: -10, right: -10, bottom: -10,
    backgroundColor: 'rgba(184,137,26,0.15)',
    borderRadius: 8, shadowColor: colors.sepia,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6, shadowRadius: 20, elevation: 15,
  },
  portraitCard: {
    width: PORTRAIT_W, height: PORTRAIT_W * 1.5, borderRadius: 2, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(184,137,26,0.2)',
    // The glow above carries elevation 15 to cast its sepia halo. Android paints
    // siblings by elevation rather than JSX order, so without a higher number
    // here the glow — a translucent wash 10pt larger than the card on every
    // side — painted straight over the face. iOS was fine; Android was not.
    elevation: 16,
    zIndex: 1,
  },
  portrait: { width: '100%', height: '100%' } as import('react-native').ImageStyle,
  portraitPlaceholder: { backgroundColor: 'rgba(8,6,4,0.98)', justifyContent: 'center', alignItems: 'center' },
  portraitInitial: { fontFamily: fonts.display, fontSize: 40, color: colors.fog },

  // ── Beat 1: identity — badge · name · life line ──
  deptBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 2,
    borderWidth: 1, borderColor: colors.sepiaBorder,
    marginBottom: 10,
  },
  deptLabel: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 3.5, color: colors.sepia, includeFontPadding: false },
  personName: {
    fontFamily: fonts.display, fontSize: 28, color: colors.parchment,
    // 34 gave 1.21 — already at the edge of the 1.2 tier this text declares, and
    // 0.90 at 1.35. The name would have grown through its own line box on any
    // enlarged system text. 38 clears both (38 / 33.6 = 1.13).
    textAlign: 'center', lineHeight: 38, marginBottom: 10,
  },

  // ── Beat 2: the record — a typed card, not four centred captions ──
  // Born / place / craft / known-for used to stack as four separate centred
  // lines, which read as a tombstone rather than a file. They are one card now:
  // brass label, bone value, hairline between. A long birthplace WRAPS here
  // instead of being shrunk by adjustsFontSizeToFit to 5.6pt.
  recordCard: {
    width: '100%', marginTop: 14, marginBottom: 14,
    borderWidth: 1, borderColor: 'rgba(184,137,26,0.18)', borderRadius: 3,
    backgroundColor: 'rgba(18,14,9,0.5)',
    paddingHorizontal: 12,
  },
  recordRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8 },
  recordLabel: {
    fontFamily: fonts.sub, fontSize: 8, letterSpacing: 3, color: colors.sepia,
    // 62 is not arbitrary. The longest label the card can emit is RECORD, which
    // measures 54.1pt at the 1.2 tier this text declares — letterSpacing is a
    // fixed point value in RN and does NOT shrink back when the font grows, so
    // it has to be counted per character at the cap, not at rest.
    // personPage.test.ts recomputes this from the shipped labels.
    width: 62, paddingTop: 1, includeFontPadding: false,
  },
  recordValue: {
    flex: 1, fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1.2,
    color: colors.bone, lineHeight: 15, includeFontPadding: false,
  },
  // The pressable KNOWN FOR row fills its value column, so the tap target is the
  // whole line rather than the glyphs.
  recordPressValue: { flex: 1 },
  recordRule: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(184,137,26,0.14)' },
  // The dagger wears crimson — archival convention, no skulls in this house.
  recordDeath: { color: colors.crimson } as import('react-native').TextStyle,
  recordLink: { color: colors.sepia } as import('react-native').TextStyle,

  // ── Beat 3: the action — lounge (every rank sees the door) ──
  loungeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 12,
    borderWidth: 1, borderColor: colors.sepiaBorder, borderRadius: 2,
    backgroundColor: 'rgba(14,11,8,0.9)',
    marginBottom: 14,
  },
  loungeBtnText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2, color: colors.sepia, includeFontPadding: false },

  // ── Beat 4: the progress — THE AUTEUR HUNT (full rail width) ──
  auteurHunt: {
    width: '100%',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: 'rgba(184,137,26,0.06)', borderRadius: 4,
    borderWidth: 1, borderColor: 'rgba(184,137,26,0.2)',
    marginBottom: 8,
  },
  auteurHuntHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 } as import('react-native').ViewStyle,
  auteurHuntTitle: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 2, color: colors.sepia, includeFontPadding: false },
  auteurHuntCount: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1, color: colors.parchment, includeFontPadding: false },
  auteurHuntTrack: { height: 8, backgroundColor: 'rgba(8,6,4,0.98)', borderRadius: 2, overflow: 'hidden', position: 'relative' },
  auteurHuntFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: colors.sepia, borderRadius: 2 } as import('react-native').ViewStyle,
  // Frame notches — the strip reads as film, not as a loading bar.
  auteurHuntNotches: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', justifyContent: 'space-evenly' } as import('react-native').ViewStyle,
  auteurHuntNotch: { width: 1, height: '100%', backgroundColor: 'rgba(10,9,6,0.55)' } as import('react-native').ViewStyle,
  auteurHuntMastery: { shadowColor: colors.sepia, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 10, elevation: 10 } as import('react-native').ViewStyle,
  auteurComplete: {
    fontFamily: fonts.sub, fontSize: 7, letterSpacing: 2.5,
    color: colors.flicker, marginTop: 7, textAlign: 'center', includeFontPadding: false,
  },

  // ── Biography ──
  bioSection: {
    marginHorizontal: RAIL, marginBottom: 24, marginTop: 8,
    padding: 20,
    backgroundColor: 'rgba(25,20,15,0.6)',
    borderWidth: 1, borderColor: 'rgba(184,137,26,0.15)',
    borderLeftWidth: 3, borderLeftColor: 'rgba(184,137,26,0.4)',
    borderRadius: 4, borderTopLeftRadius: 0,
    position: 'relative', overflow: 'hidden',
  },
  bioTopLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 1 } as import('react-native').ViewStyle,
  bioLabel: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 3, color: colors.sepia, marginBottom: 12, opacity: 0.9, includeFontPadding: false },
  bioTextWrap: { position: 'relative' },
  bioText: { fontFamily: fonts.body, fontSize: 14, color: colors.bone, lineHeight: 24 },
  bioFadeMask: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 60 },
  toggleTicketBtn: {
    marginTop: 16, paddingVertical: 12, alignItems: 'center',
    borderWidth: 1, borderColor: colors.sepiaBorder,
    backgroundColor: 'rgba(14,11,8,0.9)', borderRadius: 2,
  },
  toggleTicketText: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 3, color: colors.sepia, includeFontPadding: false },

  // ── Sections (one rail, one header grammar) ──
  section: { marginTop: 8, marginBottom: 16, paddingHorizontal: RAIL },
  sectionFlush: { marginTop: 8, marginBottom: 16 },
  sectionPadded: { paddingHorizontal: RAIL },

  // ── Defining List ──
  definingWorksWrap: { minHeight: 250 },
  definingList: { paddingHorizontal: RAIL },

  // ── Empty State ──
  emptyState: {
    padding: 32, marginHorizontal: RAIL, alignItems: 'center',
    borderWidth: 1, borderColor: colors.sepiaBorder,
    borderRadius: 4, backgroundColor: 'rgba(18,14,9,0.4)',
  },
  emptyLabel: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 3, color: colors.sepia, marginBottom: 8, includeFontPadding: false },
  emptyTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.parchment, opacity: 0.7, marginBottom: 4 },
  emptyBody: { fontFamily: fonts.body, fontSize: 14, color: colors.fog, fontStyle: 'italic', textAlign: 'center' },

  // ── Back Button ──
  backBtnBottom: { marginTop: 24, paddingVertical: 14, paddingHorizontal: 24, borderWidth: 1, borderColor: colors.sepiaBorder, borderRadius: 2 },
  backBtnBottomText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.bone, includeFontPadding: false },
  backBtnRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});

// ═══════════════════════════════════════════════════════════
//  SHARED SUB-COMPONENT STYLES
// ═══════════════════════════════════════════════════════════
export const st = StyleSheet.create({
  shimmer: { backgroundColor: 'rgba(8,6,4,0.98)', borderRadius: 3 },

  // ── Obscurity Badge ──
  // The raw score is gone. It was an internal 2–99 number with no unit — "51
  // INDIE" invited the question "51 of what?", and the word already carries the
  // whole meaning. The score still decides the word and the colour.
  obsBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 7, paddingVertical: 4, borderWidth: 1, borderRadius: 2 },
  obsLabel: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 2, includeFontPadding: false },

  // ── Film-strip Perforations ──
  perfRow: {
    flexDirection: 'row', justifyContent: 'center', gap: 6, opacity: 0.15,
  },
  perfHole: {
    width: 14, height: 8,
    borderWidth: 1, borderColor: colors.sepia, borderRadius: 1,
  },

  // ── Grid Poster Cards ──
  gridCard: { width: '100%', marginBottom: 8 },
  gridPosterWrap: { position: 'relative', width: '100%' },
  gridPoster: {
    borderRadius: 2, borderWidth: 1, borderColor: 'rgba(184,137,26,0.2)',
    width: '100%', aspectRatio: 2 / 3,
  },
  gridPosterPlaceholder: { backgroundColor: 'rgba(8,6,4,0.98)', justifyContent: 'center', alignItems: 'center' },
  // The brass mark of a screened frame — the Hunt made visible.
  screenedTick: {
    position: 'absolute', top: 5, right: 5,
    width: 16, height: 16, borderRadius: 2,
    backgroundColor: 'rgba(10,9,6,0.85)',
    borderWidth: 1, borderColor: 'rgba(184,137,26,0.6)',
    alignItems: 'center', justifyContent: 'center',
  },
  gridTitle: {
    fontFamily: fonts.sub, fontSize: 10, color: colors.bone,
    marginTop: 5, width: '100%', includeFontPadding: false,
    lineHeight: 13,
    // Two lines at a readable size beats one line shrunk to 7pt — "Untitled
    // Daniels Event Film" was unreadable. The fixed height is what keeps a
    // three-column grid's rows level when some titles wrap and others do not.
    height: 26,
  },
  gridYear: { fontFamily: fonts.sub, fontSize: 8, color: colors.fog, letterSpacing: 1, marginTop: 2, includeFontPadding: false },

  // ── Grid Column Spacing (pre-computed for FlashList hot path) ──
  gridColLeft: { flex: 1, paddingLeft: 20, paddingRight: 0, marginBottom: POSTER_GRID_GAP } as import('react-native').ViewStyle,
  gridColCenter: { flex: 1, paddingLeft: 10, paddingRight: 10, marginBottom: POSTER_GRID_GAP } as import('react-native').ViewStyle,
  gridColRight: { flex: 1, paddingLeft: 0, paddingRight: 20, marginBottom: POSTER_GRID_GAP } as import('react-native').ViewStyle,

  // ── Defining Work Cards ──
  defCard: { width: 140 },
  defPosterWrap: {
    width: 140, height: 210, borderRadius: 4, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(184,137,26,0.2)',
    position: 'relative',
  },
  defPoster: { width: '100%', height: '100%' } as import('react-native').ImageStyle,
  defPosterPlaceholder: { backgroundColor: 'rgba(8,6,4,0.98)', justifyContent: 'center', alignItems: 'center' },
  defOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 8, paddingBottom: 8, paddingTop: 50,
  } as import('react-native').ViewStyle,
  defTitle: { fontFamily: fonts.sub, fontSize: 12, color: colors.parchment, lineHeight: 16 },
  defMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  defYear: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1, color: colors.fog, includeFontPadding: false },
  defBadgeWrap: { marginTop: 6 },
  defSeparator: { width: 12 },
});

/** Pre-computed column styles for FlashList grid — zero allocations in hot path */
export const GRID_COL_STYLES = [st.gridColLeft, st.gridColCenter, st.gridColRight];
