import { colors, fonts } from '@/src/theme/theme';
import { StyleSheet } from 'react-native';

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
  header: {
    paddingTop: 56, paddingHorizontal: 16, paddingBottom: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ash,
  },
  backBtn: { width: 50 },
  headerTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.bone },
  shareBtn: { width: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  shareBtnText: { fontFamily: fonts.uiBold, fontSize: 10, color: colors.sepia, letterSpacing: 1 },
  moreBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, paddingHorizontal: 10, paddingVertical: 8, marginLeft: 8 },
  
  content: { paddingBottom: 40 },

  // Content Card
  contentCard: { backgroundColor: 'rgba(10,7,3,0.92)', minHeight: 800, borderTopWidth: 1, borderColor: 'rgba(139,105,20,0.15)', borderTopLeftRadius: 12, borderTopRightRadius: 12, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: -20 }, shadowOpacity: 0.8, shadowRadius: 40, elevation: 24 },
  contentCardAuteur: { backgroundColor: 'rgba(25,10,10,0.92)', borderColor: 'rgba(180,45,45,0.25)' },
  logCardInner: { paddingHorizontal: 16, paddingBottom: 16, marginTop: 0, paddingTop: 24 },
  logCenter: { alignItems: 'center' },

  // User Row
  userRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 24, width: '100%' },
  userRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  userRefText: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 1.8, color: colors.sepia, textTransform: 'uppercase' },
  timestamp: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 2, color: colors.fog },
  archivistBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: 'rgba(196,150,26,0.1)', borderWidth: 1, borderColor: 'rgba(196,150,26,0.3)', borderRadius: 2 },
  archivistBadgeText: { fontFamily: fonts.ui, fontSize: 6.5, letterSpacing: 1, color: colors.sepia },
  auteurBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: '#DAA520', borderRadius: 2 },
  auteurBadgeLabel: { fontFamily: fonts.ui, fontSize: 6.5, letterSpacing: 1, color: colors.ink },

  // Poster
  posterSection: { width: '100%', alignItems: 'center', marginBottom: 24, zIndex: 10 },
  posterGlow: { position: 'absolute', top: '50%', left: '50%', width: 180, height: 250, marginLeft: -90, marginTop: -125, borderRadius: 125, zIndex: 0 },
  posterGlowAuteur: { backgroundColor: 'rgba(125,31,31,0.12)' },
  posterGlowArchivist: { backgroundColor: 'rgba(139,105,20,0.12)' },
  posterBounds: { width: 140, height: 210, borderRadius: 2, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(196,150,26,0.35)', backgroundColor: colors.soot, shadowColor: '#000', shadowOffset: {width: 0, height: 20}, shadowOpacity: 0.8, shadowRadius: 40, elevation: 12 },
  posterBoundsAuteur: { borderColor: 'rgba(180,45,45,0.35)', shadowColor: 'rgba(125,31,31,0.2)', shadowOffset: {width:0, height:20}, shadowOpacity: 0.8, shadowRadius: 40 },
  posterCentered: { width: '100%', height: '100%' },
  posterPlaceholder: { backgroundColor: colors.soot, justifyContent: 'center', alignItems: 'center' },

  // Title
  titleSection: { alignItems: 'center', marginBottom: 12 },
  logFilmTitle: { fontFamily: fonts.display, fontSize: 32, lineHeight: 35, color: colors.parchment, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: {width:0, height:4}, textShadowRadius: 12 },
  logFilmYear: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 3.6, color: colors.fog, marginTop: 8 },
  ratingWrap: { marginTop: 12 },

  // Review
  reviewSection: { marginTop: 24, marginBottom: 16, paddingHorizontal: 24 },
  ornamentalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 16, marginTop: 16 },
  ornamentalLine: { flex: 1, maxWidth: 80, height: 1, backgroundColor: 'rgba(139,105,20,0.4)' },
  ornamentalStar: { opacity: 0.7 },
  featuredQuoteWrap: { paddingVertical: 24, alignItems: 'center' },
  featuredQuote: { fontFamily: fonts.display, fontSize: 20, color: colors.sepia, fontStyle: 'italic', lineHeight: 27, textAlign: 'center', textShadowColor: 'rgba(139,105,20,0.15)', textShadowOffset: {width:0, height:2}, textShadowRadius: 12 },
  featuredQuoteAuteur: { color: 'rgba(180,45,45,0.9)', textShadowColor: 'rgba(125,31,31,0.15)' },
  reviewBodyWrap: { paddingHorizontal: 0, marginTop: 0 },
  review: { fontSize: 13, color: colors.bone, lineHeight: 22, opacity: 0.9 },
  dropCapRow: { flexDirection: 'row', alignItems: 'flex-start' },
  dropCapLetter: { fontFamily: fonts.display, fontSize: 34, color: colors.sepia, lineHeight: 36, marginRight: 6, marginTop: -2, textShadowColor: 'rgba(139,105,20,0.2)', textShadowOffset: {width:0, height:2}, textShadowRadius: 6 },
  dropCapBody: { flex: 1, paddingTop: 3, fontFamily: fonts.body, fontSize: 15, color: colors.bone, lineHeight: 28, opacity: 0.9 },

  // Editorial Badge
  editorialBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, position: 'absolute', top: 90, left: 16, backgroundColor: 'rgba(11,10,8,0.5)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 2, borderWidth: 1, borderColor: 'rgba(196,150,26,0.2)' },
  editorialBadgeText: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 2.2, color: 'rgba(218,165,32,0.85)' },

  // Viewing Chronicle
  chronicleWrap: { marginHorizontal: 16, marginTop: 8, marginBottom: 16, backgroundColor: '#050403', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(139,105,20,0.18)', borderRadius: 2, overflow: 'hidden' },
  chronicleHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(139,105,20,0.1)' },
  chronicleDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.sepia },
  chronicleTitle: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1.5, color: colors.sepia },
  chronicleCard: { padding: 14 },
  chronicleLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  chronicleLabelBadge: { borderRadius: 2 },
  chronicleLabelBadgeCurrent: { backgroundColor: 'rgba(139,105,20,0.12)', paddingHorizontal: 6, paddingVertical: 2 },
  chronicleLabelText: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1, color: colors.fog },
  chronicleLabelTextCurrent: { color: colors.sepia },
  chronicleDateText: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 0.8, color: colors.fog },
  chronicleRatingWrap: { marginBottom: 6 },
  chronicleReviewText: { fontFamily: fonts.body, fontSize: 13, color: colors.bone, lineHeight: 20, opacity: 0.75 },
  chronicleReviewTextCurrent: { fontSize: 14, lineHeight: 22, opacity: 0.9, fontStyle: 'normal' },
  chronicleReviewTextPast: { fontStyle: 'italic' },
  chronicleWatchedWith: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 0.8, color: colors.fog, marginTop: 6 },
  chronicleDots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingBottom: 10, paddingTop: 4 },
  chronicleDotIndicator: { width: 6, height: 2, borderRadius: 1, backgroundColor: 'rgba(139,105,20,0.25)' },
  chronicleDotActive: { backgroundColor: colors.sepia, width: 12 },

  // Autopsy
  autopsyWrap: { paddingHorizontal: 16 },
  autopsyToggle: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 16, backgroundColor: 'rgba(11,10,8,0.95)', borderRadius: 4, borderWidth: 1, borderColor: 'rgba(139,105,20,0.25)', borderBottomWidth: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, marginBottom: -1, zIndex: 2 },
  autopsyToggleInner: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  autopsyPulse: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.sepia, shadowColor: 'rgba(139,105,20,0.6)', shadowOffset: {width:0, height:0}, shadowRadius: 8, shadowOpacity: 1 },
  autopsyToggleTitle: { fontFamily: fonts.display, fontSize: 12, letterSpacing: 2.5, color: colors.parchment },
  autopsyToggleConf: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 3, color: colors.sepia, opacity: 0.6 },
  rotated: { transform: [{ rotate: '180deg' }] },
  autopsyCard: { backgroundColor: colors.ink, padding: 24, borderRadius: 2, borderWidth: 1, borderColor: colors.ash, borderTopWidth: 0, marginTop: -2, borderTopLeftRadius: 0, borderTopRightRadius: 0, shadowColor: '#000', shadowOffset: {width:0, height:10}, shadowOpacity: 0.5, shadowRadius: 10 },
  autopsyContent: { gap: 24 },
  autopsyBarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 6 },
  autopsyLabel: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 2, color: colors.fog },
  autopsyValue: { fontFamily: fonts.display, fontSize: 20, lineHeight: 22, color: colors.parchment, opacity: 0.85, letterSpacing: 1 },
  autopsyTrack: { width: '100%', height: 8, backgroundColor: colors.soot, borderRadius: 1, borderWidth: 1, borderColor: 'rgba(10, 7, 3, 0.8)', overflow: 'hidden' },
  autopsyFill: { height: '100%' },

  // Action Deck
  actionDeckWrap: { paddingHorizontal: 16, marginTop: 8 },
  actionDeck: { flexDirection: 'row', backgroundColor: '#050403', borderRadius: 2, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(139,105,20,0.1)', marginBottom: 16, overflow: 'hidden', padding: 1, gap: StyleSheet.hairlineWidth, zIndex: 1 },
  deckBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 18, gap: 6, backgroundColor: colors.ink, borderRadius: 1 },
  deckLabel: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2, color: colors.fog },
  deckLabelActive: { color: colors.sepia },

  // Comments
  commentsSection: { paddingHorizontal: 16, marginTop: 16, paddingBottom: 40 },
  emptyComments: { fontFamily: fonts.body, fontSize: 12, fontStyle: 'italic', color: colors.fog, textAlign: 'center', marginTop: 24 },
  commentItem: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ash },
  userInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  commUsername: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 1, color: colors.sepia },
  commBody: { fontFamily: fonts.body, fontSize: 13, color: colors.bone, lineHeight: 20 },
  commDate: { fontFamily: fonts.ui, fontSize: 9, color: colors.fog },
  commDeleteBtn: { marginTop: 8, alignSelf: 'flex-end' },
  commDelete: { fontFamily: fonts.uiMedium, fontSize: 9, letterSpacing: 1, color: colors.bloodReel },

  // Critique Input
  critiqueInputWrap: { 
    marginTop: 32, paddingTop: 24, 
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(139,105,20,0.15)',
  },
  critiqueInput: {
    backgroundColor: '#050403', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(139,105,20,0.2)',
    borderRadius: 2, paddingHorizontal: 16, paddingVertical: 16,
    color: colors.bone, fontFamily: fonts.body, fontSize: 13, lineHeight: 22,
    minHeight: 120, textAlignVertical: 'top',
  },
  critiqueSubmitBtn: { 
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.sepia, borderRadius: 2, 
    paddingVertical: 14, marginTop: 12, 
  },
  critiqueSubmitText: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 2, color: colors.ink },
  critiqueSubmitDisabled: { opacity: 0.4 },
  
  backBtnRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 24, paddingVertical: 12, paddingHorizontal: 24, borderWidth: 1, borderColor: colors.ash, borderRadius: 2 },
  backBtnText: { fontFamily: fonts.uiMedium, fontSize: 10, letterSpacing: 2, color: colors.bone },

  // Abandoned Badge
  abandonedWrap: { marginTop: 12, alignItems: 'center' },
  abandonedBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(125,31,31,0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 4, borderWidth: 1, borderColor: 'rgba(125,31,31,0.3)' },
  abandonedText: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 2, color: colors.bloodReel },

  // Watched Metadata Row
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  metaDateText: { fontFamily: fonts.ui, fontSize: 9, color: colors.fog, letterSpacing: 1.5 },
  metaDot: { color: colors.ash, fontSize: 10 },
  metaWithText: { fontFamily: fonts.ui, fontSize: 9, color: colors.sepia, letterSpacing: 1.5 },
  metaFormatText: { fontFamily: fonts.ui, fontSize: 9, color: colors.bone, letterSpacing: 1.5 },



  // Drop Cap Override
  reviewDropCapReset: { lineHeight: undefined },
  dropCapBodyLine: { lineHeight: 24 },

  // Private Notes
  privateNotesWrap: { marginTop: 24, padding: 16, backgroundColor: 'rgba(10,7,3,0.5)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.2)', borderRadius: 4 },
  privateNotesHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  privateNotesLabel: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 2, color: colors.sepia },
  privateNotesBody: { fontFamily: fonts.bodyItalic, fontSize: 12, color: colors.fog, lineHeight: 20 },
});
