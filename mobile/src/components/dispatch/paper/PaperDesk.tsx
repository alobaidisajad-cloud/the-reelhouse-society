/**
 * ── THE THREE FORMS THAT HAD NO DESK ─────────────────────────────────────────
 * The picker offers five forms. Two of them had a composer drawn (take,
 * seeking) and three did not — including the ballot, which was added on your
 * suggestion, and the dossier, which is the entire Auteur tier.
 *
 * Every desk here is the SAME desk: back / kind / file it across the top, the
 * document filling the room, one tool rail at the foot. What changes is the
 * form printed on the paper, because what changes between kinds is the form.
 *
 * Also here: the two sheets a desk opens (find a film, share it) and the sheet
 * the page opens on somebody else's filing (report it).
 */
import { memo } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { Image } from 'expo-image';
import {
  FilmIcon, ImageIcon, AlertTriangle, Search, X, Plus, Calendar,
  Send, Bookmark, Share2,
} from 'lucide-react-native';

import PressableScale from '@/src/components/PressableScale';
import { colors, fonts } from '@/src/theme/theme';
import { scaledTextProps, decorativeTextProps, displayTextProps } from '@/src/constants/textScaling';
import { p, QUIET } from './paperStyles';
import { KIND_RULE, COUNTER_SHOWS_AT, CRIMSON_INK, UNSPOKEN, groupDigits } from './paperMetrics';
import { LEAD_STYLE } from './paperPerf';
import { MAX_LENGTHS } from '@/src/utils/sanitizeInput';
import { Byline, type PaperAuthor, type PaperFilm } from './PaperPost';
import { PaperKeyWell } from './PaperKeyWell';

/** The head every desk wears. One component so three desks cannot drift. */
/**
 * BACK and FILE IT are REQUIRED, for the reason BrassButton's onPress is.
 *
 * `BallotDesk` mounted this with neither, so the ballot desk had a back arrow
 * that did not go back and a FILE IT that did not file — on the one screen where
 * a member has just spent a minute choosing six films. Optional handlers on a
 * header whose entire content is two controls is a dead end waiting to be
 * written; required ones are a compile error the moment it is.
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
        {kind.toUpperCase()}
      </Text>
      {/* FILE IT is lit only when the form is complete. A permanently bright
          confirm on an unfinished form is a button that lies about being ready. */}
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

