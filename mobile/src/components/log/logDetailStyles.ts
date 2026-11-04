import { colors, fonts } from '@/src/theme/theme';
import { StyleSheet } from 'react-native';

export const s = StyleSheet.create({
  // ── The page: its body under the head, and its bar over the projection ──
  // The opened log is its author's card stock, not a lit room (the screen sets the stock).
  page: { flex: 1 },
  pageBody: { paddingHorizontal: 18, paddingBottom: 28 },
  // A section's 26 above it, less the 14 the breakdown keeps above its own rule.
  breakdown: { marginTop: 12 },
  bar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 3 },
  // The house's sheet over art: the page under the bar never reads through its words.
  barScrim: { backgroundColor: colors.sheetOverArt },
  barRow: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6 },
  barButton: { minWidth: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  // Between equal gutters, each the right cluster's width (the screen sets them, from the plan).
  barTitleWrap: { position: 'absolute', top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  barTitle: { fontFamily: fonts.sub, fontSize: 10, color: colors.parchment, includeFontPadding: false },
  barRight: { flexDirection: 'row', alignItems: 'center' },
  // One width whether it says SHARE or is still preparing (the screen sets it): it never grows into the ··· beside it.
  barShare: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 48, paddingHorizontal: 6 },
  barShareText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2.4, color: colors.parchment, includeFontPadding: false },
  container: { flex: 1, backgroundColor: colors.ink },
  centerFull: { justifyContent: 'center', alignItems: 'center', gap: 16 },
  hiddenShareContainer: { position: 'absolute', top: 0, left: 0, opacity: 0.01, zIndex: -1 },
  inkBg: { backgroundColor: colors.ink },

  /** "✦ FEATURED IN THE LOBBY · 30 SEPTEMBER", between the log's head and its words. */
  lobbyHonour: { textAlign: 'center', marginTop: 4, marginBottom: 12 },

  // iOS needs the paragraph direction stated — writingDirection is an iOS-only
  // style and the app never set it, so an Arabic essay inherited the app's own
  // left-to-right base and dropped each sentence's stop at the far left of its
  // line. Android resolves direction itself; textAlign is what puts the block
  // on the side it reads from, on both.
  rtlText: { writingDirection: 'rtl', textAlign: 'right' } as import('react-native').TextStyle,

  commentItem: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ash },
  // The name whole on its line; the date beside it while both fit, else beneath, at the right.
  commentTopRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 4, marginBottom: 7 },
  commentByline: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  commentAvatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.soot, borderWidth: 1, borderColor: colors.sepiaBorder, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  commentAvatarText: { fontFamily: fonts.display, fontSize: 11, color: colors.parchment, includeFontPadding: false, textAlignVertical: 'center' },
  commUsername: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 1, color: colors.sepia, includeFontPadding: false, flexShrink: 1 },
  commBody: { fontFamily: fonts.body, fontSize: 13, color: colors.bone, lineHeight: 20 },
  commDate: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1, color: colors.fog, marginLeft: 'auto', includeFontPadding: false, flexShrink: 0 },
  /** The one control at a critique's foot: WITHDRAW on yours, REPORT on anyone else's. */
  commActionBtn: { marginTop: 8, alignSelf: 'flex-end' },
  // Bone, not crimson. Crimson measures 3.18:1 on ink and cannot reach AA at
  // any opacity — exactly the finding already written up for the ABANDONED
  // stamp on the Reel's card, which changed its colour rather than its alpha.
  // That lesson never crossed to here, and this control takes a critique off the page.
  // The word carries the warning; it only had to be readable.
  // A destructive control has to read as one AND be legible. Crimson at 9pt
  // measures 3.2:1 on ink — under the 4.5:1 small text needs — but bone made
  // it look exactly like the body text above it, which is worse: a control
  // that erases something should never be the same colour as prose. `danger`
  // is the one red in the palette that clears the bar (5.2:1) while still
  // unmistakably being a red. The Dispatch's identical row reads from the same
  // decision.
  commWithdraw: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.8, color: colors.danger, includeFontPadding: false },
  /** REPORT on another member's critique: said quietly, in the date's grey — it accuses no one until pressed. */
  commReport: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.8, color: colors.fog, includeFontPadding: false },

  backBtnRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 24, paddingVertical: 12, paddingHorizontal: 24, borderWidth: 1, borderColor: colors.ash, borderRadius: 2 },
  backBtnText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.bone, includeFontPadding: false },

  // ── THE VAULT: a private note, on the page it belongs to ──
  // No frame and no radius on purpose — a brass rule down one side and a wash
  // so faint it reads as part of the writing above, not as a third box between
  // two others.
  vaultNote: {
    backgroundColor: 'rgba(184,137,26,0.05)',
    borderLeftWidth: 2,
    borderLeftColor: colors.sepia,
  },
  vaultNoteFull: { marginTop: 8, marginBottom: 16, paddingVertical: 14, paddingLeft: 14, paddingRight: 12 },
  vaultNoteCompact: { marginTop: 14, paddingVertical: 10, paddingLeft: 12, paddingRight: 8 },
  vaultNoteHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  vaultNoteHeaderCompact: { marginBottom: 6 },
  vaultNoteLabel: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6, flex: 1, includeFontPadding: false },
  vaultNoteLabelCompact: { fontSize: 10 },
  vaultNoteLabelName: { color: colors.sepia },
  vaultNoteLabelWho: { color: colors.fog },
  // Bone, not fog: this is the member's own writing and it is read, not skimmed
  // (fog on this wash measures under the floor at a small size).
  vaultNoteBody: { fontFamily: fonts.bodyItalic, fontSize: 13.5, lineHeight: 22, color: colors.bone },
  vaultNoteBodyCompact: { fontFamily: fonts.bodyItalic, fontSize: 12.5, lineHeight: 20, color: colors.bone },
});
