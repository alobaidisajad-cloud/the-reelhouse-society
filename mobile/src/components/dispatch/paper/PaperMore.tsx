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
import { View, StyleSheet } from 'react-native';
import { Text, TextInput } from '@/src/components/text';
import Animated, { FadeOut, useReducedMotion } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight, ChevronUp, Search, ArrowLeft, Lock, ExternalLink, MoreHorizontal } from 'lucide-react-native';

import PressableScale from '@/src/components/PressableScale';
import { colors, fonts } from '@/src/theme/theme';
import { BRASS, BRASS_STOPS } from '@/src/theme/brass';
import { scaledTextProps, decorativeTextProps, displayTextProps, deckLabelProps } from '@/src/constants/textScaling';
import { p, QUIET } from './paperStyles';
import { KIND_RULE, KIND_NAME, MARGIN_W, RULE_W, RULE_GAP, CRIMSON_INK, UNSPOKEN, AVATAR, nameOf } from './paperMetrics';
import { LEAD_STYLE } from './paperPerf';
import { MS, PILL_Y } from './paperMotion';
import { Byline, type PaperAuthor, type PaperFilm } from './PaperPost';
import { clipToSentence, counted } from './paperText';
import { isRTLText, RTL_MARK } from '@/src/utils/text';
import { EDGE_LIT } from '@/src/theme/light';
import { Arrive } from '@/src/components/Arrive';

/* ═══ THE PICKER ══════════════════════════════════════════════════════════════
 * The brass ＋ opens this: five forms, each in its own ink, so the colour code is
 * taught before it is used as a filter. The Auteur's two are shown, dimmed and
 * locked, never hidden: an unseen form is never learned. Given `onLocked`, a
 * locked row takes the tap to the caller (the Society); without it, it is inert.
 */
export interface Form {
  kind: keyof typeof KIND_RULE;
  name: string;
  line: string;
  locked?: boolean;
  /** A draft of this form is waiting (the writing room keeps ONE, so a second would replace it). */
  inProgress?: boolean;
}

export const FORMS: Form[] = [
  // No limits named: the composer counts down, and a named limit goes stale when it moves.
  { kind: 'take', name: 'TAKE', line: 'Say the thing nobody else will.' },
  { kind: 'seeking', name: 'SEEKING', line: 'Ask the house what to watch tonight.' },
  { kind: 'wire', name: 'WIRE', line: 'News from elsewhere, carrying its source.' },
  { kind: 'ballot', name: 'BALLOT', line: 'Put a question to the house. Two to six films.', locked: true },
  { kind: 'dossier', name: KIND_NAME.dossier, line: 'The long form. In parts, if you like.', locked: true },
];

