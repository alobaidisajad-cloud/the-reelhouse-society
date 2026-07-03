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
  shimmerName: { width: 220, height: 34, borderRadius: 2, marginBottom: 12 },
  shimmerDateRow: { width: 190, height: 10, borderRadius: 2, marginBottom: 6 },
  shimmerPlaceRow: { width: 150, height: 9, borderRadius: 2, marginBottom: 14 },
  shimmerStatsRow: { flexDirection: 'row', gap: 14, marginBottom: 14, justifyContent: 'center' },
  shimmerStat: { width: 90, height: 10, borderRadius: 2 },

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
  },

  // ── Hero Backdrop ──
  heroWrap: { minHeight: 240, maxHeight: 300, position: 'relative', overflow: 'hidden' },
  heroBg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  heroSepia: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,7,3,0.5)' },
  perfBar: { position: 'absolute', bottom: 4, left: 0, right: 0, zIndex: 2 },

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
    textAlign: 'center', lineHeight: 34, marginBottom: 10,
  },
  // The life line — dates first, ground second; the dagger wears crimson.
  lifeLine: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1.5, color: colors.fog, textAlign: 'center', includeFontPadding: false },
  lifeLineDeath: { color: colors.crimson },
  lifeLinePlace: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1.5, color: colors.fog, opacity: 0.75, textAlign: 'center', marginTop: 4, includeFontPadding: false },

  // ── Beat 2: the record — craft stats · known for ──
  recordGroup: { alignItems: 'center', marginTop: 14, marginBottom: 14 },
  statLine: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1.5, color: colors.bone, textAlign: 'center', includeFontPadding: false },
  knownForLine: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1.5, color: colors.fog, textAlign: 'center', marginTop: 5, includeFontPadding: false },
  knownForTitle: { color: colors.sepia } as import('react-native').TextStyle,

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
  obsBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 4, borderWidth: 1, borderRadius: 2 },
  obsScore: { fontFamily: fonts.sub, fontSize: 10, includeFontPadding: false },
  obsLabel: { fontFamily: fonts.sub, fontSize: 7, letterSpacing: 2, color: colors.fog, includeFontPadding: false },

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
