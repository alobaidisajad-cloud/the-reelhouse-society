/**
 * ── EVERYTHING ELSE THE PAGE TOUCHES ─────────────────────────────────────────
 * The picker, the door, the house rules, the archive, a member's room, the
 * Tribunal's reported docket, and the two cards a filing travels as.
 *
 * Not one of these invents a layout. Every one of them is the letters page —
 * margin, rule, column — turned to a different job, because a page that keeps
 * changing shape is a page nobody learns. Where a screen needed something the
 * feed does not have, it is written here rather than bent into `paperStyles`.
 */
import { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight, ChevronUp, Search, ArrowLeft, Lock, ExternalLink } from 'lucide-react-native';

import PressableScale from '@/src/components/PressableScale';
import { colors, fonts } from '@/src/theme/theme';
import { BRASS, BRASS_STOPS } from '@/src/theme/brass';
import { scaledTextProps, decorativeTextProps, displayTextProps } from '@/src/constants/textScaling';
import { p, QUIET } from './paperStyles';
import { KIND_RULE, MARGIN_W, RULE_W, RULE_GAP, AVATAR, CRIMSON_INK, UNSPOKEN } from './paperMetrics';
import { Byline, Credit, type PaperAuthor, type PaperFilm } from './PaperPost';
import { clipToSentence } from './paperText';

/* ═══ THE PICKER ══════════════════════════════════════════════════════════════
 * The brass ＋ opens this. Five forms, each named in its own ink with one line
 * saying what it is for — which is the first place a member meets the colour
 * code, so the code is taught before it is ever used as a filter.
 *
 * The two an Auteur can file are NOT hidden. A form you cannot see is a feature
 * you never learn exists; a form you can see and cannot use is an invitation.
 * They are dimmed, locked, and say who may file them.
 */
export interface Form {
  kind: keyof typeof KIND_RULE;
  name: string;
  line: string;
  locked?: boolean;
}

export const FORMS: Form[] = [
  /* No character count. It said "280 characters", which was a rule we decided
     not to make — a take is 2,000 like every other post — and a line that
     names a limit is a line that has to be corrected every time the limit
     moves. The composer counts down as you write; the menu says what the form
     is FOR. */
  { kind: 'take', name: 'TAKE', line: 'Say the thing nobody else will.' },
  { kind: 'seeking', name: 'SEEKING', line: 'Ask the house what to watch tonight.' },
  { kind: 'wire', name: 'WIRE', line: 'News from elsewhere, carrying its source.' },
  { kind: 'ballot', name: 'BALLOT', line: 'Put a question to the house. Two to six films.', locked: true },
  { kind: 'dossier', name: 'DOSSIER', line: 'An essay, at length, in parts if you like.', locked: true },
];

export const PaperPicker = memo(function PaperPicker({ forms = FORMS }: { forms?: Form[] }) {
  return (
    <View style={m.sheet}>
      <View style={m.grab} />
      <Text style={m.pickHead} accessibilityRole="header" {...decorativeTextProps}>
        WHAT ARE YOU FILING?
      </Text>
      {forms.map((f, i) => (
        <View key={f.kind}>
          {i > 0 && <View style={p.hair} />}
          <PressableScale
            style={[m.formRow, f.locked && { opacity: 0.85 }]}
            hitSlop={{ top: 2, bottom: 2, left: 0, right: 0 }}
            haptic="medium" disabled={f.locked}
            accessibilityRole="button"
            accessibilityState={{ disabled: !!f.locked }}
            accessibilityLabel={f.locked ? `${f.name}. Auteurs only. ${f.line}` : `${f.name}. ${f.line}`}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[p.leadIn, { color: KIND_RULE[f.kind] }]} {...decorativeTextProps}>
                {f.name}
              </Text>
              <Text style={m.formLine} {...scaledTextProps}>{f.line}</Text>
            </View>
            {f.locked ? (
              <View style={m.lockRow}>
                <Lock size={9} strokeWidth={2} color={colors.sepia} />
                <Text style={m.lockText} {...decorativeTextProps}>AUTEURS</Text>
              </View>
            ) : (
              <ChevronRight size={15} strokeWidth={2} color={colors.sepia} />
            )}
          </PressableScale>
        </View>
      ))}
    </View>
  );
});

/* ═══ THE DOOR ════════════════════════════════════════════════════════════════
 * A new member reads from the first minute and files after five films and two
 * days. The rule is not a wall to argue with, it is a door with a handle: the
 * page states exactly what remains, and the only act it offers is the one that
 * moves the count.
 *
 * The two conditions are drawn as rules that FILL — the ballot's device, doing
 * the same job — so "three of five" is a length before it is a number.
 */
export const PaperDoor = memo(function PaperDoor({
  films, filmsNeeded, days, daysNeeded,
}: { films: number; filmsNeeded: number; days: number; daysNeeded: number }) {
  // The return type is written out because a template literal widens to `string`,
  // and React Native's DimensionValue accepts `${number}%` but not `string` — so
  // an untyped version is a type error at every call site rather than here.
  const bar = (a: number, b: number): `${number}%` =>
    `${Math.min(100, Math.round((a / b) * 100))}%`;
  return (
    <View style={p.empty}>
      <View style={p.emptyRules} pointerEvents="none">
        {[0.13, 0.115, 0.10].map((o, i) => (
          <View key={i} style={[p.emptyRule, { borderBottomColor: `rgba(184,137,26,${o})` }]} />
        ))}
      </View>

      <Text style={p.emptyTitle} accessibilityRole="header" {...displayTextProps}>
        The door opens shortly.
      </Text>
      <Text style={p.emptyBody} {...scaledTextProps}>
        The house lets you read from the first minute. Filing waits until it
        knows what you watch.
      </Text>

      <View style={m.gate}>
        <View style={m.gateRow}>
          <Text style={m.gateLabel} {...scaledTextProps}>FILMS LOGGED</Text>
          <Text style={m.gateValue} {...scaledTextProps}>{films} OF {filmsNeeded}</Text>
        </View>
        <View style={p.fillTrack}>
          <LinearGradient colors={BRASS} locations={BRASS_STOPS}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={[p.fillBar, { width: bar(films, filmsNeeded) }]} />
        </View>

        <View style={[m.gateRow, { marginTop: 16 }]}>
          <Text style={m.gateLabel} {...scaledTextProps}>DAYS A MEMBER</Text>
          <Text style={m.gateValue} {...scaledTextProps}>{days} OF {daysNeeded}</Text>
        </View>
        <View style={p.fillTrack}>
          <LinearGradient colors={BRASS} locations={BRASS_STOPS}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={[p.fillBar, { width: bar(days, daysNeeded) }]} />
        </View>
      </View>

      {/* One act, and it is the one that moves the count. A button that merely
          dismissed this would be a button that changed nothing. */}
      <PressableScale style={[p.btn, { marginTop: 24 }]} haptic="medium"
        accessibilityRole="button" accessibilityLabel="Go and log a film">
        <Text style={p.btnText} {...scaledTextProps}>LOG A FILM</Text>
      </PressableScale>
      <Text style={p.quiet} {...scaledTextProps}>NOTHING IS HIDDEN FROM YOU MEANWHILE</Text>

      <View style={p.emptyRules} pointerEvents="none">
        {[0.06, 0.04, 0.02].map((o, i) => (
          <View key={i} style={[p.emptyRule, { borderBottomColor: `rgba(184,137,26,${o})` }]} />
        ))}
      </View>
    </View>
  );
});

/* ═══ THE HOUSE RULES ═════════════════════════════════════════════════════════
 * The letters page, unchanged, doing the one job it was literally invented for:
 * a numbered clause in the margin, the clause itself in the column. Nothing was
 * designed for this screen — it is the page it already is, carrying rules
 * instead of filings, which is why it needs no explaining.
 */
