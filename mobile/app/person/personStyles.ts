/**
 * PersonDetailScreen styles — extracted from [id].tsx.
 *
 * Two style-sheets:
 *  • `s`  — main screen styles (hero, dossier, bio, sections, etc.)
 *  • `st` — shared sub-component styles (shimmer, badges, grid cards, defining cards)
 */
import { StyleSheet } from 'react-native';
import { colors, fonts, effects } from '@/src/theme/theme';

const PORTRAIT_W = 130;
const POSTER_GRID_GAP = 10;

// ════════════════════════════════════════════════════════════
//  MAIN STYLES — NITRATE NOIR
// ════════════════════════════════════════════════════════════
export const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  scrollContent: { paddingBottom: 100 },

  // ── Shimmer ──
  shimmerBackdrop: { minHeight: 240, maxHeight: 300, backgroundColor: 'rgba(8,6,4,0.98)', position: 'relative' },
  shimmerContent: { alignItems: 'center', marginTop: -75, paddingHorizontal: 20, zIndex: 2 },
  shimmerPortrait: { width: PORTRAIT_W, height: PORTRAIT_W * 1.5, borderRadius: 2, marginBottom: 10 },
  shimmerSocietyMark: { width: 160, height: 8, borderRadius: 2, marginBottom: 12 },
  shimmerDeptBadge: { width: 90, height: 22, borderRadius: 2, marginBottom: 10 },
  shimmerName: { width: 220, height: 34, borderRadius: 2, marginBottom: 12 },
  shimmerDateRow: { width: 180, height: 12, borderRadius: 2, marginBottom: 16 },
  shimmerStatsRow: { flexDirection: 'row', gap: 14, marginBottom: 14, justifyContent: 'center' },
  shimmerStat: { width: 80, height: 12, borderRadius: 2 },

  // ── Not Found ──
  notFoundContainer: { justifyContent: 'center', alignItems: 'center', padding: 32 },
  notFoundLabel: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 4, color: colors.sepia, marginBottom: 8 },
  notFoundTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.parchment, marginBottom: 8, ...effects.textGlowSepia },
  notFoundBody: { fontFamily: fonts.body, fontSize: 14, color: colors.fog, textAlign: 'center', lineHeight: 22 },

  // ── Floating Back ──
  floatingBack: {
    position: 'absolute', top: 54, left: 16, zIndex: 100,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(10,7,3,0.65)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Hero Backdrop ──
  heroWrap: { minHeight: 240, maxHeight: 300, position: 'relative', overflow: 'hidden' },
  heroBg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  heroSepia: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,7,3,0.5)' },
  perfBar: { position: 'absolute', bottom: 4, left: 0, right: 0, zIndex: 2 },

  // ── Dossier Section ──
  dossierSection: { alignItems: 'center', marginTop: -75, paddingHorizontal: 20, zIndex: 2 },

  // ── Portrait ──
  portraitWrap: { marginBottom: 10, position: 'relative' },
  portraitGlow: {
    position: 'absolute', top: -10, left: -10, right: -10, bottom: -10,
    backgroundColor: 'rgba(139,105,20,0.15)',
    borderRadius: 8, shadowColor: colors.sepia,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6, shadowRadius: 20, elevation: 15,
  },
  portraitCard: {
    width: PORTRAIT_W, height: PORTRAIT_W * 1.5, borderRadius: 2, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.2)',
  },
  portrait: { width: '100%', height: '100%' } as import('react-native').ImageStyle,
  portraitPlaceholder: { backgroundColor: 'rgba(8,6,4,0.98)', justifyContent: 'center', alignItems: 'center' },
  portraitInitial: { fontFamily: fonts.display, fontSize: 40, color: colors.fog },

  // ── Society Watermark ──
  societyMark: {
    fontFamily: fonts.ui, fontSize: 7, letterSpacing: 4,
    color: colors.sepia, opacity: 0.55, marginBottom: 12,
  },

  // ── Department Badge ──
  deptBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 2,
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)',
    marginBottom: 10,
  },
  deptLabel: { fontFamily: fonts.uiBold, fontSize: 8, letterSpacing: 3.5, color: colors.sepia },

  // ── Name ──
  personName: {
    fontFamily: fonts.display, fontSize: 28, color: colors.parchment,
    textAlign: 'center', lineHeight: 34, marginBottom: 12,
  },

  // ── Dates ──
  dateRow: { alignItems: 'center', gap: 6, marginBottom: 16 },
  dateItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dateText: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1, color: colors.fog },
  dateTextDeath: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1, color: 'rgba(200,80,80,0.7)' },
  dateTextFaded: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1, color: colors.fog, opacity: 0.8 },

  // ── Stats Strip ──
  statsStrip: {
    flexDirection: 'row', gap: 14, flexWrap: 'wrap',
    justifyContent: 'center', alignItems: 'center', marginBottom: 14,
  },
  statChip: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statText: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1.2, color: colors.bone },
  knownForText: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1.2, color: colors.fog },
  knownForTitle: { color: colors.bone, textDecorationLine: 'underline', textDecorationColor: 'rgba(139,105,20,0.3)' } as import('react-native').TextStyle,

  // ── Share to Lounge ──
  loungeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 12,
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)', borderRadius: 2,
    backgroundColor: 'rgba(14,11,8,0.9)',
    marginBottom: 14,
  },
  loungeBtnText: { fontFamily: fonts.uiMedium, fontSize: 9, letterSpacing: 1.5, color: colors.sepia },

  // ── Auteur Hunt ──
  auteurHuntWrap: { width: '100%', alignItems: 'center' },
  auteurHunt: {
    width: '100%', maxWidth: 300,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: 'rgba(196,150,26,0.06)', borderRadius: 4,
    borderWidth: 1, borderColor: 'rgba(196,150,26,0.2)',
    marginBottom: 8,
  },
  auteurHuntHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 } as import('react-native').ViewStyle,
  auteurHuntTitle: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1.5, color: colors.sepia },
  auteurHuntCount: { fontFamily: fonts.uiMedium, fontSize: 8, letterSpacing: 1, color: colors.parchment },
  auteurHuntTrack: { height: 4, backgroundColor: 'rgba(8,6,4,0.98)', borderRadius: 2, overflow: 'hidden' },
  auteurHuntFill: { height: '100%', backgroundColor: colors.sepia, borderRadius: 2 } as import('react-native').ViewStyle,
  auteurHuntMastery: { shadowColor: colors.sepia, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 10, elevation: 10 } as import('react-native').ViewStyle,
  auteurComplete: {
    fontFamily: fonts.uiBold, fontSize: 7, letterSpacing: 2.5,
    color: colors.flicker, marginTop: 6, textAlign: 'center',
  },

  // ── Biography ──
  bioSection: {
    marginHorizontal: 20, marginBottom: 24, marginTop: 8,
    padding: 20,
    backgroundColor: 'rgba(25,20,15,0.6)',
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.15)',
    borderLeftWidth: 3, borderLeftColor: 'rgba(139,105,20,0.4)',
    borderRadius: 4, borderTopLeftRadius: 0,
    position: 'relative', overflow: 'hidden',
  },
  bioTopLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 1 } as import('react-native').ViewStyle,
  bioLabel: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 3, color: colors.sepia, marginBottom: 12, opacity: 0.8 },
  bioTextWrap: { position: 'relative' },
  bioText: { fontFamily: fonts.body, fontSize: 14, color: colors.bone, lineHeight: 24 },
  bioFadeMask: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 60 },
  toggleTicketBtn: {
    marginTop: 16, paddingVertical: 12, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)',
    backgroundColor: 'rgba(14,11,8,0.9)', borderRadius: 2,
  },
  toggleTicketText: { fontFamily: fonts.uiBold, fontSize: 8, letterSpacing: 3, color: colors.sepia },

  // ── Sections ──
  section: { marginTop: 8, marginBottom: 16, paddingHorizontal: 20 },
  sectionFlush: { marginTop: 8, marginBottom: 16 },
  sectionPadded: { paddingHorizontal: 20 },
  sectionSubtitle: { fontFamily: fonts.display, fontSize: 22, color: colors.parchment, marginBottom: 16, paddingHorizontal: 0 },

  // ── Defining List ──
  definingWorksWrap: { minHeight: 250 },
  definingList: { paddingHorizontal: 20 },

  // ── Gold Separator ──
  goldSep: { height: 1, marginBottom: 20 },

  // ── Filmography Grid ──

  // ── Empty State ──
  emptyState: {
    padding: 32, marginHorizontal: 20, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)',
    borderRadius: 4, backgroundColor: 'rgba(18,14,9,0.4)',
  },
  emptyLabel: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 3, color: colors.sepia, marginBottom: 8 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.parchment, opacity: 0.7, marginBottom: 4 },
  emptyBody: { fontFamily: fonts.body, fontSize: 14, color: colors.fog, fontStyle: 'italic', textAlign: 'center' },

  // ── Back Button ──
  backBtnBottom: { marginTop: 24, paddingVertical: 14, paddingHorizontal: 24, borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)', borderRadius: 2 },
  backBtnBottomText: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 2, color: colors.bone },
  backBtnRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  // ── Closing Bar ──
  closingBar: { alignItems: 'center', marginTop: 32, marginBottom: 8, paddingHorizontal: 40 },
  closingLine: { width: '100%', height: 1, marginBottom: 12 },
  closingText: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 5, color: colors.sepia, opacity: 0.4 },
});

