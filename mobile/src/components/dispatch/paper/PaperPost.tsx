import { memo } from 'react';
import { View, Text } from 'react-native';
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
import { formatCount, stillHeight, KIND_RULE, actionLabelProps, CRIMSON_INK, UNSPOKEN } from './paperMetrics';
import { LEAD_STYLE } from './paperPerf';
import { PaperStrike } from './PaperStrike';
import { softBreak, counted } from './paperText';
import { isRTLText } from '@/src/utils/text';

export type PaperKind = 'take' | 'seeking' | 'wire' | 'ballot' | 'dossier';
export type PaperTier = 'free' | 'archivist' | 'auteur';

export interface PaperAuthor {
  name: string;
  memberNo: number;
  tier: PaperTier;
  avatar?: string | null;
}

/**
 * ── THE MARK ON A MEMBER'S DISC ─────────────────────────────────────────────
 * A member's HOUSE NUMBER is a fact about their membership, not about the thing
 * they just wrote — so it is printed where membership is: their room, their
 * file card, and the card a filing travels as. It used to be printed twice on
 * every post, in the byline and again inside the disc, which made a serial
 * number the loudest thing about a stranger's opinion of a film.
 *
 * What stands in for a face is their initial. The house already has a mark for
 * a letter standing in for something — the raised initial that opens a dossier —
 * so this is that gesture at nineteen points rather than a generic app avatar.
 * Set in the DISPLAY face for the same reason: a letter in Rye is a monogram, a
 * number in the typewriter face was a serial.
 *
 * Empty when there is no name to take a letter from, which is what a departed
 * member's disc already shows.
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
 * ── THE BYLINE ───────────────────────────────────────────────────────────────
 * Heads the column, the way a correspondent's name heads a letter. It is HERE
 * and not in the margin because a 30-character username wrapped to three lines
 * in a 44pt margin — making the apparatus taller than a one-line post, which is
 * the exact disease this layout exists to cure.
 *
 * No username is stored on a post; this renders what the join returned, and
 * when the join returns nothing there is one fallback for the whole app.
 */
export const Byline = memo(function Byline({
  author, trailing, onPress,
}: { author: PaperAuthor | null; trailing?: string; onPress?: () => void }) {
  const departed = !author;
  // A departed member has no page to open, so the name is not a control. The
  // words stay and the destination goes, which is what the erasure means.
  const Row: React.ComponentType<any> = onPress && !departed ? PressableScale : View;
  const rowProps = onPress && !departed
    ? {
      onPress, haptic: 'selection' as const,
      hitSlop: { top: 4, bottom: 4, left: 0, right: 0 },
      accessibilityRole: 'link' as const,
      accessibilityLabel: `${author.name}. Open their room.`,
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
        {/* `recyclingKey` on the avatar because this byline sits in EVERY row of
            a recycling list. Without it FlashList hands the reused <Image> the
            next member's uri while the previous member's bitmap is still
            mounted, and the row shows the wrong face for a frame — the most
            visible artefact a recycling list produces, on the one element that
            says who wrote the thing. */}
        {!departed && author.avatar ? (
          <Image source={{ uri: author.avatar }} style={p.plateArt} contentFit="cover"
            recyclingKey={author.avatar} transition={0} cachePolicy="memory-disk" />
        ) : !departed ? (
          // UNSPOKEN. The mark stands in for a face a member has not set, and
          // the name is printed directly beside it — read aloud, a disc that
          // said its own letter would open every row with "T. TOMASREYES".
          <Text style={p.avatarMark} {...UNSPOKEN} {...decorativeTextProps}>
            {initialOf(author.name)}
          </Text>
        ) : null}
      </View>
      {/* ── THE TRAILING FACTS ARE NOT PART OF THE NAME ────────────────────
          They used to be concatenated into this line, and this line truncates.
          Measured: a fourteen-character name with `· No. 10248 · 12 MIN ·
          EDITED` comes to 292pt in a 256pt column AT NORMAL TEXT SIZE — so the
          dossier's read time was the first thing to disappear, and it
          disappeared for anyone whose name was slightly long.

          The name truncates. The facts do not. Each gets its own box, and only
          the one that can be re-read elsewhere is allowed to give way. */}
      <Text
        style={[p.bylineName, author?.tier === 'auteur' && { color: CRIMSON_INK, opacity: 1 }]}
        numberOfLines={1}
        {...scaledTextProps}
      >
        {departed ? 'A MEMBER, DEPARTED' : author.name.toUpperCase()}
      </Text>
      {trailing ? (
        <Text style={p.bylineTrail} numberOfLines={1} {...scaledTextProps}>
          {`· ${trailing}`}
        </Text>
      ) : null}
    </Row>
  );
});