/** The rail every desk stands on. `count` appears only when it could matter. */
export const DeskRail = memo(function DeskRail({
  tools, remaining, onTool,
}: {
  tools: { icon: 'film' | 'still' | 'spoiler' | 'date'; label: string; on?: boolean }[];
  remaining?: number;
  onTool?: (icon: 'film' | 'still' | 'spoiler' | 'date') => void;
}) {
  const I = { film: FilmIcon, still: ImageIcon, spoiler: AlertTriangle, date: Calendar };
  return (
    <View style={p.rail}>
      {tools.map((t) => {
        const Icon = I[t.icon];
        return (
          <PressableScale key={t.label} style={p.railTool} hitSlop={{ top: 10, bottom: 10, left: 0, right: 0 }}
            onPress={() => onTool?.(t.icon)}
            accessibilityRole="button" accessibilityState={{ selected: !!t.on }} accessibilityLabel={t.label.toLowerCase()}>
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
    <View style={p.screen}>
      <DeskHead kind="wire" ready={!!source && !!headline} onBack={onBack} onFile={onFile} />
      <View style={p.deskDoc}>
        <View style={p.postRow}>
          <View style={p.margin}>
            <Text style={p.marginValue} {...decorativeTextProps}>{hour}</Text>
          </View>
          <View style={p.column}>
            <Byline author={me} />
            <Text style={d.wireHead} {...displayTextProps}>
              <Text style={[p.leadIn, LEAD_STYLE.wire]}>WIRE — </Text>
              {headline}
            </Text>
            <Text style={p.wire} {...scaledTextProps}>{body}<Text style={p.caret} {...UNSPOKEN}>|</Text></Text>

            <View style={d.field}>
              <Text style={d.fieldLabel} {...decorativeTextProps}>SOURCE — REQUIRED</Text>
              <Text style={[d.fieldValue, !source && { color: colors.fog, opacity: 0.6 }]}
                numberOfLines={1} {...scaledTextProps}>
                {source || 'where did this come from?'}
              </Text>
            </View>
          </View>
        </View>
      </View>
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
  options: (PaperFilm | null)[]; closes: string;
  /** Absent in the harness, where the question is a drawn line. */
  onQuestion?: (text: string) => void;
  onRemove?: (index: number) => void;
  onChoose?: (index: number) => void;
  onCloses?: (choice: string) => void;
  onBack: () => void;
  onFile: () => void;
  ready?: boolean;
}) {
  const ROMAN = ['I.', 'II.', 'III.', 'IV.', 'V.', 'VI.'];
  const filled = options.filter(Boolean).length;
  return (
    <View style={p.screen}>
      <DeskHead kind="ballot" ready={ready ?? (filled >= 2 && !!question)} onBack={onBack} onFile={onFile} />
      <View style={p.deskDoc}>
        <View style={p.postRow}>
          <View style={p.margin}>
            <Text style={p.marginValue} {...decorativeTextProps}>{hour}</Text>
          </View>
          <View style={p.column}>
            <Byline author={me} />
            {/* The lead-in is the HOUSE and cannot live inside the field: it is
                not the member's text, and putting it there would let them
                delete it or type before it. Printed, with the field set
                immediately after — which is also what makes the desk print the
                shape the page will.

                No `onQuestion` means the harness, where this stays a drawn line
                with a drawn caret and every screenshot is unchanged. */}
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
                        onPress={() => onRemove?.(i)}
                        accessibilityRole="button" accessibilityLabel={`Remove ${o.title}`}>
                        <X size={13} strokeWidth={2} color={colors.fog} />
                      </PressableScale>
                    </>
                  ) : (
                    <PressableScale style={d.slotEmpty} haptic="selection" hitSlop={{ top: 0, bottom: 0, left: 0, right: 0 }}
                      onPress={() => onChoose?.(i)}
                      accessibilityRole="button" accessibilityLabel={`Choose film ${i + 1}`}>
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
                {['1 DAY', '2 DAYS', '1 WEEK'].map((c) => (
                  <PressableScale key={c} hitSlop={{ top: 10, bottom: 10, left: 0, right: 0 }} haptic="selection"
                    onPress={() => onCloses?.(c)}
                    accessibilityRole="button" accessibilityState={{ selected: c === closes }}
                    accessibilityLabel={`Closes in ${c.toLowerCase()}`}>
                    <Text style={[d.choice, c === closes && d.choiceOn]} {...scaledTextProps}>{c}</Text>
                  </PressableScale>
                ))}
              </View>
            </View>
          </View>
        </View>
      </View>
      <DeskRail tools={[{ icon: 'date', label: 'CLOSES', on: true }]}
        remaining={MAX_LENGTHS.filingTitle - question.length} />
      {/* Drawn in the harness, where `onQuestion` is absent; the keyboard's real
          height in the app, where it is not. A fixed 210pt block was neither —
          it left the tool rail under the keyboard AND put the word KEYBOARD on
          a member's screen. */}
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
    <View style={p.screen}>
      <DeskHead kind="dossier" ready={!!title && words > 0} onBack={onBack} onFile={onFile} />
      <View style={[p.deskDoc, { paddingTop: 16 }]}>
        <Text style={d.dossierTitle} {...displayTextProps}>
          {title || 'Title'}
          {!title ? null : <Text style={p.caret} {...UNSPOKEN}>|</Text>}
        </Text>
        {series ? (
          <Text style={d.dossierSeries} numberOfLines={1} {...scaledTextProps}>{series.toUpperCase()}</Text>
        ) : (
          <PressableScale style={{ paddingVertical: 6 }} haptic="selection" onPress={onSeries}
            accessibilityRole="button" accessibilityLabel="Make this part of a series">
            <Text style={d.dossierAdd} {...scaledTextProps}>+ PART OF A SERIES</Text>
          </PressableScale>
        )}
        <View style={[p.hair, { marginTop: 12, marginBottom: 16 }]} />
        <Text style={d.dossierBody} {...scaledTextProps}>{body}<Text style={p.caret} {...UNSPOKEN}>|</Text></Text>
      </View>
      <View style={p.rail}>
        <PressableScale style={p.railTool} hitSlop={{ top: 10, bottom: 10, left: 0, right: 0 }} onPress={onFilm}
          accessibilityRole="button" accessibilityLabel="Name a film">
          <FilmIcon size={13} strokeWidth={2} color={colors.bone} />
          <Text style={p.rl} {...scaledTextProps}>FILM</Text>
        </PressableScale>
        <PressableScale style={p.railTool} hitSlop={{ top: 10, bottom: 10, left: 0, right: 0 }} onPress={onCover}
          accessibilityRole="button" accessibilityLabel="Choose a cover">
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
  query, results, onPick, onQuery,
}: {
  query: string; results: PaperFilm[];
  /**
   * The INDEX comes too, and the caller must use it.
   *
   * The film alone is not an identity: the caller has to map it back to the
   * TMDB id it carries, and doing that by title and year picks the FIRST result
   * that matches — so two entries sharing both (a re-release, a duplicate TMDB
   * record) resolve to the wrong id, and the wrong film is persisted as the
   * filing's subject. The row is then correct-looking and wrong.
   *
   * This is the same defect as keying the rows by title, one layer up.
   */
  onPick?: (film: PaperFilm, index: number) => void;
  /** Absent in the harness, where the query is a drawn line with a caret. */
  onQuery?: (text: string) => void;
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
            onPress={() => onPick?.(f, i)}
            accessibilityRole="button" accessibilityLabel={`${f.title}, ${f.year}`}>
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
    </View>
  );
});

/* ═══ SPIKING A FILING ════════════════════════════════════════════════════════
 * Five reports send a filing to the house. The sheet says exactly that, because
 * a member who thinks they are deleting a post will report everything they
 * dislike, and a member who knows five are needed reports what actually warrants
 * it. It also names what happens next, so nobody has to wonder.
 *
 * The reasons are the house rules, in the same words the rules page uses. A
 * report form whose vocabulary differs from the rules it enforces is a form
 * that teaches members the wrong rules.
 */
export const ReportSheet = memo(function ReportSheet({
  reasons, chosen, onChoose, onReport,
}: {
  reasons: string[]; chosen?: string;
  onChoose?: (reason: string) => void;
  onReport?: () => void;
}) {
  return (
    <View style={d.sheet}>
      <View style={d.grab} />
      <Text style={d.sheetHead} accessibilityRole="header" {...decorativeTextProps}>
        WHY ARE YOU REPORTING THIS?
      </Text>
      {reasons.map((r, i) => (
        <View key={r}>
          {i > 0 && <View style={p.hair} />}
          <PressableScale style={d.reason} haptic="selection" hitSlop={{ top: 0, bottom: 0, left: 0, right: 0 }}
            onPress={() => onChoose?.(r)}
            accessibilityRole="radio" accessibilityState={{ checked: r === chosen }}
            accessibilityLabel={r}>
            <View style={[d.box, r === chosen && { borderColor: colors.crimson }]}>
              {/* The mark is silent: this row is a radio, and its own
                  `accessibilityState={{ checked }}` is how a reader learns it
                  is chosen. Left spoken, the ✗ would be announced as "ballot X"
                  on top of the state that already says the same thing. */}
              {r === chosen ? (
                <Text style={d.boxMark} {...decorativeTextProps} {...UNSPOKEN}>✗</Text>
              ) : null}
            </View>
            <Text style={d.reasonText} {...scaledTextProps}>{r}</Text>
          </PressableScale>
        </View>
      ))}
      <Text style={d.sheetFoot} {...scaledTextProps}>
        Five members report a filing and the house reads it. Five is not a verdict,
        and the member is never told who reported them.
      </Text>
      <PressableScale style={[p.btn, d.reportBtn]} haptic="medium" disabled={!chosen}
        onPress={chosen ? onReport : undefined}
        accessibilityRole="button" accessibilityState={{ disabled: !chosen }}
        accessibilityLabel={chosen ? "Report this filing" : "Report this filing. Choose a reason first"}>
        <Text style={[p.btnText, { color: chosen ? CRIMSON_INK : colors.fog }]} {...scaledTextProps}>
          REPORT IT
        </Text>
      </PressableScale>
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
  /**
   * Whether this filing HAS a card to save.
   *
   * Only a dossier does. A take shared as a poster is a poster of somebody's
   * opinion and a seeking is a poster of somebody's question; nobody makes
   * those, so nothing is drawn for them. The row is therefore absent, not
   * dimmed: a disabled control asks a question the app has no answer to, and
   * offering to save a picture that will never exist is worse than not offering.
   *
   * Every kind keeps the other three — a lounge, a link and the system sheet —
   * because pointing at a filing is useful whatever kind it is.
   *
   * ⚠️ NOTHING PASSES THIS, AND THAT IS DELIBERATE — 2026-09-04.
   * The reader is the only screen that mounts this sheet and it never sets
   * `card`, so the row has never appeared. Two reasons, and the second is the
   * one that decides it:
   *
   *   · A DIRECT SAVE IS NOT AVAILABLE. "To your photos" means writing to the
   *     photo library, which needs `expo-media-library`. It is not a dependency
   *     of this app, and adding one needs a native build — which the release is
   *     frozen against.
   *   · WITHOUT IT THE ROW IS A DUPLICATE. ELSEWHERE already captures a
   *     dossier's clipping and hands it to the system sheet, where "Save Image"
   *     is one tap. Offering a second row that does exactly the same thing is
   *     worse than offering one, and a row promising the photo library while
   *     opening a share sheet is worse still.
   *
   * So the prop stays, unset, with the reason written down — and the work is in
   * DEFERRED-ACTIONS.md rather than half-built behind a label that overpromises.
   */
  card?: boolean;
}) {
  /**
   * ── ONLY WHAT THE PHONE CANNOT DO ITSELF ─────────────────────────────────
   * This sheet had four rows and two of them were already in the operating
   * system's own share sheet: COPY THE LINK, and a second way to reach the
   * apps that ELSEWHERE reaches. A custom sheet that reimplements the OS sheet
   * is a longer road to the same place, and one the member has to read first.
   *
   * What survives is what iOS and Android have no idea about — the house's own
   * rooms, and the clipping that only a dossier has. Then ELSEWHERE hands over
   * to the system sheet, which already carries copy-link, Messages, WhatsApp
   * and Instagram, ordered by what this member actually uses. We are not going
   * to guess that order better than their phone already knows it.
   */
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
            onPress={() => onDest?.(String(label))}
            accessibilityRole="button" accessibilityLabel={`${label}. ${sub}.`}>
            <Icon size={15} strokeWidth={2} color={colors.sepia} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={d.destLabel} {...decorativeTextProps}>{label}</Text>
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
  sheetHead: {
    fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 2.2, color: colors.sepia,
    marginBottom: 4, includeFontPadding: false,
  },
  sheetFoot: {
    fontFamily: fonts.bodyItalic, fontSize: 12.5, lineHeight: 18,
    color: colors.bone, opacity: QUIET, marginTop: 16,
  },

  // ── fields ────────────────────────────────────────────────────────────────
  field: {
    marginTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(184,137,26,0.25)', paddingTop: 12,
  },
  fieldLabel: {
    fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 1.6, color: colors.sepia,
    opacity: 0.85, marginBottom: 6, includeFontPadding: false,
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
  // 21, matching `optionNo` on the ballot itself and for the same measured
  // reason: `III.` needs 19pt at 8.5pt in the sub face and was being cut by two.
  // The desk numbers the same six options the ballot prints, so a member choosing
  // the third film saw `III` here and `III` there — the same fault twice, because
  // the two rows were styled separately.
  slotNo: { fontFamily: fonts.sub, fontSize: 8.5, color: colors.sepia, width: 21, includeFontPadding: false },
  slotArt: {
    width: 26, height: 39, borderRadius: 1, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(240,232,176,0.18)', backgroundColor: 'rgba(20,16,11,0.9)',
  },
  slotTitle: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.2, color: colors.parchment, includeFontPadding: false },
  slotMeta: { fontFamily: fonts.sub, fontSize: 8.5, color: colors.fog, marginTop: 4, includeFontPadding: false },
  /** An empty slot is a DASHED frame the height of a filled one, so adding a
   *  film never changes the height of the form under your thumb. */
  slotEmpty: {
    flex: 1, height: 39, flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(184,137,26,0.25)',
    borderRadius: 2, paddingHorizontal: 8,
  },
  slotAdd: {
    fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.6, color: colors.sepia,
    opacity: 0.85, includeFontPadding: false,
  },
  closesRow: {
    marginTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(184,137,26,0.25)', paddingTop: 12,
  },
  closesChoices: { flexDirection: 'row', gap: 16 },
  choice: {
    fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.2, color: colors.bone,
    opacity: 0.8, includeFontPadding: false,
  },
  choiceOn: { color: KIND_RULE.ballot, opacity: 1 },

  // ── the dossier desk ──────────────────────────────────────────────────────
  dossierTitle: {
    fontFamily: fonts.display, fontSize: 26, lineHeight: 34, color: colors.parchment,
  },
  dossierSeries: {
    fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 1.6, color: colors.sepia,
    marginTop: 8, includeFontPadding: false,
  },
  dossierAdd: {
    fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.6, color: colors.sepia,
    opacity: 0.7, marginTop: 8, includeFontPadding: false,
  },
  dossierBody: {
    fontFamily: fonts.serif, fontSize: 16.5, lineHeight: 27, color: colors.parchment, opacity: 0.94,
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
    borderWidth: 1, borderColor: 'rgba(240,232,176,0.18)', backgroundColor: 'rgba(20,16,11,0.9)',
  },
  resultTitle: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.2, color: colors.parchment, includeFontPadding: false },
  resultMeta: { fontFamily: fonts.sub, fontSize: 8.5, color: colors.fog, marginTop: 4, includeFontPadding: false },

  // ── reporting ───────────────────────────────────────────────────────────────
  reason: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  box: {
    width: 13, height: 13, borderRadius: 1, borderWidth: 1.4,
    borderColor: 'rgba(184,137,26,0.5)', alignItems: 'center', justifyContent: 'center',
  },
  boxMark: { fontFamily: fonts.sub, fontSize: 12.5, color: CRIMSON_INK, marginTop: -2, includeFontPadding: false },
  reasonText: { flex: 1, minWidth: 0, fontFamily: fonts.body, fontSize: 12.5, color: colors.parchment },
  reportBtn: { marginTop: 16, borderColor: 'rgba(180,45,45,0.42)', alignItems: 'center' },

  // ── sharing ───────────────────────────────────────────────────────────────
  preview: { marginBottom: 16 },
  dest: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  destLabel: {
    fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.6, color: colors.parchment,
    includeFontPadding: false,
  },
  destSub: {
    fontFamily: fonts.bodyItalic, fontSize: 12.5, color: colors.bone, opacity: QUIET, marginTop: 4,
  },
});
