import { colors, effects, fonts } from '@/src/theme/theme';
import { StyleSheet } from 'react-native';
import { ROOM_INSET } from './roomStyles';

// ════════════════════════════════════════════════════════════
// STYLES — Nitrate Noir Design System
// T3-1: Extracted from [username].tsx for maintainability
// ════════════════════════════════════════════════════════════

export const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },

  // ── Top Navigation ──
  topNav: { paddingTop: 56, paddingHorizontal: ROOM_INSET, paddingBottom: 8, position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  topNavBtn: { width: 40, height: 40, justifyContent: 'center' },

  // ── Tab Page Header ──
  tabPageHeader: {
    paddingTop: 56, paddingHorizontal: ROOM_INSET, paddingBottom: 12,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(8,6,4,0.98)',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(184,137,26,0.15)',
  },

  // ── Atmospheric Header ──
  headerWrap: {
    position: 'relative', overflow: 'hidden',
    borderBottomWidth: 1, borderBottomColor: 'rgba(184,137,26,0.15)',
  },
  headerDarkBase: {
    ...StyleSheet.absoluteFillObject, zIndex: 0,
    backgroundColor: colors.ink,
  },
  headerArchivistBase: {
    ...StyleSheet.absoluteFillObject, zIndex: 0,
    backgroundColor: colors.ink,
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
  // own inset, exactly as the design does. A shared 20pt pad plus
  // alignItems:'center' is precisely what produced the old single centred
  // column of eleven stacked rows. `paddingTop` is supplied at the call site —
  // it differs between your own file (a tab, no back button) and a pushed one.
  headerContent: { position: 'relative', zIndex: 4 },

  // ── Avatar ──
  avatarWrap: { position: 'relative', marginBottom: 12 },
  avatar: { width: 108, height: 108, borderRadius: 54 },
  // Auteur-only: a tight, contained ruby halo behind the avatar — replaces the
  // big header haze. iOS shadow only, soft and restrained (not the old red cloud).

  // ── Social Links ──
  // Sets its own inset — the hero no longer pads its children as a group.
  socialLinksRow: { position: 'relative' as const, zIndex: 5, flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8, justifyContent: 'center' as const, marginTop: 14, paddingHorizontal: 20 },
  socialLinkChip: {
    flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 4,
    // 36 + 4pt of slop each side = the 44pt floor, using only half the 8pt row
    // gap so a chip never reaches into the one beside or below it. At the old
    // ~20pt height no amount of legal slop could have got there.
    minHeight: 36,
    paddingHorizontal: 12, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(184,137,26,0.2)', borderRadius: 3,
  },
  socialLinkText: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1.5, color: colors.fog },

  // ── Buttons ──
  ghostBtn: { paddingVertical: 14, paddingHorizontal: 28, borderWidth: 1.5, borderColor: 'rgba(184,137,26,0.3)', borderRadius: 4, backgroundColor: 'rgba(10,8,5,0.8)' },
  ghostBtnText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2.5, color: colors.silverScreen },
  primaryBtn: { backgroundColor: 'rgba(18,14,9,0.9)', borderWidth: 1.5, borderColor: 'rgba(184,137,26,0.4)', paddingVertical: 14, paddingHorizontal: 28, borderRadius: 4, ...effects.shadowSurface },
  primaryBtnText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2.5, color: colors.silverScreen, ...effects.textGlowSepia },
  ctaBtn: { borderWidth: 1.5, borderColor: 'rgba(184,137,26,0.4)', backgroundColor: 'rgba(14,11,8,0.9)', paddingVertical: 14, alignItems: 'center' as const, borderRadius: 4, marginBottom: 16, ...effects.shadowSurface },
  ctaBtnText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2.5, color: colors.silverScreen, ...effects.textGlowSepia },

  // ── Stats ──
  statsGrid: { 
    flexDirection: 'row' as const, width: '100%' as const, marginTop: 24, 
    justifyContent: 'center' as const, alignItems: 'center' as const,
    backgroundColor: 'rgba(10,8,5,0.85)',
    borderWidth: 1.5, borderColor: 'rgba(184,137,26,0.15)',
    borderRadius: 6,
    ...effects.shadowSurface,
  },
  statValue: { fontFamily: fonts.display, fontSize: 18, color: colors.silverScreen, lineHeight: 22, ...effects.textGlowSepia },
  statLabel: { fontFamily: fonts.sub, fontSize: 7, letterSpacing: 1.5, color: colors.fog, marginTop: 4, opacity: 0.8 },

  // ── The Sealed Dossier (private accounts) ──
  sealedWrap: { paddingHorizontal: 24, paddingVertical: 48, backgroundColor: colors.ink },
  sealedCard: {
    borderWidth: 1, borderStyle: 'dashed' as const, borderColor: 'rgba(184,137,26,0.35)',
    borderRadius: 4, backgroundColor: colors.sepiaFaint,
    paddingVertical: 28, paddingHorizontal: 20, alignItems: 'center' as const,
  },
  sealedTitle: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 3, color: colors.sepia, marginBottom: 10 },
  sealedBody: { fontFamily: fonts.bodyItalic, fontSize: 11, color: colors.bone, opacity: 0.85, textAlign: 'center' as const, lineHeight: 19 },

  // ── Recently Watched poster overlays ──
  posterImg: { width: '100%' as const, height: '100%' as const, borderRadius: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(184,137,26,0.2)' },
  posterBottomGrad: {
    position: 'absolute' as const, bottom: 0, left: 0, right: 0,
    padding: 4, flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'flex-end' as const,
    backgroundColor: 'rgba(0,0,0,0.65)', borderBottomLeftRadius: 4, borderBottomRightRadius: 4,
    overflow: 'hidden' as const, flexWrap: 'wrap' as const,
  },
  posterTimeAgo: { fontFamily: fonts.sub, fontSize: 7, letterSpacing: 1, color: colors.fog },

  // ── Tier Borders (Shadows Purged) ──
  auteurGlow: {
    borderWidth: 1, borderColor: 'rgba(107,26,10,0.8)', borderRadius: 2, borderStyle: 'solid' as const,
  },
  archivistGlow: {
    borderWidth: 1, borderColor: 'rgba(196,150,26,0.5)', borderRadius: 2, borderStyle: 'solid' as const,
  },

  // ── Collection Grid ──
  // Width is computed in pixels at the call site — the '31%'-of-a-widthless-
  // wrapper collapse is dead. minHeight keeps all six rooms in perfect rows.
  roomKeyDim: { opacity: 0.75 },
  ascendBtn: { marginTop: 18, backgroundColor: colors.sepia, borderRadius: 2, paddingVertical: 11, paddingHorizontal: 24 },
  ascendBtnText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2.5, color: colors.ink },

  // ── Tab Content: Grids ──
  grid4: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6 },
  grid3: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  monthHeader: {
    fontFamily: fonts.sub, fontSize: 9, letterSpacing: 3, color: colors.sepia, marginBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(184,137,26,0.15)', paddingBottom: 8,
  },

  // ── Badges ──
  statusBadge: { position: 'absolute' as const, top: 4, right: 4, backgroundColor: 'rgba(10,7,3,0.85)', borderWidth: 1, borderColor: 'rgba(184,137,26,0.35)', borderRadius: 2, paddingHorizontal: 4, paddingVertical: 2 },
  halfLifeBadge: { position: 'absolute' as const, bottom: 4, left: 4, backgroundColor: 'rgba(10,7,3,0.9)', borderWidth: 1, borderColor: 'rgba(184,137,26,0.3)', borderRadius: 2, paddingHorizontal: 4, paddingVertical: 2 },
  formatBadge: { position: 'absolute' as const, top: 4, right: 4, backgroundColor: 'rgba(10,5,0,0.95)', borderWidth: 1, borderRadius: 2, paddingHorizontal: 5, paddingVertical: 2 },

  // ── Filters & Search ──
  filterChip: { paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: colors.ash, borderRadius: 2, backgroundColor: 'transparent' },
  filterChipActive: { borderColor: colors.sepia, backgroundColor: colors.sepiaFaint },
  filterChipText: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1.5, color: colors.fog },
  filterChipTextActive: { color: colors.sepia },
  searchWrap: { flexDirection: 'row' as const, alignItems: 'center' as const, backgroundColor: 'rgba(22,18,12,0.6)', borderWidth: 1, borderColor: 'rgba(184,137,26,0.15)', borderRadius: 2, paddingHorizontal: 10 },
  searchIcon: { fontSize: 14, color: colors.fog, opacity: 0.5, marginRight: 6 },
  searchInput: { flex: 1, fontFamily: fonts.sub, fontSize: 11, color: colors.parchment, paddingVertical: 10 },
  searchClear: { padding: 4 },

  // ── Empty State ──
  emptyState: { alignItems: 'center' as const, paddingVertical: 48, paddingHorizontal: 32, borderWidth: 1, borderStyle: 'dashed' as const, borderColor: 'rgba(184,137,26,0.3)', borderRadius: 2, backgroundColor: 'rgba(14,11,8,0.7)' },
  emptyTitle: { fontFamily: fonts.display, fontSize: 15, color: colors.parchment, marginBottom: 8 },
  emptyDesc: { fontFamily: fonts.body, fontSize: 10, color: colors.fog, textAlign: 'center' as const, lineHeight: 16, fontStyle: 'italic' as const },

  // ── Stacks ──
  stackCard: { borderRadius: 2, overflow: 'hidden' as const, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(184,137,26,0.2)', backgroundColor: colors.soot },
  stackPosterWrap: { width: '100%' as const, height: 80, position: 'relative' as const, overflow: 'hidden' as const },
  stackPosterPanel: { position: 'absolute' as const, top: 0, height: '100%' as const },
  stackOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,7,3,0.55)' },
  stackContent: { padding: 12 },
  stackBadge: { fontFamily: fonts.sub, fontSize: 7, letterSpacing: 1.5, color: colors.sepia, backgroundColor: colors.sepiaFaint, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 1, alignSelf: 'flex-start' as const, overflow: 'hidden' as const, marginBottom: 4 },
  stackTitle: { fontFamily: fonts.display, fontSize: 11, color: colors.parchment, letterSpacing: 0.5, lineHeight: 14 },
  stackDesc: { fontFamily: fonts.body, fontSize: 9, color: colors.fog, fontStyle: 'italic' as const, lineHeight: 13, marginTop: 4 },

  // ── Projector Tab ──
  card: { backgroundColor: 'rgba(8,6,4,0.98)', borderWidth: 1, borderColor: 'rgba(184,137,26,0.2)', borderRadius: 2, padding: 16, gap: 10 },
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

  // ── Tab Header ──
  tabHeaderTextWrap: { flex: 1 },
  tabHeaderUsername: { fontFamily: fonts.sub, fontSize: 7, letterSpacing: 2.5, color: colors.fog },
  tabHeaderTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.parchment, lineHeight: 22 },
  tabScrollContent: { paddingBottom: 80, paddingTop: 8 },
  /** A sealed room, which has no list to inherit the room inset from. */
  sealedPad: { paddingHorizontal: ROOM_INSET },
  tabContentPad: { paddingHorizontal: ROOM_INSET },
  filterGroupCol: { marginBottom: 16, gap: 10 },
  filterScrollMargin: { marginBottom: 16 },
  filterChipRow: { gap: 8 },
  filterChipRowTight: { gap: 6 },
  searchIconStyle: { opacity: 0.5, marginRight: 6 },
  searchWrapFlex: { flex: 1 },
  searchNoResults: { textAlign: 'center' as const, padding: 24, color: colors.fog, fontFamily: fonts.body, fontSize: 11 },

  // ── Poster Cards ──
  posterPlaceholder: { backgroundColor: '#050402', justifyContent: 'center' as const, alignItems: 'center' as const },
  posterRatingRow: { flexDirection: 'row' as const, gap: 2 },
  posterCardWrap: { aspectRatio: 2 / 3, position: 'relative' as const },
  statusBadgeAbandoned: { borderColor: 'rgba(139,30,30,0.4)' },
  formatBadgeText: { fontSize: 7, fontFamily: fonts.sub, letterSpacing: 1 },

  // ── Half-Life ──
  halfLifeContent: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 2 },
  halfLifeText: { fontSize: 7, fontFamily: fonts.sub },

  // ── Watchlist ──
  watchlistControlRow: { flexDirection: 'row' as const, gap: 8, marginBottom: 16, alignItems: 'center' as const },
  sortRow: { flexDirection: 'row' as const, gap: 4 },
  ctaBtnRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },

  // ── Stacks ──
  stackEmptyBg: { flex: 1, backgroundColor: 'rgba(8,6,4,0.98)' },

  // ── Projector Tab ──
  // The Projector Room used to announce itself a second time under the header
  // that already named it — a super, a display title and a line of prose, three
  // rows of chrome before a single number. `projectorHeader`, `projectorSuper`,
  // `projectorTitle` and `projectorSub` went with it.
  projectorGap: { gap: 32 },
  projectorSectionsWrap: { paddingHorizontal: ROOM_INSET, gap: 32 },

  // ── Favourites ──
  favPosterThumb: { width: 28, height: 42, borderRadius: 2, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(232,223,208,0.14)' },
  favPosterEmpty: { backgroundColor: '#050402' },
  favYear: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1.2, color: colors.fog },
  favTextWrap: { flex: 1, minWidth: 0 },
  favTitle: { fontFamily: fonts.sub, fontSize: 11, color: colors.parchment, lineHeight: 14 },
  favRatingRow: { flexDirection: 'row' as const, gap: 2, marginTop: 2 },

  // ── Calendar ──
  emptyLockIcon: { marginBottom: 12, opacity: 0.5 },

  // ── Profile Action Row (follow + more) ──
  moreBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, paddingHorizontal: 10, paddingVertical: 8, marginLeft: 8 },

  // ── Triptych ──
  // No `maxWidth: 380` any more. The altarpiece derives its panel widths from
  // the WINDOW, so a wrapper that capped the row at 380 while the panels were
  // measured against a 430pt screen would have hung them off the edge of their
  // own container on the larger phones.
  triptychWrap: { marginTop: 16 },

  // ── Content Area ──
  contentArea: { backgroundColor: colors.ink },

  // ── Main Scroll ──
  mainScrollContent: { paddingBottom: 60 },

  // ── Founder's Mark ──
  founderText: {
    fontFamily: fonts.sub, fontSize: 7, letterSpacing: 2.5,
    color: 'rgba(184,137,26,0.7)', textAlign: 'center' as const,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // THE MEMBER FILE
  // ══════════════════════════════════════════════════════════════════════════
  // The hero used to be ten centred blocks stacked down the middle of a 120pt
  // top pad: portrait, badge, name, tier pill, serial, joined, bio, links,
  // buttons, stats. Eleven rows before a single film. It is now a COMPOSITION —
  // a mounted portrait on the left, the member's particulars set beside it like
  // a letterhead — which reads in one glance and costs about 100pt less on a
  // pushed profile (~613 → ~510 at 375pt) and about 140 on your own tab, where
  // the old flat 120pt pad was clearing a back button that is not there.

  // A breath of dark at the very top so the status bar recedes into the plate
  // instead of fighting a bright backdrop for the same pixels.
  heroTopFade: { position: 'absolute' as const, top: 0, left: 0, right: 0, height: 76, zIndex: 3 },

  identRow: { position: 'relative' as const, zIndex: 5, flexDirection: 'row' as const, gap: 16, alignItems: 'flex-start' as const, paddingHorizontal: 20, paddingTop: 6 },

  // ── the mounted portrait ──
  // Not a circle. Circles are what every profile in the world uses; a member
  // file holds a PRINT, and a print has edges, a white margin and corners.
  portraitWrap: { position: 'relative' as const, flexShrink: 0 },
  plate: {
    width: 96, height: 120,
    borderWidth: 3, borderColor: 'rgba(232,223,208,0.86)',
    backgroundColor: colors.frame,
    overflow: 'hidden' as const,
  },
  plateImage: { width: '100%' as const, height: '100%' as const },
  plateInitialWrap: { width: '100%' as const, height: '100%' as const, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: colors.soot },
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

  // The rank, stamped on the corner of the print at a hand's angle. This is
  // where rank lives now — the badge that used to hang under the avatar and the
  // pill that sat beside the name were two labels for one fact.
  tierStamp: {
    position: 'absolute' as const, left: -8, bottom: 11, zIndex: 6,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: colors.sepia,
    backgroundColor: 'rgba(10,9,6,0.92)',
    transform: [{ rotate: '-3.5deg' }],
  },
  tierStampRuby: { borderColor: colors.crimson },
  tierStampText: { fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 1.8, color: colors.sepia },
  tierStampTextRuby: { color: colors.crimson },

  // ── the particulars ──
  particulars: { flex: 1, minWidth: 0, paddingTop: 2 },
  heroName: { fontFamily: fonts.display, color: colors.silverScreen, textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 12 },
  // A hairline that starts at the name and fades out — a letterhead rule, not a
  // box. It ends the name without enclosing it.
  nameRule: { height: 1, marginTop: 11 },
  heroHandle: { fontFamily: fonts.sub, fontSize: 9.5, letterSpacing: 2, color: colors.fog, marginTop: 9 },
  heroStand: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 2.2, marginTop: 11 },
  heroSerial: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.9, color: colors.fog, opacity: 0.9, marginTop: 6 },

  // ── the bio, in the house's own quotation marks ──
  heroBio: { position: 'relative' as const, zIndex: 5, fontFamily: fonts.bodyItalic, color: colors.bone, opacity: 0.92, textAlign: 'center' as const, paddingHorizontal: 22, paddingTop: 20 },
  bioMark: { color: colors.sepia, opacity: 0.6, fontStyle: 'normal' as const },
  bioMarkRuby: { color: colors.crimson, opacity: 0.75, fontStyle: 'normal' as const },

  // ── the four figures ──
  statsBox: {
    position: 'relative' as const, zIndex: 5, flexDirection: 'row' as const,
    marginHorizontal: 20, marginTop: 20,
    borderWidth: 1, borderRadius: 6,
    backgroundColor: 'rgba(10,8,5,0.82)',
  },
  statCell: { flex: 1, minHeight: 56, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 4, paddingHorizontal: 2 },
  statCellRule: { borderLeftWidth: 1, borderLeftColor: 'rgba(184,137,26,0.10)' },
  statNum: { fontFamily: fonts.display, fontSize: 17, lineHeight: 20, color: colors.silverScreen, textShadowColor: 'rgba(184,137,26,0.35)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 10 },
  statCap: { fontFamily: fonts.sub, fontSize: 7, letterSpacing: 1.4, color: colors.fog, opacity: 0.85 },

  // ── the two acts ──
  actsRow: { position: 'relative' as const, zIndex: 5, flexDirection: 'row' as const, gap: 10, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 24 },
  act: { flex: 1, minHeight: 48, alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 1, borderColor: colors.sepia, borderRadius: 2, backgroundColor: 'rgba(184,137,26,0.06)' },
  actSolid: { backgroundColor: colors.sepia, shadowColor: 'rgba(184,137,26,1)', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.22, shadowRadius: 20, elevation: 4 },
  actText: { fontFamily: fonts.sub, fontSize: 9.5, letterSpacing: 2.4, color: colors.sepia },
  actTextSolid: { color: colors.ink },
  actGhost: { flex: 0, width: 48, borderColor: colors.ash, backgroundColor: 'transparent' },

  // ── the picture rail the altarpiece stands on ──
  railRow: { flexDirection: 'row' as const, alignItems: 'center' as const, marginHorizontal: 20, marginTop: 14 },
  railLine: { flex: 1, height: 1 },
  railDiamond: { width: 3, height: 3, marginHorizontal: 5, backgroundColor: colors.sepia, opacity: 0.5, transform: [{ rotate: '45deg' }] },
  railDiamondRuby: { backgroundColor: colors.crimson },

  // ══ LATELY — a ledger, numbered ══
  // Three poster tiles in a row said "here are three pictures". A numbered
  // ledger says "these are the last three films, in order, and here is what
  // they got" — the same data, carrying its own meaning.
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
  latelyYear: { fontFamily: fonts.body, fontSize: 10, color: colors.fog, opacity: 0.75, marginTop: 4 },
  latelyRight: { flexShrink: 0, alignItems: 'flex-end' as const },
  latelyWhen: { fontFamily: fonts.sub, fontSize: 7, letterSpacing: 0.9, color: colors.fog, opacity: 0.7, marginTop: 4 },
  latelyRewatch: { fontFamily: fonts.sub, fontSize: 7, letterSpacing: 0.9, color: colors.sepia, opacity: 0.85, marginTop: 4 },

  // ══ THE HOLDINGS ══
  // Six 122pt cards in a 3-wide grid spent ~286pt saying six numbers, and put a
  // decorative icon circle above each one. Three rows in two columns say the
  // same six in 156pt, and a dotted leader carries the eye from the room to its
  // count the way a printed index does. That 130pt is what pays for the centre
  // of the altarpiece being genuinely large.
  holdWrap: { flexDirection: 'row' as const, gap: 14, paddingHorizontal: 20 },
  holdCol: { flex: 1, minWidth: 0 },
  holdRow: { minHeight: 52, justifyContent: 'center' as const, gap: 3, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(184,137,26,0.10)' },
  holdRowLast: { borderBottomWidth: 0 },
  holdNameRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5 },
  holdName: { fontFamily: fonts.sub, fontSize: 10.5, letterSpacing: 1.8, color: colors.silverScreen, flexShrink: 1 },
  holdBase: { flexDirection: 'row' as const, alignItems: 'flex-end' as const, gap: 6 },
  holdSub: { fontFamily: fonts.body, fontSize: 9.5, color: colors.fog, opacity: 0.7, flexShrink: 0 },
  holdLeader: { flex: 1, minWidth: 8, marginBottom: 4, borderBottomWidth: 1, borderStyle: 'dotted' as const, borderBottomColor: 'rgba(184,137,26,0.30)' },
  holdCount: { fontFamily: fonts.display, fontSize: 14, lineHeight: 17, color: colors.sepia, flexShrink: 0, textShadowColor: 'rgba(184,137,26,0.3)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8 },
  holdCountLock: { fontFamily: fonts.sub, fontSize: 11, color: 'rgba(184,137,26,0.5)', textShadowRadius: 0 },

  // ── a door ──
  doorRow: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10,
    marginHorizontal: 20, marginTop: 18, minHeight: 52, paddingHorizontal: 15,
    borderWidth: 1, borderColor: 'rgba(184,137,26,0.20)', borderRadius: 6,
    backgroundColor: 'rgba(15,10,5,0.85)',
  },
  doorRowLocked: { borderColor: 'rgba(184,137,26,0.10)', backgroundColor: 'transparent' },
  doorText: { flex: 1, fontFamily: fonts.sub, fontSize: 9.5, letterSpacing: 2.2, color: colors.sepia },
  doorTextLocked: { color: 'rgba(158,148,136,0.55)' },

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