export const CLAUSES: Array<[string, string]> = [
  ['I', 'Argue with the film. Never with the member.'],
  ['II', 'Mark a spoiler before you write one. The house hides it either way, but you should have meant to.'],
  ['III', 'A wire carries its source. No source, no wire.'],
  ['IV', 'One member, one name. A second voice is not a second person.'],
  ['V', 'Five members report a filing and the house reads it. Five is not a verdict.'],
  ['VI', 'What you keep is yours and is never shown. What you file is the house’s and is.'],
];

export const PaperRules = memo(function PaperRules() {
  return (
    <View>
      <Text style={m.rulesHead} accessibilityRole="header" {...displayTextProps}>
        The house rules
      </Text>
      <Text style={m.rulesStand} {...scaledTextProps}>
        Six, and they have not changed since the room had a projector in it.
      </Text>
      {CLAUSES.map(([n, text], i) => (
        <View key={n}>
          {i > 0 && <View style={p.hair} />}
          <View style={[p.postRow, { paddingVertical: 12 }]}>
            <View style={p.margin}>
              <Text style={p.marginValue} {...decorativeTextProps}>{n}</Text>
            </View>
            <View style={p.column}>
              <Text style={m.clause} {...scaledTextProps}>{text}</Text>
            </View>
          </View>
        </View>
      ))}
      <Text style={m.rulesFoot} {...decorativeTextProps}>IN FORCE SINCE 1924</Text>
    </View>
  );
});

/* ═══ THE ARCHIVE ═════════════════════════════════════════════════════════════
 * An Archivist can read everything the house has ever said about one film,
 * gathered in one place — the only thing on this page that search does which
 * scrolling cannot.
 *
 * The film is the RESULT, not a filter chip: it is set as a plate with its
 * count and its span, and the filings run beneath it as the same entries they
 * are anywhere else. Nothing is re-styled for having been found.
 */
export const PaperArchive = memo(function PaperArchive({
  query, film, count, span, children,
}: {
  query: string; film: PaperFilm; count: number; span: string; children?: React.ReactNode;
}) {
  return (
    <View>
      <View style={m.searchRow}>
        <Search size={13} strokeWidth={2} color={colors.sepia} />
        <Text style={m.searchText} numberOfLines={1} {...scaledTextProps}>{query}</Text>
        <Text style={m.searchMark} {...decorativeTextProps}>ARCHIVIST</Text>
      </View>

      <View style={m.found}>
        <View style={m.foundPlate}>
          {film.posterPath ? (
            <Image source={{ uri: film.posterPath }} style={p.plateArt} contentFit="cover" />
          ) : null}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={m.foundTitle} numberOfLines={2} {...displayTextProps}>{film.title}</Text>
          <Text style={m.foundMeta} numberOfLines={1} {...scaledTextProps}>
            {[film.year, film.director?.toUpperCase()].filter(Boolean).join(' · ')}
          </Text>
          <Text style={m.foundCount} {...scaledTextProps}>{count} FILINGS · {span}</Text>
        </View>
      </View>
      {children}
    </View>
  );
});

/* ═══ A MEMBER'S ROOM ═════════════════════════════════════════════════════════
 * Their filings, on their profile. The head says whose room it is once, and the
 * entries then print no byline at all — twenty consecutive repeats of the same
 * name is the page saying nothing twenty times.
 */
export const PaperRoom = memo(function PaperRoom({
  author, filed, certified,
}: { author: PaperAuthor; filed: number; certified: number }) {
  return (
    <View style={m.roomHead}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Byline author={author} />
      </View>
      <Text style={m.roomCount} {...decorativeTextProps}>
        {filed} FILED · {certified} CERTIFIED
      </Text>
    </View>
  );
});

/* ═══ THE REPORTED DOCKET ═══════════════════════════════════════════════════════
 * Five reports send a filing here. The Tribunal's docket already exists in this
 * app; this is the Dispatch's case laid out in its language — the report count
 * in the margin, because that is what ordered the queue, and the filing quoted
 * beneath the reasons it was reported for.
 *
 * Two acts, and they are opposite and equal in weight. A docket that makes one
 * verdict easier than the other is not a docket.
 */
export const PaperCase = memo(function PaperCase({
  reports, reasons, kind, body, author, age,
}: {
  reports: number; reasons: string; kind: keyof typeof KIND_RULE;
  body: string; author: PaperAuthor; age: string;
}) {
  return (
    <View style={{ paddingVertical: 12 }}>
      <View style={p.postRow}>
        <View style={p.margin}>
          <Text style={[p.marginValue, { color: CRIMSON_INK }]} {...displayTextProps}>{reports}</Text>
        </View>
        <View style={p.column}>
          <Text style={m.caseReasons} numberOfLines={1} {...decorativeTextProps}>
            {reasons.toUpperCase()}
          </Text>
          <Text style={m.caseBody} numberOfLines={3} {...scaledTextProps}>
            <Text style={[p.leadIn, { color: KIND_RULE[kind] }]}>{kind.toUpperCase()} — </Text>
            {body}
          </Text>
          <View style={{ marginTop: 8 }}>
            <Byline author={author} trailing={age} />
          </View>
        </View>
      </View>
      <View style={m.verdicts}>
        <PressableScale style={m.verdict} haptic hitSlop={{ top: 10, bottom: 10, left: 0, right: 0 }}
          accessibilityRole="button" accessibilityLabel="Let this filing stand">
          <Text style={m.verdictText} {...scaledTextProps}>LET IT STAND</Text>
        </PressableScale>
        <PressableScale style={[m.verdict, m.verdictStrike]} haptic="medium" hitSlop={{ top: 10, bottom: 10, left: 0, right: 0 }}
          accessibilityRole="button" accessibilityLabel="Strike this filing">
          <Text style={[m.verdictText, { color: CRIMSON_INK }]} {...scaledTextProps}>STRIKE IT</Text>
        </PressableScale>
      </View>
    </View>
  );
});

/* ═══ THE TWO CARDS A FILING TRAVELS AS ═══════════════════════════════════════
 * SHARE  the image that leaves the app entirely — a printed clipping, so it
 *        carries the masthead, the writing, and where it came from, and nothing
 *        else. Someone who has never heard of the house has to be able to read
 *        it cold.
 * LOUNGE the same filing dropped into a chat: compact, in the chat's own
 *        bubble, and it still names its kind in its ink so the code holds even
 *        outside the page.
 */
/* ── THERE IS ONE SHARE CARD, AND IT IS THE DOSSIER'S ─────────────────────
 * A generic card stood here, taking any kind. It went when we settled that
 * only an essay earns an image of its own: a take shared as a poster is a
 * poster of somebody's opinion, and a seeking is a poster of somebody's
 * question. Nobody makes those. See `DossierShareCard` below.
 */

