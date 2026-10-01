import { colors, effects, fonts } from '@/src/theme/theme';
import { StyleSheet } from 'react-native';
import { ROOM_INSET } from './roomStyles';
import { EDGE_LIT } from '@/src/theme/light';

// The member file's styles: app/user/[username].tsx and the parts it draws.

export const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },

  // ── Top Navigation ──
  topNav: { paddingTop: 56, paddingHorizontal: ROOM_INSET, paddingBottom: 8, position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  topNavBtn: { width: 40, height: 40, justifyContent: 'center' },

  // ── Atmospheric Header ──
  headerWrap: {
    position: 'relative', overflow: 'hidden',
    borderBottomWidth: 1, borderBottomColor: 'rgba(184,137,26,0.15)',
  },
  // Clear, so the room's light reaches the plate: see RoomLight.
  headerArchivistBase: {
    ...StyleSheet.absoluteFillObject, zIndex: 0,
  },
  filmGrainOverlay: {
    ...StyleSheet.absoluteFillObject, zIndex: 2, opacity: 0.03,
    backgroundColor: 'rgba(184,137,26,0.05)',
  },
  headerGoldEdge: {
    position: 'absolute', bottom: 0, left: '5%', right: '5%', height: 1.5,
    backgroundColor: 'rgba(184,137,26,0.3)', zIndex: 3,
  },
  // No horizontal padding and no centring: each block inside the hero sets its
  // own inset (a shared pad and centring make one centred column of stacked
  // rows). `paddingTop` is supplied at the call site — it differs between your
  // own file (a tab, no back button) and a pushed one.
  headerContent: { position: 'relative', zIndex: 4 },

  // ── Social Links ──
  // Sets its own inset, as every block in the hero does.
  socialLinksRow: { position: 'relative' as const, zIndex: 5, flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8, justifyContent: 'center' as const, marginTop: 14, paddingHorizontal: 20 },
  socialLinkChip: {
    flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 4,
    // 36 + 4pt of slop each side = the 44pt floor, using only half the 8pt row
    // gap so a chip never reaches into the one beside or below it.
    minHeight: 36,
    paddingHorizontal: 12, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(184,137,26,0.2)', borderRadius: 3,
  },
  socialLinkText: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1.5, color: colors.fog },

  // ── Buttons ──
  ghostBtn: { paddingVertical: 14, paddingHorizontal: 28, borderWidth: 1.5, borderColor: 'rgba(184,137,26,0.3)', borderRadius: 4, backgroundColor: 'rgba(13,11,9,0.8)' },
  ghostBtnText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2.5, color: colors.silverScreen },
  ctaBtn: { ...EDGE_LIT, borderWidth: 1.5, borderColor: 'rgba(184,137,26,0.4)', backgroundColor: colors.soot, paddingVertical: 14, alignItems: 'center' as const, borderRadius: 4, marginBottom: 16, ...effects.shadowSurface, ...effects.flat, },
  ctaBtnText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2.5, color: colors.silverScreen, ...effects.textGlowSepia },
  ctaBtnRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },

  // ── The Sealed Dossier (private accounts) ──
  // No ground of its own, as contentArea has none: the sealed notice lies on
  // the lit room like the open file's rooms do.
  sealedWrap: { paddingHorizontal: 24, paddingVertical: 48 },
  sealedCard: {
    borderWidth: 1, borderStyle: 'dashed' as const, borderColor: 'rgba(184,137,26,0.35)',
    borderRadius: 4, backgroundColor: colors.sepiaFaint,
    paddingVertical: 28, paddingHorizontal: 20, alignItems: 'center' as const,
  },
  sealedTitle: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 3, color: colors.sepia, marginBottom: 10 },
  sealedBody: { fontFamily: fonts.bodyItalic, fontSize: 11, color: colors.bone, textAlign: 'center' as const, lineHeight: 19 },

  // ── Collection Grid ──
  // Width is computed in pixels at the call site; minHeight keeps all six
  // rooms in even rows.
  roomKeyDim: { opacity: 0.75 },
  ascendBtn: { marginTop: 18, backgroundColor: colors.sepia, borderRadius: 2, paddingVertical: 11, paddingHorizontal: 24 },
  ascendBtnText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2.5, color: colors.ink },

  // ── Empty State ──
  emptyState: { alignItems: 'center' as const, paddingVertical: 48, paddingHorizontal: 32, borderWidth: 1, borderStyle: 'dashed' as const, borderColor: 'rgba(184,137,26,0.3)', borderRadius: 2, backgroundColor: 'rgba(30,25,20,0.7)' },
  emptyTitle: { fontFamily: fonts.display, fontSize: 15, color: colors.parchment, marginBottom: 8 },
  emptyDesc: { fontFamily: fonts.body, fontSize: 10, color: colors.fog, textAlign: 'center' as const, lineHeight: 16, fontStyle: 'italic' as const },

  // ── Projector Tab ──
  card: { ...EDGE_LIT, backgroundColor: colors.soot, borderWidth: 1, borderColor: 'rgba(184,137,26,0.2)', borderRadius: 2, padding: 16, gap: 10 },
  favouriteRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },

  // ── Early Return States ──
  centeredFull: { justifyContent: 'center' as const, alignItems: 'center' as const },
  centeredPadded: { justifyContent: 'center' as const, alignItems: 'center' as const, padding: 40 },
  loadingRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  loadingText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 3, color: colors.sepia },
  notFoundIcon: { marginBottom: 16, opacity: 0.4 },
  notFoundTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.parchment, marginBottom: 8 },
  notFoundBody: { fontFamily: fonts.body, fontSize: 11, color: colors.fog, fontStyle: 'italic' as const, textAlign: 'center' as const, marginBottom: 24 },
  ghostBtnRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },

  // ── A room ──
  tabScrollContent: { paddingBottom: 80, paddingTop: 8 },
  /** A sealed room, which has no list to inherit the room inset from. */
  sealedPad: { paddingHorizontal: ROOM_INSET },
  tabContentPad: { paddingHorizontal: ROOM_INSET },

  // ── Projector Tab ──
  // The header above already names the room; nothing here names it again.
  projectorGap: { gap: 32 },
  projectorSectionsWrap: { paddingHorizontal: ROOM_INSET, gap: 32 },

  // ── Favourites ──
  favPosterThumb: { width: 28, height: 42, borderRadius: 2, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(232,223,208,0.14)' },
  favPosterEmpty: { backgroundColor: colors.inkwell },
  favYear: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1.2, color: colors.fog },
  favTextWrap: { flex: 1, minWidth: 0 },
  favTitle: { fontFamily: fonts.sub, fontSize: 11, color: colors.parchment, lineHeight: 14 },
  favRatingRow: { flexDirection: 'row' as const, gap: 2, marginTop: 2 },

  // ── Calendar ──
  emptyLockIcon: { marginBottom: 12, opacity: 0.5 },

  // ── Triptych ──
  // No maxWidth: the altarpiece derives its panel widths from the WINDOW, and
  // a capped wrapper would hang them off its own edge on the larger phones.
  triptychWrap: { marginTop: 16 },

  // ── Content Area ──
  // No ground of its own: a painted one would lay a second, UNLIT page over the
  // room's light from the plate down. The light is painted once, at the root.
  contentArea: {},

  // ── Main Scroll ──
  mainScrollContent: { paddingBottom: 60 },

  // ══════════════════════════════════════════════════════════════════════════
  // THE MEMBER FILE
  // ══════════════════════════════════════════════════════════════════════════
  // The hero is a COMPOSITION — a mounted portrait on the left, the member's
  // particulars set beside it like a letterhead — read in one glance, not
  // eleven centred rows before a single film.

  // A breath of dark at the very top so the status bar recedes into the plate
  // instead of fighting a bright backdrop for the same pixels.
  heroTopFade: { position: 'absolute' as const, top: 0, left: 0, right: 0, height: 76, zIndex: 3 },

  identRow: { position: 'relative' as const, zIndex: 5, flexDirection: 'row' as const, gap: 16, alignItems: 'flex-start' as const, paddingHorizontal: 20, paddingTop: 6 },

  // ── the mounted portrait ──
  // Not a circle. Circles are what every profile in the world uses; a member
  // file holds a PRINT, and a print has edges, a white margin and corners.
  portraitWrap: { position: 'relative' as const, flexShrink: 0 },
  plate: { ...EDGE_LIT,
    width: 96, height: 120,
    borderWidth: 3, borderColor: 'rgba(232,223,208,0.86)',
    backgroundColor: colors.frame,
    overflow: 'hidden' as const,
  },
  plateImage: { width: '100%' as const, height: '100%' as const },
  plateInitialWrap: { ...EDGE_LIT, width: '100%' as const, height: '100%' as const, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: colors.soot },
  plateInitial: { fontFamily: fonts.display, fontSize: 40, color: 'rgba(232,223,208,0.28)' },
  // The grain sits INSIDE the frame, over the photograph — it is the print that
  // is old, not the screen.
  plateGrain: { ...StyleSheet.absoluteFillObject, zIndex: 2, opacity: 0.05, backgroundColor: 'rgba(232,223,208,0.5)' },

  // Photo corners: four 15pt triangles, drawn the only way a phone can draw a
  // triangle — a zero-sized box with two coloured borders.
  corner: { position: 'absolute' as const, width: 0, height: 0, borderStyle: 'solid' as const, backgroundColor: 'transparent', zIndex: 5 },
  cornerTL: { top: 0, left: 0, borderTopWidth: 15, borderRightWidth: 15, borderTopColor: 'rgba(232,223,208,0.30)', borderRightColor: 'transparent' },
  cornerTR: { top: 0, right: 0, borderTopWidth: 15, borderLeftWidth: 15, borderTopColor: 'rgba(232,223,208,0.30)', borderLeftColor: 'transparent' },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 15, borderRightWidth: 15, borderBottomColor: 'rgba(232,223,208,0.30)', borderRightColor: 'transparent' },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 15, borderLeftWidth: 15, borderBottomColor: 'rgba(232,223,208,0.30)', borderLeftColor: 'transparent' },

  // WHERE the rank sits on the print — and only where. The mark itself (its
  // border, ground, tilt and type) is `theme/stamp.ts` and `RankBadge`, drawn
  // identically in every place a rank appears.
  tierStamp: {
    position: 'absolute' as const, left: -8, bottom: 11, zIndex: 6,
  },

  // ── the particulars ──
  particulars: { flex: 1, minWidth: 0, paddingTop: 2 },
  heroName: { fontFamily: fonts.display, color: colors.silverScreen, textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 12 },
  // A hairline that starts at the name and fades out — a letterhead rule, not a
  // box. It ends the name without enclosing it.
  nameRule: { height: 1, marginTop: 11 },
  heroHandle: { fontFamily: fonts.sub, fontSize: 9.5, letterSpacing: 2, color: colors.fog, marginTop: 9 },
  heroStand: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 2.2, marginTop: 11 },
  heroSerial: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.9, color: colors.fogQuiet, marginTop: 6 },

  // ── the bio, in the house's own quotation marks ──
  heroBio: { position: 'relative' as const, zIndex: 5, fontFamily: fonts.bodyItalic, color: colors.bone, textAlign: 'center' as const, paddingHorizontal: 22, paddingTop: 20 },
  bioMark: { color: colors.sepia, opacity: 0.6, fontStyle: 'normal' as const },
  bioMarkRuby: { color: colors.crimson, opacity: 0.75, fontStyle: 'normal' as const },

  // ── the four figures ──
  statsBox: {
    position: 'relative' as const, zIndex: 5, flexDirection: 'row' as const,
    marginHorizontal: 20, marginTop: 20,
    borderWidth: 1, borderRadius: 6,
    backgroundColor: 'rgba(13,11,9,0.82)',
  },
  statCell: { flex: 1, minHeight: 56, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 4, paddingHorizontal: 2 },
  statCellRule: { borderLeftWidth: 1, borderLeftColor: 'rgba(184,137,26,0.10)' },
  statNum: { fontFamily: fonts.display, fontSize: 17, lineHeight: 20, color: colors.silverScreen, textShadowColor: 'rgba(184,137,26,0.35)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 10 },
  statCap: { fontFamily: fonts.sub, fontSize: 7, letterSpacing: 1.4, color: colors.fogQuiet },

  // ── the two acts ──
  actsRow: { position: 'relative' as const, zIndex: 5, flexDirection: 'row' as const, gap: 10, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 24 },
  act: { flex: 1, minHeight: 48, alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 1, borderColor: colors.sepia, borderRadius: 2, backgroundColor: 'rgba(184,137,26,0.06)' },
  actSolid: { backgroundColor: colors.sepia, shadowColor: 'rgba(184,137,26,1)', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.22, shadowRadius: 20, elevation: 4 },
  actText: { fontFamily: fonts.sub, fontSize: 9.5, letterSpacing: 2.4, color: colors.sepia },
  actTextSolid: { color: colors.ink },
  actGhost: { flex: 0, width: 48, borderColor: colors.ash, backgroundColor: 'transparent' },

  // ══ LATELY — a ledger, numbered ══
  // A numbered ledger, not three tiles: "the last three films, in order, and
  // what they got".
  latelySection: { marginTop: 4 },
  latelyWrap: { paddingHorizontal: 20 },
  latelyRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 11, minHeight: 66, borderBottomWidth: 1, borderBottomColor: 'rgba(184,137,26,0.10)' },
  latelyRowLast: { borderBottomWidth: 0 },
  latelyIndex: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1, color: colors.sepia, opacity: 0.5, width: 15, flexShrink: 0 },
  latelyPoster: { width: 38, height: 57, flexShrink: 0, overflow: 'hidden' as const, backgroundColor: colors.frame, borderWidth: 1, borderColor: 'rgba(232,223,208,0.12)' },
  latelyPosterImg: { width: '100%' as const, height: '100%' as const },
  latelyPosterEmpty: { alignItems: 'center' as const, justifyContent: 'center' as const },
  latelyText: { flex: 1, minWidth: 0 },
  latelyTitle: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 1.2, color: colors.bone },
  latelyYear: { fontFamily: fonts.body, fontSize: 10, color: colors.fogQuiet, marginTop: 4 },
  latelyRight: { flexShrink: 0, alignItems: 'flex-end' as const },
  latelyWhen: { fontFamily: fonts.sub, fontSize: 7, letterSpacing: 0.9, color: colors.fogQuiet, marginTop: 4 },
  latelyRewatch: { fontFamily: fonts.sub, fontSize: 7, letterSpacing: 0.9, color: colors.sepia, marginTop: 4 },

  // ══ THE HOLDINGS ══
  // Three rows in two columns say the six rooms' numbers in 156pt, a dotted
  // leader carrying the eye from the room to its count as a printed index does
  // (the room this saves is what makes the altarpiece's centre large).
  holdWrap: { flexDirection: 'row' as const, gap: 14, paddingHorizontal: 20 },
  holdCol: { flex: 1, minWidth: 0 },
  holdRow: { minHeight: 52, justifyContent: 'center' as const, gap: 3, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(184,137,26,0.10)' },
  holdRowLast: { borderBottomWidth: 0 },
  holdNameRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5 },
  holdName: { fontFamily: fonts.sub, fontSize: 10.5, letterSpacing: 1.8, color: colors.silverScreen, flexShrink: 1 },
  holdBase: { flexDirection: 'row' as const, alignItems: 'flex-end' as const, gap: 6 },
  /**
   * ── THE PLAIN-ENGLISH GLOSS ─────────────────────────────────────────────────
   * The word under each room name — *watched*, *to see*, *physical* — is what
   * makes six invented room names legible to somebody who has just arrived, so:
   *
   * IT YIELDS FIRST. Beside a count that cannot shrink, a gloss that could not
   * would push out of the card: at maximum Dynamic Type on a 320pt phone the
   * pair has about 8 characters of room. The count is a number and must stay
   * whole; the gloss is a word and can take an ellipsis.
   *
   * IT IS READABLE. 9.5pt text needs 4.5:1, on ink and on the lit card alike,
   * so it is solid `fogQuiet`: a word never borrows its contrast from the
   * ground behind it.
   */
  holdSub: { fontFamily: fonts.body, fontSize: 9.5, color: colors.fogQuiet, flexShrink: 1, minWidth: 0 },
  holdLeader: { flex: 1, minWidth: 8, marginBottom: 4, borderBottomWidth: 1, borderStyle: 'dotted' as const, borderBottomColor: 'rgba(184,137,26,0.30)' },
  holdCount: { fontFamily: fonts.display, fontSize: 14, lineHeight: 17, color: colors.sepia, flexShrink: 0, textShadowColor: 'rgba(184,137,26,0.3)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8 },
  holdCountLock: { fontFamily: fonts.sub, fontSize: 11, color: colors.sepia, textShadowRadius: 0 },

  // ── a door ──
  doorRow: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10,
    marginHorizontal: 20, marginTop: 18, minHeight: 52, paddingHorizontal: 15,
    borderWidth: 1, borderColor: 'rgba(184,137,26,0.20)', borderRadius: 6,
    backgroundColor: 'rgba(13,11,9,0.85)',
  },
  doorText: { flex: 1, fontFamily: fonts.sub, fontSize: 9.5, letterSpacing: 2.2, color: colors.sepia },

  // ══ THE DESK — your own file only ══
  deskWrap: { paddingHorizontal: 20 },
  deskRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 11, minHeight: 54, borderBottomWidth: 1, borderBottomColor: 'rgba(184,137,26,0.10)' },
  deskRowLast: { borderBottomWidth: 0 },
  deskText: { flex: 1, fontFamily: fonts.sub, fontSize: 10.5, letterSpacing: 1.9, color: colors.silverScreen },

  // The Society plate — a door at EVERY rank. It is the way into the society
  // page, not an upsell, so it does not vanish once you reach the top; at the
  // top it simply stops shouting.
  ranksPlate: {
    marginHorizontal: 20, marginTop: 20,
    borderWidth: 1, borderColor: 'rgba(184,137,26,0.20)', borderRadius: 6,
    backgroundColor: 'rgba(184,137,26,0.06)',
    paddingTop: 17, paddingBottom: 15, paddingHorizontal: 16,
    alignItems: 'center' as const,
  },
  ranksTitle: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2.8, color: colors.sepia },
  ranksSub: { fontFamily: fonts.bodyItalic, fontSize: 11.5, lineHeight: 16, color: colors.fog, textAlign: 'center' as const, marginTop: 9 },
  ranksBtn: {
    width: '100%' as const, minHeight: 44, marginTop: 14,
    alignItems: 'center' as const, justifyContent: 'center' as const,
    backgroundColor: colors.sepia, borderRadius: 2,
    shadowColor: 'rgba(184,137,26,1)', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.22, shadowRadius: 20, elevation: 4,
  },
  ranksBtnQuiet: { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(184,137,26,0.30)', shadowOpacity: 0, elevation: 0 },
  ranksBtnText: { fontFamily: fonts.sub, fontSize: 9.5, letterSpacing: 2.6, color: colors.ink },
  ranksBtnTextQuiet: { color: colors.sepia },

  // ── the foot of the file ──
  footRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 12, paddingTop: 30, paddingBottom: 22 },
  footRule: { width: 32, height: 1, backgroundColor: colors.sepia, opacity: 0.3 },
  footMark: { fontSize: 9, lineHeight: 11, color: colors.sepia, opacity: 0.55 },
  footMarkRuby: { color: colors.crimson, opacity: 0.7 },
});