/**
 * A film, named. Type only.
 *
 * ── THREE THINGS THE RENDER SETTLED ──────────────────────────────────────────
 * NO DIRECTOR. `IN THE MOOD FOR LOVE · 2000 · WONG KAR-…` truncated in a 259pt
 * column and would truncate constantly. Title and year identify a film; the
 * director is one tap away on the film page.
 *
 * NO POSTER. This carried an 18x27 thumbnail, and the comment sitting directly
 * above it said an 18x27 poster "is not an image, it is a speck: it neither
 * carries the film's identity nor gets out of the way". The comment was right
 * and the code drew one anyway. Rendered side by side, the type-only credit is
 * cleaner, denser and more certain of itself — and the feed's photography is
 * now the avatar and the deliberate still, both of which are big enough to be
 * looked at.
 *
 * THE YEAR NEVER TRUNCATES. Title and year were one string in one truncating
 * Text: measured, `THE LORD OF THE RINGS: THE RETURN OF THE KING · 2003` runs
 * 331pt in a 256pt column at normal size, so the YEAR was cut — the one part
 * that separates a remake from the film it remade. Two boxes now: the title
 * yields, the year is fixed.
 */
/**
 * The film a filing is about, named.
 *
 * It is a destination when there is somewhere to go — a filing carries the
 * film's id, so the credit opens the film's page — and plain text when there is
 * not. Rendering a control that leads nowhere would be a dead end wearing the
 * costume of a link, which is worse than a label.
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
      // No horizontal slop. The credit sits directly above the stamp bar, and
      // PressableScale's 15pt default would reach into CERTIFY — where the
      // later sibling wins the touch and a member certifies by aiming at a film.
      hitSlop={{ top: 4, bottom: 0, left: 0, right: 0 }}
      accessibilityRole="link"
      accessibilityLabel={`${film.title}${film.year ? `, ${film.year}` : ''}. Open the film.`}
    >
      {words}
    </PressableScale>
  );
});

/**
 * ── THE STAMP BAR ────────────────────────────────────────────────────────────
 * I described the old version of this as "the app's four marks, unchanged" and
 * then defended it on consistency grounds. It was not the app's deck. I had
 * built a different control and argued for it with the other one's authority.
 *
 * The shipped `ActionDeck` is:
 *   · the icon ABOVE its label, not beside it
 *   · four EQUAL TILES on ink, divided by hairlines over an inkwell ground —
 *     its own comment calls it "a flush stamp bar, a seam across the full card
 *     width, not a floating box"
 *   · 8pt at two points of tracking, twelve points of padding
 *   · no counts at all
 *
 * And it is better than what I made. A ruled band of four stamps IS the 1924
 * thing I kept saying this row was missing; my floating row of icon-beside-word
 * was the app-toolbar shape I was complaining about. So the anatomy is the
 * app's, exactly, and the marks run flush to the document's rails — the entry's
 * foot is a ruled band, which is also what lets the separating hairline between
 * entries go.
 *
 * TWO DELIBERATE DIVERGENCES, both stated rather than smuggled:
 *
 *   1. THE COUNTS LEAVE. Four equal quarters cannot hold `CERTIFIED 2.1K` —
 *      measured, it needs 95pt of a 91pt tile before scaling. The app has no
 *      counts here for the same reason. The one count a discussion page truly
 *      needs at a glance is how much conversation a filing drew, and that moves
 *      to the byline's trailing slot, which already exists for facts that must
 *      not truncate. The certify count is what orders the page under CERTIFIED,
 *      so it is already in the margin.
 *
 *   2. THE FOURTH MARK IS SHARE, NOT LOUNGE. The app's fourth action shares to
 *      a salon. The Dispatch's share sheet does that AND sends the card out of
 *      the app entirely, so SHARE is a superset of LOUNGE rather than a
 *      different idea — the Lounge is its first row.
 */
