import { memo } from 'react';
import { RemoteImage, PosterMark } from '@/src/components/Picture';
import { View } from 'react-native';
import { Text } from '@/src/components/text';
import { LinearGradient } from 'expo-linear-gradient';
import { Heart, MessageSquare, Share2, Bookmark } from 'lucide-react-native';

import PressableScale from '@/src/components/PressableScale';
import { colors } from '@/src/theme/theme';
import { BRASS, BRASS_STOPS } from '@/src/theme/brass';
import { UNINKED } from '@/src/theme/unready';
import {
  scaledTextProps, decorativeTextProps, displayTextProps,
} from '@/src/constants/textScaling';
import { p } from './paperStyles';
import { stillHeight, KIND_RULE, KIND_NAME, actionLabelProps, CRIMSON_INK, UNSPOKEN, nameOf } from './paperMetrics';
import { MarkFigure, certifyLabel, critiqueLabel } from '@/src/components/MarkFigure';
import { RankBadge, rankOf, rankWord } from '@/src/components/RankBadge';
import { LEAD_STYLE } from './paperPerf';
import { PaperStrike } from './PaperStrike';
import { softBreak, counted, NOT_SENT_LINE, WITHHELD_LINE } from './paperText';
import { DEPARTED_NAME } from '@/src/constants/departed';
import { initialOf, isRTLText, RTL_MARK } from '@/src/utils/text';

export type PaperKind = 'take' | 'seeking' | 'wire' | 'ballot' | 'dossier';
export type PaperTier = 'free' | 'archivist' | 'auteur';
/** What the margin's ordering value is: a room's `28` is a day, CERTIFIED's is a count. */
export type PaperOrder = 'hour' | 'count' | 'day';

