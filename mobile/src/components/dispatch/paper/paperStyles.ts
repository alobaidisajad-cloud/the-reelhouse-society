import { StyleSheet } from 'react-native';
import { colors, fonts, effects } from '@/src/theme/theme';
import {
  DOC_MARGIN, DOC_PAD, DOC_RAIL, POST_PAD_V, RULE_W, RULE_GAP, AVATAR,
  BYLINE_INDENT, MARGIN_W,
  CHROME_PAD_V, CHROME_PAD_H, CRIMSON_INK, PAPER_MAX, KIND_RULE,
} from './paperMetrics';

/**
 * ── THE CONTRAST FLOOR ───────────────────────────────────────────────────────
 * These were COMPUTED, and then the computation was checked by measuring the
 * rendered page — which is how I found that my arithmetic had been optimistic
 * every time.
 *
 * I had written that an inactive index label at `bone` 0.6 was "~4.8:1". The
 * real composite, measured against what is actually painted behind it, is
 * **3.54:1**. Not a rumour any more, but still under the floor, and it is the
 * page's navigation. Seven values in this file were wrong in the same
 * direction, all of them apparatus:
 *
 *      index label  3.54 -> 4.62      running head  3.73 -> 4.86
 *      index dots   1.52 -> 3.10      day divider   3.58 -> 4.71
 *      quiet line   4.02 -> 4.58      the whisper   3.73 -> 4.90
 *      member no.   4.09 -> 8.90
 *
 * The lesson is not "raise the opacities". It is that a contrast number nobody
 * measured is a guess, and every guess here leaned the same way — towards the
 * atmospheric — because that is the direction that looks better in isolation.
 */
export const QUIET = 0.82;
export const INDEX_INACTIVE = 0.78;

