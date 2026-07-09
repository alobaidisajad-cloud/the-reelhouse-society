/**
 * authStyles.ts — Extracted styles for the Login/Signup screen
 * ──────────────────────────────────────────────────────────────
 * Nitrate Noir aesthetic: archival ledger inputs, gold accents,
 * film-strip decorative elements.
 */
import { StyleSheet } from 'react-native';
import { colors, fonts, effects } from '@/src/theme/theme';

export const loginStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.ink,
  },

  fixedHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: 24,
  },
  closeBtn: {
    width: 44, height: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 24,
    paddingTop: 40,
  },

  // ── Headers ──
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  sealWrap: {
    marginBottom: 18,
    alignItems: 'center',
  },
  eyebrowWrap: {
    marginBottom: 14,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 34,
    color: colors.parchment,
    textAlign: 'center',
    lineHeight: 40,
    ...effects.textShadowDeep,
  },
  rule: {
    width: 60,
    height: 1,
    backgroundColor: colors.sepia,
    marginVertical: 16,
  },
  subtitle: {
    fontFamily: fonts.bodyItalic,
    fontSize: 12,
    color: colors.bone,
    textAlign: 'center',
    opacity: 0.8,
  },
  loreTransmission: {
    fontFamily: fonts.bodyItalic,
    fontSize: 10,
    color: colors.fog,
    textAlign: 'center',
    marginTop: 12,
    opacity: 0.6,
    lineHeight: 16,
    maxWidth: 280,
    alignSelf: 'center',
  },
  formCard: {
    backgroundColor: colors.soot,
    borderWidth: 1,
    borderColor: colors.sepiaBorder,
    borderRadius: 6,
    padding: 24,
    gap: 20,
  },
  formCardGlow: {
    position: 'absolute',
    top: 0,
    left: 40,
    right: 40,
    height: 1,
    backgroundColor: colors.sepia,
    opacity: 0.4,
  },

  // ── Archival Inputs ──
  fieldGroup: {
    gap: 8,
  },
  inputLabel: {
    fontFamily: fonts.sub,
    fontSize: 10,
    letterSpacing: 2.5,
    color: colors.fog,
    textTransform: 'uppercase',
  },
  inputLabelFocused: {
    color: colors.sepia,
  },
  inputWrap: {
    position: 'relative',
  },
  inputPrefix: {
    position: 'absolute',
    left: 4,
    top: 10,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.sepia,
    zIndex: 2,
    opacity: 0.8,
  },
  input: {
    backgroundColor: 'transparent',
    borderBottomWidth: 2,
    borderColor: colors.sepiaBorder,
    paddingVertical: 12,
    paddingHorizontal: 4,
    fontSize: 16,
    fontFamily: fonts.body,
    color: colors.parchment,
  },
  inputFocused: {
    borderColor: colors.sepiaBorderStrong,
  },
  inputDisabled: {
    opacity: 0.5,
  },
  fieldHint: {
    fontFamily: fonts.sub,
    fontSize: 9,
    color: colors.sepia,
    letterSpacing: 0.5,
    marginTop: 2,
  },

  // ── Username Status ──
  usernameStatusWrap: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },

  // ── Password ──
  showBtn: {
    position: 'absolute',
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  showText: {
    fontFamily: fonts.sub,
    fontSize: 9,
    letterSpacing: 1.5,
    color: colors.sepia,
  },

  // ── Forgot password ──
  forgotBtn: {
    alignSelf: 'flex-end',
    marginTop: -8,
  },
  forgotText: {
    fontFamily: fonts.sub,
    color: colors.fog,
    fontSize: 10,
    letterSpacing: 0.5,
    textDecorationLine: 'underline',
    textDecorationColor: colors.fog,
  },

  // ── Submit ──
  submitBtn: {
    backgroundColor: colors.sepia,
    borderRadius: 3,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
    ...effects.glowSepia,
  },
  submitDisabled: {
    opacity: 0.5,
    shadowOpacity: 0,
  },
  submitText: {
    // Typewriter CTA — reads like a stamped clearance on the admission slip
    fontFamily: fonts.sub,
    fontSize: 12,
    letterSpacing: 2,
    color: colors.ink,
  },
  submitLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  // ── Toggle ──
  toggleWrap: {
    alignItems: 'center',
    marginTop: 28,
  },
  toggleText: {
    fontFamily: fonts.body,
    color: colors.fog,
    fontSize: 12,
  },
  toggleHighlight: {
    color: colors.sepia,
    fontFamily: fonts.bodyBold,
    textDecorationLine: 'underline',
    textDecorationColor: colors.sepia,
  },

  // ── Footer ──
  footerNote: {
    alignItems: 'center',
    marginTop: 20,
    paddingHorizontal: 16,
  },
  estMark: {
    marginBottom: 10,
  },
  footerText: {
    fontFamily: fonts.sub,
    fontSize: 8,
    letterSpacing: 0.5,
    color: colors.fog,
    textAlign: 'center',
    lineHeight: 14,
    opacity: 0.6,
  },
});

// Film-strip perforation styles now live with the shared auth chrome:
// see src/components/auth/AuthChrome.tsx (AuthBackdrop).