const ordinal = (day: string) => {
  const n = Number(day);
  const teen = n % 100 >= 11 && n % 100 <= 13;
  return day + (teen ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'));
};

/** The margin prints a bare value, as a ledger does; the ear is told what it is. */
const SAY_ORDER: Record<PaperOrder, (value: string) => string> = {
  hour: (v) => (v === '—' ? 'Time not known' : `Filed at ${v}`),
  count: (v) => (v === '—' ? 'Not certified' : `${v} certified`),
  day: (v) => (v === '—' ? 'Date not known' : `Filed on the ${ordinal(v)}`),
};

export interface PaperAuthor {
  name: string;
  memberNo: number;
  tier: PaperTier;
  avatar?: string | null;
}


export interface PaperFilm {
  title: string;
  year?: number | null;
  director?: string | null;
  posterPath?: string | null;
  backdropPath?: string | null;
}

/**
 * The byline heads the column, as a correspondent's name heads a letter; in the
 * 44pt margin a long name wrapped to three lines. No author: the one fallback.
 */
/** Under this many letters a name is shorter than the byline's floor (56pt), so it is never cut. */
const SHORT_NAME = 9;

export const Byline = memo(function Byline({
  author, trailing, onPress,
}: { author: PaperAuthor | null; trailing?: string; onPress?: () => void }) {
  const departed = !author;
  // The rank the badge draws. `rankOf` goes through resolveTier, so a founding
  // member reads as an Auteur here exactly as they do everywhere else.
  const rank = departed ? null : rankOf(author.tier);
  const word = rankWord(rank);
  const name = departed ? DEPARTED_NAME.toUpperCase() : author.name.toUpperCase();
  // A departed member has no page to open, so the name is not a control. The
  // words stay and the destination goes, which is what the erasure means.
  const Row: React.ComponentType<any> = onPress && !departed ? PressableScale : View;
  const pressable = Boolean(onPress) && !departed;
  const rowProps = pressable
    ? {
      onPress, haptic: 'selection' as const,
      hitSlop: { top: 4, bottom: 4, left: 0, right: 0 },
      accessibilityRole: 'link' as const,
      // The rank rides the ROW's label: a labelled iOS control silences its children.
      accessibilityLabel: `${author.name}${word ? `, ${word}` : ''}${trailing ? `, ${trailing}` : ''}. Open their room.`,
    }
    : {};
  return (
    <Row style={p.byline} {...rowProps}>
      {/* The ring carries the tier — brass for an Archivist, crimson for an
          Auteur. It belongs to the member, not to the post they wrote. */}
      <View style={[
        p.avatar,
        author?.tier === 'archivist' && p.avatarArchivist,
        author?.tier === 'auteur' && p.avatarAuteur,
      ]}>
        {/* `recyclingKey`: in a recycled row the reused <Image> would show the
            previous member's face for a frame. */}
        <RemoteImage
          uri={departed ? null : author.avatar}
          style={p.plateArt}
          contentFit="cover"
          recyclingKey={departed ? undefined : author.avatar}
          transition={0}
          fallback={departed ? null : (
            // UNSPOKEN: the name is beside it, and "T. TOMASREYES" is a stutter.
            <Text style={p.avatarMark} {...UNSPOKEN} {...decorativeTextProps}>
              {initialOf(author.name)}
            </Text>
          )}
        />
      </View>
      {/* The name truncates; the rank and the trailing facts sit in their own
          boxes. Measured: a 14-letter name with its facts needs 292pt of 256.
          With no facts, the name and the rank share a block that wraps: where
          both will not fit one line (a narrow phone, a large size), the rank
          takes the next, and neither is cut. */}
      <View style={trailing ? p.bylineInline : p.bylineWords}>
        <Text
          style={[p.bylineName, name.length < SHORT_NAME && p.bylineNameShort, rank === 'auteur' && p.bylineNameAuteur]}
          numberOfLines={1}
          {...scaledTextProps}
        >
          {name}
        </Text>
        {/* The app's own badge, which never truncates (`★ AUT` is wrong);
            `silent` inside a control whose label already says the rank. */}
        <RankBadge rank={rank} silent={pressable} />
        {trailing ? (
          <Text style={p.bylineTrail} numberOfLines={1} {...scaledTextProps}>
            {`· ${trailing}`}
          </Text>
        ) : null}
      </View>
    </Row>
  );
});

/**
 * The film a filing is about, named in type only: title and year identify it
 * (a director truncated constantly; an 18x27 poster is a speck). The title
 * yields and the year never does, as the year tells a remake from its original
 * (`THE LORD OF THE RINGS: THE RETURN OF THE KING · 2003` needs 331pt of 256).
 * A link to the film's page when there is one; plain text when there is not.
 */
export const Credit = memo(function Credit({
  film, onPress,
}: { film: PaperFilm; onPress?: () => void }) {
  const words = (
    <View style={p.creditWords}>
      <Text style={p.creditText} numberOfLines={1} {...scaledTextProps}>
        {film.title.toUpperCase()}
      </Text>
      {film.year ? (
        <Text style={p.creditYear} {...scaledTextProps}>{'· '}{film.year}</Text>
      ) : null}
    </View>
  );

  if (!onPress) return <View style={p.credit}>{words}</View>;

  return (
    <PressableScale
      style={p.credit} onPress={onPress} haptic="selection"
      // Not the 15pt default, which would reach into CERTIFY just below.
      hitSlop={{ top: 4, bottom: 0, left: 0, right: 0 }}
      accessibilityRole="link"
      accessibilityLabel={`${film.title}${film.year ? `, ${film.year}` : ''}. Open the film.`}
    >
      {words}
    </PressableScale>
  );
});

// The stamp bar's reach: upward only, clear of the credit and the next entry.
const SLOP = { top: 7, bottom: 0, left: 0, right: 0 };
// A mark not yet read is drawn UNINKED (src/theme/unready.ts); the paper's pieces take it from here.
export { UNINKED };

/**
 * The four marks under a filing: the app's stamp-bar anatomy (four equal
 * tiles, the icon above its word, flush to the rails), each count beside its
 * icon. The fourth is SHARE, not LOUNGE: the share sheet's first row IS the
 * Lounge. CERTIFY and SAVE pass the state they move TO, never a toggle, which
 * an offline replay could land on either side. Handlers are optional only for
 * the render harness; `dispatchNoDeadControls.test.ts` requires them in the app.
 */
export const PaperActions = memo(function PaperActions({
  certifyCount = 0, commentCount = 0, certified, saved, dimmed,
  certifyKnown = true, saveKnown = true,
  onCertify, onCritique, onShare, onSave,
}: {
  certifyCount?: number; commentCount?: number;
  certified?: boolean; saved?: boolean;
  /**
   * Whether this member's certify and save on the filing have been read. Unread, the mark is
   * drawn as the stamp's outline before its ink (dashed, in fog) and cannot be pressed: drawn
   * as CERTIFY, a member who had certified would be invited to certify again. Known by default,
   * for the render harness; the app passes the store's answer (marksKnown).
   */
  certifyKnown?: boolean; saveKnown?: boolean;
  /** Not sent yet: nothing can be done to this filing until the house has it. */
  dimmed?: boolean;
  onCertify?: (next: boolean) => void;
  onCritique?: () => void;
  onShare?: () => void;
  onSave?: (next: boolean) => void;
}) {
  // No handler (signed out): dimmed, disabled and said so, never a silent tap.
  // `dimmed` is a filing NOT SENT YET: the house has not seen it, so nothing is
  // done to it until it has — the house would refuse a certify, a share would
  // link to nothing, a critique would hang under a filing nobody else can open.
  const waiting = !!dimmed;
  const why = waiting ? 'Not sent yet' : 'Members only';
  // A mark still being read is not off: its outline is drawn, unpressed, until the read answers.
  const markReading = !!onCertify && !waiting && !certifyKnown;
  const keepReading = !!onSave && !waiting && !saveKnown;
  const canMark = !!onCertify && !waiting && certifyKnown;
  const canKeep = !!onSave && !waiting && saveKnown;
  const whyNot = (reading: boolean) => (reading ? 'Reading your mark' : why);

  return (
    <View style={p.actions}>
      <PressableScale room style={[p.action, !canMark && !markReading && p.actionOff]} hitSlop={SLOP} haptic pressedScale={0.92}
        onPress={canMark ? () => onCertify(!certified) : undefined}
        disabled={!canMark}
        accessibilityRole="button"
        accessibilityState={{ selected: !markReading && !!certified, disabled: !canMark, busy: markReading }}
        accessibilityLabel={
          // Why it cannot be pressed comes before how many have pressed it.
          !canMark ? `Certify this. ${whyNot(markReading)}${certifyCount > 0 ? `. ${counted(certifyCount, 'member has', 'members have')} certified this` : ''}`
            : certifyLabel(certifyCount, !!certified)
        }>
        <MarkFigure iconSize={15} count={certifyCount} reach="open" style={[p.actionLabel, !markReading && certified && p.actionLabelOn]}>
          <PaperStrike on={!markReading && certified}>
            <Heart size={15} strokeWidth={2}
              color={!markReading && certified ? colors.crimsonInk : colors.fog}
              fill={!markReading && certified ? colors.crimsonInk : 'transparent'}
              strokeDasharray={markReading ? UNINKED : undefined} />
          </PaperStrike>
        </MarkFigure>
        <Text style={[p.actionLabel, !markReading && certified && p.actionLabelOn]} {...actionLabelProps}>
          {!markReading && certified ? 'CERTIFIED' : 'CERTIFY'}
        </Text>
      </PressableScale>

      <PressableScale room style={[p.action, waiting && p.actionOff]} hitSlop={SLOP} haptic
        onPress={waiting ? undefined : onCritique}
        disabled={waiting}
        accessibilityRole="button"
        accessibilityState={{ disabled: waiting }}
        accessibilityLabel={waiting ? `Critique. ${why}` : critiqueLabel(commentCount)}>
        <MarkFigure iconSize={16} count={commentCount} reach="open" style={p.actionLabel}>
          <MessageSquare size={16} strokeWidth={2} color={colors.fog} />
        </MarkFigure>
        <Text style={p.actionLabel} {...actionLabelProps}>CRITIQUE</Text>
      </PressableScale>

      <PressableScale room style={[p.action, waiting && p.actionOff]} hitSlop={SLOP} haptic
        onPress={waiting ? undefined : onShare}
        disabled={waiting}
        accessibilityRole="button"
        accessibilityState={{ disabled: waiting }}
        accessibilityLabel={waiting ? `Share this filing. ${why}` : 'Share this filing'}>
        <Share2 size={15} strokeWidth={2} color={colors.fog} />
        <Text style={p.actionLabel} {...actionLabelProps}>SHARE</Text>
      </PressableScale>

      <PressableScale touch="commit" style={[p.action, !canKeep && !keepReading && p.actionOff]} hitSlop={SLOP} haptic pressedScale={0.92}
        onPress={canKeep ? () => onSave(!saved) : undefined}
        disabled={!canKeep}
        accessibilityRole="button"
        accessibilityState={{ selected: !keepReading && !!saved, disabled: !canKeep, busy: keepReading }}
        accessibilityLabel={!canKeep ? `Save this. ${whyNot(keepReading)}` : saved ? 'Saved' : 'Save this'}>
        <PaperStrike on={!keepReading && saved}>
          <Bookmark size={15} strokeWidth={2}
            color={!keepReading && saved ? colors.sepia : colors.fog}
            fill={!keepReading && saved ? colors.sepia : 'transparent'}
            strokeDasharray={keepReading ? UNINKED : undefined} />
        </PaperStrike>
        <Text style={[p.actionLabel, !keepReading && saved && p.actionLabelSaved]} {...actionLabelProps}>
          {!keepReading && saved ? 'SAVED' : 'SAVE'}
        </Text>
      </PressableScale>
    </View>
  );
});

/**
 * A struck BRASS plate — the film page's REWATCHED tab, not outlined text.
 * WITHHELD is the exception: being withheld is not an achievement, so it keeps
 * a crimson censor's outline rather than being handed a medal.
 *
 * NOT exported. It is used twice, both of them in this file, and the `export`
 * on it was surface nobody asked for — which the orphan guard could not see,
 * because `lucide-react-native` also exports a `Stamp` and the edit-profile
 * screen imports THAT one. Two same-named symbols, one of them vouching for the
 * other, is the same fault that kept a dead report sheet alive next door.
 */
const Stamp = memo(function Stamp({
  label, style, crimson,
}: { label: string; style?: object; crimson?: boolean }) {
  return (
    <View style={[p.stamp, crimson && p.stampCrimson, style]}>
      <View style={[p.stampPlate, crimson && p.stampPlateCrimson]}>
        {!crimson && (
          <>
            <LinearGradient colors={BRASS} locations={BRASS_STOPS}
              start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }}
              style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
            <LinearGradient colors={['rgba(240,232,176,0.42)', 'rgba(240,232,176,0.10)', 'transparent']}
              style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '52%' }} />
          </>
        )}
        <Text style={[p.stampText, crimson && p.stampTextCrimson]} {...decorativeTextProps}>
          {label}
        </Text>
      </View>
    </View>
  );
});

