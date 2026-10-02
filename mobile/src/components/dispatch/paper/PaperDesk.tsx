/**
 * PaperDesk.tsx — the desks a filing is written at, and the sheets they open.
 *
 * Every desk is the SAME desk: back / kind / file it across the top, the
 * document filling the room, one tool rail at the foot; what changes is the form
 * printed on the paper. The app mounts the ballot desk, the film finder and the
 * share sheet; the wire and dossier desks are the design record of a writing
 * room that lost to ComposeDesks, drawn only by the mockups.
 *
 * A control whose handler is absent (the harness) is disabled and says so:
 * aDeskControlNeverAnswersWithNothing.test.tsx.
 */
import { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, TextInput } from '@/src/components/text';
import { Image } from 'expo-image';
import {
  FilmIcon, ImageIcon, AlertTriangle, Search, X, Plus, Calendar,
  Send, Bookmark, Share2,
} from 'lucide-react-native';

import PressableScale from '@/src/components/PressableScale';
import { colors, fonts } from '@/src/theme/theme';
import { scaledTextProps, decorativeTextProps, displayTextProps, deckLabelProps } from '@/src/constants/textScaling';
import { p, QUIET } from './paperStyles';
import {
  KIND_RULE, COUNTER_SHOWS_AT, CRIMSON_INK, UNSPOKEN, CLOSING_TIMES, groupDigits, nameOf, nextClosing,
  type ClosingTime,
} from './paperMetrics';
import { LEAD_STYLE } from './paperPerf';
import { MAX_LENGTHS } from '@/src/utils/sanitizeInput';
import { isRTLText, RTL_MARK } from '@/src/utils/text';
import { Byline, type PaperAuthor, type PaperFilm } from './PaperPost';
import { PaperKeyWell } from './PaperKeyWell';
import { DeskDoc } from './PaperDeskDoc';
import { EDGE_LIT } from '@/src/theme/light';
import { PaperEmpty } from './PaperFrame';

/**
 * The head every desk wears, one component so the desks cannot drift. BACK and
 * FILE IT are REQUIRED: a header of two controls must not compile without them.
 */
export const DeskHead = memo(function DeskHead({
  kind, ready, onBack, onFile,
}: { kind: string; ready?: boolean; onBack: () => void; onFile: () => void }) {
  return (
    <View style={p.ch}>
      <PressableScale onPress={onBack} hitSlop={{ top: 12, bottom: 12, left: 0, right: 8 }} accessibilityRole="button" accessibilityLabel="Back, without filing">
        <Text style={p.chs} {...scaledTextProps}>BACK</Text>
      </PressableScale>
      <Text style={[p.chm, { color: KIND_RULE[kind.toLowerCase() as keyof typeof KIND_RULE] ?? colors.sepia }]}
        {...decorativeTextProps}>
        {nameOf(kind)}
      </Text>
      {/* Lit only when the form is complete: a bright FILE IT on an unfinished form lies. */}
      <PressableScale onPress={ready ? onFile : undefined} hitSlop={{ top: 12, bottom: 12, left: 8, right: 0 }} haptic="medium" disabled={!ready}
        accessibilityRole="button"
        accessibilityLabel={ready ? 'File it' : 'File it. Not ready yet'}
        accessibilityState={{ disabled: !ready }}>
        <Text style={[p.chs, ready && p.chsGo, !ready && { opacity: 0.4 }]} {...scaledTextProps}>
          FILE IT
        </Text>
      </PressableScale>
    </View>
  );
});

/** A tool on the rail. With no `onPress` (the design record) it is disabled, and says so. */
export type RailTool = {
  icon: 'film' | 'still' | 'spoiler' | 'date';
  label: string;
  on?: boolean;
  onPress?: () => void;
  /** Spoken in place of the label, where the label alone does not say what a press does. */
  spoken?: string;
};

