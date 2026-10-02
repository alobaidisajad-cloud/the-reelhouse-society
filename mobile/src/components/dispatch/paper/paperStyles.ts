import { StyleSheet } from 'react-native';
import { colors, fonts, effects } from '@/src/theme/theme';
import {
  DOC_MARGIN, DOC_PAD, DOC_RAIL, POST_PAD_V, RULE_W, RULE_GAP, AVATAR,
  BYLINE_INDENT, MARGIN_W,
  CHROME_PAD_V, CHROME_PAD_H, CRIMSON_INK, PAPER_MAX, KIND_RULE,
} from './paperMetrics';
import { EDGE_LIT } from '@/src/theme/light';

// Measured on the rendered page against what is painted behind, not computed:
// at these opacities quiet lines and inactive index labels clear 4.5:1.
export const QUIET = 0.82;
export const INDEX_INACTIVE = 0.78;

export const p = StyleSheet.create({
  // ── the page ──────────────────────────────────────────────────────────────
  /** The house ground. The paper (`doc`) is a lit step above it, so the sheet has an edge. */
  screen: { flex: 1, backgroundColor: colors.ink },
  /** Transparent: a desk mounts in a screen lit by its room, and a page would hide the light. */
  desk: { flex: 1 },

  /** Centred; the screen caps it at PAPER_MAX, so a tablet does not set forty words to a line. */
  docWrap: { flex: 1, alignSelf: 'center', width: '100%' },
  /**
   * The sheet. It reaches the foot even when empty, or an empty section ends
   * mid-screen with its rails in mid-air. One shadow on this one element, not
   * per row, so iOS pays for one offscreen pass; on a tablet it is the sheet's
   * edge against the desk around it. No paper texture: on a near-black page
   * grain reads as noise on the lens, not as pulp.
   */
  doc: { ...EDGE_LIT,
    flex: 1, minHeight: 0,
    backgroundColor: colors.soot,
    marginHorizontal: DOC_MARGIN,
    paddingHorizontal: DOC_PAD,
    borderLeftWidth: DOC_RAIL,
    borderRightWidth: DOC_RAIL,
    borderColor: colors.sepiaBorder,
    ...effects.shadowSurface, ...effects.flat,
  },
  docTop: {
    borderTopWidth: DOC_RAIL,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    paddingTop: 24,
    ...effects.shadowSurface, ...effects.flat,
  },

  // ── the one row of chrome ─────────────────────────────────────────────────
  chrome: { ...EDGE_LIT,
    flexDirection: 'row',
    alignItems: 'stretch',
    // Centres the capped index on the main axis (alignSelf on a row child centres vertically).
    justifyContent: 'center',
    backgroundColor: colors.soot,
    borderBottomWidth: 1,
    borderBottomColor: colors.sepiaBorder,
  },
  /** Capped and centred on the paper's measure: on a tablet the index sits over its page. */
  chromeWrap: {
    flexDirection: 'row', alignItems: 'stretch',
    width: '100%', maxWidth: PAPER_MAX, alignSelf: 'center',
  },
  /** Clips, so the index's last department never paints under the archive's mark beside it. */
  chromeIndex: { flex: 1, minWidth: 0, overflow: 'hidden', paddingHorizontal: CHROME_PAD_H },
  /**
   * The archive's mark, outside the index's scroll: centred on the stretched
   * row, and ending where the page's margin does.
   */
  chromeArchive: {
    justifyContent: 'center', alignItems: 'center',
    paddingLeft: 4, paddingRight: CHROME_PAD_H,
  },
  chromeRow: { flexDirection: 'row', alignItems: 'center' },
  indexItem: {
    paddingVertical: CHROME_PAD_V,
    paddingHorizontal: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  indexLabel: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.9,
    color: colors.bone, opacity: INDEX_INACTIVE, includeFontPadding: false,
  },
  /** Strength only; the colour is the section's own (SECTION_COLOR). */
  indexLabelOn: { opacity: 1 },
  /** `indexLabel`'s token: later in the style array, any other number here would win. */
  indexLabelOff: { opacity: INDEX_INACTIVE },
  indexDot: {
    fontFamily: fonts.sub, fontSize: 8.5, color: colors.sepia, opacity: 0.62,
    includeFontPadding: false,
  },
  // Over the index's trailing edge on both platforms: iOS stacks by zIndex and
  // Android by elevation, so the two match. 2 clears the index (no elevation)
  // and stays under this file's raised surfaces (6 and 4).
  chromeFade: {
    position: 'absolute', right: 0, top: 0, bottom: 0, width: 26,
    zIndex: 2, elevation: 2,
  },
  toolLabel: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.2,
    color: colors.fog, includeFontPadding: false,
  },

  // ── masthead ──────────────────────────────────────────────────────────────
  mast: { alignItems: 'center' },
  mastRuleTop: {
    width: '100%', height: 6, marginBottom: 12, opacity: 0.6,
    borderTopWidth: 3, borderTopColor: colors.sepia,
    borderBottomWidth: 1, borderBottomColor: 'rgba(184,137,26,0.25)',
  },
  mastRuleBottom: {
    width: '100%', height: 6, marginBottom: 12, opacity: 0.6,
    borderTopWidth: 1, borderTopColor: 'rgba(184,137,26,0.25)',
    borderBottomWidth: 3, borderBottomColor: colors.sepia,
  },
  mastTitle: {
    fontFamily: fonts.display, fontSize: 36, lineHeight: 42, letterSpacing: 2.2,
    color: colors.silverScreen, textAlign: 'center', marginBottom: 12,
    ...effects.textGlowSepia, textShadowRadius: 30,
  },
  mastMetaRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, flexWrap: 'wrap', marginBottom: 12,
  },
  mastMeta: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6,
    color: colors.sepia, includeFontPadding: false,
  },
  pip: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.bloodReel, opacity: 0.85 },
  mastSub: {
    fontFamily: fonts.bodyItalic, fontSize: 12.5, letterSpacing: 0.8,
    color: colors.bone, opacity: QUIET, textAlign: 'center',
  },

  /**
   * The running head: the issue number and the day, with the page's tools
   * (sort, saved) on the right, where a printed page keeps its apparatus.
   */
  runHead: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingTop: 12, paddingBottom: 8,
    borderBottomWidth: 1, borderBottomColor: 'rgba(184,137,26,0.25)',
  },
  /** Yields to the pinned tools by wrapping (two lines, PaperFrame), never by an ellipsis:
   *  cut from the end, AUGUST 28 reads AUGUST 2 — a wrong date, not a shorter one. */
  runHeadText: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1, color: colors.sepia, includeFontPadding: false, flex: 1, minWidth: 0,
  },
  runHeadTools: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  // ── ornament / dividers ───────────────────────────────────────────────────
  orn: { flexDirection: 'row', alignItems: 'center', gap: 8, opacity: 0.5, marginVertical: 24 },
  ornLine: { flex: 1, height: 1, backgroundColor: colors.sepia },
  ornDiamond: { width: 6, height: 6, backgroundColor: colors.sepia, transform: [{ rotate: '45deg' }] },
  /** A definite rule between stories, so the space between them need not do the separating. */
  hair: { height: 1, backgroundColor: 'rgba(184,137,26,0.25)' },

  /** A member's writing in its own direction (isRTLText); the chrome stays English. */
  rtlText: { writingDirection: 'rtl', textAlign: 'right' } as import('react-native').TextStyle,
  /** Centred writing (a ballot's question): only the direction turns, so it stays centred. */
  rtlDirection: { writingDirection: 'rtl' } as import('react-native').TextStyle,
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 16, paddingBottom: 8, opacity: 0.92 },
  /** Thin over thick, as a printed section break is set. */
  dayLine: {
    flex: 1, height: 4,
    borderTopWidth: 1, borderTopColor: colors.sepia,
    borderBottomWidth: 2, borderBottomColor: colors.sepia,
    opacity: 0.4,
  },
  dayLabel: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6,
    color: colors.sepia, includeFontPadding: false,
  },

  // ── a post ────────────────────────────────────────────────────────────────
  /** Clips, so a film's art set behind the block cannot bleed into its neighbours. */
  post: { paddingVertical: POST_PAD_V, position: 'relative', overflow: 'hidden' },
  kind: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6,
    color: colors.sepia, marginBottom: 8, includeFontPadding: false,
  },

  /** The letters page: what orders the page in a margin, the writing in a column, a rule. */
  postRow: { flexDirection: 'row', alignItems: 'flex-start' },
  /** paddingTop 6 sets the value on the byline name's line; paddingEnd mirrors in Arabic. */
  margin: { width: MARGIN_W, alignItems: 'flex-end', paddingTop: 6, paddingEnd: 6 },
  marginValue: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.6,
    color: colors.sepia, includeFontPadding: false,
  },
  /** The dash where nothing orders a post: as readable as the counts it stands in for. */
  marginNil: { color: colors.bone, opacity: 0.75 },
  /** The column's leading edge is the rule between what the app knows and what a member
   *  wrote. It is always there; rank changes its material (`columnRanked`, `rankRule`). */
  column: {
    flex: 1, minWidth: 0,
    paddingLeft: RULE_GAP, borderLeftWidth: RULE_W,
    borderLeftColor: colors.sepiaBorder,
  },
  /** A ranked rule is painted by `rankRule`; the border steps aside, not printing a second. */
  columnRanked: { borderLeftColor: 'transparent' },
  /** The rank's rule, brass ramp or crimson, runs along its length: across 3pt it is flat. */
  rankRule: { position: 'absolute', left: -RULE_W, top: 0, bottom: 0, width: RULE_W },


  /** The largest thing on a post, at full parchment: the words a member wrote. */
  take: {
    fontFamily: fonts.serifItalic, fontSize: 16.5, lineHeight: 28,
    color: colors.parchmentBright,
  },
  /**
   * A question is the member's own voice, so it is set as a take is. The rule:
   * a member's voice (take, seeking) is serif italic; a wire, reported from
   * elsewhere, the plain face; a headline (ballot, dossier) the display face.
   */
  seeking: {
    fontFamily: fonts.serifItalic, fontSize: 16.5, lineHeight: 28,
    color: colors.parchmentBright,
  },
  /**
   * Every kind names itself here, in one face and size, quieter than the
   * writing it introduces. The colour is the kind's own, given where it is drawn.
   */
  leadIn: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6, fontStyle: 'normal',
    includeFontPadding: false,
  },
  seekingLead: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6, color: KIND_RULE.seeking, includeFontPadding: false },
  wire: { fontFamily: fonts.body, fontSize: 13.5, lineHeight: 20.5, color: colors.parchment },
  /** Generated, never typed: the most authoritative place on the page is not free text. */
  wireDateline: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6, color: KIND_RULE.wire, includeFontPadding: false },
  wireSource: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.9, color: colors.fog,
    marginTop: 8, paddingLeft: BYLINE_INDENT, includeFontPadding: false,
  },

  /** A still is a lit frame: the art, a scrim that keeps the type legible, a hairline. */
  still: { ...EDGE_LIT,
    borderRadius: 3, marginBottom: 12, overflow: 'hidden',
    backgroundColor: colors.soot,
    borderWidth: 1, borderColor: 'rgba(240,232,176,0.16)',
    ...effects.shadowSurface, ...effects.flat,
  },
  /** Held back: a raw frame at full strength would make this page look like another app. */
  stillArt: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%', opacity: 0.46 },
  stillScrim: { ...StyleSheet.absoluteFillObject },


  // ── byline ────────────────────────────────────────────────────────────────
  byline: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 0, marginBottom: 8,
    // No flexWrap: in a wrapping row an item moves down instead of shrinking,
    // so the trail would stop truncating and the byline would take two lines.
  },
  /** WITHDRAW on your critique: a log's `commWithdraw` colour, one act (held so by logSurfaces). */
  critiqueWithdraw: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.8,
    color: colors.danger, includeFontPadding: false,
  },
  avatar: {
    width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2,
    borderWidth: 1, borderColor: 'rgba(240,232,176,0.22)',
    backgroundColor: colors.tarnish,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  /** The ring carries the member's rank: brass for an Archivist… */
  avatarArchivist: { borderColor: colors.champagne, borderWidth: 1.5 },
  /** …crimson for an Auteur, as the profile draws one. */
  avatarAuteur: { borderColor: colors.crimson, borderWidth: 1.5 },
  /** No picture: a monogram in the display face. */
  avatarMark: {
    fontFamily: fonts.display, fontSize: 11, lineHeight: 13,
    color: colors.parchmentBright,
    // Keeps includeFontPadding: a reading face never strips it, or a tall glyph
    // clips on Android (feedRowIsRecyclable).
  },
  /** A credit, not a headline: dimmer than the writing, so the eye reaches the words first. */
  bylineName: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.9,
    color: colors.bone, includeFontPadding: false,
    // Gives first (1000× the trail), down to 56pt — about nine characters, still a name.
    flexShrink: 1000, minWidth: 56,
  },
  /** An Auteur's name in crimsonInk, the crimson for words (5.4:1). Frozen: no row allocates it. */
  bylineNameAuteur: { color: colors.crimsonInk, opacity: 1 },
  /**
   * Read time, source, count: facts found nowhere else on the screen, so they
   * give only after the name reaches its floor. Shrink 1, not a tiny factor:
   * factors summing below 1 absorb only that share of a shortfall.
   */
  bylineTrail: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.9,
    color: colors.fog, includeFontPadding: false,
    flexShrink: 1, minWidth: 0,
  },

  // ── the plate ─────────────────────────────────────────────────────────────
  plateGlow: {
    shadowColor: colors.sepia, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55, shadowRadius: 12, elevation: 6,
  },
  plateArt: { width: '100%', height: '100%' },
  /** Held back: a bright poster is otherwise the loudest thing on a page of ink and brass. */
  artHeld: { opacity: 0.86 },
  /** The feed's credit: a thumbnail and one line. The full poster is on the post page. */
  credit: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  creditArt: {
    width: 18, height: 27, borderRadius: 1.5, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(240,232,176,0.28)',
    backgroundColor: colors.soot,
  },
  /** Gap 6 before the "·", as the byline spaces it: in the layout, not padded in the string. */
  creditWords: { flexDirection: 'row', alignItems: 'baseline', gap: 6, flexShrink: 1, minWidth: 0 },
  /** `flexShrink: 1`, not `flex: 1`: a short title keeps its year beside it, not at the edge. */
  creditText: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.9, color: colors.bone,
    includeFontPadding: false, flexShrink: 1, minWidth: 0,
  },
  /** Fixed. Never shrinks, never truncates — see the note in `Credit`. */
  creditYear: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.9, color: colors.bone,
    includeFontPadding: false, flexShrink: 0,
  },

  // ── the action row ────────────────────────────────────────────────────────
  /**
   * Four equal quarters (`action` is flex: 1), each an icon above its label.
   * Above the icon a label has the quarter's whole width; beside it, CERTIFIED
   * would be cut. No tray of tiles: on a continuous page that is a button bar.
   */
  actions: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 8,
  },
  /** The filing's closing rule in its own ink, faint: where the entry ends, not what it was. */
  entryEnd: { height: 1, marginTop: 12, opacity: 0.34 },
  action: {
    flex: 1, paddingBottom: 8,
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  /** A labelled field on a desk (a wire's SOURCE, a ballot's CLOSES), shared by every desk. */
  field: {
    marginTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(184,137,26,0.25)', paddingTop: 12,
  },
  fieldLabel: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.9, color: colors.sepia, marginBottom: 6, includeFontPadding: false,
  },
  fieldValue: { fontFamily: fonts.body, fontSize: 12.5, color: colors.parchment },

  /** A visitor's mark: dimmed, not removed, so the foot keeps its shape. 0.62 is 3.1:1. */
  actionOff: { opacity: 0.62 },
  /** Quieter than the writing above it: a control is not the sentence. */
  actionLabel: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.9,
    color: colors.fog, includeFontPadding: false,
  },
  /** Full strength: the certified label is the one that must be readable. */
  actionLabelOn: { color: CRIMSON_INK, opacity: 1 },
  actionLabelSaved: { color: colors.sepia },

  // ── THE REPLY ─────────────────────────────────────────────────────────────

  // ── the answer on a seeking post ──────────────────────────────────────────
  answer: {
    flexDirection: 'row', gap: 8, marginTop: 16, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: 'rgba(184,137,26,0.25)', borderStyle: 'dashed',
  },
  answerBody: {
    fontFamily: fonts.bodyItalic, fontSize: 12.5, lineHeight: 21,
    color: colors.bone, marginTop: 6,
  },

  /**
   * ANSWERED / FILED: a struck brass plate, as the film page's REWATCHED tab
   * is. Decorative, so it never scales and never clips its corner.
   */
  stamp: {
    borderRadius: 2, paddingVertical: 4, paddingHorizontal: 8,
    borderWidth: 1, borderColor: 'rgba(240,232,176,0.32)',
    // The -6° tilt paints outside the layout box by (h/2)·sin 6° ≈ 1pt a side;
    // 2pt of margin keeps it off the byline and the column's edge.
    marginHorizontal: 2,
    transform: [{ rotate: '-6deg' }], overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5, shadowRadius: 4, elevation: 4,
  },
  stampText: {
    fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 2.2,
    color: colors.ink, includeFontPadding: false,
  },
  /** WITHHELD is not an achievement, so it keeps the censor's crimson outline, not a plate. */
  stampCrimson: {
    borderColor: colors.crimson, backgroundColor: 'rgba(180,45,45,0.10)',
    shadowOpacity: 0,
  },
  stampTextCrimson: { color: CRIMSON_INK },

  // ── the ballot ────────────────────────────────────────────────────────────
  ballotHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  ballotClose: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.9, color: colors.fog, includeFontPadding: false },
  ballotQ: {
    fontFamily: fonts.display, fontSize: 20, lineHeight: 28,
    color: colors.parchment, textAlign: 'center', marginBottom: 4,
  },
  /** The ballot names itself on the line it prints, as the other kinds do. */
  ballotLead: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6, color: KIND_RULE.ballot, includeFontPadding: false },
  option: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  // 21 holds III., the widest of I–VI at 8.5pt in the sub face, with a point of
  // slack for the platforms' rendering.
  optionNo: { fontFamily: fonts.sub, fontSize: 8.5, color: colors.sepia, width: 21, includeFontPadding: false },
  box: { width: 13, height: 13, borderRadius: 1, borderWidth: 1.4, borderColor: KIND_RULE.ballot, alignItems: 'center', justifyContent: 'center' },
  boxMark: { fontFamily: fonts.sub, fontSize: 12.5, color: CRIMSON_INK, marginTop: -2, includeFontPadding: false },
  optionPoster: { overflow: 'hidden',
    width: 30, height: 45, borderRadius: 1,
    borderWidth: 1, borderColor: 'rgba(240,232,176,0.18)',
    backgroundColor: colors.soot,
  },
  optionTitle: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.9, color: colors.parchment, includeFontPadding: false },
  optionMeta: { fontFamily: fonts.sub, fontSize: 10, color: colors.fog, marginTop: 4, includeFontPadding: false },
  percent: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.8, color: colors.parchment, includeFontPadding: false },
  /** A rule that fills, not a coloured progress bar. */
  fillTrack: { height: 3, borderRadius: 2, backgroundColor: 'rgba(184,137,26,0.14)', marginTop: 6, overflow: 'hidden' },
  fillBar: { height: '100%', borderRadius: 2 },
  ballotFoot: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6, color: colors.fog,
    textAlign: 'center', marginTop: 12, includeFontPadding: false,
  },
  wonWrap: { alignItems: 'center', paddingTop: 6 },
  wonLabel: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6, color: colors.sepia, marginBottom: 12, includeFontPadding: false },
  wonPoster: { overflow: 'hidden',
    width: 74, height: 111, borderRadius: 2, marginBottom: 12,
    borderWidth: 1, borderColor: 'rgba(240,232,176,0.26)', backgroundColor: colors.soot,
  },
  wonTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.parchment, marginBottom: 6, textAlign: 'center' },
  wonMeta: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.9, color: colors.fog, includeFontPadding: false },

  // ── the dossier ───────────────────────────────────────────────────────────
  cover: { ...EDGE_LIT,
    height: 104, borderRadius: 2, marginBottom: 12,
    backgroundColor: colors.soot,
    borderWidth: 1, borderColor: 'rgba(232,223,208,0.09)',
  },
  dossierTitle: { fontFamily: fonts.display, fontSize: 20, lineHeight: 28, color: colors.parchment, marginBottom: 8 },
  /** A ballot's question on a card, set to the rule like a dossier's title (not `ballotQ`). */
  cardBallotQ: { fontFamily: fonts.display, fontSize: 20, lineHeight: 28, color: colors.parchment, marginBottom: 8 },
  dossierLead: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6, color: KIND_RULE.dossier, includeFontPadding: false },
  series: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.9, color: colors.sepia, marginTop: 8, includeFontPadding: false },

  // ── section head + empty ──────────────────────────────────────────────────

  /** Centred in its space: pinned under a heading, it reads as content that failed to load. */
  empty: { flex: 1, minHeight: 0, alignItems: 'center', paddingHorizontal: 4, paddingBottom: 6 },
  /** An empty page is ruled: rules above and below the notice, not behind it, filling by flex. */
  emptyRules: { alignSelf: 'stretch', flex: 1 },
  emptyRule: { flex: 1, borderBottomWidth: 1 },
  emptyTitle: {
    fontFamily: fonts.display, fontSize: 20, lineHeight: 28, color: colors.parchment, textAlign: 'center', marginBottom: 12, maxWidth: 288,
  },
  emptyBody: {
    fontFamily: fonts.bodyItalic, fontSize: 12.5, lineHeight: 21, color: colors.bone,
    opacity: QUIET, textAlign: 'center', marginBottom: 24, maxWidth: 264,
  },
  btn: { borderWidth: 1, borderColor: colors.sepia, borderRadius: 2, paddingVertical: 8, paddingHorizontal: 16 },
  btnText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6, color: colors.parchment, includeFontPadding: false },
  btnBrass: { borderColor: 'rgba(240,232,176,0.30)', overflow: 'hidden' },
  quiet: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6, color: colors.sepia, marginTop: 16, includeFontPadding: false },
  endRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 16 },
  endLine: { width: 32, height: 1, backgroundColor: colors.sepia, opacity: 0.35 },
  /** The ornament between the two end rules, defined once. */
  endMark: { color: colors.sepia, fontSize: 12.5, opacity: 0.7 },

  // ── skeletons ─────────────────────────────────────────────────────────────
  skRow: { paddingVertical: POST_PAD_V },
  skBar: { height: 8, borderRadius: 2, backgroundColor: 'rgba(184,137,26,0.06)', marginBottom: 8 },
  skAvatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, backgroundColor: 'rgba(184,137,26,0.06)' },
  skByline: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },

  // ── post page ─────────────────────────────────────────────────────────────
  /** The spine that appears once the post scrolls away, so you never lose what
   *  you are reading comments on. Tapping it returns to the top. */
  spine: { ...EDGE_LIT,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, paddingHorizontal: DOC_PAD,
    backgroundColor: colors.soot,
    borderBottomWidth: 1, borderBottomColor: colors.sepiaBorder,
  },
  /** Its own target behind a hairline: a thumb aiming to leave never lands on "to the top". */
  spineBack: { paddingRight: 8, marginRight: 2, borderRightWidth: 1, borderRightColor: 'rgba(184,137,26,0.25)' },
  // The same hairline facing the other way: the bar reads as three parts.
  spineMore: { paddingLeft: 8, marginLeft: 2, borderLeftWidth: 1, borderLeftColor: 'rgba(184,137,26,0.25)' },

  // The ground closes the sheet when touched, as every sheet in the app does.
  sheetHost: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'flex-end' },
  sheetGround: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(6,5,4,0.72)' },
  /** What is being shared, named, so the sheet is about a thing and not a verb. */
  sharePreview: {
    fontFamily: fonts.serifItalic, fontSize: 14, lineHeight: 21,
    color: colors.parchment, paddingHorizontal: 4,
  },
  spineBody: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  spineKind: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.2, color: colors.sepia, includeFontPadding: false },
  spineText: { fontFamily: fonts.serifItalic, fontSize: 12.5, color: colors.bone, flex: 1 },
  spineCount: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.9, color: colors.fog, includeFontPadding: false },

  critiqueHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 4 },
  critiqueLabel: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6, color: colors.sepia, includeFontPadding: false },
  critiqueSortRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  critiqueSort: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.9, color: colors.bone, opacity: INDEX_INACTIVE, includeFontPadding: false },
  critiqueSortOn: { color: colors.parchment, opacity: 1 },

  comment: { flexDirection: 'row', gap: 8, paddingVertical: 12, borderTopWidth: 1, borderTopColor: 'rgba(184,137,26,0.14)' },
  commentName: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.9, color: colors.bone, marginBottom: 4, includeFontPadding: false },
  commentBody: { fontFamily: fonts.serif, fontSize: 13.5, lineHeight: 21, color: colors.parchment },
  commentMeta: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.9, color: colors.fog, marginTop: 6, includeFontPadding: false },
  commentMine: { backgroundColor: 'rgba(184,137,26,0.06)' },
  topMark: { color: colors.sepia },

  /** One docked thing, ever: the composer replaces the action bar. */
  dock: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 12, paddingHorizontal: 16,
    borderTopWidth: 1, borderTopColor: colors.sepiaBorder,
    backgroundColor: colors.ink,
  },
  dockCompose: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingTop: 12, paddingHorizontal: 16,
    borderTopWidth: 1, borderTopColor: colors.sepiaBorder,
    backgroundColor: colors.ink,
  },
  dockInput: { flex: 1, fontFamily: fonts.serif, fontSize: 13.5, color: colors.fog },

  // ── the copy desk ─────────────────────────────────────────────────────────
  /**
   * The copy desk's head. The composer IS the printed post: you type onto the
   * sheet in the face it prints in, with your byline and hour already on it.
   */
  ch: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: colors.sepiaBorder,
    backgroundColor: colors.ink,
  },
  chs: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.2, color: colors.fog, includeFontPadding: false },
  chsGo: { color: colors.parchment },
  chm: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2.2, color: colors.sepia, includeFontPadding: false },

  /**
   * The desk's document fills the writing area, framed as the feed's sheet is.
   * It clips: React Native paints overflow out of a View, and the tool rail is
   * the next sibling down (PaperDeskDoc scrolls it, clear of the rail).
   */
  deskDoc: { ...EDGE_LIT,
    flex: 1, minHeight: 0, overflow: 'hidden',
    marginHorizontal: DOC_MARGIN, paddingHorizontal: DOC_PAD, paddingTop: 16,
    backgroundColor: colors.soot,
    borderLeftWidth: DOC_RAIL, borderRightWidth: DOC_RAIL,
    borderColor: colors.sepiaBorder,
  },
  caret: { color: colors.sepia },
  railTool: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },

  sheet: { ...EDGE_LIT,
    backgroundColor: colors.soot, borderWidth: 1, borderColor: colors.sepiaBorder,
    paddingHorizontal: 16, paddingVertical: 4, ...effects.shadowSurface, ...effects.flat,
  },
  /** The tool rail sits above the keyboard, where the writing room already puts
   *  its toolbar — outside the sheet, so the printed page stays clean. */
  rail: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: colors.sepiaBorder,
    backgroundColor: colors.ink,
  },
  rl: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.2, color: colors.bone, includeFontPadding: false },
  kbd: { ...EDGE_LIT,
    height: 210, backgroundColor: colors.keyWell,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  kbdLabel: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6, color: colors.fogQuiet, includeFontPadding: false },

  // ── states ────────────────────────────────────────────────────────────────
  /** Spoilered text is NOT DRAWN. A blur can be sharpened; an absent node cannot. */
  veil: {
    borderWidth: 1, borderColor: 'rgba(184,137,26,0.25)', borderStyle: 'dashed',
    borderRadius: 2, paddingVertical: 16, paddingHorizontal: 16, alignItems: 'center',
  },
  veilText: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6, lineHeight: 17.5,
    color: colors.bone, textAlign: 'center', marginBottom: 12, includeFontPadding: false,
  },
  veilAction: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6, color: colors.sepia, includeFontPadding: false },
  /** Flush left, like every other line on the page. */
  removedText: { fontFamily: fonts.bodyItalic, fontSize: 12.5, color: colors.fogQuiet },
});