/* ═══ THE DOSSIER'S CARD ══════════════════════════════════════════════════════
 * The one filing that earns an image of its own.
 *
 * A take shared as a poster is a poster of somebody's opinion; a seeking shared
 * as a poster is a poster of somebody's question. Nobody makes those. An essay
 * is different — it is a finished piece of writing, and a clipping of a finished
 * piece of writing is a thing people have been cutting out of newspapers for a
 * hundred years. So the share card is a DOSSIER card and there are no others.
 *
 * ── IT IS AN IMAGE, NOT A SCREEN ─────────────────────────────────────────────
 * Everything below follows from that one fact, and it is why this card is not
 * simply the page in a box:
 *
 *  1. FIXED SHAPE, TEXT FITS IT. 4:5 — the most-shared portrait ratio, and the
 *     proportion of a cutting. The card never grows to the writing; the writing
 *     is cut to the card by `clipToSentence`, which ends it on a full sentence.
 *
 *  2. NO FONT SCALING, ANYWHERE. Every other surface in this design honours the
 *     member's text size, because reading is the point. Here it would be a bug:
 *     a member at 130% would export an image with its own masthead pushed off
 *     the top. An exported image must be identical on every device that makes
 *     it, so every string on this card is `decorativeTextProps`.
 *
 *  3. BUILT FOR SOMEBODY ELSE'S COMPRESSION. This is the only asset that leaves
 *     the app and gets re-encoded by Instagram's and WhatsApp's servers. The
 *     page's 0.34-opacity hairlines and 8.5pt letterspaced labels turn to grey
 *     mush in a JPEG round-trip, so the card keeps the look and changes the
 *     build: rules at 2pt and full strength, no type under 11pt, no italic
 *     below the passage, and nothing that depends on fine detail.
 *
 *  4. READABLE AT A THUMBNAIL. In a WhatsApp chat list this is about 200px
 *     wide. If the title cannot be read there the share does nothing at all —
 *     hence a display title given the room to be large, and a short passage
 *     under it rather than a full column of text.
 */
/**
 * Title size, off the character count. Five steps, tuned against the card's
 * measure so the longest title at each step still sets in four lines or fewer.
 * The ceiling on a title is 200 characters; past the bottom step it is set at
 * the smallest size and allowed to end in an ellipsis, which is the one case
 * this card cannot draw whole and should not pretend to.
 */
/**
 * How wide a string actually SETS, not how many characters it has.
 *
 * The ladder counted characters, which is the same thing only in Latin. A CJK
 * ideograph is a full em — twice the width of an average Latin letter — so an
 * eighteen-character Japanese title measured as "short" and was set at the
 * largest step, filling two lines at 32pt where the same measurement in English
 * would have filled half a line. It held, but only because it was short; forty
 * ideographs would have gone straight through the card.
 *
 * Counting the wide ranges as two makes one ladder correct for every script the
 * house's members write in.
 *
 * ── AND EMOJI ARE EM-WIDTH TOO ───────────────────────────────────────────────
 * The first version of this covered scripts and stopped there, which left the
 * commonest wide character of all counting as narrow. A title of twenty emoji
 * measured "short", took the ladder's largest step, and would have set at forty
 * characters' width in a box built for twenty.
 *
 * A flag is the sharpest case: two regional indicators, two code points, two
 * ems — and the old rule called it two narrow characters, so it was wrong by a
 * factor of two on the one glyph most likely to open a title.
 *
 * The ranges cover pictographs and transport, the enclosed alphanumerics that
 * pair into flags, cards and tiles, the dingbats, and U+FE0F — the variation
 * selector that turns an otherwise-narrow glyph emoji-wide.
 */
const WIDE = /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6\u2600-\u27BF\uFE0F\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F1FF}\u{1F300}-\u{1FAFF}]/u;
const visualLen = (t: string) => {
  let n = 0;
  for (const ch of t) n += WIDE.test(ch) ? 2 : 1;
  return n;
};

const titleType = (t: string) => {
  const n = visualLen(t);
  return n <= 26 ? { fontSize: 32, lineHeight: 38 }
    : n <= 44 ? { fontSize: 28, lineHeight: 34 }
    : n <= 68 ? { fontSize: 24, lineHeight: 30 }
    : n <= 104 ? { fontSize: 20, lineHeight: 26 }
    /* 16.5, not 17. The page sets its own display headlines at 16.5 and the
       card's floor was invented at 17 — half a point away, on the other side of
       the design, where no single-page audit could ever see it. Measuring the
       page and the cards TOGETHER is the only thing that finds this class. */
    : { fontSize: 16.5, lineHeight: 23 };
};

/**
 * ── THE CARD IS A FIXED BUDGET, AND THE TITLE SPENDS FIRST ───────────────────
 * Drawn against a title at its 200-character ceiling, the card broke: four lines
 * of display type ran past the room the middle had, and the opening was drawn
 * straight through the last line of the title. Two separate faults.
 *
 * The first is that "the title never truncates" was a promise nothing could
 * keep. Two hundred characters cannot be set legibly on a card at any size — at
 * the ladder's floor it needs seven lines. So the honest rule is the one the
 * body already follows: cut at a WORD, never mid-word, and mark the cut.
 *
 * 112 is where the floor step fills four lines exactly, so a title is set whole
 * whenever it possibly can be and trimmed only when it truly cannot.
 */
/** Size, face and leading resolved together — one call, one answer, no way for
 *  a caller to take the face and forget the leading that belongs with it. */
const titleSet = (t: string) => {
  const face = titleFace(t);
  const type = titleType(t);
  return {
    fontFamily: face.fontFamily,
    fontSize: type.fontSize,
    lineHeight: Math.round(type.lineHeight * face.lead),
  };
};

const TITLE_MAX = 112;
const fitTitle = (t: string) => {
  const s = (t ?? '').trim();
  if (visualLen(s) <= TITLE_MAX) return s;
  const w = s.slice(0, TITLE_MAX);
  const sp = w.lastIndexOf(' ');
  return (sp > 0 ? w.slice(0, sp) : w).replace(/[\s,;:.—-]+$/, '') + '…';
};

/**
 * The second fault: the opening had a FIXED budget while the title's height
 * varied, so a tall title and a long opening both claimed the same room and the
 * card lost. The opening is paid last, out of what the title left — which is
 * also what makes the card genuinely responsive to what a member writes rather
 * than to what the fixture happened to contain.
 *
 * `lines` is the hard backstop underneath the sentence cut. The cut should
 * always land first; this exists so that no title, at no width, on no device,
 * can push the member's own signature off the bottom of the card.
 *
 * ── THE NUMBERS ARE MEASURED, NOT ESTIMATED ──────────────────────────────────
 * They were guessed twice and were wrong twice. Reckoning the card's measure at
 * roughly 47 characters a line gave budgets the layout could not hold, so the
 * backstop fired on top of the cut and the opening came out as `…and..` once
 * and `…to watch i…` the next time — the line-clamp truncating text the
 * sentence cut had already finished with, mid-word, on the house's one public
 * asset. Counted off the render, the measure is ~38 characters, and every
 * budget below is that figure times the lines the title left standing.
 */
/* A wider measure holds more per line, so the budgets rise with it: at 20pt of
   padding the card sets ~44 characters a line rather than ~38, and an opening
   cut to the old numbers would leave the card half empty — which is the same
   fault as before wearing the opposite face. */
const openingRoom = (titleLen: number, lead = 1) => {
  const base = titleLen <= 26 ? { max: 210, lines: 5 }
    : titleLen <= 44 ? { max: 165, lines: 4 }
    : { max: 125, lines: 3 };
  /**
   * ── THE TITLE'S HEIGHT, NOT ITS LENGTH ─────────────────────────────────────
   * The budget was reckoned from how many characters the title has. That is the
   * same thing as how much room it takes only when every title has the same
   * leading — and CJK titles are set at 1.5, because an ideograph fills its em
   * box and Latin leading cuts the bottom off it.
   *
   * So a Japanese title of the same measured length is half again as TALL, and
   * the opening underneath it was being handed room the card did not have. It
   * cost four points of clipping on the title and five on the passage, and only
   * appeared once the measure was widened and the budgets rose with it.
   *
   * One line of the title's own leading, taken out of the opening's.
   */
  if (lead <= 1) return base;
  return { max: Math.round(base.max * 0.7), lines: Math.max(2, base.lines - 1) };
};