/** The rail every desk stands on. `count` appears only when it could matter. */
export const DeskRail = memo(function DeskRail({
  tools, remaining,
}: {
  tools: RailTool[];
  remaining?: number;
}) {
  const I = { film: FilmIcon, still: ImageIcon, spoiler: AlertTriangle, date: Calendar };
  return (
    <View style={p.rail}>
      {tools.map((t) => {
        const Icon = I[t.icon];
        return (
          <PressableScale key={t.icon} style={p.railTool} hitSlop={{ top: 10, bottom: 10, left: 0, right: 0 }}
            onPress={t.onPress} disabled={!t.onPress}
            accessibilityRole="button"
            accessibilityState={{ selected: !!t.on, disabled: !t.onPress }}
            accessibilityLabel={t.spoken ?? t.label.toLowerCase()}>
            <Icon size={13} strokeWidth={2} color={t.on ? colors.sepia : colors.bone} />
            <Text style={[p.rl, t.on && { color: colors.sepia }]} {...scaledTextProps}>{t.label}</Text>
          </PressableScale>
        );
      })}
      <View style={{ flex: 1 }} />
      {remaining != null && remaining <= COUNTER_SHOWS_AT ? (
        <Text style={[p.rl, remaining < 0 && { color: CRIMSON_INK }]} {...scaledTextProps}>
          {remaining}
        </Text>
      ) : null}
    </View>
  );
});

/* ═══ THE WIRE DESK ═══════════════════════════════════════════════════════════
 * The one form with a REQUIRED field, and the house rule says so out loud: a
 * wire carries its source or it is not a wire. So the source sits on the paper
 * as part of the form — not behind a tool, not in a dialog after you press file
 * — and FILE IT stays unlit until it is there.
 */
export const WireDesk = memo(function WireDesk({
  me, hour, headline, body, source, onBack, onFile,
}: {
  me: PaperAuthor; hour: string; headline: string; body: string; source?: string;
  onBack: () => void; onFile: () => void;
}) {
  return (
    <View style={p.desk}>
      <DeskHead kind="wire" ready={!!source && !!headline} onBack={onBack} onFile={onFile} />
      <DeskDoc>
        <View style={p.postRow}>
          <View style={p.margin}>
            <Text style={p.marginValue} {...decorativeTextProps}>{hour}</Text>
          </View>
          <View style={p.column}>
            <Byline author={me} />
            {/* The desk promises "this is how it prints", so it carries the
                page's direction rule too — the headline is the member's own
                writing and `WIRE — ` in front of it is what makes the mark
                necessary. */}
            <Text style={[d.wireHead, isRTLText(headline) && p.rtlText]} {...displayTextProps}>
              {isRTLText(headline) ? RTL_MARK : null}
              <Text style={[p.leadIn, LEAD_STYLE.wire]}>WIRE — </Text>
              {headline}
            </Text>
            <Text style={p.wire} {...scaledTextProps}>{body}<Text style={p.caret} {...UNSPOKEN}>|</Text></Text>

            <View style={d.field}>
              <Text style={d.fieldLabel} {...decorativeTextProps}>SOURCE — REQUIRED</Text>
              <Text style={[d.fieldValue, !source && { color: colors.fogQuiet }]}
                numberOfLines={1} {...scaledTextProps}>
                {source || 'where did this come from?'}
              </Text>
            </View>
          </View>
        </View>
      </DeskDoc>
      <DeskRail tools={[{ icon: 'film', label: 'FILM' }]} remaining={MAX_LENGTHS.filingBody - body.length} />
      <View style={p.kbd}><Text style={p.kbdLabel} {...decorativeTextProps}>KEYBOARD</Text></View>
    </View>
  );
});

/* ═══ THE BALLOT DESK ═════════════════════════════════════════════════════════
 * Two to six films, never plain text. The slots are drawn EMPTY and numbered
 * from the start, so the shape of the thing you are making is on the paper
 * before you have made it — and the two that must be filled are separated from
 * the four that need not be.
 *
 * The closing time is a choice of three, not a date picker: a picker is a
 * modal, a keyboard and a formatting problem for a decision that has three
 * sensible answers.
 */
