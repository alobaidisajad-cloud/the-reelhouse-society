import { colors, effects, fonts } from '@/src/theme/theme';
import { StyleSheet } from 'react-native';

// ════════════════════════════════════════════════════════════
// STYLES — Nitrate Noir Design System
// T3-1: Extracted from [username].tsx for maintainability
// ════════════════════════════════════════════════════════════

export const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },

  // ── Top Navigation ──
  topNav: { paddingTop: 56, paddingHorizontal: 16, paddingBottom: 8, position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  topNavBtn: { width: 40, height: 40, justifyContent: 'center' },

  // ── Tab Page Header ──
  tabPageHeader: {
    paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12,
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
  headerContent: {
    position: 'relative', zIndex: 4,
    alignItems: 'center', paddingHorizontal: 20, paddingTop: 120, paddingBottom: 28,
  },

  // ── Avatar ──
  avatarWrap: { position: 'relative', marginBottom: 12 },
  avatarRing: {
    width: 116, height: 116, borderRadius: 58, 
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden', 
    backgroundColor: '#050402',
  },
  avatarRingAuteur: {
    borderWidth: 3, borderColor: colors.bloodAged, // Auteur Ruby
    ...effects.shadowPrimary, shadowColor: colors.bloodAged, shadowRadius: 15,
  },
  avatarRingArchivist: {
    borderWidth: 3, borderColor: colors.champagne, // Archivist Champagne Gold
    ...effects.shadowSurface, shadowColor: colors.champagne, shadowRadius: 10,
  },
  avatarRingCinephile: {
    borderWidth: 2, borderColor: colors.soot,
  },
  avatar: { width: 108, height: 108, borderRadius: 54 },
  // Auteur-only: a tight, contained ruby halo behind the avatar — replaces the
  // big header haze. iOS shadow only, soft and restrained (not the old red cloud).
  avatarHaloAuteur: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 58,
    backgroundColor: colors.bloodAged,
    shadowColor: '#B42D2D',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.42,
    shadowRadius: 15,
  },

  // ── Level Badge ──
  levelBadge: {
    position: 'absolute', bottom: -8, alignSelf: 'center',
    backgroundColor: '#050402', paddingHorizontal: 14, paddingVertical: 4,
    borderWidth: 1.5, borderRadius: 4, zIndex: 5, borderColor: 'rgba(184,137,26,0.5)',
    ...effects.shadowSurface,
  },
  levelBadgeText: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 2 },

  // ── Display Name ──
  displayName: {
    fontFamily: fonts.display, fontSize: 26, color: colors.silverScreen, textAlign: 'center' as const,
    letterSpacing: 2, ...effects.textGlowSepia, textShadowRadius: 12,
  },

  // ── Tier Badges ──
  auteurBadge: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4,
    backgroundColor: '#2A0505', paddingHorizontal: 10, paddingVertical: 4, 
    borderRadius: 4, borderWidth: 1.5, borderColor: colors.bloodAged,
    ...effects.shadowPrimary, shadowColor: colors.bloodAged,
  },
  auteurBadgeText: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 2.5, color: '#E8B4B4', ...effects.textGlowSepia, textShadowColor: colors.bloodAged },
  archivistBadge: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4,
    backgroundColor: 'rgba(20,15,10,0.95)', borderWidth: 1.5, borderColor: colors.champagne,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4,
    ...effects.shadowSurface, shadowColor: colors.champagne,
  },
  archivistBadgeText: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 2.5, color: colors.silverScreen },

  // ── Bio ──
  bio: {
    fontFamily: fonts.body, fontSize: 12, color: colors.bone, textAlign: 'center' as const,
    lineHeight: 18, marginTop: 10, paddingHorizontal: 24, fontStyle: 'italic' as const, opacity: 0.85,
  },

  // ── Social Links ──
  socialLinksRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8, justifyContent: 'center' as const, marginTop: 14 },
  socialLinkChip: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(184,137,26,0.2)', borderRadius: 3,
  },
  socialLinkText: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1.5, color: colors.fog },

  // ── Buttons ──
  editBtn: {
    backgroundColor: 'rgba(18,14,9,0.9)', borderWidth: 1.5, borderColor: 'rgba(184,137,26,0.3)',
    borderRadius: 4, paddingVertical: 12, paddingHorizontal: 24, ...effects.shadowSurface,
  },
  editBtnText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2.5, color: colors.sepia },
  settingsBtn: {
    backgroundColor: 'rgba(18,14,9,0.9)', borderWidth: 1.5, borderColor: 'rgba(184,137,26,0.3)',
    borderRadius: 4, paddingVertical: 12, paddingHorizontal: 16, justifyContent: 'center' as const, alignItems: 'center' as const, ...effects.shadowSurface,
  },
  followBtn: { 
    marginTop: 14, backgroundColor: 'rgba(18,14,9,0.9)', borderWidth: 1.5, borderColor: 'rgba(184,137,26,0.4)', 
    borderRadius: 4, paddingVertical: 14, paddingHorizontal: 32, ...effects.shadowSurface,
  },
  followingBtn: { backgroundColor: 'rgba(5,3,2,0.95)', borderWidth: 1.5, borderColor: 'rgba(184,137,26,0.2)' },
  followBtnText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2.5, color: colors.silverScreen, textAlign: 'center' as const, ...effects.textGlowSepia },
  followingBtnText: { color: colors.fog, textShadowRadius: 0 },
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
  statCard: { flex: 1, paddingVertical: 16, paddingHorizontal: 4, alignItems: 'center' as const },
  statValue: { fontFamily: fonts.display, fontSize: 18, color: colors.silverScreen, lineHeight: 22, ...effects.textGlowSepia },
  statLabel: { fontFamily: fonts.sub, fontSize: 7, letterSpacing: 1.5, color: colors.fog, marginTop: 4, opacity: 0.8 },
  statDivider: { width: 1.5, height: 32, backgroundColor: 'rgba(184,137,26,0.15)' },

  // ── The Sealed Dossier (private accounts) ──
  sealedWrap: { paddingHorizontal: 24, paddingVertical: 48, backgroundColor: colors.ink },
  sealedCard: {
    borderWidth: 1, borderStyle: 'dashed' as const, borderColor: 'rgba(184,137,26,0.35)',
    borderRadius: 4, backgroundColor: colors.sepiaFaint,
    paddingVertical: 28, paddingHorizontal: 20, alignItems: 'center' as const,
  },
  sealedTitle: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 3, color: colors.sepia, marginBottom: 10 },
  sealedBody: { fontFamily: fonts.bodyItalic, fontSize: 11, color: colors.bone, opacity: 0.85, textAlign: 'center' as const, lineHeight: 19 },

  // ── Plate sections (favorites/recent on solid ground) ──
  plateSections: { paddingHorizontal: 16 },

  // ── Section Label ──
  sectionLabelText: {
    fontFamily: fonts.sub, fontSize: 8, letterSpacing: 3, color: colors.sepia,
    textAlign: 'center' as const, ...effects.textGlowSepia,
  },

  // ── Gold Divider ──
  goldDivider: { height: 1, backgroundColor: 'rgba(184,137,26,0.2)', marginBottom: 14 },

  // ── Recently Watched poster overlays ──
  posterImg: { width: '100%' as const, height: '100%' as const, borderRadius: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(184,137,26,0.2)' },
  posterBottomGrad: {
    position: 'absolute' as const, bottom: 0, left: 0, right: 0,
    padding: 4, flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'flex-end' as const,
    backgroundColor: 'rgba(0,0,0,0.65)', borderBottomLeftRadius: 4, borderBottomRightRadius: 4,
    overflow: 'hidden' as const, flexWrap: 'wrap' as const,
  },
  posterRating: { fontFamily: fonts.sub, fontSize: 9, color: colors.sepia },
  posterTimeAgo: { fontFamily: fonts.sub, fontSize: 7, letterSpacing: 1, color: colors.fog },

  // ── Tier Borders (Shadows Purged) ──
  auteurGlow: {
    borderWidth: 1, borderColor: 'rgba(107,26,10,0.8)', borderRadius: 2, borderStyle: 'solid' as const,
  },
  archivistGlow: {
    borderWidth: 1, borderColor: 'rgba(196,150,26,0.5)', borderRadius: 2, borderStyle: 'solid' as const,
  },

  // ── Collection Grid ──
  collectionGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 10, justifyContent: 'center' as const },
  // Width is computed in pixels at the call site — the '31%'-of-a-widthless-
  // wrapper collapse is dead. minHeight keeps all six rooms in perfect rows.
  collectionCard: {
    alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8,
    minHeight: 122, paddingVertical: 18, paddingHorizontal: 6,
    backgroundColor: 'rgba(10,8,5,0.85)', borderWidth: 1.5, borderColor: 'rgba(184,137,26,0.2)', borderRadius: 6,
    ...effects.shadowSurface,
  },
  roomKey: { position: 'absolute' as const, top: 8, right: 9, zIndex: 2 },
  roomKeyDim: { opacity: 0.75 },
  ascendBtn: { marginTop: 18, backgroundColor: colors.sepia, borderRadius: 2, paddingVertical: 11, paddingHorizontal: 24 },
  ascendBtnText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2.5, color: colors.ink },
  collectionIconCircle: {
    width: 42, height: 42, borderRadius: 21, borderWidth: 1.5, borderColor: 'rgba(184,137,26,0.25)',
    backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center' as const, justifyContent: 'center' as const,
    ...effects.shadowSurface,
  },
  collectionCardLabel: { fontFamily: fonts.sub, fontSize: 10, color: colors.silverScreen, textAlign: 'center' as const, letterSpacing: 1.5 },
  collectionCardDesc: { fontFamily: fonts.sub, fontSize: 7, letterSpacing: 1.5, color: colors.fog },
  collectionCardCount: { fontFamily: fonts.display, fontSize: 22, color: colors.sepia, ...effects.textGlowSepia },
  collectionCardWide: {
    flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const,
    paddingVertical: 16, borderWidth: 1.5, borderColor: 'rgba(184,137,26,0.2)',
    borderRadius: 6, backgroundColor: 'rgba(15,10,5,0.85)',
    ...effects.shadowSurface,
  },

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
  emptyIcon: { fontSize: 40, color: colors.sepia, marginBottom: 16, opacity: 0.6 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 15, color: colors.parchment, marginBottom: 8 },
  emptyDesc: { fontFamily: fonts.body, fontSize: 10, color: colors.fog, textAlign: 'center' as const, lineHeight: 16, fontStyle: 'italic' as const },

  // ── Stacks ──
  stacksGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 10 },
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

  // ── Account Section ──
  accountRow: {
    paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(184,137,26,0.15)',
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8,
  },
  accountRowText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2, color: colors.bone },
  doorCountBadge: { marginLeft: 'auto' as const, minWidth: 22, paddingHorizontal: 7, height: 20, borderRadius: 10, backgroundColor: colors.sepia, alignItems: 'center' as const, justifyContent: 'center' as const },
  doorCountText: { fontFamily: fonts.sub, fontSize: 10, color: colors.ink, includeFontPadding: false },

  // ── Early Return States ──
  centeredFull: { justifyContent: 'center' as const, alignItems: 'center' as const },
  centeredPadded: { justifyContent: 'center' as const, alignItems: 'center' as const, padding: 40 },
  loadingRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  loadingText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 3, color: colors.sepia },
  notFoundIcon: { marginBottom: 16, opacity: 0.4 },
  notFoundTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.parchment, marginBottom: 8 },
  notFoundBody: { fontFamily: fonts.body, fontSize: 11, color: colors.fog, fontStyle: 'italic' as const, textAlign: 'center' as const, marginBottom: 24 },
  privateBody: { fontFamily: fonts.body, fontSize: 12, color: colors.bone, opacity: 0.7, textAlign: 'center' as const, lineHeight: 18, marginBottom: 24 },
  ghostBtnRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },

  // ── SectionLabel ──
  sectionLabelWrap: { alignItems: 'center' as const, flexDirection: 'row' as const, justifyContent: 'center' as const, gap: 6, marginBottom: 12 },

  // ── Tab Header ──
  tabHeaderTextWrap: { flex: 1 },
  tabHeaderUsername: { fontFamily: fonts.sub, fontSize: 7, letterSpacing: 2.5, color: colors.fog },
  tabHeaderTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.parchment, lineHeight: 22 },
  tabScrollContent: { paddingBottom: 80, paddingTop: 8 },
  tabContentPad: { paddingHorizontal: 16 },
  tabGap: { gap: 28 },
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
  projectorGap: { gap: 32 },
  projectorHeader: { alignItems: 'center' as const, paddingHorizontal: 16, paddingTop: 8 },
  projectorSuper: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2.5, color: colors.sepia, marginBottom: 6 },
  projectorTitle: { fontFamily: fonts.display, fontSize: 24, color: colors.parchment, lineHeight: 28, textAlign: 'center' as const },
  projectorSub: { fontFamily: fonts.body, fontSize: 11, color: colors.fog, fontStyle: 'italic' as const, marginTop: 6 },
  projectorSectionsWrap: { paddingHorizontal: 16, gap: 32 },

  // ── Favourites ──
  favPosterThumb: { width: 28, height: 42, borderRadius: 2 },
  favTextWrap: { flex: 1 },
  favTitle: { fontFamily: fonts.sub, fontSize: 11, color: colors.parchment, lineHeight: 14 },
  favRatingRow: { flexDirection: 'row' as const, gap: 2, marginTop: 2 },

  // ── Calendar ──
  comingSoonText: { fontFamily: fonts.body, fontSize: 11, color: colors.fog, textAlign: 'center' as const, fontStyle: 'italic' as const },
  emptyLockIcon: { marginBottom: 12, opacity: 0.5 },

  // ── Avatar ──
  avatarPlaceholder: { backgroundColor: '#050402', justifyContent: 'center' as const, alignItems: 'center' as const },
  avatarInitial: { fontFamily: fonts.display, fontSize: 36, color: colors.sepia },

  // ── Level Badge ──
  levelBadgeRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },

  // ── Username Row ──
  usernameRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginTop: 8, flexWrap: 'wrap' as const, justifyContent: 'center' as const },

  // ── Edit Row ──
  editRow: { flexDirection: 'row' as const, gap: 8, justifyContent: 'center' as const, marginTop: 14 },

  // ── Profile Action Row (follow + more) ──
  profileActionRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, justifyContent: 'center' as const, marginTop: 14 },
  moreBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, paddingHorizontal: 10, paddingVertical: 8, marginLeft: 8 },

  // ── Triptych ──
  triptychWrap: { width: '100%' as const, maxWidth: 380, alignSelf: 'center' as const, marginTop: 16 },
  triptychWrapRecent: { width: '100%' as const, maxWidth: 380, alignSelf: 'center' as const, marginTop: 20 },
  recentRow: { flexDirection: 'row' as const, gap: 8 },
  recentItem: { flex: 1 },

  // ── Content Area ──
  contentArea: { backgroundColor: colors.ink },
  collectionSection: { paddingHorizontal: 16, marginTop: 8, paddingBottom: 24 },
  collectionCardDisabled: { opacity: 0.3 },
  collectionCardHighlight: { borderColor: 'rgba(184,137,26,0.25)' },
  collectionIconHighlight: { backgroundColor: 'rgba(184,137,26,0.1)' },
  collectionHighlightText: { color: colors.sepia },

  // ── Calendar CTA ──
  calendarCtaWrap: { paddingHorizontal: 16, marginBottom: 24 },
  calendarCtaText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2, color: colors.fog },
  lockIconMr: { marginRight: 6 },

  // ── Account ──
  accountSection: { paddingHorizontal: 16, paddingBottom: 40 },
  accountRowLast: { borderBottomWidth: 0 },

  // ── Main Scroll ──
  mainScrollContent: { paddingBottom: 60 },

  // ── Founder's Mark ──
  founderMark: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginTop: 6, marginBottom: 2,
  },
  founderLine: {
    flex: 1, height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(184,137,26,0.25)',
  },
  founderText: {
    fontFamily: fonts.sub, fontSize: 7, letterSpacing: 2.5,
    color: 'rgba(184,137,26,0.7)', textAlign: 'center' as const,
  },

  // ── Member Since ──
  memberSince: {
    fontFamily: fonts.sub, fontSize: 6.5, letterSpacing: 2,
    color: colors.fog, opacity: 0.6, marginBottom: 4,
  },

  // ── Society Seal ──
  societySealWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 32, paddingVertical: 20,
  },
  sealLine: {
    flex: 1, height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(184,137,26,0.2)',
  },
  sealCenter: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  sealText: {
    fontFamily: fonts.sub, fontSize: 7, letterSpacing: 3,
    color: 'rgba(184,137,26,0.45)',
  },
});