export const PaperPicker = memo(function PaperPicker({
  forms = FORMS, onPick, onLocked, lockedStanding = 'stranger', onRules,
}: {
  forms?: Form[];
  onPick?: (kind: Form['kind']) => void;
  /** A locked form was touched. The caller decides where that leads. */
  onLocked?: (kind: Form['kind']) => void;
  /** Never held the rank, or held it and stopped — the spoken label differs. */
  lockedStanding?: 'stranger' | 'lapsed';
  /** The house rules, at the foot of the door every filing goes through. */
  onRules?: () => void;
}) {
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
            // Rows a hairline apart, each a whole target: a halo only reached
            // into the next kind, and the later row took the tap.
            hitSlop={null}
            onPress={() => (f.locked ? onLocked?.(f.kind) : onPick?.(f.kind))}
            haptic="medium" disabled={f.locked && !onLocked}
            accessibilityRole="button"
            accessibilityState={{ disabled: !!f.locked && !onLocked }}
            accessibilityLabel={
              f.locked && onLocked
                ? (lockedStanding === 'lapsed'
                  ? `${f.name}. ${f.line} Your dues have lapsed. The Auteur opens this again. Opens the Society.`
                  : `${f.name}. ${f.line} Clearance required. The Auteur opens this. Opens the Society.`)
              : f.locked ? `${f.name}. Auteurs only. ${f.line}`
                : f.inProgress ? `${f.name}. One in progress. ${f.line}`
                  : `${f.name}. ${f.line}`
            }
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[p.leadIn, LEAD_STYLE[f.kind]]} {...deckLabelProps}>
                {f.name}
              </Text>
              <Text style={m.formLine} {...scaledTextProps}>{f.line}</Text>
            </View>
            {f.locked ? (
              <View style={m.lockRow}>
                <Lock size={9} strokeWidth={2} color={colors.sepia} />
                <Text style={m.lockText} {...deckLabelProps}>AUTEURS</Text>
              </View>
            ) : f.inProgress ? (
              <View style={m.lockRow}>
                <Text style={m.inProgress} {...deckLabelProps}>IN PROGRESS</Text>
                <ChevronRight size={15} strokeWidth={2} color={colors.sepia} />
              </View>
            ) : (
              <ChevronRight size={15} strokeWidth={2} color={colors.sepia} />
            )}
          </PressableScale>
        </View>
      ))}
      {onRules ? (
        <>
          <View style={p.hair} />
          <PressableScale
            style={m.rulesRow} haptic="selection"
            // Nothing above: the last kind is a hairline away.
            hitSlop={{ top: 0, bottom: 6, left: 6, right: 6 }}
            onPress={onRules}
            accessibilityRole="link" accessibilityLabel="Read the house rules"
          >
            <Text style={m.rulesLink} {...deckLabelProps}>THE HOUSE RULES</Text>
            <ChevronRight size={11} strokeWidth={2} color={colors.sepia} />
          </PressableScale>
        </>
      ) : null}
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
  films, filmsNeeded, days, daysNeeded, held, onLog,
}: {
  films: number; filmsNeeded: number; days: number; daysNeeded: number;
  /** An unfinished piece is waiting (an Auteur can write before the door opens). */
  held?: boolean;
  onLog?: () => void;
}) {
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
      <PressableScale style={[p.btn, { marginTop: 24 }]} haptic="medium" onPress={onLog}
        accessibilityRole="button" accessibilityLabel="Go and log a film">
        <Text style={p.btnText} {...scaledTextProps}>LOG A FILM</Text>
      </PressableScale>
      <Text style={p.quiet} {...scaledTextProps}>
        {held ? 'WHAT YOU HAVE WRITTEN IS KEPT' : 'NOTHING IS HIDDEN FROM YOU MEANWHILE'}
      </Text>

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
/**
 * Every clause is a promise, so each names what keeps it:
 *   III  CONSTRAINT wire_source on dispatch_posts: no live wire without a source.
 *   IV   profiles_username_unique and profiles_username_lower_unique.
 *   V    a report raises a filing up a docket a person reads; no count acts on it.
 *   VI   private notes and member_drafts are owner-only at the row level.
 *   VII  POLICY votes_read: USING (user_id = auth.uid()).
 *   VIII TRIGGER no_hard_delete on dispatch_posts.
 *   IX   POLICY posts_tier: a ballot or dossier needs has_tier_at_least(2).
 * I and II are conduct and intention, which no machine can check.
 * A schema change that makes a clause false is a broken promise.
 */
export const CLAUSES: [string, string][] = [
  ['I', 'Argue with the film. Never with the member.'],
  ['II', 'Mark a spoiler before you write one. The house covers it either way, but you should have meant to.'],
  ['III', 'A wire carries its source. No source, no wire.'],
  ['IV', 'One member, one name. A second voice is not a second person.'],
  ['V', 'Report a filing and the house reads it. A report is not a verdict, and neither is the number of them.'],
  ['VI', 'What you keep is yours and is never shown, finished or not. What you file is the house’s and is.'],
  ['VII', 'A ballot is secret until it closes. Not even the house counts it early.'],
  ['VIII', 'Nothing filed is destroyed. A filing may be withdrawn, and the critiques written under it stand.'],
  ['IX', 'The long forms — the essay, the ballot — are an Auteur’s to file.'],
];

export const PaperRules = memo(function PaperRules() {
  return (
    <View>
      <Text style={m.rulesHead} accessibilityRole="header" {...displayTextProps}>
        The house rules
      </Text>
      {/* No count: it would go stale the day a clause is added. */}
      <Text style={m.rulesStand} {...scaledTextProps}>
        The house has kept them since the room still had a projector in it.
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
  query, film, count, span, onQuery, children,
}: {
  query: string;
  /** Null until a film is chosen; `children` then list the films the house has written on. */
  film: PaperFilm | null;
  /** Only meaningful once there is a film. Both, or the line is not printed. */
  count?: number; span?: string;
  /** Makes the query a real input; absent in the harness, which draws it (as FilmFinder does). */
  onQuery?: (text: string) => void;
  children?: React.ReactNode;
}) {
  return (
    <View>
      <View style={m.searchRow}>
        <Search size={13} strokeWidth={2} color={colors.sepia} />
        {onQuery ? (
          <TextInput
            style={[m.searchText, { flex: 1, minWidth: 0, padding: 0 }]}
            value={query}
            onChangeText={onQuery}
            placeholder="Name a film"
            placeholderTextColor={colors.fog}
            autoCorrect={false}
            returnKeyType="search"
            keyboardAppearance="dark"
            cursorColor={colors.sepia}
            selectionColor="rgba(184,137,26,0.3)"
            accessibilityLabel="Search the archive for a film"
            {...scaledTextProps}
          />
        ) : (
          <Text style={m.searchText} numberOfLines={1} {...scaledTextProps}>{query}</Text>
        )}
        <Text style={m.searchMark} {...decorativeTextProps}>ARCHIVIST</Text>
      </View>

      {film ? (
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
            {count !== undefined && span ? (
              <Text style={m.foundCount} {...scaledTextProps}>{count} FILINGS · {span}</Text>
            ) : null}
          </View>
        </View>
      ) : null}
      {children}
    </View>
  );
});

/**
 * One film the house has written about, as a row: here a film is a reference,
 * not a poster for sale.
 */
export const ArchiveFilm = memo(function ArchiveFilm({
  film, filings, onPress,
}: { film: PaperFilm; filings: number; onPress?: () => void }) {
  return (
    <PressableScale
      style={m.archiveRow} haptic="selection"
      // No reach: 65pt tall as drawn (a 45pt plate and 10 above and below). Its
      // 2pt reached into the row below it, and into the rope under the last one.
      hitSlop={null}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${film.title}. ${counted(filings, 'filing', 'filings')}`}
    >
      <View style={m.archivePlate}>
        {film.posterPath ? (
          <Image source={{ uri: film.posterPath }} style={p.plateArt} contentFit="cover" />
        ) : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={m.archiveTitle} numberOfLines={1} {...scaledTextProps}>{film.title}</Text>
        <Text style={m.archiveMeta} {...deckLabelProps}>
          {counted(filings, 'FILING', 'FILINGS')}
        </Text>
      </View>
      <ChevronRight size={13} strokeWidth={2} color={colors.sepia} />
    </PressableScale>
  );
});

/* ═══ A MEMBER'S ROOM ═════════════════════════════════════════════════════════
 * Their filings, on their profile. The head says whose room it is once, and the
 * entries then print no byline at all — twenty consecutive repeats of the same
 * name is the page saying nothing twenty times.
 */
export const PaperRoom = memo(function PaperRoom({
  author, filed, certified, onFile,
}: {
  author: PaperAuthor;
  /** Null when the totals did not arrive; the line is then not drawn (both or neither). */
  filed: number | null; certified: number | null;
  /** To the member file. A named line, not a tappable byline, which would say "open their room". */
  onFile?: () => void;
}) {
  // The byline on its own line, the facts beneath: at the largest text size this, the
  // narrowest head in the app, cannot fit a byline and counts side by side.
  return (
    <View style={m.roomHead}>
      <Byline author={author} />
      <View style={m.roomFacts}>
        {/* The house number lives here, on the one head about a member, not on every byline. */}
        <Text style={m.roomNo} numberOfLines={1} {...decorativeTextProps}>
          {`No. ${author.memberNo}`}
        </Text>
        {filed !== null && certified !== null ? (
          <Text style={m.roomCount} numberOfLines={1} {...decorativeTextProps}>
            {filed} FILED · {certified} CERTIFIED
          </Text>
        ) : null}
      </View>
      {onFile ? (
        <PressableScale
          style={m.roomFile} haptic="selection" onPress={onFile}
          /* All four sides: a partial hitSlop sets the missing ones to 0, not 15pt. */
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="link"
          accessibilityLabel={`Open the member file of ${author.name}`}
        >
          <Text style={m.roomFileText} {...deckLabelProps}>THE MEMBER’S FILE</Text>
          <ChevronRight size={10} strokeWidth={2} color={colors.sepia} />
        </PressableScale>
      ) : null}
    </View>
  );
});

/* ═══ THE REPORTED DOCKET ═══════════════════════════════════════════════════════
 * A reported filing, in the Dispatch's language: the report count in the margin
 * (it orders the queue; no number of reports acts by itself), the filing under
 * its reasons, and two verdicts of equal weight.
 */
export const PaperCase = memo(function PaperCase({
  reports, reasons, kind, body, author, age, onStand, onStrike, onAuthor,
}: {
  onStand?: () => void; onStrike?: () => void; onAuthor?: () => void;
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
          <Text style={[m.caseBody, isRTLText(body) && p.rtlText]} numberOfLines={3} {...scaledTextProps}>
            {isRTLText(body) ? RTL_MARK : null}
            <Text style={[p.leadIn, LEAD_STYLE[kind]]}>{nameOf(kind)} — </Text>
            {body}
          </Text>
          <View style={{ marginTop: 8 }}>
            <Byline author={author} trailing={age} />
          </View>
        </View>
      </View>
      <View style={m.verdicts}>
        <PressableScale style={m.verdict} haptic hitSlop={{ top: 10, bottom: 10, left: 0, right: 0 }}
          onPress={onStand}
          accessibilityRole="button" accessibilityLabel="Let this filing stand">
          <Text style={m.verdictText} {...scaledTextProps}>LET IT STAND</Text>
        </PressableScale>
        <PressableScale style={[m.verdict, m.verdictStrike]} haptic="medium" hitSlop={{ top: 10, bottom: 10, left: 0, right: 0 }}
          onPress={onStrike}
          accessibilityRole="button" accessibilityLabel="Strike this filing">
          <Text style={[m.verdictText, { color: CRIMSON_INK }]} {...scaledTextProps}>STRIKE IT</Text>
        </PressableScale>
      </View>
    </View>
  );
});

/* ═══ THE TWO CARDS A FILING TRAVELS AS ═══════════════════════════════════════
 * SHARE  the image that leaves the app: a printed clipping a stranger can read cold.
 *        Only an essay gets one; a take as a poster is a poster of an opinion.
 * LOUNGE the filing dropped into a chat, still naming its kind in its ink.
 */

/* ═══ THE DOSSIER'S CARD ══════════════════════════════════════════════════════
 * An IMAGE, not a screen: a fixed 4:5 shape the writing is cut to (on a sentence);
 * no font scaling, so every device exports the same; built to survive other apps'
 * re-encoding (2pt rules, no type under 11pt); readable as a ~200px thumbnail.
 */

// How wide a string SETS: CJK and emoji are em-wide (a flag is two), so they count as
// two, and one size ladder works for every script.
const WIDE = /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6\u2600-\u27BF\uFE0F\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F1FF}\u{1F300}-\u{1FAFF}]/u;
const visualLen = (t: string) => {
  let n = 0;
  for (const ch of t) n += WIDE.test(ch) ? 2 : 1;
  return n;
};

// Title size off the set width: each step's longest title still fits four lines.
const titleType = (t: string) => {
  const n = visualLen(t);
  return n <= 26 ? { fontSize: 32, lineHeight: 38 }
    : n <= 44 ? { fontSize: 28, lineHeight: 34 }
    : n <= 68 ? { fontSize: 24, lineHeight: 30 }
    : n <= 104 ? { fontSize: 20, lineHeight: 26 }
    // 16.5: the page's own display headline size, so page and card agree.
    : { fontSize: 16.5, lineHeight: 23 };
};

/** Size, face and leading in one answer, so no caller takes a face without its leading. */
const titleSet = (t: string) => {
  const face = titleFace(t);
  const type = titleType(t);
  return {
    fontFamily: face.fontFamily,
    fontSize: type.fontSize,
    lineHeight: Math.round(type.lineHeight * face.lead),
  };
};

// The title spends the card first. Past 112 (four lines at the smallest step) it is
// cut at a word and marked, as the opening is.
const TITLE_MAX = 112;
const fitTitle = (t: string) => {
  const s = (t ?? '').trim();
  if (visualLen(s) <= TITLE_MAX) return s;
  const w = s.slice(0, TITLE_MAX);
  const sp = w.lastIndexOf(' ');
  return (sp > 0 ? w.slice(0, sp) : w).replace(/[\s,;:.—-]+$/, '') + '…';
};

/**
 * The opening is paid last, out of the room the title left. The budgets are
 * counted off the rendered 4:5 card (about 42 characters a line at its padding),
 * never estimated; `lines` is the backstop that keeps the signature on the card.
 */
const openingRoom = (titleLen: number, lead = 1, ratio = 4 / 5) => {
  const base = titleLen <= 26 ? { max: 210, lines: 5 }
    : titleLen <= 44 ? { max: 165, lines: 4 }
    : { max: 125, lines: 3 };
  // A taller leading (CJK) makes the title half again as tall: one line less below.
  const forLead = lead <= 1
    ? base
    : { max: Math.round(base.max * 0.7), lines: Math.max(2, base.lines - 1) };

  // Scaled to the height the ratio leaves: the middle is flex 1, and writing that
  // over-asks does not overflow, it SHRINKS to nothing (measured: 0pt on a 5:4 card).
  const h = (4 / 5) / ratio;
  return {
    max: Math.round(forLead.max * h),
    lines: Math.max(1, Math.floor(forLead.lines * h)),
    titleLines: h >= 0.95 ? 4 : h >= 0.75 ? 3 : 2,
  };
};

// Latin, its accents (U+0020-U+024F) and general punctuation (U+2000-U+206F).
const LATIN = /^[\u0020-\u024F\u2000-\u206F]*$/;
/**
 * Rye has only Latin, and React Native does not fall back between families, so
 * other scripts are set in the serif, at CJK's usual 1.5 leading (1.21 clips it).
 */
const titleFace = (t: string) =>
  LATIN.test(t)
    ? { fontFamily: fonts.display, lead: 1 }
    : { fontFamily: fonts.serifMedium, lead: 1.5 / 1.21 };

export const DossierShareCard = memo(function DossierShareCard({
  // `max` has NO default: one would shadow the computed room in `max ?? room.max`.
  title, opening, author, filed, logo, width, max, ratio = 4 / 5,
}: {
  title: string; opening: string;
  /** Null once the member closed their account: the essay survives, the name does not. */
  author: PaperAuthor | null;
  /** The dateline, and the only time on the card (a read time reads as "minutes ago"). */
  filed: string;
  logo?: string;
  /** Undefined fills the parent; a number is for the story ground, which sizes it. */
  width?: number;
  /** Overrides the room the title left. Only the story export needs this. */
  max?: number;
  /** The card's proportion: 4:5 (a cutting, the most shared), 1:1 or wider. */
  ratio?: number;
}) {
  const head = fitTitle(title);
  // The set width, as the ladder measures it, in any script.
  const room = openingRoom(visualLen(head), titleFace(head).lead, ratio);
  const cut = clipToSentence(opening, max ?? room.max);
  return (
    <View style={[m.share, { aspectRatio: ratio }, width !== undefined && { width }]}>
      {/* The inner rule: a second border set in, which makes it read as printed. */}
      <View style={m.shareInner} pointerEvents="none" />

      {logo ? <Image source={{ uri: logo }} style={m.shareLogo} contentFit="contain" /> : null}

      {/* The nameplate rule is the house's brass ramp, as on every rule that matters. */}
      <LinearGradient colors={BRASS} locations={BRASS_STOPS}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={m.shareRuleTop} />
      {/* The dateline sits in the nameplate, where a paper puts it. */}
      <Text style={m.shareMast} {...decorativeTextProps}>THE DISPATCH</Text>
      <Text style={m.shareDateline} {...decorativeTextProps}>{filed}</Text>
      <View style={m.shareRuleBottom} />

      {/* Centred in the room the masthead and signature leave, so a short essay sits mid-card. */}
      <View style={m.shareMiddle}>
        {/* The kind, alone: the nameplate carries the date. */}
        <Text style={m.shareKind} {...decorativeTextProps}>
          <Text style={LEAD_STYLE.dossier}>{KIND_NAME.dossier}</Text>
        </Text>

        {/* Sized by the ladder, not adjustsFontSizeToFit: that is unreliable on Android past
            one line and varies by renderer, on the one asset that must look identical. */}
        <Text style={[m.shareTitle, titleSet(head)]} numberOfLines={room.titleLines} {...decorativeTextProps}>
          {head}
        </Text>

        <Text style={m.shareBody} numberOfLines={room.lines} {...decorativeTextProps}>
          {cut.text}
        </Text>

        {/* "Continues" only when it does: an essay that fits whole must not claim to run on. */}
        {cut.clipped ? (
          <View style={m.shareMore}>
            {/* Rule, ✦, rule: the compositor's break mark, in the house's own ornament. */}
            <View style={m.shareOrn}>
              <View style={m.shareOrnRule} />
              <Text style={m.shareOrnMark} {...decorativeTextProps} {...UNSPOKEN}>✦</Text>
              <View style={m.shareOrnRule} />
            </View>
            <Text style={m.shareMoreText} {...decorativeTextProps}>THE ESSAY CONTINUES</Text>
          </View>
        ) : null}
      </View>

      {/* Not the page's Byline: its 8.5pt name would smear under recompression. */}
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
 * The same card on a 9:16 ground, never a second layout (two layouts drift). The
 * bands top and bottom are where Instagram and TikTok paint their own chrome.
 */
export const StoryFrame = memo(function StoryFrame({
  width = 320, cardWidth = 358, children,
}: { width?: number; cardWidth?: number; children: React.ReactNode }) {
  const height = Math.round((width * 16) / 9);
  // SCALED, not re-laid-out: at the narrower width the card reflows and loses its title.
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
 * Every kind can be dropped into a lounge: that is pointing at something, not a
 * poster of yourself. One skeleton (the kind's rule and name in its ink), and a
 * middle that carries what the kind is FOR: a wire's source, a ballot's result,
 * an essay's title set as a name.
 */
export const LoungeCard = memo(function LoungeCard({
  kind, body, author, certifyCount, commentCount,
  title, source, result, answered, ended, onOpen,
}: {
  onOpen?: () => void;
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

  // An ended filing ends here too, or a withdrawal would be a fiction; the bubble
  // stays for the conversation, and still opens the page and its critiques.
  if (ended) {
    return (
      <PressableScale style={[m.bubble, m.bubbleEnded]} haptic="selection" pressedScale={0.98} onPress={onOpen}
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
    <PressableScale style={m.bubble} haptic="selection" pressedScale={0.98} onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`Open this ${nameOf(kind).toLowerCase()}${title ? `: ${title}` : ''}${author ? `, by ${author.name}` : ''}`}>
      <View style={[m.loungeRule, { backgroundColor: ink }]} />
      <View style={{ flex: 1, minWidth: 0 }}>
        {/* An essay leads with its name, on its own line, in the display face —
            the same way it leads on the page and on the share card. */}
        {kind === 'dossier' && title ? (
          <>
            <Text style={[p.leadIn, m.loungeKind, { color: ink }]} {...deckLabelProps}>
              {KIND_NAME.dossier}
            </Text>
            <Text style={m.loungeTitle} numberOfLines={2} {...scaledTextProps}>{title}</Text>
            <Text style={m.loungeBody} numberOfLines={2} {...scaledTextProps}>{body}</Text>
          </>
        ) : (
          <Text style={[m.loungeBody, isRTLText(body) && p.rtlText]} numberOfLines={3} {...scaledTextProps}>
            {isRTLText(body) ? RTL_MARK : null}
            <Text style={[p.leadIn, { fontSize: 10, color: ink }]}>{nameOf(kind)} — </Text>
            {body}
          </Text>
        )}

        {/* The kind's own fact, in its ink. A wire names its host before the arrow that leaves. */}
        {kind === 'wire' && source ? (
          <View style={m.loungeSource}>
            <Text style={[m.loungeFact, { color: ink, marginTop: 0 }]}
              {...deckLabelProps}>
              {source.toUpperCase()}
            </Text>
            <ExternalLink size={9} strokeWidth={2} color={ink} />
          </View>
        ) : null}
        {kind === 'ballot' && result ? (
          <Text style={[m.loungeFact, { color: ink }]} {...deckLabelProps}>
            {`CLOSED · ${result.toUpperCase()}`}
          </Text>
        ) : null}
        {kind === 'seeking' && answered ? (
          <Text style={[m.loungeFact, { color: ink }]} {...deckLabelProps}>
            ANSWERED
          </Text>
        ) : null}

        {/* The WRITER, with a face (the lounge already names who shared it). */}
        <View style={m.loungeByRow}>
          {author?.avatar ? (
            <Image source={{ uri: author.avatar }} style={m.loungeAvatar} contentFit="cover" />
          ) : (
            <View style={[m.loungeAvatar, m.loungeAvatarNone]} />
          )}
          {/* No house number: that belongs on the share card, which leaves the app. */}
          <Text style={m.loungeBy} {...deckLabelProps}>
            {author ? author.name.toUpperCase() : 'A MEMBER, DEPARTED'}
          </Text>
        </View>

        {/* No counts: on a shared card they would freeze at the moment of sharing. */}
      </View>
    </PressableScale>
  );
});

/* ═══ FILINGS ARRIVED WHILE YOU WERE READING: held and offered, never inserted ═══ */

/** The gutter the list reserves while filings are held: 31pt of pill plus 10pt clear. */
export const NEW_FILINGS_ROOM = 41;

export const NewFilings = memo(function NewFilings({
  count, onPress,
}: { count: number; onPress?: () => void }) {
  // In with movement, out without: it leaves as the list jumps, and two motions are one
  // too many. Reduced motion keeps the appearing and going, without the travel. It
  // arrives through Arrive: a stalled arrival would leave an invisible pill taking taps.
  const reduced = useReducedMotion();
  return (
    <View style={m.newWrap} pointerEvents="box-none">
      <Animated.View exiting={reduced ? undefined : FadeOut.duration(MS.quick)}>
        <Arrive name="new-filings" duration={MS.base} rise={-PILL_Y}>
          <PressableScale style={m.newPill} haptic="medium" onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={`${count} new filings. Go to the top.`}>
            <ChevronUp size={11} strokeWidth={2.5} color={colors.ink} />
            <Text style={m.newText} {...deckLabelProps}>
              {count} NEW {count === 1 ? 'FILING' : 'FILINGS'}
            </Text>
          </PressableScale>
        </Arrive>
      </Animated.View>
    </View>
  );
});

/** A plain screen head for the pages reached from somewhere else. */
export const PaperBack = memo(function PaperBack({
  label, onBack, onMore,
}: { label: string; onBack?: () => void; onMore?: () => void }) {
  return (
    <View style={m.back}>
      <PressableScale hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }} haptic="selection"
        onPress={onBack}
        accessibilityRole="button" accessibilityLabel="Back">
        <ArrowLeft size={15} strokeWidth={2} color={colors.sepia} />
      </PressableScale>
      <Text style={m.backLabel} {...deckLabelProps}>{label}</Text>
      {/* A control, or a spacer of its width: either way the label stays centred. */}
      {onMore ? (
        <PressableScale hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }} haptic="selection"
          onPress={onMore}
          accessibilityRole="button" accessibilityLabel="More, for this filing">
          <MoreHorizontal size={15} strokeWidth={2} color={colors.sepia} />
        </PressableScale>
      ) : (
        <View style={{ width: 15 }} />
      )}
    </View>
  );
});

const m = StyleSheet.create({
  // ── the picker ────────────────────────────────────────────────────────────
  sheet: { ...EDGE_LIT,
    backgroundColor: colors.soot,
    borderTopWidth: 1.5, borderTopColor: colors.sepiaBorder,
    borderTopLeftRadius: 6, borderTopRightRadius: 6,
    paddingHorizontal: 24, paddingTop: 8, paddingBottom: 34,
  },
  grab: {
    width: 34, height: 3, borderRadius: 2, alignSelf: 'center',
    backgroundColor: colors.sepia, opacity: 0.32, marginBottom: 16,
  },
  pickHead: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6, color: colors.sepia,
    marginBottom: 4, includeFontPadding: false,
  },
  formRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  formLine: {
    fontFamily: fonts.bodyItalic, fontSize: 12.5, lineHeight: 19,
    color: colors.bone, opacity: QUIET, marginTop: 4,
  },
  /** space-between, so its chevron ends at the right edge like the five forms' marks. */
  rulesRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12,
  },
  rulesLink: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.2, color: colors.sepia,
    includeFontPadding: false,
  },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  /** Sepia, not crimson: an unfinished piece is a fact, not a warning. */
  inProgress: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.9, color: colors.sepia,
    includeFontPadding: false,
  },
  lockText: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.9, color: colors.sepia,
    includeFontPadding: false,
  },

  // ── the door ──────────────────────────────────────────────────────────────
  gate: { alignSelf: 'stretch', paddingHorizontal: 8, marginTop: 4 },
  gateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 },
  gateLabel: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.9, color: colors.fog,
    includeFontPadding: false,
  },
  gateValue: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.9, color: colors.parchment,
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
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.2, color: colors.sepia,
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
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.9, color: colors.sepia,
    includeFontPadding: false,
  },
  found: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingTop: 16, paddingBottom: 16 },
  foundPlate: {
    width: 46, height: 69, borderRadius: 2, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(240,232,176,0.26)',
    backgroundColor: colors.soot,
  },
  foundTitle: { fontFamily: fonts.display, fontSize: 20, lineHeight: 28, color: colors.parchment },
  foundMeta: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.9, color: colors.fog,
    marginTop: 4, includeFontPadding: false,
  },
  foundCount: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.2, color: colors.sepia,
    marginTop: 8, includeFontPadding: false,
  },
  /** A candidate film, before one has been chosen. */
  archiveRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  archivePlate: {
    width: 30, height: 45, borderRadius: 2, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(240,232,176,0.26)',
    backgroundColor: colors.soot,
  },
  archiveTitle: {
    fontFamily: fonts.body, fontSize: 13.5, color: colors.parchment,
    includeFontPadding: false,
  },
  archiveMeta: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.9, color: colors.sepia,
    marginTop: 4, includeFontPadding: false,
  },

  // ── a member's room ───────────────────────────────────────────────────────
  roomHead: {
    paddingTop: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(184,137,26,0.25)',
  },
  /**
   * Hung from the NAME: indented by the disc and the byline's gap. Wrapping is
   * safe here, as both are plain text: the counts drop below the number, not crushed.
   */
  roomFacts: {
    flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap',
    columnGap: 10, rowGap: 3,
    marginLeft: AVATAR + 6,
    // Tight under the name, against the byline's own 8pt bottom margin.
    marginTop: -4,
  },
  roomNo: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.9, color: colors.sepia,
    includeFontPadding: false,
  },
  roomCount: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.9, color: colors.sepia,
    includeFontPadding: false,
  },
  /** As wide as its words: stretched, it would catch taps meant for the first filing. */
  roomFile: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    alignSelf: 'flex-start', marginLeft: AVATAR + 6, marginTop: 10,
  },
  roomFileText: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.9, color: colors.sepia,
    includeFontPadding: false,
  },

  // ── the docket ────────────────────────────────────────────────────────────
  caseReasons: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.9, color: CRIMSON_INK,
    marginBottom: 8, includeFontPadding: false,
  },
  caseBody: {
    fontFamily: fonts.serifItalic, fontSize: 13.5, lineHeight: 24,
    color: colors.parchment,
  },
  verdicts: {
    flexDirection: 'row', gap: 8, marginTop: 12,
    marginStart: MARGIN_W + RULE_W + RULE_GAP,
  },
  /** Equal in size and weight: brass or crimson, never louder. */
  verdict: {
    flex: 1, borderWidth: 1, borderColor: colors.sepiaBorder, borderRadius: 2,
    paddingVertical: 8, alignItems: 'center',
  },
  verdictStrike: { borderColor: 'rgba(180,45,45,0.42)' },
  verdictText: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.2, color: colors.parchment,
    includeFontPadding: false,
  },

  // ── the dossier's share card ──────────────────────────────────────────────
  /** The ratio is on the CARD, so the frame is fixed and the writing gives way. */
  share: { ...EDGE_LIT,
    aspectRatio: 4 / 5,
    backgroundColor: colors.soot,
    borderWidth: 2, borderColor: colors.sepiaBorder, borderRadius: 3,
    // Room for the writing comes out of the padding: 20 gives the line the width,
    // 16 gives the opening its last line above the plate edge.
    paddingHorizontal: 20, paddingVertical: 16,
    justifyContent: 'flex-start',
    // The frame wins; every margin inside is cut so the content clears it.
    overflow: 'hidden',
  },
  /** 7 in: reads as one border, and the gap survives re-encoding. */
  shareInner: {
    position: 'absolute', left: 7, right: 7, top: 7, bottom: 7,
    borderWidth: 1, borderColor: 'rgba(184,137,26,0.28)', borderRadius: 1,
  },
  /** Square, like the mark itself (445x444), so no renderer can crop it. */
  shareLogo: { width: 40, height: 40, alignSelf: 'center', marginBottom: 9 },
  /** Thick enough to survive re-encoding; no colour, as the brass ramp paints it. */
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
  /** 11pt: the floor for letterspaced type that must survive compression. */
  shareKind: {
    fontFamily: fonts.sub, fontSize: 11, letterSpacing: 1.6, color: colors.fog,
    textAlign: 'center', marginTop: 14, includeFontPadding: false,
  },
  shareMiddle: { flex: 1, justifyContent: 'center' },
  /** Size, face and leading come from `titleSet`. */
  shareTitle: {
    fontFamily: fonts.display,
    color: colors.parchmentBright, textAlign: 'center',
    marginTop: 8, includeFontPadding: false,
    // Fail loudly: a shrinking title vanishes unseen; an overflowing one the audit catches.
    flexShrink: 0,
  },
  /** Set left, as a column is: centred body copy is ragged on both edges. */
  shareBody: {
    fontFamily: fonts.serifItalic, fontSize: 15.5, lineHeight: 25,
    color: colors.parchment, textAlign: 'left', marginTop: 14,
    flexShrink: 0,   // same reason as shareTitle above
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
  /** At the bottom because `shareMiddle` takes the slack. */
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
  /** 12.5: the house's body size, joined rather than a near-miss invented. */
  shareBy: {
    fontFamily: fonts.sub, fontSize: 12.5, letterSpacing: 1.4,
    color: colors.parchmentBright, includeFontPadding: false, flexShrink: 1,
  },
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
  storySafe: { justifyContent: 'center' },

  // ── the lounge card ───────────────────────────────────────────────────────
  bubble: {
    flexDirection: 'row', gap: 8,
    backgroundColor: 'rgba(30,25,20,0.72)',
    borderWidth: 1, borderColor: 'rgba(184,137,26,0.25)', borderRadius: 3,
    paddingVertical: 12, paddingHorizontal: 12,
  },
  bubbleEnded: { borderColor: 'rgba(184,137,26,0.14)' },
  loungeRule: { width: 2.5, borderRadius: 2, alignSelf: 'stretch' },
  loungeBody: { fontFamily: fonts.serifItalic, fontSize: 13.5, lineHeight: 21, color: colors.parchment },
  loungeKind: { fontSize: 10, marginBottom: 3 },
  /** 15.5: the share card's reading size, not a near-miss of it. */
  loungeTitle: {
    fontFamily: fonts.display, fontSize: 15.5, lineHeight: 20,
    color: colors.parchmentBright, marginBottom: 4, includeFontPadding: false,
  },
  /** Coloured by the kind's ink at the call site. */
  loungeFact: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.2,
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
  /** No photograph still gets the ring, so every byline keeps its shape. */
  loungeAvatarNone: { backgroundColor: 'rgba(184,137,26,0.10)' },
  loungeBy: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.9,
    color: colors.parchmentBright, includeFontPadding: false, flexShrink: 1,
  },

  // ── held filings ──────────────────────────────────────────────────────────
  /** In the gutter the page reserves (`NEW_FILINGS_ROOM`), so it covers no writing. */
  newWrap: { position: 'absolute', left: 0, right: 0, top: 5, alignItems: 'center' },
  /** Filled brass: the one control that must be found without being looked for. */
  newPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.sepia, borderRadius: 20,
    paddingVertical: 6, paddingHorizontal: 12,
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  newText: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.2, color: colors.ink,
    includeFontPadding: false,
  },

  // ── a screen reached from somewhere else ──────────────────────────────────
  back: { ...EDGE_LIT,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: colors.soot,
    borderBottomWidth: 1, borderBottomColor: colors.sepiaBorder,
  },
  backLabel: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6, color: colors.sepia,
    includeFontPadding: false,
  },
});