/**
 * ── THE FACE THE TITLE CAN ACTUALLY BE SET IN ────────────────────────────────
 * Rye is a display face with a Latin character set and nothing else. A member
 * writing in Japanese, Arabic, Russian, Greek or Hebrew — and this house has
 * members who will — would export a card whose title is a row of empty boxes.
 *
 * React Native does not cascade font families, so there is no fallback list to
 * lean on: the face has to be CHOSEN. Anything outside Latin, its accents and
 * ordinary punctuation is set in the serif instead, which carries far more of
 * Unicode and, failing that, hands off to the system face rather than tofu.
 *
 * The card loses its display face in those cases. It keeps the member's title,
 * which is the trade worth making every time.
 */
// Basic Latin, Latin-1 and Latin Extended A/B (U+0020-U+024F), plus general
// punctuation (U+2000-U+206F) for the quotes, dashes and ellipsis a title uses.
const LATIN = /^[\u0020-\u024F\u2000-\u206F]*$/;
/**
 * Face AND leading, together, because they are one decision.
 *
 * They were two, and the pixel audit caught what that costs: the Japanese title
 * was clipped four points at the bottom. A CJK glyph fills its em box — no
 * x-height, no descender to borrow room from — so the 1.21 leading that suits
 * Rye cuts the bottom off 語 and 屋. Latin leading applied to a script that
 * does not have Latin's proportions is a fault the eye reads as a broken font.
 *
 * 1.5 is the leading CJK type is normally set at, and asking for it here also
 * means the fallback face never has to guess.
 */
const titleFace = (t: string) =>
  LATIN.test(t)
    ? { fontFamily: fonts.display, lead: 1 }
    : { fontFamily: fonts.serifMedium, lead: 1.5 / 1.21 };

export const DossierShareCard = memo(function DossierShareCard({
  // `max` takes NO default. It had one, and a default is not an absence: the
  // computed room was never once consulted, `max ?? room.max` resolved to the
  // default every time, and the line-clamp did all the cutting — which is how
  // an opening trimmed cleanly by the sentence cut still reached the card as
  // `…have gone, and…`. Two renders were spent blaming a stale cache for it.
  title, opening, author, filed, logo, width, max, ratio = 4 / 5,
}: {
  title: string; opening: string;
  /**
   * NULL when the member has closed their account. The card must still draw:
   * the essay survives, the name does not, and `request_account_deletion`
   * nulls the author on rows exactly like this one. Reaching into `author.name`
   * without this would crash the export for every essay by a departed member —
   * on the asset that is supposed to be the house's introduction to strangers.
   */
  author: PaperAuthor | null;
  /**
   * The dateline, and the ONLY time on this card.
   *
   * The read time was here too, and it went through three versions before going
   * away: `12 MIN` was read as "twelve minutes ago" — fair, on an asset that
   * will still be sitting in a WhatsApp thread a year from now — and `12 MIN
   * READ` was read as nothing at all by the next person who saw it. It is a
   * blog's device, invented for feeds that had to promise readers an exit. A
   * clipping never told you how long it would take; it told you WHEN, which is
   * the fact that stops it going stale.
   */
  filed: string;
  logo?: string;
  /**
   * Left undefined the card fills whatever it is placed in, and `aspectRatio`
   * takes the height from there. A number is for the story ground, which sets
   * the card's size deliberately rather than inheriting a screen's.
   */
  width?: number;
  /** Overrides the room the title left. Only the story export needs this. */
  max?: number;
  /**
   * The card's proportion, so the three candidates can be looked at side by
   * side rather than argued about. 4:5 is the most-shared portrait ratio and
   * the one a cutting usually has; 1:1 reads wider and sets longer lines; 4:3
   * is a plate rather than a clipping.
   */
  ratio?: number;
}) {
  const head = fitTitle(title);
  // visualLen, not .length — the same measure the ladder uses, so the room the
  // title leaves is reckoned in the width it actually took, in any script.
  const room = openingRoom(visualLen(head), titleFace(head).lead);
  const cut = clipToSentence(opening, max ?? room.max);
  return (
    <View style={[m.share, { aspectRatio: ratio }, width !== undefined && { width }]}>
      {/* THE INNER RULE. A printed card has two borders — the plate edge and a
          hairline set in from it — and the gap between them is most of what makes
          a rectangle read as PRINTED rather than as drawn. It sits behind
          everything and takes no part in the layout. */}
      <View style={m.shareInner} pointerEvents="none" />

      {logo ? <Image source={{ uri: logo }} style={m.shareLogo} contentFit="contain" /> : null}

      {/* The nameplate rule is BRASS, not flat sepia. The house's four-stop ramp
          is on every rule that matters everywhere else in the app; this card was
          the one place still setting it as a single colour, which is exactly the
          detail that separates a real nameplate from a line. */}
      <LinearGradient colors={BRASS} locations={BRASS_STOPS}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={m.shareRuleTop} />
      {/* The dateline sits in the nameplate, between the rules, because that is
          where a paper puts it and where anyone holding a cutting looks for it. */}
      <Text style={m.shareMast} {...decorativeTextProps}>THE DISPATCH</Text>
      <Text style={m.shareDateline} {...decorativeTextProps}>{filed}</Text>
      <View style={m.shareRuleBottom} />

      {/* Centred in whatever room the masthead and the signature leave, so a
          four-minute essay sits in the middle of its card instead of stranding
          the writing at the top over a third of empty ground. */}
      <View style={m.shareMiddle}>
        {/* DOSSIER, and nothing beside it.
            It carried the read time — `12 MIN`, then `12 MIN READ` once the bare
            version was read as "twelve minutes ago". The second reader did not
            know what it meant either, which settles it: a length of reading is a
            blog's idea, invented for a feed that needed to promise you an exit.
            A clipping cut out of a newspaper never told you how long it would
            take. The nameplate carries the date; this line carries the kind. */}
        <Text style={m.shareKind} {...decorativeTextProps}>
          <Text style={{ color: KIND_RULE.dossier }}>DOSSIER</Text>
        </Text>

        {/* The size is COMPUTED, not negotiated. `adjustsFontSizeToFit` is the
            obvious tool and it is the wrong one here twice over: it is unreliable
            on Android with more than one line, and it makes the type size depend
            on the renderer — on the single asset whose whole job is to look
            identical everywhere it is exported. Drawn with it, a 72-character
            title came out cut to `…Refuses to Do, an…` rather than set smaller.
            A ladder off the character count is deterministic, is the same on both
            platforms, and cannot truncate what it can simply set smaller. */}
        <Text style={[m.shareTitle, titleSet(head)]} numberOfLines={4} {...decorativeTextProps}>
          {head}
        </Text>

        <Text style={m.shareBody} numberOfLines={room.lines} {...decorativeTextProps}>
          {cut.text}
        </Text>

        {/* A newspaper prints "continued on page 4". The card cannot name a page,
            so it says the only true thing it knows — and only when it is true.
            An essay short enough to fit whole must not claim to run on. */}
        {cut.clipped ? (
          <View style={m.shareMore}>
            {/* A printer's ornament, not a line. Rule, star, rule is the mark a
                compositor set where a piece broke off — and ✦ is already this
                house's ornament, so the card is speaking the app's own hand
                rather than borrowing a divider from somewhere else. */}
            <View style={m.shareOrn}>
              <View style={m.shareOrnRule} />
              <Text style={m.shareOrnMark} {...decorativeTextProps} {...UNSPOKEN}>✦</Text>
              <View style={m.shareOrnRule} />
            </View>
            <Text style={m.shareMoreText} {...decorativeTextProps}>THE ESSAY CONTINUES</Text>
          </View>
        ) : null}
      </View>

      {/* The page's `Byline` sets a name at 8.5pt, which is right on a page you
          hold and wrong here twice: it is under this card's 11pt floor, so the
          compression closes its letterspacing into a smear — and the thing it
          smears is the member's own name, the one line on the card they care
          most about surviving the trip. So the foot is set at card scale. */}
      <View style={m.shareFoot}>
        <View style={m.shareByWrap}>
          {author?.avatar ? (
            <Image source={{ uri: author.avatar }} style={m.shareAvatar} contentFit="cover" />
          ) : null}
          <Text style={m.shareBy} numberOfLines={1} {...decorativeTextProps}>
            {author ? author.name.toUpperCase() : 'A MEMBER, DEPARTED'}
            {author ? <Text style={m.shareByNo}>{`  ·  No. ${author.memberNo}`}</Text> : null}
          </Text>
        </View>
        <Text style={m.shareFrom} {...decorativeTextProps}>REELHOUSE</Text>
      </View>
    </View>
  );
});