/**
 * ── A FILING ─────────────────────────────────────────────────────────────────
 * Margin, rule, column — the letters page. The margin carries whatever orders
 * the page and nothing else. The column carries the correspondent and their
 * words. The rule between them is the boundary, always present, its MATERIAL
 * set by tier so structure never depends on who paid.
 *
 * There is no kind label. A take is Spectral italic; a seeking opens
 * `SEEKING —`; a wire leads with its source; a dossier has a drop cap and a
 * display headline. The form is the label — printing both was a row spent
 * saying what the post already says.
 */
type PaperPostProps = {
  /** Whether this member's certify and save have been read (PaperActions). */
  certifyKnown?: boolean;
  saveKnown?: boolean;
  kind: PaperKind;
  author: PaperAuthor | null;
  body: string;
  headline?: string;
  source?: string;
  film?: PaperFilm | null;
  still?: boolean;
  /** The ordering value. A dash where there is none. */
  order: string;
  orderIs: PaperOrder;
  measureWidth: number;
  certifyCount?: number;
  commentCount?: number;
  certified?: boolean;
  saved?: boolean;
  answer?: { film: PaperFilm; body: string; author: PaperAuthor | null } | null;
  answered?: boolean;
  spoiler?: string | null;
  withheld?: boolean;
  /** WHO ended it, so the tombstone never blames the author for the house's act. */
  ended?: 'author' | 'house';
  edited?: boolean;
  series?: string;
  readTime?: string;
  /** A member's room: its head already says whose. */
  noByline?: boolean;
  /** Filed offline, not yet sent: says so under the words, and nothing can be done to it yet. */
  pending?: boolean;
  /** The reader docks its marks at the screen's foot (PostDock): the card draws no second row of them. */
  docked?: boolean;
  /** The whole card opens the filing; optional for the harness, required in the app by a test. */
  onOpen?: () => void;
  onCertify?: (next: boolean) => void;
  onCritique?: () => void;
  onShare?: () => void;
  onSave?: (next: boolean) => void;
  /** The film named in the credit line, which is its own destination. */
  onFilm?: () => void;
  /** The byline. A member's name leads to that member. */
  onAuthor?: () => void;
};

