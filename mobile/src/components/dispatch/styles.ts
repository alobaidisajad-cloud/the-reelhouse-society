import { StyleSheet } from 'react-native';
import { colors, fonts, effects } from '@/src/theme/theme';

export const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  scrollContent: { paddingBottom: 0 },
  ambientGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 400 },

  // ── Document ──
  documentHeader: {
    backgroundColor: 'rgba(8,6,4,0.98)',
    marginHorizontal: 12,
    paddingTop: 32,
    paddingHorizontal: 24,
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
    borderColor: 'rgba(139,105,20,0.2)',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    ...effects.shadowSurface,
  },
  documentItem: {
    backgroundColor: 'rgba(8,6,4,0.98)',
    marginHorizontal: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
    borderColor: 'rgba(139,105,20,0.2)',
  },
  documentFooter: {
    backgroundColor: 'rgba(8,6,4,0.98)',
    marginHorizontal: 12,
    paddingBottom: 24,
    paddingHorizontal: 24,
    borderBottomWidth: 1.5,
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
    borderColor: 'rgba(139,105,20,0.2)',
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    ...effects.shadowSurface,
  },

  // ── Masthead ──
  masthead: { alignItems: 'center', marginBottom: 24 },
  mastheadPublisherRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12,
  },
  mastheadPublisher: {
    fontFamily: fonts.ui, fontSize: 7, letterSpacing: 5,
    color: colors.sepia, opacity: 0.8,
  },
  mastheadRuleTop: {
    width: '100%', height: 6, marginBottom: 16,
    borderTopWidth: 3, borderTopColor: colors.sepia,
    borderBottomWidth: 1, borderBottomColor: 'rgba(139,105,20,0.3)',
    opacity: 0.6,
  },
  mastheadTitle: {
    fontFamily: fonts.display, fontSize: 36, color: '#F2ECD8',
    textAlign: 'center', lineHeight: 42, marginBottom: 16,
    letterSpacing: 2,
    ...effects.textGlowSepia,
    textShadowRadius: 30,
  },
  mastheadRuleBottom: {
    width: '100%', height: 6, marginBottom: 12,
    borderTopWidth: 1, borderTopColor: 'rgba(139,105,20,0.3)',
    borderBottomWidth: 3, borderBottomColor: colors.sepia,
    opacity: 0.6,
  },
  mastheadMetaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginBottom: 12, flexWrap: 'wrap', justifyContent: 'center',
  },
  mastheadMetaText: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 3, color: colors.sepia, fontWeight: '700' },
  pulseDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.bloodReel, opacity: 0.8 },
  mastheadSubtitle: {
    fontFamily: fonts.body, fontSize: 11, color: colors.bone,
    opacity: 0.6, fontStyle: 'italic', textAlign: 'center', letterSpacing: 0.5,
  },

  // ── Divider ──
  dividerWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 28, opacity: 0.5 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.sepia },
  dividerDiamond: { width: 6, height: 6, backgroundColor: colors.sepia, transform: [{ rotate: '45deg' }] },

  // ── Section header ──
  sectionHeaderBlock: { alignItems: 'center', marginBottom: 24 },
  shTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.parchment, marginBottom: 6, textAlign: 'center' },
  shSub: { fontFamily: fonts.ui, fontSize: 11, letterSpacing: 1, color: colors.sepia, opacity: 0.8, textAlign: 'center' },

  // ── Writer bar ──
  writerBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: 'rgba(139,105,20,0.15)',
    marginBottom: 28,
  },
  writerBarWrap: { alignItems: 'center', marginBottom: 24, marginTop: -4 },
  writerBarLogo: { fontFamily: fonts.display, fontSize: 16, color: colors.parchment, letterSpacing: 1, ...effects.textGlowSepia },
  writerBarBtn: {
    paddingVertical: 6, paddingHorizontal: 12,
    borderWidth: 1, borderColor: colors.sepia, borderRadius: 2,
  },
  writerBarBtnText: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 2, color: colors.parchment },
  writerBarBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  writerBarLocked: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1, color: colors.sepia, opacity: 0.6 },

  // ── Dossier Card ──
  dossierCard: {
    padding: 20, paddingLeft: 24,
    backgroundColor: 'transparent',
    borderWidth: 1.5, borderColor: 'rgba(139,105,20,0.2)', borderStyle: 'dashed',
    borderRadius: 4, position: 'relative',
    ...effects.shadowSurface,
  },
  dossierAccentBar: {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: 4,
    backgroundColor: colors.sepia,
    borderTopLeftRadius: 4, borderBottomLeftRadius: 4,
  },
  dossierMeta: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 12,
    flexWrap: 'wrap',
    gap: 4,
  },
  dmAuthorRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1,
  },
  dmAuthor: {
    fontFamily: fonts.mono, fontSize: 9, letterSpacing: 2, color: colors.sepia, flexShrink: 1, fontWeight: '700',
  },
  dmDate: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1, color: colors.fog, opacity: 0.7, flexShrink: 0 },
  dossierTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.parchment, lineHeight: 24, marginBottom: 10 },
  dossierCardFeature: {
    paddingVertical: 24, paddingRight: 24, paddingLeft: 28,
    backgroundColor: 'rgba(196,150,26,0.03)',
  },
  dossierTitleFeature: {
    fontSize: 26, lineHeight: 30, ...effects.textGlowSepia,
  },
  dossierExcerptRow: { flexDirection: 'row' },
  dossierDropCap: {
    fontFamily: fonts.mono, fontSize: 36, color: colors.sepia,
    lineHeight: 36, paddingRight: 8, opacity: 0.9, fontWeight: '700',
  },
  dossierExcerpt: { fontFamily: fonts.mono, fontSize: 13, lineHeight: 22, color: colors.bone, opacity: 0.8, flex: 1, paddingTop: 2 },
  dossierFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
  dossierStatsRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  dossierStatItem: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  dossierStatText: { fontFamily: fonts.mono, fontSize: 9, color: colors.fog, fontWeight: '700' },
  dossierStatTextActive: { color: colors.sepia },
  dossierReadMore: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dossierReadMoreText: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 2, color: colors.sepia, fontWeight: '700' },

  // ── Nightly Transmission ──
  transmissionWrap: {
    borderWidth: 2, borderColor: 'rgba(139,105,20,0.2)',
    padding: 24, position: 'relative', overflow: 'hidden',
    borderRadius: 6, ...effects.shadowSurface,
    backgroundColor: 'rgba(8,6,4,0.98)',
  },
  transmissionBg: {
    ...StyleSheet.absoluteFillObject, width: '100%', height: '100%',
    opacity: 0.15,
  },
  transmissionImageContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  transmissionContent: { alignItems: 'center', position: 'relative' },
  transmissionSignalRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  transmissionSignal: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 4, color: colors.bloodReel, opacity: 0.8 },
  transmissionLabel: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 3, color: colors.sepia, marginBottom: 16 },
  transmissionTitle: {
    fontFamily: fonts.display, fontSize: 24, color: colors.parchment,
    textAlign: 'center', lineHeight: 28, marginBottom: 8,
    ...effects.textGlowSepia,
  },
  transmissionMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  transmissionMeta: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1.5, color: colors.sepia, marginBottom: 12 },
  transmissionExcerpt: {
    fontFamily: fonts.body, fontSize: 11, lineHeight: 18, color: colors.bone,
    opacity: 0.7, fontStyle: 'italic', textAlign: 'center', marginBottom: 16,
    paddingHorizontal: 12,
  },
  transmissionFooter: { flexDirection: 'row', gap: 16, flexWrap: 'wrap', justifyContent: 'center' },
  transmissionBullet: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  transmissionDot: { width: 6, height: 6, borderRadius: 3 },
  transmissionDotBlood: { backgroundColor: colors.bloodReel },
  transmissionDotSepia: { backgroundColor: colors.sepia },
  transmissionFooterText: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 1, color: colors.fog },

  // Corners
  corner: { position: 'absolute', width: 16, height: 16 },
  cornerTL: { top: 8, left: 8, borderTopWidth: 2, borderLeftWidth: 2, borderColor: 'rgba(162,36,36,0.5)' },
  cornerTR: { top: 8, right: 8, borderTopWidth: 2, borderRightWidth: 2, borderColor: 'rgba(162,36,36,0.5)' },
  cornerBL: { bottom: 8, left: 8, borderBottomWidth: 2, borderLeftWidth: 2, borderColor: 'rgba(162,36,36,0.5)' },
  cornerBR: { bottom: 8, right: 8, borderBottomWidth: 2, borderRightWidth: 2, borderColor: 'rgba(162,36,36,0.5)' },

  // ── Daily Frame ──
  dailyFrameWrap: {
    width: '100%', aspectRatio: 21 / 9, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.2)', borderRadius: 2,
  },
  dailyFrameImg: { width: '100%', height: '100%' },
  dailyFrameCaption: { position: 'absolute', bottom: 12, left: 14, right: 14 },
  dailyFrameTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.parchment, lineHeight: 22, marginBottom: 4 },
  dailyFrameMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dailyFrameViewRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  dailyFrameMeta: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1.5, color: colors.sepia },

  // ── Wire ──
  wireLead: {
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.2)',
    overflow: 'hidden', marginBottom: 20, borderRadius: 2,
  },
  wireLeadImgWrap: { width: '100%', aspectRatio: 16 / 9, overflow: 'hidden' },
  wireLeadImg: { width: '100%', height: '100%' },
  wireLeadBody: { padding: 16 },
  wireLeadTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.parchment, lineHeight: 24, marginBottom: 8 },
  wireLeadExcerpt: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: colors.bone, opacity: 0.7, marginBottom: 10 },
  wireCategory: { fontFamily: fonts.mono, fontWeight: '700', fontSize: 8, letterSpacing: 2.5, color: colors.sepia, marginBottom: 6, opacity: 0.9 },
  wireTitle: { fontFamily: fonts.display, fontSize: 15, color: colors.parchment, lineHeight: 18, marginBottom: 6 },
  wireExcerpt: { fontFamily: fonts.mono, fontSize: 11, lineHeight: 18, color: colors.bone, opacity: 0.7, marginBottom: 8 },
  wireMeta: { fontFamily: fonts.mono, fontSize: 8, letterSpacing: 1.5, color: colors.sepia, opacity: 0.8 },
  wireItem: {
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139,105,20,0.2)',
    borderStyle: 'dashed',
  },
  wireItemInner: { flex: 1 },
  wireLoader: {
    textAlign: 'center', fontFamily: fonts.mono, fontSize: 10, letterSpacing: 2,
    color: colors.sepia, opacity: 0.6, paddingVertical: 24, fontWeight: '700'
  },

  // ── Buster Note ──
  busterNote: { 
    marginTop: 32,
    borderWidth: 1.5,
    borderColor: 'rgba(139,105,20,0.2)',
    borderStyle: 'dashed',
    padding: 20,
    backgroundColor: 'rgba(8,6,4,0.98)',
    ...effects.shadowSurface,
  },
  busterRuleTop: { borderTopWidth: 3, borderTopColor: 'rgba(139,105,20,0.2)', borderStyle: 'solid', marginBottom: 20 },
  busterContent: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  busterAvatar: { opacity: 0.8 },
  busterTextWrap: { flex: 1 },
  busterLabel: { fontFamily: fonts.mono, fontWeight: '700', fontSize: 9, letterSpacing: 2.5, color: colors.sepia, marginBottom: 8 },
  busterQuote: {
    fontFamily: fonts.mono, fontSize: 12, lineHeight: 20,
    color: colors.bone, fontStyle: 'italic', opacity: 0.8,
  },

  // ── Footer ──
  footer: { alignItems: 'center', marginTop: 32 },
  footerMark: { fontFamily: fonts.mono, fontWeight: '700', fontSize: 10, letterSpacing: 4, color: colors.sepia, opacity: 0.6, marginBottom: 6 },
  footerHeritage: { fontFamily: fonts.mono, fontSize: 8, letterSpacing: 3, color: colors.sepia, opacity: 0.5, marginBottom: 8 },
  footerCopyright: { fontFamily: fonts.mono, fontSize: 10, color: colors.bone, opacity: 0.4, textAlign: 'center' },

  // ── Empty ──
  emptyState: { alignItems: 'center', paddingVertical: 32, gap: 12 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.parchment, opacity: 0.6, textAlign: 'center', marginBottom: 4 },
  emptySub: { fontFamily: fonts.mono, fontSize: 12, color: colors.bone, opacity: 0.5, fontStyle: 'italic', textAlign: 'center', lineHeight: 18, maxWidth: 260 },

  // ── Skeleton ──
  skeleton: {
    backgroundColor: 'rgba(8,6,4,0.98)', borderRadius: 2,
    padding: 20, borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(139,105,20,0.2)',
  },
  shimmer: { backgroundColor: 'rgba(139,105,20,0.06)', borderRadius: 2 },
  shimmerSm: { width: '35%', height: 8 },
  shimmerLg: { width: '80%', height: 20, marginTop: 10 },
  shimmerMd: { width: '60%', height: 12, marginTop: 10 },
  skeletonGroup: { gap: 16, marginBottom: 32 },
  dossierList: { gap: 24, marginBottom: 16 },
  loadMoreBtn: { paddingVertical: 14, borderWidth: 1, borderColor: 'rgba(139,105,20,0.25)', borderRadius: 2, alignItems: 'center' },
  loadMoreText: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 2, color: colors.sepia, fontWeight: '700' },
  wireList: { gap: 0 },

  // ── Article Reader Modal ──
  readerOverlay: {
    flex: 1, backgroundColor: 'rgba(8,6,4,0.98)',
  },
  readerScroll: { flex: 1 },
  readerScrollContent: {
    paddingHorizontal: 24, paddingBottom: 60,
  },
  readerClose: {
    position: 'absolute', top: 16, right: 20, zIndex: 10,
    padding: 8,
  },
  readerWatermark: {
    fontFamily: fonts.mono, fontWeight: '700', fontSize: 10, letterSpacing: 4,
    color: colors.sepia, opacity: 0.6, textAlign: 'center', marginBottom: 28,
  },
  readerTitle: {
    fontFamily: fonts.display, fontSize: 30, color: colors.parchment,
    textAlign: 'center', lineHeight: 34, marginBottom: 16, ...effects.textGlowSepia,
  },
  readerByline: {
    fontFamily: fonts.mono, fontSize: 10, letterSpacing: 2,
    color: colors.bone, opacity: 0.7, textAlign: 'center', marginBottom: 16,
  },
  readerBylineAuthor: { color: colors.sepia, fontWeight: '700' },
  readerStats: {
    flexDirection: 'row', justifyContent: 'center', gap: 20,
    paddingTop: 12, borderTopWidth: 2, borderTopColor: 'rgba(139,105,20,0.2)',
    borderStyle: 'dashed',
  },
  readerStatRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  readerStatText: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1.5, color: colors.fog, fontWeight: '700' },
  readerStatCertified: { color: colors.sepia },
  readerSep: {
    height: 2, backgroundColor: 'rgba(139,105,20,0.3)',
    marginVertical: 28, width: 80, alignSelf: 'center',
  },
  readerBody: {
    fontFamily: fonts.mono, fontSize: 14, lineHeight: 28,
    color: '#D1CBB8', marginBottom: 24, letterSpacing: 0.2, fontWeight: '500',
  },
  readerActions: {
    flexDirection: 'row', gap: 16, paddingTop: 16,
    borderTopWidth: 1, borderTopColor: 'rgba(139,105,20,0.1)',
    marginTop: 20,
  },
  readerActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12 },
  readerActionText: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1.5, color: colors.fog },
  readerActionCertified: { color: colors.sepia },
  wireReadFullBtn: {
    marginTop: 20, paddingVertical: 14,
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.25)',
    borderRadius: 2, alignItems: 'center',
  },
  wireReadFullRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wireReadFullText: { fontFamily: fonts.uiMedium, fontSize: 9, letterSpacing: 2, color: colors.sepia },
  readerEndmarkRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    justifyContent: 'center', marginTop: 32,
  },
  readerEndmarkLine: {
    width: 32, height: StyleSheet.hairlineWidth,
    backgroundColor: colors.sepia, opacity: 0.3,
  },
  tabBarSpacer: { height: 120 },
});

