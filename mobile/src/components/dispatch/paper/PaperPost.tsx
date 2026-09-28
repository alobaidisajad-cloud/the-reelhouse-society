import { memo } from 'react';
import { View } from 'react-native';
import { Text } from '@/src/components/text';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Heart, MessageSquare, Share2, Bookmark } from 'lucide-react-native';

import PressableScale from '@/src/components/PressableScale';
import { colors } from '@/src/theme/theme';
import { BRASS, BRASS_STOPS } from '@/src/theme/brass';
import {
  scaledTextProps, decorativeTextProps, displayTextProps,
} from '@/src/constants/textScaling';
import { p } from './paperStyles';
import { stillHeight, KIND_RULE, KIND_NAME, actionLabelProps, CRIMSON_INK, UNSPOKEN } from './paperMetrics';
import { MarkFigure, certifyLabel, critiqueLabel } from '@/src/components/MarkFigure';
import { RankBadge, rankOf, rankWord } from '@/src/components/RankBadge';
import { LEAD_STYLE } from './paperPerf';
import { PaperStrike } from './PaperStrike';
import { softBreak, counted } from './paperText';
import { isRTLText, RTL_MARK } from '@/src/utils/text';

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

/**
 * The mark on a member's disc when they have no picture: their initial, a
 * monogram like an essay's raised initial (their house NUMBER belongs to their
 * room and file, not to every post). Empty with no name, as a departed disc is.
 */