/* ═══ THE STORY EXPORT ════════════════════════════════════════════════════════
 * The same card, centred on a 9:16 ground — NOT a second layout.
 *
 * Two layouts drift. One gets a fix the other does not, and six months later the
 * house has two different faces depending on where a member pressed share. So
 * there is one card, and a story is that card sitting on a surface, which is
 * also exactly what people do by hand when an app fails to offer it.
 *
 * The band top and bottom is not margin for looks. Instagram and TikTok both
 * paint their own chrome over those zones — a username, a caption, a row of
 * buttons — and a full-bleed card would have its masthead under somebody's
 * handle. The card sits inside what the platforms leave alone.
 */
export const StoryFrame = memo(function StoryFrame({
  width = 320, cardWidth = 358, children,
}: { width?: number; cardWidth?: number; children: React.ReactNode }) {
  const height = Math.round((width * 16) / 9);
  /**
   * SCALED, not re-laid-out. The first version drew the card at the narrower
   * story width, which is a different layout wearing the same name: the type
   * stayed the size it was, the measure shrank, and the title vanished entirely
   * while the signature was clipped off the bottom.
   *
   * A transform is the honest reading of "the same card on a ground" — every
   * proportion held, nothing reflowed, one layout to keep correct.
   */
  const scale = (width * 0.86) / cardWidth;
  return (
    <View style={[m.story, { width, height }]}>
      <View style={[m.storySafe, { width: cardWidth, transform: [{ scale }] }]}>
        {children}
      </View>
    </View>
  );
});

/* ═══ THE CARD A FILING TRAVELS AS, INTO A ROOM ═══════════════════════════════
 * Every kind can be dropped into a lounge, because that is POINTING at something
 * rather than making a poster of yourself — "look at this ballot", "someone is
 * asking, go and help them".
 *
 * ── ONE SHAPE WAS THE BUG ────────────────────────────────────────────────────
 * The first version gave all five the same body-and-meta bubble, which is right
 * for a take and drops the defining fact of three others:
 *
 *   WIRE     had no source. A wire without its source is an unattributed claim,
 *            which is the one thing that kind exists not to be.
 *   BALLOT   showed the question and never the result — so a closed ballot
 *            arrived in a room carrying everything except its answer.
 *   DOSSIER  had its TITLE set as running body text, reading as a sentence
 *            somebody had begun rather than as the name of an essay.
 *
 * So the bubble keeps one skeleton — the kind's rule, the kind's name in its
 * ink, the meta line — and the middle carries whatever that kind is FOR.
 */
export const LoungeCard = memo(function LoungeCard({
  kind, body, author, certifyCount, commentCount,
  title, source, result, answered, ended,
}: {
  kind: keyof typeof KIND_RULE; body: string;
  /** NULL once the member has closed their account — same law as the page. */
  author: PaperAuthor | null;
  certifyCount: number; commentCount: number;
  /** dossier: the essay's name, set as a name. */
  title?: string;
  /** wire: where it came from. Never optional in practice — a wire always has one. */
  source?: string;
  /** ballot: the answer, once there is one. */
  result?: string;
  /** seeking: somebody answered it. */
  answered?: boolean;
  /** The filing was withdrawn or struck after this card was posted. */
  ended?: 'author' | 'house';
}) {
  const ink = KIND_RULE[kind];

  /* A card outlives the filing it points at. When the filing ends, the copy
     sitting in this room has to end with it — otherwise a withdrawn take keeps
     being readable in every lounge it ever reached, which makes the withdrawal
     a fiction. The bubble stays so the conversation around it still makes
     sense; what it was quoting does not. */
  /* EVERY CLIPPING IS A DOOR. The lounge's own comment above its shared-content
     card says exactly that, and this one was a plain View — a filing quoted in a
     room with no way to reach it. A tombstone is a door too: the filing is gone,
     the page and its critiques are not. */
  if (ended) {
    return (
      <PressableScale style={[m.bubble, m.bubbleEnded]} haptic="selection" pressedScale={0.98}
        accessibilityRole="button" accessibilityLabel="Open this filing">
        <View style={[m.loungeRule, { backgroundColor: colors.fog, opacity: 0.4 }]} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={m.loungeGone} {...scaledTextProps}>
            {ended === 'author'
              ? 'This filing was withdrawn by its author.'
              : 'This filing was removed by the house.'}
          </Text>
        </View>
      </PressableScale>
    );
  }

  return (
    <PressableScale style={m.bubble} haptic="selection" pressedScale={0.98}
      accessibilityRole="button"
      accessibilityLabel={`Open this ${kind}${title ? `: ${title}` : ''}${author ? `, by ${author.name}` : ''}`}>
      <View style={[m.loungeRule, { backgroundColor: ink }]} />
      <View style={{ flex: 1, minWidth: 0 }}>
        {/* A dossier leads with its name, on its own line, in the display face —
            the same way it leads on the page and on the share card. */}
        {kind === 'dossier' && title ? (
          <>
            <Text style={[p.leadIn, m.loungeKind, { color: ink }]} {...decorativeTextProps}>
              DOSSIER
            </Text>
            <Text style={m.loungeTitle} numberOfLines={2} {...scaledTextProps}>{title}</Text>
            <Text style={m.loungeBody} numberOfLines={2} {...scaledTextProps}>{body}</Text>
          </>
        ) : (
          <Text style={m.loungeBody} numberOfLines={3} {...scaledTextProps}>
            <Text style={[p.leadIn, { fontSize: 8.5, color: ink }]}>{kind.toUpperCase()} — </Text>
            {body}
          </Text>
        )}

        {/* The kind's own fact, under the writing, in the kind's own ink. */}
        {/* The wire's source is the ONE outbound link in the whole Dispatch, and
            it leaves the app. So it names its host before it goes — a reader
            agreeing to open bfi.org.uk has agreed to something; a reader tapping
            an unlabelled arrow has agreed to nothing. The arrow says "this
            leaves", the host says where to. */}
        {kind === 'wire' && source ? (
          <View style={m.loungeSource}>
            <Text style={[m.loungeFact, { color: ink, marginTop: 0 }]} numberOfLines={1}
              {...decorativeTextProps}>
              {source.toUpperCase()}
            </Text>
            <ExternalLink size={9} strokeWidth={2} color={ink} />
          </View>
        ) : null}
        {kind === 'ballot' && result ? (
          <Text style={[m.loungeFact, { color: ink }]} numberOfLines={1} {...decorativeTextProps}>
            {`CLOSED · ${result.toUpperCase()}`}
          </Text>
        ) : null}
        {kind === 'seeking' && answered ? (
          <Text style={[m.loungeFact, { color: ink }]} numberOfLines={1} {...decorativeTextProps}>
            ANSWERED
          </Text>
        ) : null}

        {/* WHO WROTE IT, WITH A FACE.
            The card names two different members and only one of them belongs
            here: the person who SHARED it is the one sending the message, and
            the lounge already prints them above the bubble. The person who
            WROTE the filing was reduced to five letters of 7.5pt type on a
            counts line — the only name on the card that a reader is deciding
            whether to trust. It gets a photograph and its own line. */}
        <View style={m.loungeByRow}>
          {author?.avatar ? (
            <Image source={{ uri: author.avatar }} style={m.loungeAvatar} contentFit="cover" />
          ) : (
            <View style={[m.loungeAvatar, m.loungeAvatarNone]} />
          )}
          <Text style={m.loungeBy} numberOfLines={1} {...decorativeTextProps}>
            {author ? author.name.toUpperCase() : 'A MEMBER, DEPARTED'}
            {author ? <Text style={m.loungeByNo}>{`  ·  No. ${author.memberNo}`}</Text> : null}
          </Text>
        </View>

        <Text style={m.loungeMeta} numberOfLines={1} {...decorativeTextProps}>
          {`${certifyCount} CERTIFIED · ${commentCount} CRITIQUES`}
        </Text>
      </View>
    </PressableScale>
  );
});

