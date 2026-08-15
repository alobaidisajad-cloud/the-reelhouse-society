import { colors, fonts } from '@/src/theme/theme';
import { StyleSheet } from 'react-native';

// ── THE RECORD — one spine for the whole document ──
export const SPINE = 20;

/**
 * The transparent strip above the record card, which lets the poster show
 * through as the page scrolls.
 *
 * Exported because the critiques scroll target has to add it back. The comments
 * section reports its position relative to the CARD, and the card begins after
 * this padder — so "scroll to the critiques" is `PARALLAX_PADDER_HEIGHT + y`.
 * That was written as a bare `80` in the screen, silently coupled to this style:
 * change the padder and the scroll target lands in the wrong place, with nothing
 * to say why.
 *
 * (An audit note suggested this compensated for the HEADER. It does not — the
 * header measures 96, and the header sits outside the scroll view entirely.)
 */
export const PARALLAX_PADDER_HEIGHT = 80;

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
  parallaxPadder: { height: PARALLAX_PADDER_HEIGHT, width: '100%' },
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
  // Gutters sized past the measured worst case: the visitor's right cluster
  // (SHARE + ⋯) measures 87.7pt, so 104 clears it with margin.
  //
  // The note that used to sit here claimed the text "fits deterministically at
  // 360dp and up". It did not, by 40pt. Between the two 104pt gutters the box
  // is 120pt at 360dp and 150pt at 390dp — and "FROM THE PERMANENT RECORD"
  // needs 159.5pt in Special Elite at 7pt with 2pt of letterspacing. It was
  // ellipsizing on the two commonest phone widths; only a Pro Max ever showed
  // it whole. "PERMANENT RECORD" needs 102.1pt and fits both with room, and
  // says the same thing. logPage.test.ts recomputes this rather than trusting
  // another comment.
  eyebrowWrap: { position: 'absolute', top: 0, bottom: 0, left: 104, right: 104, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontFamily: fonts.sub, fontSize: 7, letterSpacing: 2, color: colors.sepia, opacity: 0.72, includeFontPadding: false },
  shareBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  shareBtnText: { fontFamily: fonts.sub, fontSize: 9, color: colors.sepia, letterSpacing: 1.5, includeFontPadding: false },
  moreBtn: { paddingHorizontal: 2, paddingVertical: 8 },

  content: { paddingBottom: 40 },

  // ── The record card ──
  // Shadow host / clip host. This card lifts UPWARD off the backdrop above it
  // (offset -20, radius 40) — a deliberate, large effect that iOS has never
  // drawn, because the same style also clips. Android drew one from elevation
  // 24, so the record has been sitting on the page differently per platform.
  // iOS geometry only. `elevation` stays on contentCard below: Android builds
  // its shadow from the painted background's outline, and this host paints
  // nothing — the sheet is deliberately 8% see-through so the film's backdrop
  // reads under it, which is why the background cannot simply be copied up here.
  contentCardShadow: { borderTopLeftRadius: 12, borderTopRightRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: -20 }, shadowOpacity: 0.8, shadowRadius: 40 },
  contentCardShadowAuteur: { shadowColor: colors.bloodReel },
  contentCard: { backgroundColor: 'rgba(10,7,3,0.92)', borderTopWidth: 1, borderColor: colors.sepiaBorder, borderTopLeftRadius: 12, borderTopRightRadius: 12, overflow: 'hidden', elevation: 24, shadowColor: '#000' },
  contentCardAuteur: { backgroundColor: 'rgba(25,10,10,0.92)', borderColor: colors.crimsonBorder, shadowColor: colors.bloodReel },
  logCardInner: { paddingHorizontal: SPINE, paddingBottom: 16, marginTop: 0, paddingTop: 24 },
  logCenter: { alignItems: 'center' },
  bylineFull: { width: '100%', marginBottom: 20 },

  // ── Poster ──
  posterSection: { width: '100%', alignItems: 'center', marginBottom: 24, zIndex: 10 },
  posterGlow: { position: 'absolute', top: '50%', left: '50%', width: 180, height: 250, marginLeft: -90, marginTop: -125, borderRadius: 125, zIndex: 0 },
  posterGlowAuteur: { backgroundColor: colors.crimsonFaint },
  posterGlowArchivist: { backgroundColor: colors.sepiaSubtle },
  // Shadow host / clip host, same reason as the record card above.
  // iOS geometry only — `elevation` stays on posterBounds, the painted view,
  // which also keeps the plate drawing over its own glow on Android.
  posterBoundsShadow: { width: 140, height: 210, borderRadius: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.8, shadowRadius: 40 },
  posterBoundsShadowAuteur: { shadowColor: 'rgba(107,26,10,0.3)' },
  posterBounds: { width: '100%', height: '100%', borderRadius: 2, overflow: 'hidden', borderWidth: 1, borderColor: colors.sepiaBorderStrong, backgroundColor: colors.soot, elevation: 12, shadowColor: '#000' },
  posterBoundsAuteur: { borderColor: colors.crimsonBorder, shadowColor: 'rgba(107,26,10,0.3)' },
  posterCentered: { width: '100%', height: '100%' },
  posterPlaceholder: { backgroundColor: colors.soot, justifyContent: 'center', alignItems: 'center' },

  // ── Title ──
  titleSection: { alignItems: 'center', marginBottom: 12 },
  // 35 gave a ratio of 1.09 — the glyphs grew through their own line box above
  // 1.04x system text, which is to say almost immediately. lineHeight does not
  // scale with Dynamic Type, so the box has to be sized for the CAP: 42 clears
  // the 1.2 tier this title declares (42 / 38.4 = 1.09) and the extra leading
  // is invisible at rest under a 32pt display face.
  logFilmTitle: { fontFamily: fonts.display, fontSize: 32, lineHeight: 42, color: colors.parchment, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 12 },
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
  // iOS needs the paragraph direction stated — writingDirection is an iOS-only
  // style and the app never set it, so an Arabic essay inherited the app's own
  // left-to-right base and dropped each sentence's stop at the far left of its
  // line. Android resolves direction itself; textAlign is what puts the block
  // on the side it reads from, on both.
  rtlText: { writingDirection: 'rtl', textAlign: 'right' } as import('react-native').TextStyle,
  reviewParagraph: { fontFamily: fonts.body, fontSize: 14, lineHeight: 24, color: colors.bone, opacity: 0.9 },
  dropCapParagraph: { fontFamily: fonts.body, fontSize: 14, color: colors.bone, opacity: 0.9 },
  reviewParagraphSpaced: { marginBottom: 14 },
  dropCapLetter: { fontFamily: fonts.display, fontSize: 34, color: colors.sepia, lineHeight: 36, textShadowColor: 'rgba(184,137,26,0.2)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6 },

  // ── Editorial Badge ──
  editorialBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, position: 'absolute', left: 16, backgroundColor: 'rgba(11,10,8,0.5)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 2, borderWidth: 1, borderColor: colors.sepiaBorder },
  editorialBadgeText: { fontFamily: fonts.sub, fontSize: 7, letterSpacing: 2.2, color: 'rgba(220,166,58,0.85)', includeFontPadding: false },

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
  // Bone, not crimson. Crimson measures 3.18:1 on ink and cannot reach AA at
  // any opacity — exactly the finding already written up for the ABANDONED
  // stamp in ReviewContent, which changed its colour rather than its alpha.
  // That lesson never crossed to here, and this control DELETES a critique.
  // The word carries the warning; it only had to be readable.
  commDelete: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1, color: colors.bone, includeFontPadding: false },

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
  // ── The filing mark ──
  // What used to be three centred captions stacked under the title. The rules
  // above and below are the whole idea: they make the line read as something
  // stamped into a file rather than a caption floating under a poster. It wraps
  // rather than shrinking, so a long companion name never squeezes the date.
  filingMark: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    flexWrap: 'wrap', columnGap: 10, rowGap: 4,
    marginTop: 16, paddingVertical: 9,
    alignSelf: 'stretch', marginHorizontal: 20,
    borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(184,137,26,0.22)',
  },
  filingLabel: {
    fontFamily: fonts.sub, fontSize: 7, letterSpacing: 3,
    color: colors.sepia, opacity: 0.85, includeFontPadding: false,
  },
  filingEntry: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  filingDot: { color: colors.ash, fontSize: 10, includeFontPadding: false },
  filingValue: {
    fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1.6,
    color: colors.bone, includeFontPadding: false,
  },
  // The companion keeps the brass — who you watched it with is the warm fact
  // in the band, and it was already sepia before this.
  filingValueAccent: { color: colors.sepia } as import('react-native').TextStyle,

  // ── Private Notes ──
  privateNotesWrap: { marginTop: 24, padding: 16, backgroundColor: 'rgba(10,7,3,0.5)', borderWidth: 1, borderColor: colors.sepiaBorder, borderRadius: 4 },
  privateNotesHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  privateNotesLabel: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2, color: colors.sepia, includeFontPadding: false },
  privateNotesBody: { fontFamily: fonts.bodyItalic, fontSize: 12, color: colors.fog, lineHeight: 20 },
});