export function initialOf(name: string | null | undefined): string {
  const first = (name ?? '').trim().slice(0, 1);
  return first ? first.toUpperCase() : '';
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
export const Byline = memo(function Byline({
  author, trailing, onPress,
}: { author: PaperAuthor | null; trailing?: string; onPress?: () => void }) {
  const departed = !author;
  // The rank the badge draws. `rankOf` goes through resolveTier, so a founding
  // member reads as an Auteur here exactly as they do everywhere else.
  const rank = departed ? null : rankOf(author.tier);
  const word = rankWord(rank);
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
      accessibilityLabel: `${author.name}${word ? `, ${word}` : ''}. Open their room.`,
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
        {!departed && author.avatar ? (
          <Image source={{ uri: author.avatar }} style={p.plateArt} contentFit="cover"
            recyclingKey={author.avatar} transition={0} cachePolicy="memory-disk" />
        ) : !departed ? (
          // UNSPOKEN: the name is beside it, and "T. TOMASREYES" is a stutter.
          <Text style={p.avatarMark} {...UNSPOKEN} {...decorativeTextProps}>
            {initialOf(author.name)}
          </Text>
        ) : null}
      </View>
      {/* The name truncates; the rank and the trailing facts sit in their own
          boxes. Measured: a 14-letter name with its facts needs 292pt of 256. */}
      <Text
        style={[p.bylineName, rank === 'auteur' && p.bylineNameAuteur]}
        numberOfLines={1}
        {...scaledTextProps}
      >
        {departed ? 'A MEMBER, DEPARTED' : author.name.toUpperCase()}
      </Text>
      {/* The app's own badge, which never truncates (`★ AUT` is wrong);
          `silent` inside a control whose label already says the rank. */}
      <RankBadge rank={rank} silent={pressable} />
      {trailing ? (
        <Text style={p.bylineTrail} numberOfLines={1} {...scaledTextProps}>
          {`· ${trailing}`}
        </Text>
      ) : null}
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
  film, bare, onPress,
}: { film: PaperFilm; bare?: boolean; onPress?: () => void }) {
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
  onCertify, onCritique, onShare, onSave,
}: {
  certifyCount?: number; commentCount?: number;
  certified?: boolean; saved?: boolean; dimmed?: boolean;
  onCertify?: (next: boolean) => void;
  onCritique?: () => void;
  onShare?: () => void;
  onSave?: (next: boolean) => void;
}) {
  // No handler (signed out): dimmed, disabled and said so, never a silent tap.
  const canMark = !!onCertify;
  const canKeep = !!onSave;

  return (
    <View style={p.actions}>
      <PressableScale style={[p.action, !canMark && p.actionOff]} hitSlop={SLOP} haptic pressedScale={0.92}
        onPress={canMark ? () => onCertify(!certified) : undefined}
        disabled={!canMark}
        accessibilityRole="button"
        accessibilityState={{ selected: !!certified, disabled: !canMark }}
        accessibilityLabel={
          // Why it cannot be pressed comes before how many have pressed it.
          !canMark ? `Certify this. Members only${certifyCount > 0 ? `. ${counted(certifyCount, 'member has', 'members have')} certified this` : ''}`
            : certifyLabel(certifyCount, !!certified)
        }>
        <MarkFigure iconSize={15} count={certifyCount} reach="open" style={[p.actionLabel, certified && p.actionLabelOn]}>
          <PaperStrike on={certified}>
            <Heart size={15} strokeWidth={2}
              color={certified ? colors.crimson : colors.fog}
              fill={certified ? colors.crimson : 'transparent'} />
          </PaperStrike>
        </MarkFigure>
        <Text style={[p.actionLabel, certified && p.actionLabelOn]} {...actionLabelProps}>
          {certified ? 'CERTIFIED' : 'CERTIFY'}
        </Text>
      </PressableScale>

      <PressableScale style={p.action} hitSlop={SLOP} haptic
        onPress={onCritique}
        accessibilityRole="button" accessibilityLabel={critiqueLabel(commentCount)}>
        <MarkFigure iconSize={16} count={commentCount} reach="open" style={p.actionLabel}>
          <MessageSquare size={16} strokeWidth={2} color={colors.fog} />
        </MarkFigure>
        <Text style={p.actionLabel} {...actionLabelProps}>CRITIQUE</Text>
      </PressableScale>

      <PressableScale style={p.action} hitSlop={SLOP} haptic
        onPress={onShare}
        accessibilityRole="button" accessibilityLabel="Share this filing">
        <Share2 size={15} strokeWidth={2} color={colors.fog} />
        <Text style={p.actionLabel} {...actionLabelProps}>SHARE</Text>
      </PressableScale>

      <PressableScale style={[p.action, !canKeep && p.actionOff]} hitSlop={SLOP} haptic pressedScale={0.92}
        onPress={canKeep ? () => onSave(!saved) : undefined}
        disabled={!canKeep}
        accessibilityRole="button"
        accessibilityState={{ selected: !!saved, disabled: !canKeep }}
        accessibilityLabel={!canKeep ? 'Save this. Members only' : saved ? 'Saved' : 'Save this'}>
        <PaperStrike on={saved}>
          <Bookmark size={15} strokeWidth={2}
            color={saved ? colors.sepia : colors.fog}
            fill={saved ? colors.sepia : 'transparent'} />
        </PaperStrike>
        <Text style={[p.actionLabel, saved && p.actionLabelSaved]} {...actionLabelProps}>
          {saved ? 'SAVED' : 'SAVE'}
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
export const PaperPost = memo(function PaperPost({
  kind, author, body, headline, source, film, still, order, orderIs, measureWidth,
  certifyCount, commentCount, certified, saved,
  answer, answered, spoiler, withheld, ended, edited, series, readTime, noByline, pending,
  onOpen, onCertify, onCritique, onShare, onSave, onFilm, onAuthor,
}: {
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
  /** Filed offline, not yet sent: says so under the words. Drawn; no screen passes it yet. */
  pending?: boolean;
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
}) {
  const tier = author?.tier ?? 'free';

  // The member's words turn; the house's lead-in (`TAKE —`) stays left to right.
  const rtl = isRTLText(body);

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
          <PressableScale style={p.action} hitSlop={SLOP} haptic
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
            onPress={onOpen} haptic="selection" pressedScale={0.995}
            // No sideways reach under the rank rule and the margin.
            hitSlop={{ top: 2, bottom: 2, left: 0, right: 0 }}
            accessibilityRole="button"
            accessibilityLabel={spoiler ? `Uncover: ${spoiler}` : 'Open this filing'}
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
                  {film?.backdropPath ? (
                    <Image
                      source={{ uri: film.backdropPath }} style={p.stillArt} contentFit="cover"
                      recyclingKey={film.backdropPath} transition={0} cachePolicy="memory-disk"
                    />
                  ) : null}
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

          {film && !spoiler ? <Credit film={film} bare={!!still} onPress={onFilm} /> : null}
          {spoiler && film ? <Credit film={film} onPress={onFilm} /> : null}

          {answer ? (
            <View style={p.answer}>
              <View style={p.creditArt}>
                {answer.film.posterPath ? (
                  <Image source={{ uri: answer.film.posterPath }} style={p.plateArt} contentFit="cover"
                    recyclingKey={answer.film.posterPath} transition={0} cachePolicy="memory-disk" />
                ) : null}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={p.creditText} numberOfLines={1} {...scaledTextProps}>
                  {[answer.film.title, answer.film.year].filter(Boolean).join(' · ').toUpperCase()}
                </Text>
                <Text style={[p.answerBody, isRTLText(answer.body) && p.rtlText]} {...scaledTextProps}>{softBreak(answer.body)}</Text>
                <Byline author={answer.author} />
              </View>
              {answered ? <Stamp label="ANSWERED" style={{ position: 'absolute', right: 0, bottom: 0 }} /> : null}
            </View>
          ) : null}

          {withheld ? (
            <Text style={[p.removedText, { textAlign: 'left', marginTop: 12 }]} {...scaledTextProps}>
              Only you can see this while the house reads it.
            </Text>
          ) : null}

          {/* Two lines: at the 10pt floor it does not fit one, and must be read whole. */}
          {pending ? (
            <Text style={p.wireSource} numberOfLines={2} {...scaledTextProps}>
              NOT SENT YET · THE HOUSE HAS NOT SEEN THIS
            </Text>
          ) : null}
        </View>
      </View>

      {/* A spoilered post keeps its marks. */}
      {!withheld && (
        <PaperActions
          certifyCount={certifyCount} commentCount={commentCount}
          certified={certified} saved={saved} dimmed={pending}
          onCertify={onCertify} onCritique={onCritique}
          onShare={onShare} onSave={onSave}
        />
      )}

      {/* Closed UNDER its marks, in its kind's ink, so they plainly belong to it. */}
      <View style={[p.entryEnd, { backgroundColor: KIND_RULE[kind] }]} />
    </View>
  );
});