export const BallotDesk = memo(function BallotDesk({
  me, hour, question, options, closes,
  onQuestion, onRemove, onChoose, onCloses, onBack, onFile, ready,
}: {
  me: PaperAuthor; hour: string; question: string;
  options: (PaperFilm | null)[]; closes: ClosingTime;
  /** Absent in the harness, where the question is a drawn line. */
  onQuestion?: (text: string) => void;
  onRemove?: (index: number) => void;
  onChoose?: (index: number) => void;
  onCloses?: (choice: ClosingTime) => void;
  onBack: () => void;
  onFile: () => void;
  ready?: boolean;
}) {
  const ROMAN = ['I.', 'II.', 'III.', 'IV.', 'V.', 'VI.'];
  const filled = options.filter(Boolean).length;
  return (
    <View style={p.desk}>
      <DeskHead kind="ballot" ready={ready ?? (filled >= 2 && !!question)} onBack={onBack} onFile={onFile} />
      <DeskDoc>
        <View style={p.postRow}>
          <View style={p.margin}>
            <Text style={p.marginValue} {...decorativeTextProps}>{hour}</Text>
          </View>
          <View style={p.column}>
            <Byline author={me} />
            {/* The lead-in is the house's, printed beside the field, never in it
                (where it could be deleted); the harness draws the question. */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <Text style={[p.leadIn, LEAD_STYLE.ballot]} {...decorativeTextProps}>BALLOT — </Text>
              {onQuestion ? (
                <TextInput
                  style={[d.ballotQ, { flex: 1, minWidth: 0, padding: 0 }]}
                  value={question}
                  onChangeText={onQuestion}
                  placeholder="What are you asking?"
                  placeholderTextColor={colors.fog}
                  multiline
                  autoFocus
                  maxLength={MAX_LENGTHS.filingTitle}
                  selectionColor={colors.sepia}
                  accessibilityLabel="Your question"
                  {...scaledTextProps}
                />
              ) : (
                <Text style={[d.ballotQ, { flex: 1, minWidth: 0 }]} {...displayTextProps}>
                  {question}<Text style={p.caret} {...UNSPOKEN}>|</Text>
                </Text>
              )}
            </View>

            <View style={{ marginTop: 16 }}>
              {options.map((o, i) => (
                <View key={i} style={d.slot}>
                  <Text style={d.slotNo} {...decorativeTextProps}>{ROMAN[i]}</Text>
                  {o ? (
                    <>
                      <View style={d.slotArt}>
                        {o.posterPath ? (
                          <Image source={{ uri: o.posterPath }} style={p.plateArt} contentFit="cover" />
                        ) : null}
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={d.slotTitle} numberOfLines={1} {...scaledTextProps}>
                          {o.title.toUpperCase()}
                        </Text>
                        <Text style={d.slotMeta} numberOfLines={1} {...scaledTextProps}>{o.year}</Text>
                      </View>
                      <PressableScale hitSlop={{ top: 4, bottom: 4, left: 8, right: 0 }} haptic
                        onPress={onRemove && (() => onRemove(i))} disabled={!onRemove}
                        accessibilityRole="button" accessibilityState={{ disabled: !onRemove }}
                        accessibilityLabel={`Remove ${o.title}`}>
                        <X size={13} strokeWidth={2} color={colors.fog} />
                      </PressableScale>
                    </>
                  ) : (
                    <PressableScale style={d.slotEmpty} haptic="selection" hitSlop={{ top: 0, bottom: 0, left: 0, right: 0 }}
                      onPress={onChoose && (() => onChoose(i))} disabled={!onChoose}
                      accessibilityRole="button" accessibilityState={{ disabled: !onChoose }}
                      accessibilityLabel={`Choose film ${i + 1}`}>
                      <Plus size={12} strokeWidth={2} color={colors.sepia} />
                      <Text style={d.slotAdd} {...scaledTextProps}>
                        {i < 2 ? 'CHOOSE A FILM' : 'ANOTHER, IF YOU LIKE'}
                      </Text>
                    </PressableScale>
                  )}
                </View>
              ))}
            </View>

            <View style={d.closesRow}>
              <Text style={d.fieldLabel} {...decorativeTextProps}>CLOSES</Text>
              <View style={d.closesChoices}>
                {CLOSING_TIMES.map(({ label: c }) => (
                  <PressableScale key={c} hitSlop={{ top: 10, bottom: 10, left: 0, right: 0 }} haptic="selection"
                    onPress={onCloses && (() => onCloses(c))} disabled={!onCloses}
                    accessibilityRole="button" accessibilityState={{ selected: c === closes, disabled: !onCloses }}
                    accessibilityLabel={`Closes in ${c.toLowerCase()}`}>
                    <Text style={[d.choice, c === closes && d.choiceOn]} {...scaledTextProps}>{c}</Text>
                  </PressableScale>
                ))}
              </View>
            </View>
          </View>
        </View>
      </DeskDoc>
      {/* CLOSES on the rail is the same choice as on the paper: each press moves it on. */}
      <DeskRail
        tools={[{
          icon: 'date', label: `CLOSES · ${closes}`, on: true,
          onPress: onCloses && (() => onCloses(nextClosing(closes))),
          spoken: `Closes in ${closes.toLowerCase()}. Change it`,
        }]}
        remaining={MAX_LENGTHS.filingTitle - question.length} />
      {/* The keyboard's real height in the app; a drawn keyboard in the harness. */}
      <PaperKeyWell drawn={!onQuestion} />
    </View>
  );
});

/* ═══ THE DOSSIER DESK ════════════════════════════════════════════════════════
 * Twenty-five thousand words. The one desk where the apparatus has to disappear
 * almost entirely: no margin, no rule, no byline while writing — the same
 * removals the READING view makes, so the desk and the page finally agree about
 * what an essay looks like.
 *
 * The counter counts WORDS, not characters remaining. Nobody writing an essay
 * has ever wanted to know they have 21,400 characters left.
 */
export const DossierDesk = memo(function DossierDesk({
  title, body, words, series, onSeries, onFilm, onCover, onBack, onFile,
}: {
  title: string; body: string; words: number; series?: string;
  onSeries?: () => void; onFilm?: () => void; onCover?: () => void;
  onBack: () => void; onFile: () => void;
}) {
  return (
    <View style={p.desk}>
      <DeskHead kind="dossier" ready={!!title && words > 0} onBack={onBack} onFile={onFile} />
      <DeskDoc style={{ paddingTop: 16 }}>
        <Text style={d.dossierTitle} {...displayTextProps}>
          {title || 'Title'}
          {!title ? null : <Text style={p.caret} {...UNSPOKEN}>|</Text>}
        </Text>
        {series ? (
          <Text style={d.dossierSeries} numberOfLines={1} {...scaledTextProps}>{series.toUpperCase()}</Text>
        ) : (
          <PressableScale style={{ paddingVertical: 6 }} haptic="selection" onPress={onSeries} disabled={!onSeries}
            accessibilityRole="button" accessibilityState={{ disabled: !onSeries }}
            accessibilityLabel="Make this part of a series">
            <Text style={d.dossierAdd} {...scaledTextProps}>+ PART OF A SERIES</Text>
          </PressableScale>
        )}
        <View style={[p.hair, { marginTop: 12, marginBottom: 16 }]} />
        <Text style={d.dossierBody} {...scaledTextProps}>{body}<Text style={p.caret} {...UNSPOKEN}>|</Text></Text>
      </DeskDoc>
      <View style={p.rail}>
        <PressableScale style={p.railTool} hitSlop={{ top: 10, bottom: 10, left: 0, right: 0 }} onPress={onFilm} disabled={!onFilm}
          accessibilityRole="button" accessibilityState={{ disabled: !onFilm }} accessibilityLabel="Name a film">
          <FilmIcon size={13} strokeWidth={2} color={colors.bone} />
          <Text style={p.rl} {...scaledTextProps}>FILM</Text>
        </PressableScale>
        <PressableScale style={p.railTool} hitSlop={{ top: 10, bottom: 10, left: 0, right: 0 }} onPress={onCover} disabled={!onCover}
          accessibilityRole="button" accessibilityState={{ disabled: !onCover }} accessibilityLabel="Choose a cover">
          <ImageIcon size={13} strokeWidth={2} color={colors.bone} />
          <Text style={p.rl} {...scaledTextProps}>COVER</Text>
        </PressableScale>
        <View style={{ flex: 1 }} />
        {/* Words, and the read time it implies — the two facts a writer of a
            long piece actually watches. */}
        <Text style={p.rl} {...scaledTextProps}>
          {groupDigits(words)} WORDS · {Math.max(1, Math.round(words / 220))} MIN
        </Text>
      </View>
      <View style={p.kbd}><Text style={p.kbdLabel} {...decorativeTextProps}>KEYBOARD</Text></View>
    </View>
  );
});

/* ═══ FINDING A FILM ══════════════════════════════════════════════════════════
 * Opened by FILM on any desk, and by a ballot's empty slot. The house's own
 * search, in the house's own frame — poster, title, year, nothing else. A row
 * that also carried the director, the rating and a synopsis would be a list you
 * read rather than a list you pick from.
 */
export const FilmFinder = memo(function FilmFinder({
  query, results, onPick, onQuery, answer, onRetry,
}: {
  query: string; results: PaperFilm[];
  /** With its INDEX, to map by: a title and year can repeat (a re-release). */
  onPick?: (film: PaperFilm, index: number) => void;
  /** Absent in the harness, where the query is a drawn line with a caret. */
  onQuery?: (text: string) => void;
  /**
   * What the catalogue said, when it said nothing to pick: it matched nothing,
   * or it could not be asked. Left blank, both looked like a search still out.
   */
  answer?: 'none' | 'unreachable';
  onRetry?: () => void;
}) {
  return (
    <View style={d.sheet}>
      <View style={d.grab} />
      <View style={d.search}>
        <Search size={13} strokeWidth={2} color={colors.sepia} />
        {onQuery ? (
          <TextInput
            style={[d.searchText, { flex: 1, minWidth: 0, padding: 0 }]}
            value={query}
            onChangeText={onQuery}
            placeholder="Name a film"
            placeholderTextColor={colors.fog}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
            selectionColor={colors.sepia}
            accessibilityLabel="Search for a film"
            {...scaledTextProps}
          />
        ) : (
          <Text style={d.searchText} numberOfLines={1} {...scaledTextProps}>
            {query}<Text style={p.caret} {...UNSPOKEN}>|</Text>
          </Text>
        )}
      </View>
      {results.map((f, i) => (
        // By POSITION, not by title. Search "Suspiria" and TMDB returns 1977 and
        // 2018 — two results, one key, and React silently drops a row from a
        // list whose whole purpose is picking between them.
        <View key={i}>
          {i > 0 && <View style={p.hair} />}
          <PressableScale style={d.result} haptic="selection" hitSlop={{ top: 0, bottom: 0, left: 0, right: 0 }}
            onPress={onPick && (() => onPick(f, i))} disabled={!onPick}
            accessibilityRole="button" accessibilityState={{ disabled: !onPick }}
            accessibilityLabel={`${f.title}${f.year ? `, ${f.year}` : ''}`}>
            <View style={d.resultArt}>
              {f.posterPath ? (
                <Image source={{ uri: f.posterPath }} style={p.plateArt} contentFit="cover" />
              ) : null}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={d.resultTitle} numberOfLines={1} {...scaledTextProps}>
                {f.title.toUpperCase()}
              </Text>
              <Text style={d.resultMeta} numberOfLines={1} {...scaledTextProps}>
                {[f.year, f.director?.toUpperCase()].filter(Boolean).join(' · ')}
              </Text>
            </View>
          </PressableScale>
        </View>
      ))}
      {answer === 'unreachable' && onRetry ? (
        <PaperEmpty
          title="The catalogue could not be reached."
          body="Check the connection, and try again."
          action="TRY AGAIN"
          onAction={onRetry}
        />
      ) : answer === 'none' ? (
        <PaperEmpty title="No film by that name." body="Try the title as it was released." />
      ) : null}
    </View>
  );
});

/* ═══ SHARING ═════════════════════════════════════════════════════════════════
 * Four destinations, in the order they are actually used, and the card is shown
 * ABOVE them — you are choosing where to send a thing you can see, not agreeing
 * to send something described in words.
 *
 * A link opened by somebody without the app goes to the store, not to a web
 * page pretending to be the app.
 */
export const ShareSheet = memo(function ShareSheet({
  preview, card, onDest,
}: {
  /** Which destination was chosen, by its label — the row's own words. */
  onDest?: (label: string) => void;
  preview: React.ReactNode;
  /** A dossier's card to save; unset in the app (supabase/DEFERRED-ACTIONS.md, SAVE THE CARD). */
  card?: boolean;
}) {
  // Only what the phone's own sheet cannot do (the house's rooms, a dossier's
  // card); ELSEWHERE hands the rest to it, ordered as this member uses them.
  const rows: [typeof Send, string, string][] = [
    [Send, 'TO THE LOUNGE', 'Drop it into a room'],
    ...(card
      ? ([[Bookmark, 'SAVE THE CARD', 'A picture, to your photos']] as [typeof Send, string, string][])
      : []),
    [Share2, 'ELSEWHERE', 'Anywhere your phone can send'],
  ];
  return (
    <View style={d.sheet}>
      <View style={d.grab} />
      <View style={d.preview}>{preview}</View>
      {rows.map(([Icon, label, sub], i) => (
        <View key={label}>
          {i > 0 && <View style={p.hair} />}
          <PressableScale style={d.dest} haptic="selection" hitSlop={{ top: 0, bottom: 0, left: 0, right: 0 }}
            onPress={onDest && (() => onDest(String(label)))} disabled={!onDest}
            accessibilityRole="button" accessibilityState={{ disabled: !onDest }}
            accessibilityLabel={`${label}. ${sub}.`}>
            <Icon size={15} strokeWidth={2} color={colors.sepia} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={d.destLabel} {...deckLabelProps}>{label}</Text>
              <Text style={d.destSub} numberOfLines={1} {...scaledTextProps}>{sub}</Text>
            </View>
          </PressableScale>
        </View>
      ))}
    </View>
  );
});

const d = StyleSheet.create({
  // ── shared sheet shell ────────────────────────────────────────────────────
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
  // ── fields ────────────────────────────────────────────────────────────────
  field: {
    marginTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(184,137,26,0.25)', paddingTop: 12,
  },
  fieldLabel: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.9, color: colors.sepia, marginBottom: 6, includeFontPadding: false,
  },
  fieldValue: { fontFamily: fonts.body, fontSize: 12.5, color: colors.parchment },

  // ── the wire desk ─────────────────────────────────────────────────────────
  wireHead: {
    fontFamily: fonts.display, fontSize: 16.5, lineHeight: 26,
    color: colors.parchment, marginBottom: 8,
  },

  // ── the ballot desk ───────────────────────────────────────────────────────
  ballotQ: { fontFamily: fonts.display, fontSize: 16.5, lineHeight: 28, color: colors.parchment },
  slot: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  // 21, as the ballot's own `optionNo`: `III.` needs 19pt at 8.5pt in the sub face.
  slotNo: { fontFamily: fonts.sub, fontSize: 8.5, color: colors.sepia, width: 21, includeFontPadding: false },
  slotArt: {
    width: 26, height: 39, borderRadius: 1, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(240,232,176,0.18)', backgroundColor: colors.soot,
  },
  slotTitle: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.9, color: colors.parchment, includeFontPadding: false },
  slotMeta: { fontFamily: fonts.sub, fontSize: 10, color: colors.fog, marginTop: 4, includeFontPadding: false },
  /** An empty slot is a DASHED frame the height of a filled one, so adding a
   *  film never changes the height of the form under your thumb. */
  slotEmpty: {
    flex: 1, height: 39, flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(184,137,26,0.25)',
    borderRadius: 2, paddingHorizontal: 8,
  },
  slotAdd: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.2, color: colors.sepia, includeFontPadding: false,
  },
  closesRow: {
    marginTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(184,137,26,0.25)', paddingTop: 12,
  },
  closesChoices: { flexDirection: 'row', gap: 16 },
  choice: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.9, color: colors.fog, includeFontPadding: false,
  },
  choiceOn: { color: KIND_RULE.ballot, opacity: 1 },

  // ── the dossier desk ──────────────────────────────────────────────────────
  dossierTitle: {
    fontFamily: fonts.display, fontSize: 26, lineHeight: 34, color: colors.parchment,
  },
  dossierSeries: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.9, color: colors.sepia,
    marginTop: 8, includeFontPadding: false,
  },
  dossierAdd: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.2, color: colors.sepia, marginTop: 8, includeFontPadding: false,
  },
  dossierBody: {
    fontFamily: fonts.serif, fontSize: 16.5, lineHeight: 27, color: colors.parchment,
  },

  // ── the film finder ───────────────────────────────────────────────────────
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: colors.sepiaBorder, borderRadius: 2,
    paddingHorizontal: 8, paddingVertical: 8, marginBottom: 6,
  },
  searchText: { flex: 1, minWidth: 0, fontFamily: fonts.body, fontSize: 12.5, color: colors.parchment },
  result: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  resultArt: {
    width: 30, height: 45, borderRadius: 1, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(240,232,176,0.18)', backgroundColor: colors.soot,
  },
  resultTitle: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.9, color: colors.parchment, includeFontPadding: false },
  resultMeta: { fontFamily: fonts.sub, fontSize: 10, color: colors.fog, marginTop: 4, includeFontPadding: false },

  // ── sharing ───────────────────────────────────────────────────────────────
  preview: { marginBottom: 16 },
  dest: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  destLabel: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.2, color: colors.parchment,
    includeFontPadding: false,
  },
  destSub: {
    fontFamily: fonts.bodyItalic, fontSize: 12.5, color: colors.bone, opacity: QUIET, marginTop: 4,
  },
});