// ═══════════════════════════════════════════════════════════
//  SHARED SUB-COMPONENT STYLES
// ═══════════════════════════════════════════════════════════
export const st = StyleSheet.create({
  shimmer: { backgroundColor: 'rgba(8,6,4,0.98)', borderRadius: 3 },

  // ── Obscurity Badge ──
  obsBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 4, borderWidth: 1, borderRadius: 2 },
  obsScore: { fontFamily: fonts.uiBold, fontSize: 10 },
  obsLabel: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 2, color: colors.fog },

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
  gridPoster: {
    borderRadius: 2, borderWidth: 1, borderColor: 'rgba(139,105,20,0.2)',
    width: '100%', aspectRatio: 2 / 3,
  },
  gridPosterPlaceholder: { backgroundColor: 'rgba(8,6,4,0.98)', justifyContent: 'center', alignItems: 'center' },
  gridTitle: {
    fontFamily: fonts.sub, fontSize: 10, color: colors.bone,
    marginTop: 5, width: '100%',
  },
  gridMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 3 },
  gridYear: { fontFamily: fonts.ui, fontSize: 9, color: colors.fog, letterSpacing: 1 },

  // ── Grid Column Spacing (pre-computed for FlashList hot path) ──
  gridColLeft: { flex: 1, paddingLeft: 20, paddingRight: 0, marginBottom: POSTER_GRID_GAP } as import('react-native').ViewStyle,
  gridColCenter: { flex: 1, paddingLeft: 10, paddingRight: 10, marginBottom: POSTER_GRID_GAP } as import('react-native').ViewStyle,
  gridColRight: { flex: 1, paddingLeft: 0, paddingRight: 20, marginBottom: POSTER_GRID_GAP } as import('react-native').ViewStyle,

  // ── Defining Work Cards ──
  defCard: { width: 140 },
  defPosterWrap: {
    width: 140, height: 210, borderRadius: 4, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.2)',
    position: 'relative',
  },
  defPoster: { width: '100%', height: '100%' } as import('react-native').ImageStyle,
  defPosterPlaceholder: { backgroundColor: 'rgba(8,6,4,0.98)', justifyContent: 'center', alignItems: 'center' },
  defOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 8, paddingBottom: 8, paddingTop: 50,
  } as import('react-native').ViewStyle,
  defTitle: { fontFamily: fonts.sub, fontSize: 12, color: colors.parchment, lineHeight: 16 },
  defMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  defYear: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1, color: colors.fog },
  defRatingRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  defRatingText: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 0.5, color: colors.fog },
  defBadgeWrap: { marginTop: 6 },
  defSeparator: { width: 12 },
});

/** Pre-computed column styles for FlashList grid — zero allocations in hot path */
export const GRID_COL_STYLES = [st.gridColLeft, st.gridColCenter, st.gridColRight];