export const markdownStyles = {
  body: {
    fontFamily: fonts.mono,
    fontSize: 14,
    lineHeight: 28,
    color: '#D1CBB8',
    letterSpacing: 0.2,
    fontWeight: '500' as const,
    marginBottom: 24,
  },
  heading1: {
    fontFamily: fonts.sub,
    fontSize: 32,
    color: colors.parchment,
    marginTop: 24,
    marginBottom: 12,
  },
  heading2: {
    fontFamily: fonts.sub,
    fontSize: 24,
    color: colors.parchment,
    marginTop: 24,
    marginBottom: 12,
  },
  heading3: {
    fontFamily: fonts.sub,
    fontSize: 18,
    color: colors.parchment,
    marginTop: 20,
    marginBottom: 10,
  },
  heading4: {
    fontFamily: fonts.sub,
    fontSize: 16,
    color: colors.parchment,
    marginTop: 16,
    marginBottom: 8,
  },
  heading5: {
    fontFamily: fonts.sub,
    fontSize: 14,
    color: colors.parchment,
    marginTop: 16,
    marginBottom: 8,
  },
  heading6: {
    fontFamily: fonts.sub,
    fontSize: 12,
    color: colors.parchment,
    marginTop: 16,
    marginBottom: 8,
  },
  blockquote: {
    backgroundColor: 'rgba(139,105,20,0.05)',
    borderLeftWidth: 2,
    borderLeftColor: colors.sepia,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginVertical: 16,
  },
  strong: {
    fontFamily: fonts.mono,
    fontWeight: '700' as const,
    color: colors.parchment,
  },
  em: {
    fontStyle: 'italic' as const,
  },
  hr: {
    backgroundColor: colors.sepia,
    height: 1,
    marginVertical: 24,
    opacity: 0.3,
  },
  link: {
    color: colors.sepia,
    textDecorationLine: 'underline' as const,
  },
  code_inline: {
    fontFamily: fonts.ui,
    backgroundColor: colors.sepiaSubtle,
    color: colors.parchmentBright,
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  code_block: {
    fontFamily: fonts.ui,
    backgroundColor: colors.ink,
    color: colors.parchment,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.sepiaBorder,
    marginVertical: 16,
  },
  fence: {
    fontFamily: fonts.ui,
    backgroundColor: colors.ink,
    color: colors.parchment,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.sepiaBorder,
    marginVertical: 16,
  },
};