type PostWordsProps = Omit<PaperPostProps, 'ended' | 'docked' | 'certifyCount' | 'commentCount' | 'certified'
  | 'saved' | 'certifyKnown' | 'saveKnown' | 'onCertify' | 'onCritique' | 'onShare' | 'onSave'>;

/**
 * A filing's words: everything above its marks, in a memo of their own, so the member's marks
 * (read after the page) redraw the bar alone.
 */
const PostWords = memo(function PostWords({
  kind, author, body, source, film, still, order, orderIs, measureWidth,
  answer, answered, spoiler, withheld, edited, series, readTime, noByline, pending,
  onOpen, onFilm, onAuthor,
}: PostWordsProps) {
  const tier = author?.tier ?? 'free';

  // The member's words turn; the house's lead-in (`TAKE —`) stays left to right.
  const rtl = isRTLText(body);

  return (
    <>
      {/* No film art behind the writing: rendered, a faint wash reads as a
          stain on a printed page. The deliberate STILL is the one photograph. */}
      <View style={p.postRow}>
        <View style={p.margin}>
          <Text
            style={[p.marginValue, order === '—' && p.marginNil]}
            accessibilityLabel={SAY_ORDER[orderIs](order)}
            {...displayTextProps}
          >
            {order}
          </Text>
        </View>

        {/* Bracketed on two axes: its KIND in the lead-in and the closing rule,
            its author's RANK in this rule down the whole entry: ink for a
            cinephile, the brass ramp for an Archivist, crimson for an Auteur. */}
        <View style={[p.column, tier !== 'free' && p.columnRanked]}>
          {tier === 'archivist' ? (
            <LinearGradient
              colors={BRASS} locations={BRASS_STOPS}
              start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
              style={p.rankRule}
            />
          ) : tier === 'auteur' ? (
            <LinearGradient
              colors={[colors.crimson, CRIMSON_INK, colors.crimson]}
              locations={[0, 0.42, 1]}
              start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
              style={p.rankRule}
            />
          ) : null}

          {noByline && !withheld ? null : (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                {noByline ? null : (
                  <Byline
                    author={author}
                    onPress={onAuthor}
                    // Beside the name, as a dateline: a wire's source or an
                    // essay's read time, and EDITED. The counts are on the bar.
                    trailing={[
                      kind === 'wire' ? source?.toUpperCase()
                        : kind === 'dossier' ? readTime
                        : null,
                      edited ? 'EDITED' : null,
                    ].filter(Boolean).join(' · ') || undefined}
                  />
                )}
              </View>
              {withheld ? <Stamp label="WITHHELD" crimson /> : null}
            </View>
          )}

          {/* The writing is the door. Three SIBLING targets, never nested (an
              outer one swallows the inner): the writing opens the filing, the
              credit the film, the byline the member. Uncovering a spoiler and
              opening the filing are one act, one tap. */}
          <PressableScale
            style={p.writingDoor} onPress={onOpen} haptic="selection" pressedScale={0.995}
            // No sideways reach under the rank rule and the margin.
            hitSlop={{ top: 2, bottom: 2, left: 0, right: 0 }}
            accessibilityRole="button"
            // Named by its writing, as it reads: "Open this filing" alone, twenty times down a
            // page, read a screen-reader member no word of any of them.
            accessibilityLabel={spoiler ? `${spoiler}. Uncover it.`
              : `${nameOf(kind)}: ${body}. Open this filing.`}
          >
          {spoiler ? (
            <View style={p.veil}>
              <Text style={p.veilText} {...scaledTextProps}>{spoiler.toUpperCase()}</Text>
              {/* The act, not the gesture: not everyone taps. */}
              <Text style={p.veilAction} {...scaledTextProps}>UNCOVER IT</Text>
            </View>
          ) : (
            <>
              {still ? (
                <View style={[p.still, { height: stillHeight(measureWidth) }]}>
                  <RemoteImage uri={film?.backdropPath} style={p.stillArt} contentFit="cover" recyclingKey={film?.backdropPath} transition={0} fallback={null} />
                  {/* One scrim, darkening toward the words below. */}
                  <LinearGradient
                    colors={['rgba(30,25,20,0.48)', 'rgba(13,11,9,0.70)', 'rgba(13,11,9,0.93)']}
                    locations={[0, 0.5, 1]} style={p.stillScrim}
                  />
                </View>
              ) : null}

              {/* Every kind opens with its name and a dash, in its colour. */}
              {kind === 'take' && (
                <Text style={[p.take, rtl && p.rtlText]} {...scaledTextProps}>
                  {rtl ? RTL_MARK : null}<Text style={[p.leadIn, LEAD_STYLE.take]}>TAKE — </Text>{softBreak(body)}
                </Text>
              )}

              {kind === 'seeking' && (
                <Text style={[p.seeking, rtl && p.rtlText]} {...scaledTextProps}>
                  {rtl ? RTL_MARK : null}<Text style={p.seekingLead}>SEEKING — </Text>{softBreak(body)}
                </Text>
              )}

              {kind === 'wire' && (
                <Text style={[p.wire, rtl && p.rtlText]} {...scaledTextProps}>
                  {rtl ? RTL_MARK : null}<Text style={p.wireDateline}>WIRE — </Text>{softBreak(body)}
                </Text>
              )}

              {/* The question only (filed into `body` too); the card opens the vote. */}
              {kind === 'ballot' && (
                <Text style={[p.cardBallotQ, rtl && p.rtlText]} numberOfLines={3} {...displayTextProps}>
                  {rtl ? RTL_MARK : null}<Text style={p.ballotLead}>BALLOT — </Text>{softBreak(body)}
                </Text>
              )}

              {kind === 'dossier' && (
                <>
                  <Text style={[p.dossierTitle, rtl && p.rtlText]} numberOfLines={3} {...displayTextProps}>
                    {rtl ? RTL_MARK : null}<Text style={p.dossierLead}>{KIND_NAME.dossier} — </Text>{softBreak(body)}
                  </Text>
                  {series ? (
                    <Text style={p.series} numberOfLines={1} {...scaledTextProps}>{series.toUpperCase()}</Text>
                  ) : null}
                </>
              )}
            </>
          )}
          </PressableScale>

          {film ? <Credit film={film} onPress={onFilm} /> : null}

          {answer ? (
            <View style={p.answer}>
              <View style={p.answerTop}>
                <View style={p.creditArt}>
                  <RemoteImage uri={answer.film.posterPath} style={p.plateArt} contentFit="cover" recyclingKey={answer.film.posterPath} transition={0} fallback={<PosterMark style={p.plateArt} size={9} ground={false} />} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={p.creditText} numberOfLines={1} {...scaledTextProps}>
                    {[answer.film.title, answer.film.year].filter(Boolean).join(' · ').toUpperCase()}
                  </Text>
                  <Text style={[p.answerBody, isRTLText(answer.body) && p.rtlText]} {...scaledTextProps}>{softBreak(answer.body)}</Text>
                </View>
              </View>
              {/* Signed under the whole answer, as a letter is. The stamp ends the byline's
                  line where there is room and takes its own where there is not: laid over
                  the corner, on a narrow phone it covered the answerer's rank. */}
              <View style={p.answerFoot}>
                <View style={p.answerBy}><Byline author={answer.author} /></View>
                {answered ? <Stamp label="ANSWERED" style={p.answerStamp} /> : null}
              </View>
            </View>
          ) : null}

          {withheld ? (
            <Text style={[p.removedText, { textAlign: 'left', marginTop: 12 }]} {...scaledTextProps}>
              {WITHHELD_LINE}
            </Text>
          ) : null}

          {/* Two lines: at the 10pt floor it does not fit one, and must be read whole. */}
          {pending ? (
            <Text style={p.wireSource} numberOfLines={2} {...scaledTextProps}>
              {NOT_SENT_LINE}
            </Text>
          ) : null}
        </View>
      </View>
    </>
  );
});