/* ═══ FILINGS ARRIVED WHILE YOU WERE READING ══════════════════════════════════
 * A live page cannot insert entries above the one somebody is halfway through —
 * the writing moves under their thumb and they lose their place, which is the
 * single most common way a feed betrays a reader.
 *
 * So new filings are HELD, and offered. The count is exact and the act is one
 * tap. It is the only floating thing on the page, it is small, it sits under
 * the index rather than over the writing, and it leaves the moment it is used.
 */
/** The gutter the held-filings pill sits in — reserved by the list while any
 *  are held, so the pill never covers an entry. 31pt of pill plus 10pt clear. */
export const NEW_FILINGS_ROOM = 41;

export const NewFilings = memo(function NewFilings({ count }: { count: number }) {
  return (
    <View style={m.newWrap} pointerEvents="box-none">
      <PressableScale style={m.newPill} haptic="medium"
        accessibilityRole="button"
        accessibilityLabel={`${count} new filings. Go to the top.`}>
        <ChevronUp size={11} strokeWidth={2.5} color={colors.ink} />
        <Text style={m.newText} {...decorativeTextProps}>
          {count} NEW {count === 1 ? 'FILING' : 'FILINGS'}
        </Text>
      </PressableScale>
    </View>
  );
});

/* ═══ AN EVENT ════════════════════════════════════════════════════════════════
 * Somebody certified your filing, critiqued it, or a member you follow filed
 * something. The same page again: the hour in the margin, the event in the
 * column — the actor named at full strength, the verb quiet, and beneath it the
 * filing itself in the ink of its kind so you know WHICH of yours before you
 * open anything.
 *
 * Unread is a brass dot in the margin beside the hour, not a coloured row. A
 * page where the unread state is a background is a page that looks broken while
 * you catch up.
 */
export const PaperEvent = memo(function PaperEvent({
  actor, verb, kind, opening, hour, unread,
}: {
  actor: PaperAuthor; verb: string; kind: keyof typeof KIND_RULE;
  opening: string; hour: string; unread?: boolean;
}) {
  return (
    <View style={{ paddingVertical: 12 }}>
      <View style={p.postRow}>
        <View style={[p.margin, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
          {unread ? <View style={m.unread} /> : null}
          <Text style={p.marginValue} {...decorativeTextProps}>{hour}</Text>
        </View>
        <View style={p.column}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={[
              p.avatar,
              actor.tier === 'archivist' && p.avatarArchivist,
              actor.tier === 'auteur' && p.avatarAuteur,
            ]}>
              {actor.avatar ? (
                <Image source={{ uri: actor.avatar }} style={p.plateArt} contentFit="cover" />
              ) : (
                <Text style={p.avatarNo} {...decorativeTextProps}>{actor.memberNo}</Text>
              )}
            </View>
            <Text style={m.eventLine} numberOfLines={1} {...scaledTextProps}>
              <Text style={m.eventActor}>{actor.name.toUpperCase()}</Text>
              {`  ${verb}`}
            </Text>
          </View>
          <Text style={m.eventQuote} numberOfLines={2} {...scaledTextProps}>
            <Text style={[p.leadIn, { fontSize: 8.5, color: KIND_RULE[kind] }]}>
              {kind.toUpperCase()} —{' '}
            </Text>
            {opening}
          </Text>
        </View>
      </View>
    </View>
  );
});

/** A plain screen head for the pages reached from somewhere else. */
export const PaperBack = memo(function PaperBack({ label }: { label: string }) {
  return (
    <View style={m.back}>
      <PressableScale hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }} haptic="selection"
        accessibilityRole="button" accessibilityLabel="Back">
        <ArrowLeft size={15} strokeWidth={2} color={colors.sepia} />
      </PressableScale>
      <Text style={m.backLabel} {...decorativeTextProps}>{label}</Text>
      <View style={{ width: 15 }} />
    </View>
  );
});