const SLOP = { top: 7, bottom: 0, left: 0, right: 0 };

/**
 * The four marks under a filing.
 *
 * Every handler is optional so this still draws in the render harness with
 * nothing behind it — but a control with no handler is a dead end in the app,
 * so `dispatchNoDeadControls.test.ts` requires each of the four to be passed one
 * everywhere this is mounted for real.
 *
 * CERTIFY and SAVE take the state they are moving TO rather than toggling, for
 * the same reason the mutations do: a toggle replayed from an offline queue
 * lands on whichever side of the coin the delay leaves it.
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
  /**
   * ── A HANDLER THAT IS ABSENT IS NOT A CONTROL ──────────────────────────────
   * The feed passes `onCertify={me ? … : undefined}`, because certifying needs
   * an account. The press here was `() => onCertify?.(!certified)`, which turns
   * a missing handler into a tap that silently does nothing — and reads as
   * enabled to a sighted member and to a screen reader alike.
   *
   * It also passed the dead-control audit: that guard requires an `onPress` to
   * EXIST, and this one existed. The optional call inside it is what made the
   * control dead, and no scan of the tag would ever see that.
   *
   * The reader screen already gets this right — it offers a signed-out reader
   * nothing rather than something that bounces. The card now agrees: the mark
   * is dimmed, announced as unavailable, and cannot be pressed. CRITIQUE and
   * SHARE stay live for everyone, because both simply open the filing, and the
   * filing is public to read.
   */
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
          !canMark ? 'Certify this. Members only'
            : certified
              ? `Certified. ${counted(certifyCount ?? 0, 'member has', 'members have')} certified this`
              : 'Certify this'
        }>
        <PaperStrike on={certified}>
          <Heart size={15} strokeWidth={2}
            color={certified ? colors.crimson : colors.fog}
            fill={certified ? colors.crimson : 'transparent'} />
        </PaperStrike>
        <Text style={[p.actionLabel, certified && p.actionLabelOn]} {...actionLabelProps}>
          {certified ? 'CERTIFIED' : 'CERTIFY'}
        </Text>
      </PressableScale>

      <PressableScale style={p.action} hitSlop={SLOP} haptic
        onPress={onCritique}
        accessibilityRole="button" accessibilityLabel={`Critique. ${counted(commentCount ?? 0, 'critique', 'critiques')}`}>
        <MessageSquare size={16} strokeWidth={2} color={colors.fog} />
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
 */
