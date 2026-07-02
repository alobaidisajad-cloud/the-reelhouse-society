import { StyleSheet } from 'react-native';
import { colors, fonts, effects } from '@/src/theme/theme';

export const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  scrollContent: { paddingBottom: 100 },
  ambientGlow: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 350, zIndex: 0,
  },
  navBar: {
    paddingHorizontal: 16, paddingBottom: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ash,
    backgroundColor: colors.ink, zIndex: 10,
  },
  navBackBtn: { width: 40, height: 40, justifyContent: 'center' },
  navSaveText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.sepia },
  hero: {
    alignItems: 'center', paddingHorizontal: 24,
    marginTop: 20, marginBottom: 12, paddingBottom: 20,
  },
  heroRuleTop: {
    width: '80%', height: 6, marginBottom: 16,
    borderTopWidth: 3, borderTopColor: colors.sepia,
    borderBottomWidth: 1, borderBottomColor: 'rgba(184,137,26,0.25)', opacity: 0.5,
  },
  heroEyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  heroEyebrow: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 5, color: colors.sepia, opacity: 0.8 },
  heroTitle: { fontFamily: fonts.display, fontSize: 32, color: colors.parchment, lineHeight: 36, marginBottom: 6, ...effects.textGlowSepia, textShadowRadius: 25 },
  heroDesc: { fontFamily: fonts.body, fontSize: 13, color: colors.bone, opacity: 0.6, fontStyle: 'italic', textAlign: 'center', lineHeight: 20, letterSpacing: 0.5, marginBottom: 16 },
  heroRuleBottom: { width: '80%', height: 6, borderTopWidth: 1, borderTopColor: 'rgba(184,137,26,0.25)', borderBottomWidth: 3, borderBottomColor: colors.sepia, opacity: 0.5 },
  
  // Fields
  fieldWrap: { marginBottom: 16 },
  fieldLabel: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 2, color: colors.sepia, marginBottom: 6 },
  fieldInput: { width: '100%', paddingHorizontal: 14, paddingVertical: 11, backgroundColor: 'rgba(10,7,3,0.6)', borderWidth: 1, borderColor: 'rgba(184,137,26,0.1)', borderRadius: 3, color: colors.parchment, fontFamily: fonts.body, fontSize: 14 },
  bioInput: { width: '100%', paddingHorizontal: 14, paddingVertical: 11, backgroundColor: 'rgba(10,7,3,0.6)', borderWidth: 1, borderColor: 'rgba(184,137,26,0.1)', borderRadius: 3, color: colors.parchment, fontFamily: fonts.body, fontSize: 14, height: 90, textAlignVertical: 'top', lineHeight: 20 },
  charCount: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1, color: colors.ash, textAlign: 'right', marginTop: 4 },
  fieldBody: { fontFamily: fonts.body, fontSize: 13, color: colors.bone, lineHeight: 20, marginBottom: 12 },
  
  usernameWrap: { position: 'relative', width: '100%', justifyContent: 'center' },
  usernameAt: { position: 'absolute', left: 14, fontFamily: fonts.body, fontSize: 14, color: colors.fog, zIndex: 2 },
  usernameInput: { paddingLeft: 32, width: '100%', paddingHorizontal: 14, paddingVertical: 11, backgroundColor: 'rgba(10,7,3,0.6)', borderWidth: 1, borderColor: 'rgba(184,137,26,0.1)', borderRadius: 3, color: colors.parchment, fontFamily: fonts.body, fontSize: 14 },
  errorText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1, color: colors.crimson, marginTop: 4 },
  helperText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1, color: colors.ash, marginTop: 4 },

  // Avatar
  avatarSection: { alignItems: 'center', marginVertical: 10 },
  avatarWrap: { width: 120, height: 120, borderRadius: 60, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(184,137,26,0.3)', backgroundColor: colors.soot, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  avatarImg: { width: '100%', height: '100%' },
  avatarOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  avatarHint: { fontFamily: fonts.body, fontSize: 14, color: colors.bone, marginBottom: 4 },
  avatarSpec: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1.5, color: colors.ash },

  // Links
  linksContainer: { gap: 16, marginBottom: 12 },
  linkItem: { padding: 16, backgroundColor: 'rgba(10,7,3,0.5)', borderWidth: 1, borderColor: 'rgba(184,137,26,0.1)', borderRadius: 4 },
  linkItemHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  linkItemTitle: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2, color: colors.fog },
  linkRemoveBtn: { padding: 4 },
  addLinkBtn: { width: '100%', padding: 14, backgroundColor: 'rgba(184,137,26,0.05)', borderWidth: 1, borderColor: 'rgba(184,137,26,0.2)', borderStyle: 'dashed', borderRadius: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 },
  addLinkText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.sepia },
  linksCount: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1, color: colors.ash, textAlign: 'center', marginTop: 10 },

  heritageFooter: { alignItems: 'center', paddingHorizontal: 24, paddingBottom: 40, marginTop: 10 },
  globalSaveBtn: { position: 'relative', width: '100%', paddingVertical: 14, borderRadius: 4, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(184,137,26,0.3)', marginBottom: 24, backgroundColor: colors.ink },
  disabledBtn: { opacity: 0.5 },
  saveBtnContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  globalSaveBtnText: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 3, color: colors.sepia },
  memberSince: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2, color: colors.fog, marginBottom: 20 },
  endMarkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20, width: '40%', alignSelf: 'center', opacity: 0.3 },
  endMarkLine: { flex: 1, height: 1, backgroundColor: colors.sepia },
  linkDragHandleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  linkDragHandleIcon: { opacity: 0.4 },
});