export const p = StyleSheet.create({
  // ── the page ──────────────────────────────────────────────────────────────
  /**
   * ── THE GROUND IS THE RECESS, NOT MORE PAPER ─────────────────────────────
   * This was `ink` — the same near-black as the document, so the paper and the
   * surface it lies on were one colour and the sheet had no edge. Invisible on
   * a phone, where the margins are 12pt. Ruinous on a tablet, where 137pt of it
   * shows on either side and the whole composition depends on reading as a
   * sheet ON something.
   *
   * `inkwell` is the app's own token for this, and its definition in the theme
   * says so in as many words: "the recess UNDER the paper". It was sitting
   * there the whole time being used for deck bars. Five points darker on every
   * channel — nothing on a phone but a whisper, and on a tablet the difference
   * between a broadsheet on a desk and a strip in a void.
   */
  screen: { flex: 1, backgroundColor: colors.inkwell },
  /**
   * ── A SHORT PAGE STILL REACHES THE FOOT ──────────────────────────────────
   * A post with two critiques left its closing mark stranded halfway up the
   * sheet with five hundred points of empty page beneath it. In the app this is
   * `contentContainerStyle={{ flexGrow: 1 }}` with this spacer before the
   * footer: when the thread is long it measures nothing, and when it is short
   * it pushes the foot down to where a foot belongs.
   */
  fill: { flexGrow: 1 },
  ambient: { position: 'absolute', top: 0, left: 0, right: 0, height: 360 },

  /**
   * The document. Capped and centred so a tablet does not set forty words to a
   * line; on every phone the cap is inert and this is the full width.
   */
  docWrap: { flex: 1, alignSelf: 'center', width: '100%' },
  /**
   * ── THE PAGE REACHES THE BOTTOM ──────────────────────────────────────────
   *  is not layout housekeeping here, it is the difference between a
   * page and a scrap. Without it the document ended wherever the content did
   * and raw ink showed beneath it, side rails stopping in mid-air. On a full
   * feed you never see it; on every EMPTY section, on day one, and on the copy
   * desk you always do — which is exactly when the page can least afford to
   * look broken.
   */
  /**
   * ── THE SHEET SITS ON SOMETHING ──────────────────────────────────────────
   * On a phone the paper is 12pt from each edge and the rails do all the work.
   * On a tablet `PAPER_MAX` leaves 137pt of ground either side — and that
   * ground was never designed, it was simply unlit. The result read as a phone
   * layout stranded in a window rather than a broadsheet on a reading desk,
   * which is what the cap's own comment claims it is.
   *
   * The app already owns the answer: `shadowSurface`, the token every lifted
   * surface in this app uses. One shadow, on ONE element — not per row, so the
   * offscreen pass it costs on iOS is paid once for the whole page. On a phone
   * it is a whisper at the rails; on a tablet it is the edge of a sheet lying
   * on a desk, and the empty ground becomes the desk rather than a void.
   */
  doc: {
    flex: 1, minHeight: 0,
    backgroundColor: 'rgba(8,6,4,0.98)',
    marginHorizontal: DOC_MARGIN,
    paddingHorizontal: DOC_PAD,
    borderLeftWidth: DOC_RAIL,
    borderRightWidth: DOC_RAIL,
    borderColor: colors.sepiaBorder,
    ...effects.shadowSurface,
  },
  docTop: {
    borderTopWidth: DOC_RAIL,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    paddingTop: 24,
    ...effects.shadowSurface,
  },
  /**
   * ── THERE IS NO SURFACE, AND THAT IS THE DECISION ────────────────────────
   * A `grain` token sat here unused for the whole design, so I finally built
   * what it was waiting for: a generated paper stock, tiled, static. It
   * rendered, it was looked at, and it was wrong — not badly made, wrong in
   * principle.
   *
   * Texture reads because a surface SCATTERS LIGHT. A near-black page has
   * almost none to scatter, so the tile did not read as pulp; it read as
   * sensor noise — dirt on the lens of a dark page. It is also why the app's
   * own material is FILM grain and not paper grain: film grain belongs to a
   * projected image, which is light. This page is ink.
   *
   * The token is gone rather than turned down, because "so faint you cannot
   * tell" is the worst answer to "is this earning its place" — it still costs
   * a view, a decode and a composite on every screen.
   *
   * On this ground, richness is the rules, the type and the brass. Surface is
   * not depth here; it is dirt. Left as a note so the idea is not rediscovered.
   */

  // ── the one row of chrome ─────────────────────────────────────────────────
  chrome: {
    flexDirection: 'row',
    alignItems: 'stretch',
    /** The capped index centres HERE, on the main axis. `alignSelf: 'center'`
     *  on the child does nothing in a row parent — it centres on the cross
     *  axis, which is vertical, so the first attempt left the index exactly
     *  where it had been and only the render showed it. */
    justifyContent: 'center',
    backgroundColor: 'rgba(8,6,4,0.97)',
    borderBottomWidth: 1,
    borderBottomColor: colors.sepiaBorder,
  },
  // `overflow: hidden` is load-bearing, not tidiness: without it the index's
  // last section printed straight through the pinned tools — DOSSIER and the
  // bookmark occupying the same pixels. Found by looking at the render.
  /**
   * ── THE INDEX GETS THE WHOLE ROW ─────────────────────────────────────────
   * The bookmark and the sort used to be pinned at the end of this row, and the
   * six departments had to fit in what was left. They did not: `DOSSIER` was
   * guillotined to a lone `D` against the tools, which reads as a rendering
   * fault rather than as more to scroll.
   *
   * The tools were never navigation — they are the page's apparatus, and a
   * printed page keeps its apparatus in the running head. Moving them there
   * gives this row its full width, where all six names fit outright at default
   * size. The fade below now sits at the screen's own edge, so on the largest
   * text sizes it says "there is more this way" instead of colliding with a
   * control.
   */
  /** The index is capped and centred on the same measure as the paper, so on a
   *  tablet the departments sit over the page they index. Inert on a phone. */
  chromeWrap: {
    flexDirection: 'row', alignItems: 'stretch',
    width: '100%', maxWidth: PAPER_MAX, alignSelf: 'center',
  },
  chromeIndex: { flex: 1, minWidth: 0, overflow: 'hidden', paddingHorizontal: CHROME_PAD_H },
  chromeRow: { flexDirection: 'row', alignItems: 'center' },
  indexItem: {
    paddingVertical: CHROME_PAD_V,
    paddingHorizontal: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  indexLabel: {
    fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.2,
    color: colors.bone, opacity: INDEX_INACTIVE, includeFontPadding: false,
  },
  /**
   * The colour now comes from the section itself — see SECTION_COLOR. These
   * carry only the STRENGTH: dimmed until you choose a department, full once
   * you have. Which is how the Darkroom's mood filter behaves, and why the word
   * teaches the code instead of a stripe having to.
   */
  indexLabelOn: { opacity: 1 },
  /** THE token, not a second number. This was 0.55 and it sat LATER in the
   *  style array than `indexLabel`, so it silently overrode INDEX_INACTIVE and
   *  the token was dead — every index label rendered at 3.54:1 while the file
   *  claimed 4.8. Two opacity systems for one state is one too many. */
  indexLabelOff: { opacity: INDEX_INACTIVE },
  indexDot: {
    fontFamily: fonts.sub, fontSize: 8.5, color: colors.sepia, opacity: 0.62,
    includeFontPadding: false,
  },
  /** Sits ABOVE the row it fades, so it must come after in z-order — hence the
   *  explicit zIndex rather than relying on paint order alone. */
  // ── THE FADE HAS TO EXIST ON ANDROID TOO ─────────────────────────────────
  // iOS paints siblings in JSX order, so zIndex alone was enough there. Android
  // paints in ELEVATION order, where a sibling declaring none sits at 0 and a
  // later overlay declaring none does NOT reliably win — the fade over the
  // index's trailing edge would simply not be there, and the last department
  // would be guillotined mid-word against the tools with nothing to say there
  // is more to scroll. That has now happened three times in this app (the
  // Darkroom's mood row, the Lounge's salon strip, and this).
  //
  // The elevation MATCHES the zIndex rather than being picked freely, so the
  // two platforms are told the same thing. What it covers — chromeRow and its
  // indexItems — declares no elevation and no shadow, and PressableScale adds
  // none, so 2 is above everything it has to cover and below the two raised
  // surfaces in this file (6 and 4), which it must never sit over.
  chromeFade: {
    position: 'absolute', right: 0, top: 0, bottom: 0, width: 26,
    zIndex: 2, elevation: 2,
  },
  toolLabel: {
    fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.6,
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
    fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 2.2,
    color: colors.sepia, includeFontPadding: false,
  },
  pip: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.bloodReel, opacity: 0.85 },
  mastSub: {
    fontFamily: fonts.bodyItalic, fontSize: 12.5, letterSpacing: 0.8,
    color: colors.bone, opacity: QUIET, textAlign: 'center',
  },

  /** A running head. Every printed page carries one; ours did not, so the
   *  moment the masthead scrolled away nothing said newspaper any more. */
  /**
   * ── THE RUNNING HEAD ─────────────────────────────────────────────────────
   * It was a folio — `THE DISPATCH · VOL. 103 · No. 240` — sitting directly on
   * top of a day divider reading `WEDNESDAY, AUGUST 28`. Two bands saying
   * almost the same thing, one after the other, on top of a nav bar and an
   * index: four rows of furniture before a word of writing. That is the same
   * header-stacking this app already carries on Stacks, repeating itself.
   *
   * One line now, and it says strictly more than either did: the issue number,
   * the day, and — on the right, where a page keeps its apparatus — the sort
   * and your saved filings. `VOL.` moves to the masthead, which is the honest
   * place for a number that turns over once a year; `No.` is the one that
   * advances every night, so it is the one the running head carries.
   *
   * Later days still get the full divider. That is not an inconsistency: a
   * running head at the top of a page and a section break inside it are two
   * different marks in every printed thing that has ever had both.
   */
  runHead: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingTop: 12, paddingBottom: 8,
    borderBottomWidth: 1, borderBottomColor: 'rgba(184,137,26,0.25)',
  },
  /**
   * `flex: 1` and one line, so on a narrow screen the DATE gives way and the
   * issue number — the thing that makes this a folio — never does. Measured at
   * 320pt the full line overran by 40pt; the tools are pinned and cannot yield,
   * so the text is the only part that can, and it must yield from the end.
   */
  runHeadText: {
    fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 2.2, color: colors.sepia,
    opacity: 0.95, includeFontPadding: false, flex: 1, minWidth: 0,
  },
  runHeadTools: { flexDirection: 'row', alignItems: 'center', gap: 12 },

  // ── ornament / dividers ───────────────────────────────────────────────────
  orn: { flexDirection: 'row', alignItems: 'center', gap: 8, opacity: 0.5, marginVertical: 24 },
  ornLine: { flex: 1, height: 1, backgroundColor: colors.sepia },
  ornDiamond: { width: 6, height: 6, backgroundColor: colors.sepia, transform: [{ rotate: '45deg' }] },
  /** A printed page separates stories with a definite rule, not a whisper.
   *  At 0.16 the hairline was doing so little that the space between posts
   *  was doing the work instead — which is why the page needed so much of it. */
  hair: { height: 1, backgroundColor: 'rgba(184,137,26,0.25)' },

  /**
   * ── A MEMBER'S OWN WRITING, SET IN ITS OWN DIRECTION ───────────────────────
   * The app does NOT flip its layout for right-to-left, and that is the right
   * call: the house speaks English, so the chrome, the ordering margin and the
   * ledger stay where they are. What it does instead is detect the direction of
   * each piece of MEMBER writing and set that piece accordingly — `isRTLText`,
   * applied in eight component files across reviews, logs, comments and the
   * profile.
   *
   * The Dispatch applied it in none of them. An Arabic take, an Arabic critique
   * and an Arabic essay all set left-aligned with their punctuation stranded on
   * the wrong side — in an app that had already solved this everywhere else,
   * for a house whose members plainly include people who write in it.
   *
   * Declared exactly as `logDetailStyles` and `LogModalStyles` declare it: a
   * third spelling of one rule is how a rule stops being one.
   */
  rtlText: { writingDirection: 'rtl', textAlign: 'right' } as import('react-native').TextStyle,
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 16, paddingBottom: 8, opacity: 0.92 },
  /** Thin over thick — how a printed section break is set, and the cheapest
   *  way to make a scroll read as an edition turning over. */
  dayLine: {
    flex: 1, height: 4,
    borderTopWidth: 1, borderTopColor: colors.sepia,
    borderBottomWidth: 2, borderBottomColor: colors.sepia,
    opacity: 0.4,
  },
  dayLabel: {
    fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 2.2,
    color: colors.sepia, includeFontPadding: false,
  },

  // ── a post ────────────────────────────────────────────────────────────────
  /** `relative` + `overflow: hidden` so the film's own art can sit behind the
   *  block without bleeding into its neighbours. */
  post: { paddingVertical: POST_PAD_V, position: 'relative', overflow: 'hidden' },
  kind: {
    fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 2.2,
    color: colors.sepia, marginBottom: 8, includeFontPadding: false,
  },

  /**
   * ── THE LETTERS PAGE ───────────────────────────────────────────────────────
   * The apparatus sits in a margin; the writing sits in a column; a rule divides
   * them. That is how a printed periodical sets its correspondence, and it is
   * the opposite of every feed, which stacks label-then-text-then-meta.
   *
   * The margin holds ONE value: whatever is ordering the page. The hour under
   * LATEST, the certify count under CERTIFIED, the date in search and saved.
   * A dash where there is nothing — nil in a ledger is a dash, not a blank, and
   * a blank column on a young page reads as a bug.
   *
   * `end` alignment rather than `right`, so the whole thing mirrors in Arabic.
   */
  postRow: { flexDirection: 'row', alignItems: 'flex-start' },
  /**
   * `paddingTop: 6` is not a nudge — it is baseline alignment, measured off the
   * render. The byline's name sits beside a 19pt avatar and therefore centres
   * about 13pt down; the margin value at 8.5pt sits about 7pt down. Left at 1
   * the number floated visibly above the name it belongs to.
   *
   * `paddingEnd`, not `paddingRight`, so the whole margin mirrors in Arabic.
   */
  margin: { width: MARGIN_W, alignItems: 'flex-end', paddingTop: 6, paddingEnd: 6 },
  marginValue: {
    fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 0.8,
    color: colors.sepia, includeFontPadding: false,
  },
  /** The dash is the mark that says nothing has been certified yet. It has to
   *  be as readable as the counts it stands in for, not a ghost. */
  marginNil: { color: colors.bone, opacity: 0.75 },
  /** The column carries the rule on its leading edge — the rule IS the boundary
   *  between what the app knows and what a member wrote, and it is always
   *  present. Tier changes its material, never whether it exists. */
  column: {
    flex: 1, minWidth: 0,
    paddingLeft: RULE_GAP, borderLeftWidth: RULE_W,
    borderLeftColor: colors.sepiaBorder,
  },
  /**
   * ── THE RULE CARRIES THE RANK ────────────────────────────────────────────
   * This rule was neutral brass on every filing, and tier lived only on the
   * 19pt avatar ring — a mark you have to look for. Meanwhile the KIND had
   * taken both of the entry's other marks: it names itself in the lead-in and
   * closes the entry in its own ink.
   *
   * So the vertical rule was free, and it is the right slot for rank, because
   * it runs the WHOLE height of the filing. The entry is now bracketed twice,
   * on two axes, saying two different things:
   *
   *      horizontally   the KIND   — lead-in above, closing rule below
   *      vertically     the RANK   — this rule, top to bottom
   *
   * And the material is the message. A cinephile's rule is ink. An Archivist's
   * is the house's brass ramp — polished metal, the same gradient the brass
   * plates and the ＋ are struck from. An Auteur's is crimson, the rarest
   * colour in the app and the one it reserves for what has been certified.
   *
   * `transparent` on the border for the two ranked tiers because a gradient
   * paints the rule instead; leaving the border under it would print two rules
   * three points apart.
   */
  columnRanked: { borderLeftColor: 'transparent' },
  /** The ramp runs along the rule's LENGTH. Across three points of width a
   *  four-stop gradient is a flat colour, and reads as yellow plastic. */
  rankRule: { position: 'absolute', left: -RULE_W, top: 0, bottom: 0, width: RULE_W },

  ruled: { paddingLeft: RULE_GAP, borderLeftWidth: RULE_W, borderLeftColor: 'rgba(184,137,26,0.25)' },

  /** 16, not 15, and at full parchment. The one thing on a post that a member
   *  actually wrote should be the one thing that is unmistakably largest. */
  take: {
    fontFamily: fonts.serifItalic, fontSize: 16.5, lineHeight: 28,
    color: colors.parchmentBright,
  },
  /**
   * ── A QUESTION IS A VOICE, NOT A NOTICE ────────────────────────────────────
   * This was Courier at 13.5 while a take was serif italic at 16.5 — three
   * points smaller and in the functional face. Rendered side by side in the
   * feed, a member's take read as writing and a member's question read as a
   * system message.
   *
   * That is the house saying your opinion matters and your question does not,
   * in type, on the kind a new member is most likely to file first.
   *
   * So the rule the five kinds actually follow, stated:
   *
   *   THE MEMBER'S OWN VOICE  — take, seeking — serif italic, 16.5
   *   REPORTED FROM ELSEWHERE — wire          — the plain face; a bulletin
   *                                             quoting a source is not a voice
   *   A HEADLINE              — ballot, dossier — the display face, because
   *                                             both are titles over something
   *
   * Four faces across five kinds is not drift once the rule is written down. It
   * was drift while it was unwritten, which is how a take ended up outranking a
   * question by accident.
   */
  seeking: {
    fontFamily: fonts.serifItalic, fontSize: 16.5, lineHeight: 28,
    color: colors.parchmentBright,
  },
  /** The lead-in carries the kind's colour — the code lives in the type, not
   *  in an ornament beside it. */
  /** Every kind names itself in this slot, in its own colour. Bold, so the
   *  name reads as a label and the sentence after it reads as the writing. */
  /**
   * Every kind names itself here, and the NAMES must match each other rather
   * than the body each one precedes. Inheriting the body size made TAKE (16pt
   * Spectral) shout while SEEKING (13.5pt Courier) murmured — the same label
   * in two weights, which reads as two different things.
   *
   * One face, one size, for all five. And quieter than the writing: a label
   * that competes with the sentence it introduces has taken the sentence
   * place.
   */
  leadIn: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6, fontStyle: 'normal',
    includeFontPadding: false,
  },
  seekingLead: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6, color: KIND_RULE.seeking, includeFontPadding: false },
  wire: { fontFamily: fonts.body, fontSize: 13.5, lineHeight: 20.5, color: colors.parchment },
  /** The dateline is GENERATED — a free-text city here would be the most
   *  authoritative position on the page handed to anyone who wanted it. */
  wireDateline: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6, color: KIND_RULE.wire, includeFontPadding: false },
  wireSource: {
    fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.2, color: colors.fog,
    marginTop: 8, paddingLeft: BYLINE_INDENT, includeFontPadding: false,
  },

  /**
   * A still is a lit frame, not a grey box: the art, a scrim that lets the type
   * beneath stay legible, and a brass hairline. The film page treats every image
   * this way and the page reads as cinema because of it.
   */
  still: {
    borderRadius: 3, marginBottom: 12, overflow: 'hidden',
    backgroundColor: 'rgba(20,16,11,0.9)',
    borderWidth: 1, borderColor: 'rgba(240,232,176,0.16)',
    ...effects.shadowSurface,
  },
  /** The art itself is held back before anything is laid over it — a raw frame
   *  at full strength is the one element that can make this page look like a
   *  different app. */
  stillArt: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%', opacity: 0.46 },
  stillScrim: { ...StyleSheet.absoluteFillObject },


  // ── byline ────────────────────────────────────────────────────────────────
  byline: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 0, marginBottom: 8,
  },
  /**
   * WITHDRAW, on your own critique.
   *
   * `danger` and 9pt at 1 of tracking, which is exactly `commDelete` on a log —
   * the same control, doing the same thing, on a different page. Those two
   * drifted apart once (crimson on one, body text on the other) and a guard now
   * holds them to one colour, so this is written to MATCH rather than chosen.
   */
  critiqueWithdraw: {
    fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1,
    color: colors.danger, includeFontPadding: false,
  },
  // (bylineFlush removed: it set paddingLeft: 0 on a row that has no padding, and
  // the `flush` prop meant to apply it was never accepted by Byline. A ballot's
  // byline is centred by its wrapper, which is what was doing the work all along.)
  avatar: {
    width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2,
    borderWidth: 1, borderColor: 'rgba(240,232,176,0.22)',
    backgroundColor: colors.tarnish,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  /** No picture? The member number, brass-rimmed. Never a grey silhouette. */
  /** ── TIER MOVED HERE ─────────────────────────────────────────────────────
   * The rule carries the KIND now, so tier needed a home. The ring is the
   * right one: tier belongs to the member, not to the post they wrote, and
   * the avatar already had a border doing nothing.
   */
  /** `champagne` — the theme owns this brass by name. */
  avatarArchivist: { borderColor: colors.champagne, borderWidth: 1.5 },
  avatarAuteur: { borderColor: colors.crimson, borderWidth: 1.5 },
  /**
   * A monogram, not a serial.
   *
   * This held the member's house number in the typewriter face at 7.5pt, sized
   * down to fit four digits inside nineteen points. One letter needs none of
   * that room, so it is set in the DISPLAY face and half again as large — the
   * same gesture as the initial that opens a dossier, at the scale of a disc.
   */
  avatarMark: {
    fontFamily: fonts.display, fontSize: 11, lineHeight: 13,
    color: colors.parchmentBright,
    /**
     * The padding STAYS, unlike the number this replaced.
     *
     * `feedRowIsRecyclable` holds a rule: a reading face never strips
     * `includeFontPadding`, because that is how a tall glyph clips on Android
     * and there is no Android device here to prove otherwise on. The number
     * was set in the label face, which is allowed to strip it; a monogram in
     * the display face is not, and carving an exception for one letter would
     * spend a guard that exists for a reason nobody can currently test.
     */
  },
  /** A credit, not a headline. Dimmer and a hair smaller than the writing's
   *  neighbours so the eye reaches the words first. */
  bylineName: {
    fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.2,
    color: colors.bone, opacity: 0.82, includeFontPadding: false,
    /** Nine characters is the floor: below that a byline stops being a name. */
    flexShrink: 1, minWidth: 56,
  },
  /**
   * The read time, the source, the critique count — facts that cannot be
   * recovered from anywhere else on this screen, so they hold their ground
   * BEFORE the name does.
   *
   * But not for ever. `flexShrink: 0` meant they never yielded at all, so on a
   * 360pt Android the name was squeezed towards nothing to keep them whole —
   * measured, the pair overran the column by 20pt. Now the name keeps a floor
   * of 56pt (about nine characters, still recognisably a name) and past that
   * the trail is the one that gives.
   */
  bylineTrail: {
    fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.2,
    color: colors.fog, includeFontPadding: false,
    flexShrink: 1, minWidth: 0, marginLeft: 4,
  },

  // ── the plate ─────────────────────────────────────────────────────────────
  /**
   * ── WHAT THE FIRST SKIN GOT WRONG ─────────────────────────────────────────
   * A plate was a bordered rectangle. In THIS app a poster is a lit object: the
   * film hero mounts it in a brass frame over a sepia glow — `shadowRadius: 20`
   * at `shadowOpacity: 0.8`, the host un-clipped so iOS keeps the shadow. A flat
   * 1px border next to that reads as a wireframe of the app rather than the app.
   *
   * So the plate is three layers, exactly as the hero builds it: a glow host
   * that must not clip, a brass rim, and the art inside.
   */
  plate: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, paddingLeft: BYLINE_INDENT },
  plateGlow: {
    shadowColor: colors.sepia, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55, shadowRadius: 12, elevation: 6,
  },
  plateArt: { width: '100%', height: '100%' },
  /** Poster art is held back a touch everywhere. At full strength a bright sheet
   *  (a yellow one-sheet, a saturated re-release) is the loudest thing on a page
   *  built out of ink and brass, and it drags the eye off the writing. */
  artHeld: { opacity: 0.86 },
  plateTitle: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.6, color: colors.parchment, includeFontPadding: false },
  /** When a still is present the plate collapses to one line — no second poster
   *  of the same film in the same block. */
  /**
   * ── THE CREDIT, NOT THE PLATE ──────────────────────────────────────────────
   * Most posts will be one short line — "any good horror movies?", "tbh Odyssey
   * was bad". A 44x66 poster with two lines of text beside it is four times the
   * height of the post it belongs to, and when the sentence already names the
   * film it repeats what was just said.
   *
   * So the feed carries a credit: a thumbnail and one line. The full poster in
   * its brass halo lives on the post page, where there is room and where you
   * have chosen to look closely.
   */
  /** Type only. An 18x27 poster is not an image, it is a speck — it neither
   *  carries the film's identity nor gets out of the way. The poster appears
   *  where it can be seen: on the post page, and in a seeking answer where it
   *  is the whole point. */
  credit: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  creditArt: {
    width: 18, height: 27, borderRadius: 1.5, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(240,232,176,0.28)',
    backgroundColor: 'rgba(20,16,11,0.9)',
  },
  /**
   * `gap: 6` — the same gap `byline` uses, for the same reason.
   *
   * Both set two facts either side of a `·`, and both write it the same way: a
   * second Text beginning with `'· '`. The byline's container reserved space
   * before that dot and this one did not, so the credit rendered
   * `TOKYO STORY· 1953` — a full word-space after the dot and nothing but 1.2pt
   * of letter-spacing before it. Measured on the page: 10pt of air before the
   * byline's dot, 0 before the credit's.
   *
   * Reserved in the LAYOUT rather than by padding the string, so the app has one
   * way of setting this and not two. A long title now gives way 6pt earlier,
   * which is right — the space is real, and the byline already spends it.
   */
  creditWords: { flexDirection: 'row', alignItems: 'baseline', gap: 6, flexShrink: 1, minWidth: 0 },
  /** `flexShrink: 1`, not `flex: 1`: the title takes the room it needs and gives
   *  way only when the line is full, so a short title does not push the year to
   *  the far edge of the column with a corridor of nothing between them. */
  creditText: {
    fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.2, color: colors.bone,
    includeFontPadding: false, flexShrink: 1, minWidth: 0,
  },
  /** Fixed. Never shrinks, never truncates — see the note in `Credit`. */
  creditYear: {
    fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.2, color: colors.bone,
    includeFontPadding: false, flexShrink: 0,
  },

  // ── the action row ────────────────────────────────────────────────────────
  /**
   * ── WHAT THE RENDER CAUGHT ────────────────────────────────────────────────
   * My first version used `gap: 16` with `paddingHorizontal: 8` on each mark.
   * On screen the row wrapped to TWO LINES at ordinary text size, and the
   * docked bar clipped `SAVE` clean off the right edge. The arithmetic says why:
   * four marks at `CERTIFIED 2.1K` measure ~261pt, the horizontal padding added
   * 80 more, and there are only ~301 to spend.
   *
   * `space-between` with no gap and no horizontal padding lets the row
   * DISTRIBUTE what it has instead of demanding a fixed rhythm it cannot
   * afford. The vertical padding stays — it is the touch target — and hitSlop
   * keeps zero horizontal component so neighbours can never overlap.
   *
   * `flexWrap` remains as the honest last resort: at type 1.35 the content
   * genuinely exceeds the measure, and two rows is correct where a clipped
   * `CERTI…` never is.
   */
  /**
   * ── ALIGNED TO THE COLUMN, NOT THE PAGE EDGE ──────────────────────────────
   * It used to run the full measure from x=0, which put a visible step under
   * every post: writing at 58, marks at 0. I had chosen that to accommodate the
   * WORST case — 272pt of labels against a 257pt column — and paid for it on
   * every single post instead.
   *
   * The typical row is about 240pt and fits with room. The rare heavy one
   * shrinks, because deckLabelProps already shrinks to fit. Never make a
   * permanent compromise for a rare case.
   */
  /**
   * ── THE ROW THAT BROKE ON THE POSTS THAT DID WELL ────────────────────────
   * `space-between` alone distributes SLACK. At `CERTIFY 4` there was slack and
   * the row looked composed; at `CERTIFIED 2.1K · CRITIQUE 61` there was none,
   * so the four marks butted together — the heart's label touching the next
   * icon — and `flexWrap` stood ready to drop SAVE onto a second line. The post
   * that earns two thousand certifications was the post whose footer collapsed.
   *
   * The first repair was to let the labels SHRINK, and it was wrong: it made
   * every label ellipsize — `CERTIF… CRITIQUE … SHA… SA…` — because a shrinking
   * box does not shrink type unless `adjustsFontSizeToFit` is honoured, and
   * that prop is unreliable on Android. Never fix an overflow by giving the
   * content permission to disappear.
   *
   * The row is 308pt of content in 254pt of column: it is simply too wide, and
   * the space has to come from somewhere real. It comes from the margin. The
   * row now runs the FULL measure, beneath both the ordering column and the
   * text — it is the entry's footer, not the column's, which is where a letters
   * page puts an entry's furniture anyway — and that is 59 points back. With
   * tracking eased to 0.8 the worst case in the app (`CERTIFIED 2.1K` beside
   * `CRITIQUE 5.2K`) measures 281 in 313, so it fits outright, with room to
   * spare for larger text rather than a prop's promise to rescue it.
   *
   * `columnGap` is a MINIMUM applied before space-between distributes the rest,
   * so the marks can never touch even if a label grows. `flexShrink` stays on
   * the pressable, never the label: if some future label overruns, the row
   * degrades at its edges instead of overflowing the page.
   */
  /**
   * ── WHAT THE APP'S DECK TAUGHT, AND WHAT IT COULD NOT LEND ────────────────
   * Built exactly as the app builds it — four tiles of ink over an inkwell
   * recess, flush to the rails — and RENDERED, it was worse. Three faults, all
   * of them only visible once drawn:
   *
   *   · the tile grounds read as a BUTTON TRAY under every entry. That device
   *     belongs to a card, where it is a footer seam closing a box. On a
   *     continuous page there is no box to close, so four lit rectangles are
   *     just four rectangles, and they are the most app-shaped thing on screen.
   *   · at twelve points of padding around a stacked icon it stood 55pt tall.
   *     Four entries per screen became three. Density is the single thing that
   *     makes this read as a page rather than a feed.
   *   · flush to the rails, the first label clipped.
   *
   * So the anatomy is the app's and the furniture is not: THE ICON ABOVE ITS
   * LABEL (which is why the app stacks — a 9-character CERTIFIED needs 66pt and
   * a quarter-tile gives the label all 79 of them, where beside an icon it gets
   * 59 and truncates), FOUR EQUAL QUARTERS, and the app's own type. One
   * hairline seam instead of a tray, and nine points of padding instead of
   * twelve, because a page's foot is a rule, not a shelf.
   */
  actions: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 8,
  },
  /**
   * The rule that closes a filing, in the filing's own ink. Faint — it is a
   * boundary, not an announcement, and five of them down a screen at full
   * strength would be a colour chart. At 0.34 it reads as a tinted hairline:
   * you see WHERE the entry ends without being told twice what kind it was.
   */
  entryEnd: { height: 1, marginTop: 12, opacity: 0.34 },
  action: {
    flex: 1, paddingBottom: 8,
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  /**
   * A labelled field on a desk — the wire's SOURCE, the ballot's CLOSES.
   *
   * Shared rather than local to one desk, because the wire composer and the
   * design's own wire desk must draw the identical field; two definitions of
   * one thing is how the comment page size came to say 30 while the query asked
   * for 50.
   */
  field: {
    marginTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(184,137,26,0.25)', paddingTop: 12,
  },
  fieldLabel: {
    fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 1.6, color: colors.sepia,
    opacity: 0.85, marginBottom: 6, includeFontPadding: false,
  },
  fieldValue: { fontFamily: fonts.body, fontSize: 12.5, color: colors.parchment },

  /**
   * A mark a signed-out reader cannot make.
   *
   * Dimmed rather than removed: the four marks divide the row evenly, so taking
   * two away would leave a card whose foot is a different shape depending on
   * who is looking at it. Dimmed and disabled says "this exists, and it is for
   * members" — which is true, and is the one thing a visitor to a members' club
   * should be able to see.
   *
   * ── 0.62, NOT 0.38 ─────────────────────────────────────────────────────────
   * Measured against the paper ground, composited properly: `fog` at 0.38 is
   * 1.85:1, and at 0.62 it is 3.13:1 — the 3:1 a UI component needs. A live
   * mark is 6.78:1, so it still reads as unmistakably the quieter of the two.
   *
   * WCAG exempts a disabled control from any minimum, so this is not compliance
   * — it is the house's own standard, already set once. `PaperChrome`'s note
   * says: "Inactive labels are `bone` at 0.6 (~4.8:1), NOT `fog` at 0.45
   * (~2.2:1) — navigation you cannot read is not navigation." 0.38 was BELOW
   * the value that note rejected.
   */
  actionOff: { opacity: 0.62 },
  /** Lower contrast than the writing it sits under. These are controls, and a
   *  control that shouts as loud as the sentence above it is a control that has
   *  been given more importance than the sentence. */
  /**
   * ── TRACKING IS A LUXURY A 69pt BOX CANNOT AFFORD ────────────────────────
   * 2.2 was taken from the app's deck, which sets its labels at 2 — and the
   * app's own comment admits `CERTIFIED` needs 79pt of an 81pt column there.
   * That is a 390pt phone. On a 320pt one the quarter is 69pt, and drawn at
   * last, `CERTIFIED` and `CRITIQUE` ran into each other: the row read
   * `ERTIFIEDCRITIQUE`.
   *
   * At 1.2 — one step down the same tracking scale — the widest label measures
   * 57pt at normal size and 68 at the cap, so it fits the smallest phone the
   * app can be installed on, at the largest type it allows, with the shrink
   * still held in reserve. A deliberate one-step divergence from the app's
   * deck, for a reason that was measured and then looked at.
   */
  actionLabel: {
    fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.2,
    color: colors.fog, includeFontPadding: false,
  },
  /** Full strength: the certified label is the one that must be readable. */
  actionLabelOn: { color: CRIMSON_INK, opacity: 1 },
  actionLabelSaved: { color: colors.sepia },

  // ── THE REPLY ─────────────────────────────────────────────────────────────
  reply: {
    marginTop: 12, marginLeft: BYLINE_INDENT, paddingLeft: RULE_GAP,
    borderLeftWidth: RULE_W, borderLeftColor: 'rgba(184,137,26,0.5)',
  },

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
   * ── THE PLATE, NOT AN OUTLINE ─────────────────────────────────────────────
   * ANSWERED / FILED were outlined crimson text. In this app that mark is a
   * struck BRASS plate — the film page's REWATCHED tab: the ramp, the crown
   * highlight, ink lettering on metal, sitting proud of what it marks.
   * Decorative, so it never scales and can never clip its corner.
   */
  stamp: {
    borderRadius: 2, paddingVertical: 4, paddingHorizontal: 8,
    borderWidth: 1, borderColor: 'rgba(240,232,176,0.32)',
    // ── A ROTATED BOX IS WIDER THAN ITS LAYOUT BOX ─────────────────────────
    // The 6-degree tilt is what makes this a struck plate rather than a chip,
    // but layout reserves the UNROTATED rectangle — so the plate's corners
    // painted 0.8pt into the byline beside it and 0.8pt past the column's edge.
    // Measured, not estimated: a 20pt-tall plate at 6 degrees grows by
    // (h / 2) x sin 6 ~ 1pt on each side.
    //
    // Two points of margin, which is that growth plus slack, and the tilt keeps
    // its room instead of borrowing its neighbour's.
    marginHorizontal: 2,
    transform: [{ rotate: '-6deg' }], overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5, shadowRadius: 4, elevation: 4,
  },
  stampText: {
    fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 2.2,
    color: colors.ink, includeFontPadding: false,
  },
  /** WITHHELD is the exception: a withheld post is not an achievement, so it
   *  keeps the crimson censor's outline rather than being handed a brass plate. */
  stampCrimson: {
    borderColor: colors.crimson, backgroundColor: 'rgba(180,45,45,0.10)',
    shadowOpacity: 0,
  },
  stampTextCrimson: { color: CRIMSON_INK },

  // ── the ballot ────────────────────────────────────────────────────────────
  ballotHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  ballotClose: { fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 1.6, color: colors.fog, includeFontPadding: false },
  ballotQ: {
    fontFamily: fonts.display, fontSize: 20, lineHeight: 28,
    color: colors.parchment, textAlign: 'center', marginBottom: 4,
  },
  /** The ballot names itself where the other four do — on the line it prints,
   *  not in a chip off to one side that read as chrome rather than as the code. */
  ballotLead: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6, color: KIND_RULE.ballot, includeFontPadding: false },
  option: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  // ── THE WIDEST NUMERAL, NOT THE COMMONEST ────────────────────────────────
  // 17pt fitted `I.` and `V.` and cut `III.` by two points on every ballot with
  // three or more options — which is most of them, since the form asks for two
  // to six. A ballot's third choice printed as `III` with the full stop shaved
  // off, in a column whose whole job is to number things.
  //
  // 21 is measured against `III.`, the widest of the six (I, II, III, IV, V, VI)
  // at 8.5pt in the sub face, with the point of slack that keeps a rendering
  // difference between platforms from bringing the clip back.
  optionNo: { fontFamily: fonts.sub, fontSize: 8.5, color: colors.sepia, width: 21, includeFontPadding: false },
  box: { width: 13, height: 13, borderRadius: 1, borderWidth: 1.4, borderColor: KIND_RULE.ballot, alignItems: 'center', justifyContent: 'center' },
  boxMark: { fontFamily: fonts.sub, fontSize: 12.5, color: CRIMSON_INK, marginTop: -2, includeFontPadding: false },
  optionPoster: { overflow: 'hidden',
    width: 30, height: 45, borderRadius: 1,
    borderWidth: 1, borderColor: 'rgba(240,232,176,0.18)',
    backgroundColor: 'rgba(20,16,11,0.9)',
  },
  /** 9 and 1.1, not 9.5 and 1.3. Measured: a 28-character title left 1.8pt of
   *  slack in the option row, so ordinary long titles truncated at normal text
   *  size. Easing both buys 15pt and stops the common case ellipsizing. */
  optionTitle: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.2, color: colors.parchment, includeFontPadding: false },
  optionMeta: { fontFamily: fonts.sub, fontSize: 8.5, color: colors.fog, marginTop: 4, includeFontPadding: false },
  percent: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.8, color: colors.parchment, includeFontPadding: false },
  /** A rule that fills, not a coloured progress bar. */
  fillTrack: { height: 3, borderRadius: 2, backgroundColor: 'rgba(184,137,26,0.14)', marginTop: 6, overflow: 'hidden' },
  fillBar: { height: '100%', borderRadius: 2 },
  ballotFoot: {
    fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 2.2, color: colors.fog,
    textAlign: 'center', marginTop: 12, includeFontPadding: false,
  },
  wonWrap: { alignItems: 'center', paddingTop: 6 },
  wonLabel: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 2.2, color: colors.sepia, marginBottom: 12, includeFontPadding: false },
  wonPoster: { overflow: 'hidden',
    width: 74, height: 111, borderRadius: 2, marginBottom: 12,
    borderWidth: 1, borderColor: 'rgba(240,232,176,0.26)', backgroundColor: 'rgba(20,16,11,0.9)',
  },
  wonTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.parchment, marginBottom: 6, textAlign: 'center' },
  wonMeta: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.2, color: colors.fog, includeFontPadding: false },

  // ── the dossier ───────────────────────────────────────────────────────────
  cover: {
    height: 104, borderRadius: 2, marginBottom: 12,
    backgroundColor: 'rgba(20,16,11,0.9)',
    borderWidth: 1, borderColor: 'rgba(232,223,208,0.09)',
  },
  dossierTitle: { fontFamily: fonts.display, fontSize: 20, lineHeight: 28, color: colors.parchment, marginBottom: 8 },
  /**
   * A ballot's question ON A CARD.
   *
   * Not `ballotQ`: that one is the READER's, centred over its options, and a
   * centred line on a card would be the only centred thing in a column where
   * everything else is set to the rule. Same face, size and leading as a
   * dossier's title, because both are a heading you tap to open.
   */
  cardBallotQ: { fontFamily: fonts.display, fontSize: 20, lineHeight: 28, color: colors.parchment, marginBottom: 8 },
  dossierLead: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6, color: KIND_RULE.dossier, includeFontPadding: false },
  series: { fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 1.6, color: colors.sepia, opacity: 0.85, marginTop: 8, includeFontPadding: false },
  excerpt: { fontFamily: fonts.serif, fontSize: 13.5, lineHeight: 24, color: colors.bone, opacity: 0.86, flex: 1, paddingTop: 2 },

  // ── section head + empty ──────────────────────────────────────────────────
  /** FilmSectionHeader's exact anatomy, plus a tint the shared component does
   *  not yet take. Shipping this means adding an optional `tint` prop there,
   *  not keeping a second copy — one source of truth, as its own comment says. */
  headRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  headRule: { flex: 1, height: 1, marginLeft: 12 },
  sectionTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.parchment, marginBottom: 6, textAlign: 'center' },

  /** No glyph above an empty state — the section head is the mark. */
  /** Centred in the space it is given. Pinned under the heading with acres
   *  below, it read as content that had failed to load rather than as a
   *  composed invitation. */
  /** The 40pt bottom padding is gone: the ruling now decides where the page
   *  ends, and holding it 40 points clear of the foot left a bare strip that
   *  read as the page stopping early. */
  empty: { flex: 1, minHeight: 0, alignItems: 'center', paddingHorizontal: 4, paddingBottom: 6 },
  /**
   * ── AN EMPTY PAGE IS STILL A RULED PAGE ──────────────────────────────────
   * Day one and an empty department were two acres of black with a sentence
   * floating in the middle of each, and two acres of black cannot look like
   * anything — which is exactly why the two screens read as unrelated designs.
   * Nothing was holding them together because there was nothing there.
   *
   * A printed page that has had nothing filed on it is not blank. It is RULED,
   * and waiting. So the empty page prints its own rules, at the rhythm an entry
   * would sit on, fading as they run down — the ledger before anyone has
   * written in it. The message sits on the ruling rather than in a void, and
   * every empty screen in the section now shares one ground.
   *
   * The rules are distributed by flex rather than placed at fixed points, so
   * the ruling fills whatever height it is given — a short empty state under a
   * masthead and a tall one under a running head are ruled the same way, which
   * is the whole reason they now look like the same page.
   *
   * And the ruling runs ABOVE and BELOW the notice, never behind it. Drawn as
   * one layer across the whole area it struck a line through the headline and
   * another through the button, which does not read as a ruled page — it reads
   * as a rendering fault. The notice sits in the clear band between the two
   * groups, and being centred in whatever space is left is what puts it in the
   * same place on every empty screen in the section.
   */
  emptyRules: { alignSelf: 'stretch', flex: 1 },
  emptyRule: { flex: 1, borderBottomWidth: 1 },
  emptyTitle: {
    fontFamily: fonts.display, fontSize: 20, lineHeight: 28, color: colors.parchment,
    opacity: 0.92, textAlign: 'center', marginBottom: 12, maxWidth: 288,
  },
  emptyBody: {
    fontFamily: fonts.bodyItalic, fontSize: 12.5, lineHeight: 21, color: colors.bone,
    opacity: QUIET, textAlign: 'center', marginBottom: 24, maxWidth: 264,
  },
  btn: { borderWidth: 1, borderColor: colors.sepia, borderRadius: 2, paddingVertical: 8, paddingHorizontal: 16 },
  btnText: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 2.2, color: colors.parchment, includeFontPadding: false },
  btnBrass: { borderColor: 'rgba(240,232,176,0.30)', overflow: 'hidden' },
  quiet: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 2.2, color: colors.sepia, opacity: 0.95, marginTop: 16, includeFontPadding: false },
  endRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 16 },
  endLine: { width: 32, height: 1, backgroundColor: colors.sepia, opacity: 0.35 },

  // ── skeletons ─────────────────────────────────────────────────────────────
  skRow: { paddingVertical: POST_PAD_V },
  skBar: { height: 8, borderRadius: 2, backgroundColor: 'rgba(184,137,26,0.06)', marginBottom: 8 },
  skAvatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, backgroundColor: 'rgba(184,137,26,0.06)' },
  skByline: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },

  // ── post page ─────────────────────────────────────────────────────────────
  /** The spine that appears once the post scrolls away, so you never lose what
   *  you are reading comments on. Tapping it returns to the top. */
  spine: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, paddingHorizontal: DOC_PAD,
    backgroundColor: 'rgba(8,6,4,0.97)',
    borderBottomWidth: 1, borderBottomColor: colors.sepiaBorder,
  },
  /** The back arrow is its own target inside the one bar, divided from the rest
   *  by a hairline so a thumb aiming to LEAVE never lands on "scroll to top". */
  spineBack: { paddingRight: 8, marginRight: 2, borderRightWidth: 1, borderRightColor: 'rgba(184,137,26,0.25)' },
  // Mirrors spineBack on the other end — the same hairline, facing the other
  // way, so the bar reads as three parts rather than two and a stray icon.
  spineMore: { paddingLeft: 8, marginLeft: 2, borderLeftWidth: 1, borderLeftColor: 'rgba(184,137,26,0.25)' },

  // ── A SHEET AND THE GROUND IT SITS ON ──────────────────────────────────────
  // The ground is a control, not a scrim: every other sheet in this app closes
  // when you touch outside it, and one that traps you until you choose a
  // destination punishes changing your mind.
  sheetHost: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'flex-end' },
  sheetGround: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(4,3,2,0.72)' },
  /** What is being shared, named, so the sheet is about a thing and not a verb. */
  sharePreview: {
    fontFamily: fonts.serifItalic, fontSize: 14, lineHeight: 21,
    color: colors.parchment, opacity: 0.9, paddingHorizontal: 4,
  },
  spineBody: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  spineKind: { fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 2.2, color: colors.sepia, includeFontPadding: false },
  spineText: { fontFamily: fonts.serifItalic, fontSize: 12.5, color: colors.bone, flex: 1 },
  spineCount: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.2, color: colors.fog, includeFontPadding: false },

  critiqueHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 4 },
  critiqueLabel: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 2.2, color: colors.sepia, includeFontPadding: false },
  critiqueSortRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  critiqueSort: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.2, color: colors.bone, opacity: INDEX_INACTIVE, includeFontPadding: false },
  critiqueSortOn: { color: colors.parchment, opacity: 1 },

  comment: { flexDirection: 'row', gap: 8, paddingVertical: 12, borderTopWidth: 1, borderTopColor: 'rgba(184,137,26,0.14)' },
  commentName: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.2, color: colors.bone, marginBottom: 4, includeFontPadding: false },
  commentBody: { fontFamily: fonts.serif, fontSize: 13.5, lineHeight: 21, color: colors.parchment, opacity: 0.92 },
  commentMeta: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.2, color: colors.fog, marginTop: 6, includeFontPadding: false },
  commentMine: { backgroundColor: 'rgba(184,137,26,0.06)' },
  topMark: { color: colors.sepia },

  /** One docked thing, ever: the composer REPLACES the action bar. Padding is
   *  16, not 20 — at `CERTIFIED 2.1K · CRITIQUE 5.2K` the wider gutter pushed
   *  SAVE off the screen, which the render showed and the arithmetic had not. */
  dock: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 12, paddingHorizontal: 16,
    borderTopWidth: 1, borderTopColor: colors.sepiaBorder,
    backgroundColor: 'rgba(10,7,3,0.97)',
  },
  dockCompose: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingTop: 12, paddingHorizontal: 16,
    borderTopWidth: 1, borderTopColor: colors.sepiaBorder,
    backgroundColor: 'rgba(10,7,3,0.97)',
  },
  dockInput: { flex: 1, fontFamily: fonts.serif, fontSize: 13.5, color: colors.bone, opacity: 0.78 },

  // ── the copy desk ─────────────────────────────────────────────────────────
  /**
   * The composer IS the printed post — you type onto the sheet, in the face it
   * prints in, with your byline and its hour already on it. One screen, one tap
   * to file. A form-then-preview would be two taps and would put the surprise
   * back in, which is where every composer loses people.
   *
   * The clock is set when the desk OPENS, not on a timer. A live clock would
   * re-render the composer every sixty seconds while somebody is typing, and
   * the real hour is stamped at filing anyway.
   */
  ch: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: colors.sepiaBorder,
    backgroundColor: colors.ink,
  },
  chs: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.6, color: colors.fog, includeFontPadding: false },
  chsGo: { color: colors.parchment },
  chm: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 3, color: colors.sepia, includeFontPadding: false },
  cb: { flex: 1, minHeight: 0, paddingHorizontal: 16, paddingTop: 16, backgroundColor: colors.soot },

  /** The desk's document FILLS the writing area. A sheet that stops halfway down
   *  an empty screen reads as a widget; one that runs to the rail reads as the
   *  page you are writing on. Same frame as the feed, so the two cannot drift. */
  /**
   * ── THE DOCUMENT CLIPS, AND IN THE APP IT SCROLLS ──────────────────────────
   * `flex: 1, minHeight: 0` bounds the BOX. It does not bound what is drawn
   * inside it: React Native lets overflowing content paint straight out of a
   * View, and the tool rail is the next sibling down.
   *
   * Drawn for the first time with a body near its 2,000-character limit — every
   * composer fixture until now used three short lines — the last line of the
   * member's writing and the whole film credit were painted UNDER the rail,
   * unreadable and unrecoverable. The pixel audit did not catch it because the
   * two boxes do not intersect; only their contents do.
   *
   * `overflow: 'hidden'` makes this mockup tell the truth. In the app the
   * document is a ScrollView, which clips for the same reason and scrolls for
   * the obvious one — and it reserves the rail's height from its content
   * inset, so the last line can always be scrolled clear of it.
   */
  deskDoc: {
    flex: 1, minHeight: 0, overflow: 'hidden',
    marginHorizontal: DOC_MARGIN, paddingHorizontal: DOC_PAD, paddingTop: 16,
    backgroundColor: 'rgba(8,6,4,0.98)',
    borderLeftWidth: DOC_RAIL, borderRightWidth: DOC_RAIL,
    borderColor: colors.sepiaBorder,
  },
  /** The rule runs the full height of the writing area, not just past the words
   *  already typed — the page is ruled before you write on it. */
  /** ── AN OVERCORRECTION, REVERTED ─────────────────────────────────────────
   * The rule used to stop at the last word, so I stretched it down the whole
   * writing area on the theory that a page is ruled before you write on it.
   * On screen that is a bright crimson line pointing at four hundred points of
   * nothing, and it reads as a rendering fault.
   *
   * A column rule exists because there is content beside it. With none, it is
   * not structure, it is a stripe. The rule ends with the writing — exactly as
   * it does in the feed, which is also what keeps the desk and the page the
   * same object.
   */
  /** flex-START on the row means a flex:1 child never grows - the rule stopped
   *  at the last word typed instead of running the height of the page. */
  deskRow: { flex: 1, minHeight: 0, alignItems: "stretch" },
  caret: { color: colors.sepia },
  railTool: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },

  sheet: {
    backgroundColor: 'rgba(8,6,4,0.98)', borderWidth: 1, borderColor: colors.sepiaBorder,
    paddingHorizontal: 16, paddingVertical: 4, ...effects.shadowSurface,
  },
  /** The tool rail sits above the keyboard, where the writing room already puts
   *  its toolbar — outside the sheet, so the printed page stays clean. */
  rail: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: colors.sepiaBorder,
    backgroundColor: 'rgba(10,7,3,0.94)',
  },
  rl: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.6, color: colors.bone, includeFontPadding: false },
  kbd: {
    height: 210, backgroundColor: colors.keyWell,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  kbdLabel: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 2.2, color: colors.fog, opacity: 0.55, includeFontPadding: false },

  // ── states ────────────────────────────────────────────────────────────────
  /** Spoilered text is NOT DRAWN. A blur can be sharpened; an absent node cannot. */
  veil: {
    borderWidth: 1, borderColor: 'rgba(184,137,26,0.25)', borderStyle: 'dashed',
    borderRadius: 2, paddingVertical: 16, paddingHorizontal: 16, alignItems: 'center',
  },
  veilText: {
    fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 2.2, lineHeight: 15,
    color: colors.bone, opacity: 0.85, textAlign: 'center', marginBottom: 12, includeFontPadding: false,
  },
  veilAction: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 2.2, color: colors.sepia, includeFontPadding: false },
  removed: {
    paddingVertical: 16, alignItems: 'center',
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(184,137,26,0.14)',
  },
  /** Flush left, like every other line on the page. It was centred — a leftover
   *  from when this was a full-width block — and read as a different design. */
  removedText: { fontFamily: fonts.bodyItalic, fontSize: 12.5, color: colors.fog, opacity: 0.8 },
});