const m = StyleSheet.create({
  // ── the picker ────────────────────────────────────────────────────────────
  sheet: {
    backgroundColor: 'rgba(8,6,4,0.99)',
    borderTopWidth: 1.5, borderTopColor: colors.sepiaBorder,
    borderTopLeftRadius: 6, borderTopRightRadius: 6,
    paddingHorizontal: 24, paddingTop: 8, paddingBottom: 34,
  },
  grab: {
    width: 34, height: 3, borderRadius: 2, alignSelf: 'center',
    backgroundColor: colors.sepia, opacity: 0.32, marginBottom: 16,
  },
  pickHead: {
    fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 2.2, color: colors.sepia,
    marginBottom: 4, includeFontPadding: false,
  },
  formRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  formLine: {
    fontFamily: fonts.bodyItalic, fontSize: 12.5, lineHeight: 19,
    color: colors.bone, opacity: QUIET, marginTop: 4,
  },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lockText: {
    fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 1.6, color: colors.sepia,
    includeFontPadding: false,
  },

  // ── the door ──────────────────────────────────────────────────────────────
  gate: { alignSelf: 'stretch', paddingHorizontal: 8, marginTop: 4 },
  gateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 },
  gateLabel: {
    fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 1.6, color: colors.fog,
    includeFontPadding: false,
  },
  gateValue: {
    fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.2, color: colors.parchment,
    includeFontPadding: false,
  },

  // ── the rules ─────────────────────────────────────────────────────────────
  rulesHead: {
    fontFamily: fonts.display, fontSize: 26, lineHeight: 34, color: colors.parchment,
    marginTop: 16, marginBottom: 8,
  },
  rulesStand: {
    fontFamily: fonts.bodyItalic, fontSize: 12.5, lineHeight: 21, color: colors.bone,
    opacity: QUIET, marginBottom: 16,
  },
  clause: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 21, color: colors.parchment },
  rulesFoot: {
    fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 2.2, color: colors.sepia,
    textAlign: 'center', marginTop: 16, includeFontPadding: false,
  },

  // ── the archive ───────────────────────────────────────────────────────────
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: colors.sepiaBorder, borderRadius: 2,
    paddingHorizontal: 8, paddingVertical: 8, marginTop: 12,
  },
  searchText: {
    flex: 1, minWidth: 0, fontFamily: fonts.body, fontSize: 12.5,
    color: colors.parchment, includeFontPadding: false,
  },
  searchMark: {
    fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 1.6, color: colors.sepia,
    includeFontPadding: false,
  },
  found: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingTop: 16, paddingBottom: 16 },
  foundPlate: {
    width: 46, height: 69, borderRadius: 2, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(240,232,176,0.26)',
    backgroundColor: 'rgba(20,16,11,0.9)',
  },
  foundTitle: { fontFamily: fonts.display, fontSize: 20, lineHeight: 28, color: colors.parchment },
  foundMeta: {
    fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.2, color: colors.fog,
    marginTop: 4, includeFontPadding: false,
  },
  foundCount: {
    fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.6, color: colors.sepia,
    marginTop: 8, includeFontPadding: false,
  },

  // ── a member's room ───────────────────────────────────────────────────────
  roomHead: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingTop: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(184,137,26,0.25)',
  },
  roomCount: {
    fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 1.6, color: colors.sepia,
    includeFontPadding: false,
  },

  // ── the docket ────────────────────────────────────────────────────────────
  caseReasons: {
    fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 1.6, color: CRIMSON_INK,
    marginBottom: 8, includeFontPadding: false,
  },
  caseBody: {
    fontFamily: fonts.serifItalic, fontSize: 13.5, lineHeight: 24,
    color: colors.parchmentBright, opacity: 0.9,
  },
  verdicts: {
    flexDirection: 'row', gap: 8, marginTop: 12,
    marginStart: MARGIN_W + RULE_W + RULE_GAP,
  },
  /** Equal in size, equal in weight. One outlined in brass, one in crimson —
   *  the difference is which, never how loud. */
  verdict: {
    flex: 1, borderWidth: 1, borderColor: colors.sepiaBorder, borderRadius: 2,
    paddingVertical: 8, alignItems: 'center',
  },
  verdictStrike: { borderColor: 'rgba(180,45,45,0.42)' },
  verdictText: {
    fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.6, color: colors.parchment,
    includeFontPadding: false,
  },

  // ── the share card ────────────────────────────────────────────────────────
  card: {
    backgroundColor: 'rgba(8,6,4,0.99)',
    borderWidth: 1.5, borderColor: colors.sepiaBorder, borderRadius: 3,
    paddingHorizontal: 24, paddingVertical: 24,
  },
  cardRuleTop: { height: 2, backgroundColor: colors.sepia, opacity: 0.55 },
  cardMast: {
    fontFamily: fonts.display, fontSize: 20, color: colors.parchment,
    textAlign: 'center', marginVertical: 8,
  },
  cardRuleBottom: { height: 1, backgroundColor: colors.sepia, opacity: 0.4, marginBottom: 24 },
  cardBody: {
    fontFamily: fonts.serifItalic, fontSize: 20, lineHeight: 29,
    color: colors.parchmentBright,
  },
  cardFilm: { marginTop: 16 },
  cardFoot: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 24, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: 'rgba(184,137,26,0.25)',
  },
  /** Square: the mark is 445x444, so the box matches its own proportion and no
   *  crop is possible whatever the renderer does with object-fit. */
  cardLogo: { width: 34, height: 34, alignSelf: 'center', marginBottom: 12 },
  cardFrom: {
    fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 2.2, color: colors.sepia,
    includeFontPadding: false,
  },

  // ── the dossier's share card ──────────────────────────────────────────────
  /**
   * 4:5, and the ratio is on the CARD rather than implied by its contents, so
   * the frame is the fixed thing and the writing is what gives way. `space-
   * between` then puts the masthead at the head and the byline at the foot at
   * every length of title, instead of leaving a short essay's card with its
   * signature floating in the middle.
   */
  share: {
    aspectRatio: 4 / 5,
    backgroundColor: 'rgba(8,6,4,0.99)',
    borderWidth: 2, borderColor: colors.sepiaBorder, borderRadius: 3,
    /* 16, down from 22. The ornament and the mark at full size cost about
       twenty points between them, and the last line of the opening went under
       the plate edge again. The room came out of the padding rather than out of
       the member's writing — the card can afford to breathe less; the essay
       cannot afford to say less. */
    /**
     * ── 20, NOT 28 ─────────────────────────────────────────────────────────
     * The card read narrow, and the ratio was not the reason: at 4:5 the frame
     * is a perfectly ordinary portrait. What made it feel squeezed was the
     * MEASURE inside it — 28pt of padding plus the inner rule's 7pt inset put
     * 35pt of dead margin on each side of a 358pt card. A fifth of the width
     * was empty, so the text column sat thin inside a frame that was not.
     *
     * Tested the other way first: 1:1 and 5:4 both shredded the type, because
     * the whole ladder is tuned for this proportion. Widening the shape was
     * never the fix; widening the LINE was.
     */
    paddingHorizontal: 20, paddingVertical: 16,
    justifyContent: 'flex-start',
    /**
     * The frame wins. Drawn the first time, the stack came out 28pt taller than
     * 4:5 and the byline was cut in half by the card's own edge — on the one
     * asset that carries the member's name out of the app. Every margin below
     * was then cut until the content clears the frame with room left over,
     * because a signature half-printed is worse than no card at all.
     */
    overflow: 'hidden',
  },
  /** Inset 7 from the plate edge: close enough to read as one border, far enough
   *  that the gap survives being re-encoded by somebody else's server. */
  shareInner: {
    position: 'absolute', left: 7, right: 7, top: 7, bottom: 7,
    borderWidth: 1, borderColor: 'rgba(184,137,26,0.28)', borderRadius: 1,
  },
  /** 40, not 34. It was set at favicon size — the most distinctive mark the
   *  house owns, drawn small enough to be mistaken for a bullet. */
  shareLogo: { width: 40, height: 40, alignSelf: 'center', marginBottom: 9 },
  /** 2pt at full strength. The page's hairline is 1pt at 0.34 and would not
   *  survive the re-encode; a rule that half-vanishes reads as a printing
   *  fault, and a printing fault is the one thing a clipping must not have. */
  /** No backgroundColor — this is the brass ramp now, and a colour under a
   *  gradient is a colour nobody will ever see. */
  shareRuleTop: { height: 2.5, borderRadius: 1 },
  shareMast: {
    fontFamily: fonts.display, fontSize: 18, color: colors.parchment,
    textAlign: 'center', marginVertical: 6, includeFontPadding: false,
  },
  shareDateline: {
    fontFamily: fonts.sub, fontSize: 11, letterSpacing: 2.2, color: colors.sepia,
    textAlign: 'center', marginBottom: 7, includeFontPadding: false,
  },
  shareRuleBottom: { height: 1.5, backgroundColor: colors.sepia, opacity: 0.75 },
  /** 11pt is the floor for anything letterspaced here — below it, compression
   *  closes the gaps and the word becomes a smear. */
  shareKind: {
    fontFamily: fonts.sub, fontSize: 11, letterSpacing: 1.6, color: colors.fog,
    textAlign: 'center', marginTop: 14, includeFontPadding: false,
  },
  /** Size and leading come from `titleType`; everything else is fixed here. */
  shareMiddle: { flex: 1, justifyContent: 'center' },
  shareTitle: {
    fontFamily: fonts.display,
    color: colors.parchmentBright, textAlign: 'center',
    marginTop: 8, includeFontPadding: false,
  },
  /**
   * ── THE PASSAGE IS SET LEFT, NOT CENTRED ───────────────────────────────────
   * It was centred, and centred body copy is ragged on BOTH sides: every line
   * ends somewhere different at both ends, so the block has no edge for the eye
   * to hold and the whole card reads as distorted — stretched, in the client's
   * word — however correct its proportions are. Measured, the composition has
   * plenty of variation in measure, 23% to 86%; sameness was never the fault.
   *
   * No newspaper has ever centred a paragraph. A masthead is centred, a
   * headline is centred, and the text under them is set to a left edge, because
   * that edge is what makes a column a column. The clipping this card is
   * imitating had one.
   *
   * The head keeps its axis. The writing gets a spine.
   */
  shareBody: {
    fontFamily: fonts.serifItalic, fontSize: 15.5, lineHeight: 25,
    color: colors.parchment, textAlign: 'left', marginTop: 14,
  },
  shareMore: { alignItems: 'center', marginTop: 12 },
  shareOrn: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  shareOrnRule: { width: 26, height: 1.5, backgroundColor: colors.sepia, opacity: 0.85 },
  shareOrnMark: {
    fontFamily: fonts.sub, fontSize: 11, color: colors.sepia,
    includeFontPadding: false, marginTop: -1,
  },
  shareMoreText: {
    fontFamily: fonts.sub, fontSize: 11, letterSpacing: 2, color: colors.sepia,
    marginTop: 9, includeFontPadding: false,
  },
  /** `marginTop: auto` drops the foot to the bottom of a FIXED box — the one
   *  place in this design where that is right, because the box is not growing
   *  to fit and the leftover room belongs at the signature. */
  /** No `marginTop: auto` any more — `shareMiddle` takes the slack with flex:1,
   *  so the foot sits under it whatever length the writing is. */
  shareFoot: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1.5, borderTopColor: 'rgba(184,137,26,0.4)',
  },
  shareByWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 },
  shareAvatar: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1, borderColor: 'rgba(184,137,26,0.45)',
  },
  /**
   * 12.5, and it took two goes to get right.
   *
   * It was 11.5 — half a point over the card's 11pt floor, an emphasis no reader
   * can see and a second number in the system forever. Correcting it to 12 only
   * moved the collision: 12.5 is the house's body size, in twenty-three places
   * across the design, so 12 was the invention and 12.5 was the step that
   * already existed. The rule is not "pick a round number", it is "join the
   * scale you already have" — and the way to know which is which is to count.
   */
  shareBy: {
    fontFamily: fonts.sub, fontSize: 12.5, letterSpacing: 1.4,
    color: colors.parchmentBright, includeFontPadding: false, flexShrink: 1,
  },
  /** 1.2, the house's step. `1` was invented here and nowhere else, sitting a
   *  tenth of a point from 0.9 and two tenths from 1.2 — three values doing one
   *  job, none of them distinguishable from the next. */
  shareByNo: { color: colors.fog, letterSpacing: 1.2 },
  shareFrom: {
    fontFamily: fonts.sub, fontSize: 11, letterSpacing: 2.4, color: colors.sepia,
    includeFontPadding: false,
  },

  // ── the story ground ──────────────────────────────────────────────────────
  story: {
    backgroundColor: colors.storyGround,
    alignItems: 'center', justifyContent: 'center',
  },
  /**
   * 14% top and bottom. Instagram's story chrome (the handle and the ring at
   * the head, the reply field at the foot) and TikTok's caption stack both eat
   * roughly that, and a card whose masthead sits under somebody's username is
   * a card that failed at the only job it had.
   */
  storySafe: { justifyContent: 'center' },

  // ── the lounge card ───────────────────────────────────────────────────────
  bubble: {
    flexDirection: 'row', gap: 8,
    backgroundColor: 'rgba(20,16,11,0.72)',
    borderWidth: 1, borderColor: 'rgba(184,137,26,0.25)', borderRadius: 3,
    paddingVertical: 12, paddingHorizontal: 12,
  },
  bubbleEnded: { borderColor: 'rgba(184,137,26,0.14)' },
  loungeRule: { width: 2.5, borderRadius: 2, alignSelf: 'stretch' },
  loungeBody: { fontFamily: fonts.serifItalic, fontSize: 13.5, lineHeight: 21, color: colors.parchment },
  /** A dossier's name gets the display face and its own line, the way it does
   *  on the page and on the card. Set as running body it read as a sentence
   *  somebody had started, not as the title of an essay. */
  loungeKind: { fontSize: 8.5, marginBottom: 3 },
  /** 15.5, matching the card's reading size rather than sitting half a point
   *  under it. Two sizes that close are one size and a loose end. */
  loungeTitle: {
    fontFamily: fonts.display, fontSize: 15.5, lineHeight: 20,
    color: colors.parchmentBright, marginBottom: 4, includeFontPadding: false,
  },
  /** The kind's defining fact — a wire's source, a ballot's result, a seeking
   *  that has been answered — in that kind's ink, so the colour code that runs
   *  the whole page still holds inside somebody else's conversation. */
  loungeFact: {
    fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.6,
    marginTop: 6, includeFontPadding: false,
  },
  loungeGone: {
    fontFamily: fonts.body, fontSize: 12.5, lineHeight: 19,
    color: colors.fog, fontStyle: 'italic',
  },
  loungeSource: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  loungeByRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 9 },
  loungeAvatar: {
    width: 17, height: 17, borderRadius: 9,
    borderWidth: 1, borderColor: 'rgba(184,137,26,0.4)',
  },
  /** A member with no photograph still gets the ring, so the byline keeps its
   *  shape and the line does not shift left on some cards and not others. */
  loungeAvatarNone: { backgroundColor: 'rgba(184,137,26,0.10)' },
  /**
   * 8.5 and 1.2, not 9 and 1.1.
   *
   * The type audit reads sizes off the rendered page and reported 8.5 and 9 as
   * "too close to tell apart" — which is the worst outcome available: no reader
   * will ever see a difference, and the system carries two numbers for one size
   * forever. 8.5/1.2 is the house's label setting everywhere else, so the
   * lounge byline joins it rather than sitting half a point away from it.
   */
  loungeBy: {
    fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.2,
    color: colors.parchmentBright, includeFontPadding: false, flexShrink: 1,
  },
  /** 0.8, the house's tightest tracking. 0.9 existed only here, one tenth of a
   *  point from a value used on four other styles — a distinction with no
   *  reader and a third number in a scale that needs two. */
  loungeByNo: { color: colors.fog, letterSpacing: 0.8 },
  loungeMeta: {
    fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 1.2, color: colors.fog,
    marginTop: 5, includeFontPadding: false,
  },

  // ── held filings ──────────────────────────────────────────────────────────
  /**
   * Pinned, but never ON the writing. Floated at 8pt it landed squarely across
   * the first byline — which is the thing this control exists to prevent, done
   * by the control itself. The page reserves `NEW_FILINGS_ROOM` at the top of
   * its scroll while filings are held, so the pill occupies a gutter of its own
   * and covers nothing at rest.
   */
  newWrap: { position: 'absolute', left: 0, right: 0, top: 5, alignItems: 'center' },
  /** Brass, filled — the one place on this page a control is a solid shape,
   *  because it is the one control that must be found without being looked for. */
  newPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.sepia, borderRadius: 20,
    paddingVertical: 6, paddingHorizontal: 12,
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  newText: {
    fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.6, color: colors.ink,
    includeFontPadding: false,
  },

  // ── an event ──────────────────────────────────────────────────────────────
  unread: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.sepia },
  eventLine: {
    flex: 1, minWidth: 0, fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.2,
    color: colors.fog, includeFontPadding: false,
  },
  eventActor: { color: colors.parchment },
  eventQuote: {
    fontFamily: fonts.serifItalic, fontSize: 12.5, lineHeight: 21,
    color: colors.bone, marginTop: 8,
  },

  // ── a screen reached from somewhere else ──────────────────────────────────
  back: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: 'rgba(8,6,4,0.97)',
    borderBottomWidth: 1, borderBottomColor: colors.sepiaBorder,
  },
  backLabel: {
    fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 2.2, color: colors.sepia,
    includeFontPadding: false,
  },
});
