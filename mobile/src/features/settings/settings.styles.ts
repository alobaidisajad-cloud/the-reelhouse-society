import { StyleSheet } from 'react-native';
import { colors, fonts, effects } from '@/src/theme/theme';

export const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  ambientGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 350, zIndex: 0 },
  navBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(184,137,26,0.1)', zIndex: 10, backgroundColor: 'rgba(5,3,1,0.85)' },
  // 48 by geometry, not by halo. A halo lives inside React Native's touch
  // dispatch and never reaches either platform's accessibility layer, so it
  // buys reach and never compliance. The negative margin keeps the chevron
  // optically where it has always sat while the BOX grows around it.
  navBackBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', marginLeft: -12 },
  navSaveBtn: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 12, marginRight: -12 },
  // Dim TEXT when there is nothing to file. The moment there is, it becomes a
  // plate — pending work should look pending, not merely brighter. This page's
  // whole model is "change it, then file it", and the old 10pt text going from
  // 50% to 100% opacity was not signal enough to carry that.
  navSaveText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.fog, opacity: 0.55, includeFontPadding: false },
  navSavePill: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 13, borderWidth: 1, borderColor: colors.sepia, borderRadius: 2, ...effects.glowSepia },
  navSavePillText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.sepia, includeFontPadding: false },
  // The page is eight cards tall; past the first screen it had no name at all.
  // Fades in as the letterhead leaves, driven on the UI thread.
  navTitle: { fontFamily: fonts.display, fontSize: 15, color: colors.parchment },

  hero: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 24 },
  heroRuleTop: { width: 100, height: 2, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.sepia, marginBottom: 16, opacity: 0.5 },
  heroRuleBottom: { width: 100, height: 2, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.sepia, marginTop: 24, opacity: 0.5 },
  heroEyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  heroEyebrow: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 4, color: colors.sepia, includeFontPadding: false },
  /**
   * `textAlign: 'center'` is the whole fix for the crooked title.
   *
   * The hero centres its CHILDREN, so a one-line title looked right by accident.
   * "Dossier Settings" wrapped to two, and with no textAlign each line sat left
   * inside a block that was itself centred — which reads as a title nudged off
   * the spine. One word now, and it is centred whatever happens to it.
   */
  heroTitle: { fontFamily: fonts.display, fontSize: 32, color: colors.parchment, textAlign: 'center', marginBottom: 4, ...effects.textShadowDeep },
  heroDesc: { fontFamily: fonts.bodyItalic, fontSize: 13, color: colors.bone, textAlign: 'center', maxWidth: 260 },

  // Four of these, one per chapter — not one per gap. It used to appear at five
  // section joins and be missing at three, which reads as an accident rather
  // than a rhythm.
  ornRule: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 24, paddingHorizontal: 40, opacity: 0.5 },
  ornLine: { flex: 1, height: 1, backgroundColor: colors.sepia },
  ornDiamond: { width: 6, height: 6, backgroundColor: colors.sepia, transform: [{ rotate: '45deg' }], marginHorizontal: 12 },

  legalActions: { flexDirection: 'column' },
  divider: { height: 1, backgroundColor: 'rgba(184,137,26,0.1)' },
  heritageFooter: { marginTop: 40, paddingHorizontal: 24, alignItems: 'center', paddingBottom: 44 },
  disabledBtn: { opacity: 0.5 },
  memberSince: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2, color: colors.parchment, marginBottom: 32, includeFontPadding: false },
  endMarkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  endMarkLine: { width: 30, height: 1, backgroundColor: colors.sepia, opacity: 0.3 },
  heritageCopyright: { fontFamily: fonts.bodyItalic, fontSize: 10, color: colors.fog, textAlign: 'center' },
  // Where a club record carries its number, and the first thing support asks for.
  edition: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 2, color: colors.fog, opacity: 0.55, marginTop: 14, includeFontPadding: false },

  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalContent: { backgroundColor: '#110D0A', borderWidth: 1, borderColor: '#30261A', borderRadius: 6, width: '100%', padding: 24 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  modalTitle: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 2, color: colors.bloodReel },
  modalDesc: { fontFamily: fonts.body, fontSize: 13, color: colors.bone, lineHeight: 20, marginBottom: 16 },
  // Said in place, not only in a toast that has already gone. A code that never
  // arrived used to leave a live box with no explanation and no way to retry.
  modalFail: { fontFamily: fonts.body, fontSize: 12, color: colors.crimson, lineHeight: 18, marginBottom: 16 },
  otpInput: { backgroundColor: colors.ink, borderWidth: 1, borderColor: '#30261A', color: colors.parchment, fontFamily: fonts.body, fontSize: 24, padding: 16, borderRadius: 4, textAlign: 'center', marginBottom: 16, letterSpacing: 8 },
  modalResend: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  modalResendText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2, color: colors.sepia, includeFontPadding: false },
  modalResendTextDim: { color: colors.fog, opacity: 0.6 },
  modalActions: { flexDirection: 'row', gap: 12 },
  // 48 by geometry. These two sat 12pt apart carrying 15pt halos each, so the
  // right edge of CANCEL pressed VERIFY — on the box that authorises deleting
  // an account.
  modalBtnCancel: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(184,137,26,0.05)', borderRadius: 4 },
  modalBtnCancelText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.fog },
  modalBtnConfirm: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bloodReel, borderRadius: 4 },
  modalBtnConfirmText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.bone },
});