export const PaperPost = memo(function PaperPost({
  kind, ended, withheld, pending, docked,
  certifyCount, commentCount, certified, saved, certifyKnown, saveKnown,
  onCertify, onCritique, onShare, onSave,
  ...words
}: PaperPostProps) {
  // A withdrawn filing keeps its room: the words go, the critiques stay.
  if (ended) {
    return (
      <View style={p.post}>
        <View style={p.postRow}>
          <View style={p.margin}>
            <Text style={[p.marginValue, p.marginNil]} {...UNSPOKEN} {...decorativeTextProps}>—</Text>
          </View>
          <View style={p.column}>
            <Text style={p.removedText} {...scaledTextProps}>
              {ended === 'author'
                ? 'This filing was withdrawn by its author.'
                : 'This filing was removed by the house.'}
            </Text>
          </View>
        </View>

        {/* One act on words that are gone: the critiques, which survive, with
            their count beside the icon as on every bar. */}
        <View style={p.actions}>
          <PressableScale room style={p.action} hitSlop={SLOP} haptic
            onPress={onCritique}
            accessibilityRole="button"
            accessibilityLabel={
              (commentCount ?? 0) > 0
                ? `Critique. ${counted(commentCount ?? 0, 'critique remains', 'critiques remain')} under this filing`
                : 'Critique'
            }>
            <MarkFigure iconSize={16} count={commentCount} style={p.actionLabel}>
              <MessageSquare size={16} strokeWidth={2} color={colors.fog} />
            </MarkFigure>
            <Text style={p.actionLabel} {...actionLabelProps}>CRITIQUE</Text>
          </PressableScale>
        </View>
      </View>
    );
  }

  return (
    <View style={p.post}>
      <PostWords kind={kind} withheld={withheld} pending={pending} {...words} />

      {/* A spoilered post keeps its marks; in the reader they stand in its dock, once. */}
      {!withheld && !docked && (
        <PaperActions
          certifyCount={certifyCount} commentCount={commentCount}
          certified={certified} saved={saved} dimmed={pending}
          certifyKnown={certifyKnown} saveKnown={saveKnown}
          onCertify={onCertify} onCritique={onCritique}
          onShare={onShare} onSave={onSave}
        />
      )}

      {/* Closed UNDER its marks, in its kind's ink, so they plainly belong to it. */}
      <View style={[p.entryEnd, { backgroundColor: KIND_RULE[kind] }]} />
    </View>
  );
});
