/**
 * Lounge tab styles — THE CORRIDOR.
 * (Must live outside app/ so Expo Router never treats it as a route.)
 *
 * Voice law: typewriter (fonts.sub) for every label and CTA; Rye for the
 * room name; Courier (fonts.body) for the search hand. No system mono,
 * no Inter, no dashed wireframes — the corridor is a finished room.
 *
 * Card styles live WITH their components (JoinedLoungeCard /
 * PublicLoungeCard / CreateLoungeSheet own their paper) — this file
 * carries only the screen chrome. The old duplicated copies are buried.
 */
import { StyleSheet } from 'react-native';
import { colors, fonts, effects } from '@/src/theme/theme';

export const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },

  // ── Header (compact ceremony — content above the fold) ──
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.ash,
    alignItems: 'center',
  },
  headerCrestRow: {
    marginBottom: 8,
  },
  headerCrest: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.sepiaBorder,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(184,137,26,0.03)',
  },
  headerTitle: {
    fontFamily: fonts.display,
    fontSize: 23,
    color: colors.parchment,
    textAlign: 'center',
    lineHeight: 27,
  },
  headerMetaLine: {
    fontFamily: fonts.sub,
    fontSize: 7,
    letterSpacing: 4,
    color: colors.sepia,
    // 0.65 measured 3.22:1 at 7pt. 0.85 gives 4.78:1 — this line names who the
    // room is for, so it should be readable rather than merely present.
    opacity: 0.85,
    marginTop: 4,
    marginBottom: 14,
    textAlign: 'center',
    includeFontPadding: false,
  },

  // ── Search + Establish (one working row) ──
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    alignSelf: 'stretch',
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(5,4,3,0.95)',
    borderRadius: 3,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: colors.sepiaBorder,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.parchment,
    letterSpacing: 0.5,
  },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: colors.sepia,
    borderRadius: 3,
    height: 44,
    paddingHorizontal: 14,
    ...effects.shadowSurface,
  },
  btnPrimaryText: {
    fontFamily: fonts.sub,
    fontSize: 8,
    letterSpacing: 1.5,
    color: colors.ink,
    includeFontPadding: false,
  },

  // ── Scroll ──
  scrollContent: {
    paddingTop: 22,
    paddingBottom: 120,
  },

  // ── Loading ──
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 14,
  },
  loadingText: {
    fontFamily: fonts.sub,
    fontSize: 8,
    letterSpacing: 4,
    color: colors.fog,
    includeFontPadding: false,
  },

  // ── Sections ──
  section: {
    marginBottom: 32,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 6,
  },
  sectionTitleLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.ash,
  },
  sectionLabel: {
    fontFamily: fonts.sub,
    fontSize: 7.5,
    letterSpacing: 3,
    color: colors.sepia,
    // 0.8 gave 4.35:1 — just shy. 0.85 = 4.78:1 and clears AA.
    opacity: 0.85,
    includeFontPadding: false,
  },
  sectionSubtext: {
    fontFamily: fonts.bodyItalic,
    fontSize: 9,
    color: colors.fog,
    // 0.5 measured 2.44:1 — below the floor WCAG allows even for LARGE
    // text. This line explains what the directory IS. 0.8 = 4.59:1.
    opacity: 0.8,
    paddingHorizontal: 20,
    marginBottom: 14,
    textAlign: 'center',
  },

  // ── Joined strip ──
  joinedStripWrap: {
    position: 'relative',
  },
  joinedStrip: {
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 18,
  },
  joinedStripFade: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 28,
  },

  // ── Empty directory ──
  emptyPublic: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 44,
    paddingHorizontal: 24,
    marginHorizontal: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.ash,
    borderRadius: 4,
    gap: 8,
  },
  emptyPublicText: {
    fontFamily: fonts.bodyItalic,
    fontSize: 11,
    color: colors.fog,
  },
  emptyPublicHint: {
    fontFamily: fonts.sub,
    fontSize: 8,
    color: colors.fog,
    // 0.5 was 2.44:1 — the invitation shown when the directory is empty.
    opacity: 0.8,
    letterSpacing: 1.5,
    includeFontPadding: false,
  },
});