export const Stamp = memo(function Stamp({
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
  kind, author, body, headline, source, film, still, order, measureWidth,
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
  measureWidth: number;
  certifyCount?: number;
  commentCount?: number;
  certified?: boolean;
  saved?: boolean;
  answer?: { film: PaperFilm; body: string; author: PaperAuthor | null } | null;
  answered?: boolean;
  spoiler?: string | null;
  withheld?: boolean;
  /**
   * WHO ended it, not merely THAT it ended — because the tombstone has to name
   * the right party. A boolean could only ever tell one of the two stories, and
   * the one it told blamed the author for the house's decisions.
   */
  ended?: 'author' | 'house';
  edited?: boolean;
  series?: string;
  readTime?: string;
  /** A member's own room prints no byline. The head already says whose room it
   *  is; repeating `ANA · No. 17` down twenty consecutive entries is the same
   *  name twenty times to say something the page said once. */
  noByline?: boolean;
  /**
   * Filed with no signal. The app queues it and sends it later, and until then
   * the honest thing is to show it in place, readable, saying plainly that the
   * house has not seen it — with its marks dimmed, because certifying a post
   * nobody else can read yet is an act with nothing on the other end.
   *
   * A post that vanishes until the network returns is the worst thing a page
   * that takes writing can do; so is one that pretends it went.
   */
  pending?: boolean;
  /**
   * What the entry does when it is touched.
   *
   * `onOpen` is the whole card — the filing, its critiques, its ballot. The four
   * marks get their own so a member can certify without leaving the page, which
   * is the point of having them on the card at all.
   *
   * All optional, because the render harness mounts this with nothing behind it.
   * In the app they are required, and a test enforces that rather than trusting
   * whoever adds the next mount to remember.
   */
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

  /**
   * Derived once, not per branch: all four kinds set the same `body`, and four
   * calls to the same function on the same string is four chances for one of
   * them to be forgotten when a fifth kind arrives.
   *
   * Note what is NOT flipped. The lead-in — `TAKE —`, `WIRE —` — is the HOUSE
   * speaking, and the house speaks left to right; it stays put and the member's
   * sentence sets itself around it. Only the writing turns.
   */
  const rtl = isRTLText(body);

  /**
   * A withdrawn filing keeps its room: the words go, the critiques stay, and the
   * margin prints a dash because there is no author and no hour left to show.
   *
   * ── TWO EVENTS, TWO SENTENCES ──────────────────────────────────────────────
   * This said "This POST was REMOVED by its author" and had no second sentence
   * at all — so a filing the HOUSE struck showed a tombstone blaming the member
   * for something the house did. On the page a member reads to find out what
   * happened to their own writing.
   *
   * A copy audit found it by asking a question none of the pixel audits can:
   * the house says FILING nine times and POST once, and the lounge card — same
   * event, different component — was already saying it correctly with both
   * sentences. Two components describing one event in two vocabularies is how
   * a voice stops being a voice.
   */
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

        {/* ── ONE ACT, AND THE COUNT VISIBLE ────────────────────────────────
            This drew the whole row — CERTIFY, CRITIQUE, SHARE, SAVE — on a
            filing whose words are gone. Three of those four are meaningless
            here: you cannot certify writing that no longer exists, share an
            empty page, or keep one.

            Worse, the count. `PaperActions` carries counts only in its
            accessibility labels; the visible number lives in the byline's
            trailing slot — and a tombstone HAS no byline, so the critique
            count was invisible. The whole reason this row survives is that the
            conversation underneath it survives, and the page was making that
            claim while showing no evidence of it.

            So: one control, and it says how many. */}
        <View style={p.actions}>
          <PressableScale style={p.action} hitSlop={SLOP} haptic
            onPress={onCritique}
            accessibilityRole="button"
            accessibilityLabel={
              `Critique. ${counted(commentCount ?? 0, 'critique remains', 'critiques remain')} under this filing`
            }>
            <MessageSquare size={16} strokeWidth={2} color={colors.fog} />
            <Text style={p.actionLabel} {...actionLabelProps}>
              {formatCount(commentCount ?? 0)
                ? counted(commentCount ?? 0, 'CRITIQUE', 'CRITIQUES', formatCount)
                : 'CRITIQUE'}
            </Text>
          </PressableScale>
        </View>
      </View>
    );
  }

  return (
    <View style={p.post}>
      {/* ── NO WASH BEHIND THE WRITING ─────────────────────────────────────
          Every post that carried film art printed that art full-bleed behind
          its own text at 0.13 opacity, under a warm gradient. The intention was
          atmosphere. Rendered and looked at, it is a STAIN: a brown smear
          behind two entries out of four, absent from the others, so the page
          carried tonal blotches that mean nothing — on a design whose entire
          premise is a clean printed page.

          It also cost the page its evenness. With the wash gone the four
          entries have equal weight and the eye runs down the hour column
          instead of catching on patches; and the deliberate STILL is now the
          only photograph in the feed, which is what makes the lead entry read
          as a lead.

          A film's identity was never carried by the smear. It is carried by the
          credit, which names it. */}

      <View style={p.postRow}>
        <View style={p.margin}>
          <Text
            style={[p.marginValue, order === '—' && p.marginNil]}

            /* A reader walks the tree and reaches this BEFORE the filing. Bare, it

               announces "21:40" on LATEST and "2.1K" on CERTIFIED — a number with

               nothing attached to say what it counts. The label names the fact; the

               column keeps printing the value alone, which is what a ledger does. */

            accessibilityLabel={
              order === '—' ? 'Not certified'
                : order.includes(':') ? `Filed at ${order}`
                : `${order} certified`
            }
            {...displayTextProps}
          >
            {order}
          </Text>
        </View>

        {/* ── THE ENTRY IS BRACKETED ON TWO AXES ─────────────────────────────
            Horizontally by its KIND: the lead-in names it above, the closing
            rule repeats it below. Vertically by its RANK: this rule, running
            the whole height of the filing.

            A cinephile's rule is ink. An Archivist's is the house's brass ramp.
            An Auteur's is crimson. Rank was a 19pt ring you had to look for;
            it is now the full edge of the entry, and the superior ranks read
            from across the room without a word being added to the page. */}
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
                {/* Read time and EDITED belong in the byline, not orphaned on
                    their own line under the credit where they read as debris. */}
                {noByline ? null : (
                  <Byline
                    author={author}
                    onPress={onAuthor}
                    /**
                     * ── ONE SLOT, AND THE KIND CHOOSES WHAT GOES IN IT ─────
                     * The stamp bar cannot carry counts — four equal quarters
                     * have no room for `CERTIFIED 2.1K`. So the byline's
                     * trailing slot, which already exists for facts that must
                     * not truncate, carries the ONE fact that kind is defined
                     * by:
                     *
                     *   a wire     its source. The house rule says a wire
                     *              carries its source; it belonged with the
                     *              correspondent all along, which is where a
                     *              dateline goes — not orphaned on its own line
                     *              beneath the credit, where it read as debris.
                     *   a dossier  how long it takes to read.
                     *   the rest   how much conversation it drew, which is the
                     *              only count a reader needs at a glance. The
                     *              certify count already orders the page under
                     *              CERTIFIED, so it is already in the margin.
                     *
                     * One fact, one home, chosen by kind — and it fills the
                     * dead half of a line that was carrying a name and nothing
                     * else.
                     */
                    trailing={[
                      kind === 'wire' ? source?.toUpperCase()
                        : kind === 'dossier' ? readTime
                        : commentCount ? counted(commentCount, 'CRITIQUE', 'CRITIQUES', formatCount) : null,
                      edited ? 'EDITED' : null,
                    ].filter(Boolean).join(' · ') || undefined}
                  />
                )}
              </View>
              {withheld ? <Stamp label="WITHHELD" crimson /> : null}
            </View>
          )}

          {/* ── THE WRITING IS THE DOOR ──────────────────────────────────────
              The entry opens by touching what it says, not by a control added
              beside it. Three SIBLING targets, never nested: the writing opens
              the filing, the credit opens the film, the byline opens the member.
              Nesting them would make the outer one swallow the inner on some
              platforms, and this app has already been bitten by two touch
              targets that overlap and let the later sibling win.

              A veiled post's target is the same one — UNCOVER IT and READ IT are
              the same act, so a spoiler is one tap to open and not two. */}
          <PressableScale
            onPress={onOpen} haptic="selection" pressedScale={0.995}
            // Zero horizontal slop: the entry already spans the column, and the
            // 15pt default would reach under the rank rule and the margin.
            hitSlop={{ top: 2, bottom: 2, left: 0, right: 0 }}
            accessibilityRole="button"
            accessibilityLabel={spoiler ? `Uncover: ${spoiler}` : 'Open this filing'}
          >
          {spoiler ? (
            <View style={p.veil}>
              <Text style={p.veilText} {...scaledTextProps}>{spoiler.toUpperCase()}</Text>
              {/* UNCOVER IT, not TAP TO READ. "Tap" is the language of a
                  tutorial, it names the gesture rather than the act, and it is
                  wrong for anyone not using a finger — a screen reader, a
                  keyboard. Every other act in this house is a verb and its
                  object: FILE IT, STRIKE IT, LET IT STAND, TAKE THIS ONE. */}
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
                  {/* The wash folded into the ramp — one layer, as above. */}
                  <LinearGradient
                    colors={['rgba(26,17,7,0.48)', 'rgba(16,11,5,0.70)', 'rgba(10,9,6,0.93)']}
                    locations={[0, 0.5, 1]} style={p.stillScrim}
                  />
                </View>
              ) : null}

              {/* A take does not announce itself — it dashes and speaks. The
                  em-rule is the same device the other kinds use, which is what
                  makes them a family, and it carries the kind's colour. */}
              {kind === 'take' && (
                <Text style={[p.take, rtl && p.rtlText]} {...scaledTextProps}>
                  <Text style={[p.leadIn, LEAD_STYLE.take]}>TAKE — </Text>{softBreak(body)}
                </Text>
              )}

              {kind === 'seeking' && (
                <Text style={[p.seeking, rtl && p.rtlText]} {...scaledTextProps}>
                  <Text style={p.seekingLead}>SEEKING — </Text>{softBreak(body)}
                </Text>
              )}

              {/* The lead-in is the SOURCE, not a date. Real wire copy leads with
                  the agency, and a date here would print twice — the margin
                  already carries it. */}
              {kind === 'wire' && (
                <Text style={[p.wire, rtl && p.rtlText]} {...scaledTextProps}>
                  <Text style={p.wireDateline}>WIRE — </Text>{softBreak(body)}
                </Text>
              )}

              {/* ── THE BALLOTS DEPARTMENT PRINTED NOTHING ────────────────
                  There were four branches here — take, seeking, wire, dossier —
                  and no ballot. The feed carries ballots (BALLOTS is one of the
                  six departments in the index, and ALL filters by no kind at
                  all), so every ballot card in the paper showed a byline, four
                  marks and NO QUESTION. An entire department of blank entries.

                  The desk files the question into `title` and `body` both, so
                  the words were always on the card — nothing was ever asked to
                  print them.

                  The options are not here on purpose: the card carries the
                  question and the whole card opens the ballot, which is what
                  this component's own note about `onOpen` already said it does.
                  A take card shows the take and you tap to critique; a ballot
                  card shows the question and you tap to vote. */}
              {kind === 'ballot' && (
                <Text style={[p.cardBallotQ, rtl && p.rtlText]} numberOfLines={3} {...displayTextProps}>
                  <Text style={p.ballotLead}>BALLOT — </Text>{softBreak(body)}
                </Text>
              )}

              {kind === 'dossier' && (
                <>
                  <Text style={[p.dossierTitle, rtl && p.rtlText]} numberOfLines={3} {...displayTextProps}>
                    <Text style={p.dossierLead}>DOSSIER — </Text>{softBreak(body)}
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

          {/* The source moved up into the byline, where a dateline belongs. It
              printed here as a fourth orphaned line under the credit — the exact
              "debris at the foot" this design already fixed once for the read
              time, and I had left the wire doing it.

              It was left as `{false ? … : null}`, which is a branch that can
              never run sitting in the app's most recycled component. The note is
              worth keeping; the corpse is not. */}

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

          {pending ? (
            <Text style={p.wireSource} numberOfLines={1} {...scaledTextProps}>
              NOT SENT YET · THE HOUSE HAS NOT SEEN THIS
            </Text>
          ) : null}
        </View>
      </View>

      {/* A spoilered post keeps its marks — you can certify, share and save
          something you have chosen not to uncover. */}
      {!withheld && (
        <PaperActions
          certifyCount={certifyCount} commentCount={commentCount}
          certified={certified} saved={saved} dimmed={pending}
          onCertify={onCertify} onCritique={onCritique}
          onShare={onShare} onSave={onSave}
        />
      )}

      {/* ── THE ENTRY IS CLOSED IN ITS OWN INK ─────────────────────────────
          The seam used to sit ABOVE the marks, which meant the rule separated
          an entry from its own footer — and with nothing beneath them the marks
          floated between two filings, belonging visibly to neither. You could
          not tell whose they were, which is the one thing a control must never
          leave unclear.

          I tried bracketing instead: the marks inside the column, wrapped by
          the kind's vertical rule. Measured, it does not fit — `CERTIFIED`
          needs 61.9pt of a 64pt quarter and overflows the moment text scales.
          A device that only works at one text size is not a device.

          So the rule moved to the FOOT, where a printed letter has always ended
          — and it is drawn in the filing's own colour. Each entry now opens
          with its kind named in an ink and closes with a rule in the same ink,
          and everything between the two lines belongs to it. Nothing was added
          to the page: the seam that was in the wrong place is now in the right
          one, carrying information it was not carrying before. */}
      <View style={[p.entryEnd, { backgroundColor: KIND_RULE[kind] }]} />
    </View>
  );
});
