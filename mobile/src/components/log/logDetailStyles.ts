import { colors, fonts } from '@/src/theme/theme';
import { StyleSheet } from 'react-native';

// ── THE RECORD — one spine for the whole document ──
export const SPINE = 20;

export const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  centerFull: { justifyContent: 'center', alignItems: 'center', gap: 16 },
  notFoundText: { color: colors.fog, fontFamily: fonts.body, fontSize: 14, marginTop: 8 },
  shrinkable: { flexShrink: 1 },
  maxHeight200: { maxHeight: 200 },
  backdropContainer: { height: 360 },
  fullSize: { width: '100%', height: '100%' },
  opacity30: { opacity: 0.3 },
  opacity20: { opacity: 0.2 },
  textureOverlay: { backgroundColor: 'rgba(0,0,0,0.03)' },
  hiddenShareContainer: { position: 'absolute', top: 0, left: 0, opacity: 0.01, zIndex: -1 },
  inkBg: { backgroundColor: colors.ink },
  parallaxPadder: { height: 80, width: '100%' },
  flexGrowZero: { flexGrow: 0 },

  // ── Header rail ──
  header: {
    paddingTop: 56, paddingHorizontal: 16, paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ash,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    minHeight: 24, position: 'relative',
  },
  backBtn: { width: 60, zIndex: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 14, zIndex: 2 },
  // The eyebrow is absolutely centered so it never shifts owner↔visitor.
  eyebrowWrap: { position: 'absolute', top: 0, bottom: 0, left: 80, right: 80, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontFamily: fonts.sub, fontSize: 7, letterSpacing: 2.5, color: colors.sepia, opacity: 0.72, includeFontPadding: false },
  shareBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  shareBtnText: { fontFamily: fonts.sub, fontSize: 9, color: colors.sepia, letterSpacing: 1.5, includeFontPadding: false },
  moreBtn: { paddingHorizontal: 2, paddingVertical: 8 },

  content: { paddingBottom: 40 },

  // ── The record card ──
  contentCard: { backgroundColor: 'rgba(10,7,3,0.92)', borderTopWidth: 1, borderColor: colors.sepiaBorder, borderTopLeftRadius: 12, borderTopRightRadius: 12, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: -20 }, shadowOpacity: 0.8, shadowRadius: 40, elevation: 24 },
  contentCardAuteur: { backgroundColor: 'rgba(25,10,10,0.92)', borderColor: colors.crimsonBorder },
  logCardInner: { paddingHorizontal: SPINE, paddingBottom: 16, marginTop: 0, paddingTop: 24 },
  logCenter: { alignItems: 'center' },
  bylineFull: { width: '100%', marginBottom: 20 },

  // ── Poster ──
  posterSection: { width: '100%', alignItems: 'center', marginBottom: 24, zIndex: 10 },
  posterGlow: { position: 'absolute', top: '50%', left: '50%', width: 180, height: 250, marginLeft: -90, marginTop: -125, borderRadius: 125, zIndex: 0 },
  posterGlowAuteur: { backgroundColor: colors.crimsonFaint },
  posterGlowArchivist: { backgroundColor: colors.sepiaSubtle },
  posterBounds: { width: 140, height: 210, borderRadius: 2, overflow: 'hidden', borderWidth: 1, borderColor: colors.sepiaBorderStrong, backgroundColor: colors.soot, shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.8, shadowRadius: 40, elevation: 12 },
  posterBoundsAuteur: { borderColor: colors.crimsonBorder, shadowColor: 'rgba(107,26,10,0.3)', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.8, shadowRadius: 40 },
  posterCentered: { width: '100%', height: '100%' },
  posterPlaceholder: { backgroundColor: colors.soot, justifyContent: 'center', alignItems: 'center' },

  // ── Title ──
  titleSection: { alignItems: 'center', marginBottom: 12 },
  logFilmTitle: { fontFamily: fonts.display, fontSize: 32, lineHeight: 35, color: colors.parchment, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 12 },
  logFilmYear: { fontFamily: fonts.sub, fontSize: 12, letterSpacing: 3.6, color: colors.fog, marginTop: 8, includeFontPadding: false },
  ratingWrap: { marginTop: 12 },

  // ── Review ──
  reviewSection: { marginTop: 24, marginBottom: 16 },
  ornamentalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 16, marginTop: 16 },
  ornamentalLine: { flex: 1, maxWidth: 80, height: 1, backgroundColor: colors.sepiaBorderStrong },
  ornamentalStar: { opacity: 0.7 },
  featuredQuoteWrap: { paddingVertical: 24, alignItems: 'center' },
  featuredQuote: { fontFamily: fonts.display, fontSize: 20, color: colors.sepia, fontStyle: 'italic', lineHeight: 27, textAlign: 'center', textShadowColor: 'rgba(184,137,26,0.15)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 12 },
  featuredQuoteAuteur: { color: colors.crimson, textShadowColor: 'rgba(107,26,10,0.15)' },
  reviewBodyWrap: { paddingHorizontal: 0, marginTop: 0 },
  // The essay, set as paragraphs — a raised drop cap opens the first.
  reviewParagraph: { fontFamily: fonts.body, fontSize: 14, lineHeight: 24, color: colors.bone, opacity: 0.9 },
  dropCapParagraph: { fontFamily: fonts.body, fontSize: 14, color: colors.bone, opacity: 0.9 },
  reviewParagraphSpaced: { marginBottom: 14 },
  dropCapLetter: { fontFamily: fonts.display, fontSize: 34, color: colors.sepia, lineHeight: 36, textShadowColor: 'rgba(184,137,26,0.2)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6 },

  // ── Editorial Badge ──
  editorialBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, position: 'absolute', left: 16, backgroundColor: 'rgba(11,10,8,0.5)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 2, borderWidth: 1, borderColor: colors.sepiaBorder },
  editorialBadgeText: { fontFamily: fonts.sub, fontSize: 7, letterSpacing: 2.2, color: 'rgba(218,165,32,0.85)', includeFontPadding: false },

  // ── Viewing Chronicle ──
  chronicleWrap: { marginTop: 8, marginBottom: 16, backgroundColor: '#050403', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.sepiaBorder, borderRadius: 2, overflow: 'hidden' },
  chronicleHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.sepiaBorder },
  chronicleDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.sepia },
  chronicleTitle: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1.5, color: colors.sepia, includeFontPadding: false },
  chronicleCard: { padding: 14 },
  chronicleLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  chronicleLabelBadge: { borderRadius: 2 },
  chronicleLabelBadgeCurrent: { backgroundColor: colors.sepiaSubtle, paddingHorizontal: 6, paddingVertical: 2 },
  chronicleLabelText: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1, color: colors.fog, includeFontPadding: false },
  chronicleLabelTextCurrent: { color: colors.sepia },
  chronicleDateText: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 0.8, color: colors.fog, includeFontPadding: false },
  chronicleRatingWrap: { marginBottom: 6 },
  chronicleReviewText: { fontFamily: fonts.body, fontSize: 13, color: colors.bone, lineHeight: 20, opacity: 0.75 },
  chronicleReviewTextCurrent: { fontSize: 14, lineHeight: 22, opacity: 0.9, fontStyle: 'normal' },
  chronicleReviewTextPast: { fontStyle: 'italic' },
  chronicleWatchedWith: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 0.8, color: colors.fog, marginTop: 6, includeFontPadding: false },
  chronicleDots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingBottom: 10, paddingTop: 4 },
  chronicleDotIndicator: { width: 6, height: 2, borderRadius: 1, backgroundColor: colors.sepiaBorder },
  chronicleDotActive: { backgroundColor: colors.sepia, width: 12 },

  // ── Autopsy drawer ──
  autopsyWrap: { marginTop: 8 },
  autopsyToggle: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 16, backgroundColor: 'rgba(11,10,8,0.95)', borderRadius: 4, borderWidth: 1, borderColor: colors.sepiaBorder, borderBottomWidth: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, marginBottom: -1, zIndex: 2 },
  autopsyToggleInner: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  autopsyPulse: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.bloodReel, shadowColor: 'rgba(107,26,10,0.9)', shadowOffset: { width: 0, height: 0 }, shadowRadius: 8, shadowOpacity: 1 },
  autopsyToggleTitle: { fontFamily: fonts.display, fontSize: 12, letterSpacing: 2, color: colors.parchment },
  autopsyToggleConf: { fontFamily: fonts.sub, fontSize: 7, letterSpacing: 3, color: colors.sepia, opacity: 0.6, includeFontPadding: false },
  rotated: { transform: [{ rotate: '180deg' }] },

  // ── Action Deck ──
  actionDeckWrap: { marginTop: 8 },
  actionDeck: { flexDirection: 'row', backgroundColor: '#050403', borderRadius: 2, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.sepiaBorder, marginBottom: 16, overflow: 'hidden', padding: 1, gap: StyleSheet.hairlineWidth, zIndex: 1 },
  deckBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 18, gap: 6, backgroundColor: colors.ink, borderRadius: 1 },
  deckLabel: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 2, color: colors.fog, includeFontPadding: false },
  deckLabelActive: { color: colors.sepia },
  deckLabelCertified: { color: colors.crimson },

  // ── Critiques ──
  commentsSection: { paddingHorizontal: SPINE, marginTop: 16, paddingBottom: 40 },
  emptyComments: { fontFamily: fonts.body, fontSize: 12, fontStyle: 'italic', color: colors.fog, textAlign: 'center', marginTop: 20 },
  listDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.sepiaBorder, marginTop: 20, marginBottom: 2 },

  commentItem: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ash },
  commentTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 7 },
  commentByline: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  commentAvatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.soot, borderWidth: 1, borderColor: colors.sepiaBorder, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  commentAvatarText: { fontFamily: fonts.display, fontSize: 11, color: colors.parchment, includeFontPadding: false, textAlignVertical: 'center' },
  commUsername: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 1, color: colors.sepia, includeFontPadding: false, flexShrink: 1 },
  commBody: { fontFamily: fonts.body, fontSize: 13, color: colors.bone, lineHeight: 20 },
  commDate: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1.5, color: colors.fog, marginLeft: 'auto', includeFontPadding: false, flexShrink: 0 },
  commDeleteBtn: { marginTop: 8, alignSelf: 'flex-end' },
  commDelete: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1, color: colors.crimson, includeFontPadding: false },

  // Show earlier/more critiques
  showMoreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, alignSelf: 'center', marginTop: 16, paddingVertical: 9, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.sepiaBorder, borderRadius: 2 },
  showMoreText: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 2, color: colors.sepia, includeFontPadding: false },

  // ── Compose critique (top of the section) ──
  composeWrap: { marginTop: 4 },
  critiqueInput: {
    backgroundColor: '#050403', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.sepiaBorder,
    borderRadius: 2, paddingHorizontal: 16, paddingVertical: 16,
    color: colors.bone, fontFamily: fonts.body, fontSize: 13, lineHeight: 22,
    minHeight: 100, textAlignVertical: 'top',
  },
  critiqueSubmitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.sepia, borderRadius: 2,
    paddingVertical: 14, marginTop: 12,
  },
  critiqueSubmitText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.ink, includeFontPadding: false },
  critiqueSubmitDisabled: { opacity: 0.4 },

  backBtnRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 24, paddingVertical: 12, paddingHorizontal: 24, borderWidth: 1, borderColor: colors.ash, borderRadius: 2 },
  backBtnText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.bone, includeFontPadding: false },

  // ── Abandoned Badge (crimson, shrink-guarded) ──
  abandonedWrap: { marginTop: 12, alignItems: 'center', width: '100%', paddingHorizontal: 8 },
  abandonedBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.crimsonFaint, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 4, borderWidth: 1, borderColor: colors.crimsonBorder, flexShrink: 1, maxWidth: '100%' },
  abandonedText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1.5, color: colors.crimson, includeFontPadding: false, flexShrink: 1 },

  // ── Watched Metadata Row ──
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  metaDateText: { fontFamily: fonts.sub, fontSize: 9, color: colors.fog, letterSpacing: 1.5, includeFontPadding: false },
  metaDot: { color: colors.ash, fontSize: 10 },
  metaWithText: { fontFamily: fonts.sub, fontSize: 9, color: colors.sepia, letterSpacing: 1.5, includeFontPadding: false },
  metaFormatText: { fontFamily: fonts.sub, fontSize: 9, color: colors.bone, letterSpacing: 1.5, includeFontPadding: false },

  // ── Private Notes ──
  privateNotesWrap: { marginTop: 24, padding: 16, backgroundColor: 'rgba(10,7,3,0.5)', borderWidth: 1, borderColor: colors.sepiaBorder, borderRadius: 4 },
  privateNotesHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  privateNotesLabel: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2, color: colors.sepia, includeFontPadding: false },
  privateNotesBody: { fontFamily: fonts.bodyItalic, fontSize: 12, color: colors.fog, lineHeight: 20 },
});
