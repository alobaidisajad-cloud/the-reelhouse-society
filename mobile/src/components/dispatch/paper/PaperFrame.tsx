import { memo, type ReactNode } from 'react';
import { View, ScrollView } from 'react-native';
import { Text } from '@/src/components/text';
import { LinearGradient } from 'expo-linear-gradient';
import { Bookmark, ChevronsUpDown, Search } from 'lucide-react-native';

import PressableScale from '@/src/components/PressableScale';
import { colors } from '@/src/theme/theme';
import { BRASS, BRASS_STOPS, ON_BRASS } from '@/src/theme/brass';
import { scaledTextProps, decorativeTextProps, displayTextProps } from '@/src/constants/textScaling';
import { p } from './paperStyles';
import { SKELETON_COUNT, PAPER_MAX, folioOf, issueOf, SECTION_COLOR, UNSPOKEN } from './paperMetrics';
import { SECTIONS, type Section } from '@/src/stores/dispatchTypes';

/**
 * ── ONE ROW OF CHROME ────────────────────────────────────────────────────────
 * The two-row version measured 201pt with the app's top bar — a quarter of an
 * iPhone 15's screen before a word of content, which is the systemic flaw this
 * app already carries on Stacks. Merging the name line away and pinning the
 * tools beside the index brings it to 154pt.
 *
 * The index scrolls; the tools never do. `LATEST` / `CERTIFIED` are one word
 * each because the two-word forms measured ~150pt at 1.35 and shoved the index
 * off the row.
 *
 * Inactive labels are `bone` at 0.6 (~4.8:1), NOT `fog` at 0.45 (~2.2:1) —
 * navigation you cannot read is not navigation. The active state is carried by
 * full-strength parchment and the brass underline instead of by dimming its
 * neighbours into the ground.
 *
 * hitSlop has ZERO horizontal component: PressableScale's 15pt default would
 * overlap the adjacent section, and the later sibling wins the touch.
 */
const IX_SLOP = { top: 8, bottom: 8, left: 0, right: 0 };

export const PaperChrome = memo(function PaperChrome({
  section, onSection, onArchive,
}: {
  section: Section;
  onSection?: (s: Section) => void;
  /**
   * The archive — one film, and everything the house has ever said about it.
   *
   * It lives HERE, beside the index, for two reasons.
   *
   * The first is measured. The running head is where it started, and that row
   * has no spare width: its issue line needs 207 points and is given 206.5. A
   * third mark there costs 25 of them and turns `WEDNESDAY, AUGUST 28` into
   * `WEDNESDAY, AUGUST 2` — not a shortened date, a wrong one. This row is a
   * horizontal SCROLL, so a fixed mark beside it takes nothing away: the
   * departments scroll a little sooner and every one of them is still reachable.
   *
   * The second is what it means. This row is how a member says what the paper
   * IS — a department, or one film's whole history. The magnifier in the app's
   * top bar finds members, films and stacks; this one finds FILINGS. Two
   * searches doing different jobs, one in the app's chrome and one in the
   * paper's, is how a member learns which is which.
   */
  onArchive?: () => void;
}) {
  return (
    <View style={p.chrome}>
      {/* The index is capped to `PAPER_MAX` with the document, so on a tablet
          it lines up with the page it indexes. The rule below the row runs the
          full width: it is the chrome's edge, not the paper's. */}
      <View style={p.chromeWrap}>
      <View style={p.chromeIndex}>
        {/* The clip has to be SOFT. With `overflow: hidden` alone the last
            section is guillotined mid-word against the tools — it reads as a
            broken label rather than as more to scroll. A short fade over the
            trailing edge says "there is more this way" in the page's own ink. */}
        <LinearGradient
          colors={['rgba(30,25,20,0)', 'rgba(30,25,20,0.97)']}
          start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
          pointerEvents="none"
          style={p.chromeFade}
        />
        {/* It scrolls: at larger type the departments overflow the row, and the
            last one would be cut against the tools. No bounce, so a row that
            fits does not imply more past its end. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          alwaysBounceHorizontal={false}
          contentContainerStyle={p.chromeRow}
          accessibilityRole="tablist"
        >
          {SECTIONS.map((s, i) => (
            <View key={s} style={p.chromeRow}>
              {/* UNSPOKEN: a rule made of a character, which a screen reader
                  would say between every department ("middle dot").
                  `decorativeTextProps` only stops the scaling. */}
              {i > 0 && <Text style={p.indexDot} {...UNSPOKEN} {...decorativeTextProps}>·</Text>}
              {/* Each department wears its own colour, the way a Darkroom mood
                  does — dimmed until you choose it, full strength and underlined
                  in the same hue once you have. The word teaches the code. */}
              <PressableScale
                style={[
                  p.indexItem,
                  s === section && { borderBottomColor: SECTION_COLOR[s] },
                ]}
                hitSlop={IX_SLOP}
                onPress={() => onSection?.(s)}
                haptic="selection"
                accessibilityRole="tab"
                accessibilityState={{ selected: s === section }}
                accessibilityLabel={`${s} section`}
              >
                {/* Lit only when chosen — the Darkroom lights the mood you pick
                    rather than painting all six at once. Six coloured words in a
                    row all the time is a legend, not navigation.

                    The label keeps `scaledTextProps` and does NOT shrink to fit.
                    Shrinking the type of a member who asked for larger type is
                    the wrong answer to running out of room; the row scrolls
                    instead. See the ScrollView above. */}
                <Text
                  style={[
                    p.indexLabel,
                    s === section
                      ? [p.indexLabelOn, { color: SECTION_COLOR[s] }]
                      : p.indexLabelOff,
                  ]}
                  {...scaledTextProps}
                >
                  {s}
                </Text>
              </PressableScale>
            </View>
          ))}
        </ScrollView>
      </View>
      {onArchive ? (
        <PressableScale
          style={p.chromeArchive}
          hitSlop={IX_SLOP}
          onPress={onArchive}
          haptic="selection"
          accessibilityRole="button"
          accessibilityLabel="The archive. Everything the house has said about one film"
        >
          <Search size={13} strokeWidth={2} color={colors.fog} />
        </PressableScale>
      ) : null}
      </View>
    </View>
  );
});

/**
 * ── THE FOLIO ────────────────────────────────────────────────────────────────
 * A running head. Every printed page carries the paper's name and its number;
 * ours carried nothing, so the moment the masthead scrolled away there was
 * nothing left saying newspaper. Seven point, at 62% — it should be noticed
 * once and then live at the edge of attention, which is what a folio does.
 *
 * The numbers are real. See `folioOf` — the volume is the house's year counted
 * from 1924, the issue is the day of the year, and both derive from the date
 * alone so neither can drift.
 */
export const RunningHead = memo(function RunningHead({
  date, dayLabel, sort, saved, title, onSort, onSaved,
}: {
  date: Date;
  dayLabel: string;
  sort: 'LATEST' | 'CERTIFIED';
  saved?: boolean;
  /** Replaces the issue line when the paper is filtered to something that is
   *  not the edition — your saved filings. The bookmark beside it lights, and
   *  that lit bookmark is also the way back out: one control, two states, no
   *  second back arrow for a page you entered by tapping a toggle. */
  title?: string;
  onSort?: () => void;
  onSaved?: () => void;
}) {
  return (
    <View style={p.runHead}>
      {/* The issue number and the day, in one line — this replaces BOTH the old
          folio and the first day divider. The date is the EDITION's, not the
          posts', so it is equally true under either ordering. */}
      {/* Two lines at most, never a cut: a date cut short is a WRONG date
          (AUGUST 28 → AUGUST 2). On a phone too narrow for one line, the day
          goes to a second line whole. */}
      <Text style={p.runHeadText} numberOfLines={2} {...decorativeTextProps}>
        {title ?? `No. ${issueOf(date)} · ${dayLabel}`}
      </Text>
      <View style={p.runHeadTools}>
        <PressableScale
          hitSlop={IX_SLOP} onPress={onSaved} haptic
          accessibilityRole="button" accessibilityLabel="Your saved filings"
        >
          <Bookmark size={13} strokeWidth={2}
            color={saved ? colors.sepia : colors.fog}
            fill={saved ? colors.sepia : 'transparent'} />
        </PressableScale>
        <PressableScale
          style={p.chromeRow} hitSlop={IX_SLOP} onPress={onSort} haptic
          accessibilityRole="button" accessibilityLabel={`Sorted by ${sort.toLowerCase()}. Change`}
        >
          <ChevronsUpDown size={11} strokeWidth={2} color={colors.fog} />
          <Text style={[p.toolLabel, { marginLeft: 4 }]} {...scaledTextProps}>{sort}</Text>
        </PressableScale>
      </View>
    </View>
  );
});

/** The full masthead: ordinary scroll content, never animated. */
export const PaperMasthead = memo(function PaperMasthead({
  date, dateLabel,
}: { date: Date; dateLabel: string }) {
  return (
    <View style={p.mast}>
      <View style={p.mastRuleTop} />
      {/* ONE line, not the two the old masthead used. At 36pt Rye it fills the
          measure exactly and reads as a printed nameplate; broken over two it
          reads as a heading that ran out of room. The shrink guard is what makes
          one line safe — on the narrowest screen the words come to the width of
          the measure with nothing to spare, so the type gives before it clips. */}
      <Text
        style={p.mastTitle} accessibilityRole="header"
        numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}
        {...displayTextProps}
      >
        THE DISPATCH
      </Text>
      <View style={p.mastRuleBottom} />
      {/* The volume is the house's year since 1924 and the number the day,
          both from the date, so they agree with EST. 1924 beside them. */}
      <View style={p.mastMetaRow}>
        <Text style={p.mastMeta} {...scaledTextProps}>{folioOf(date)}</Text>
        <View style={p.pip} />
        <Text style={p.mastMeta} {...scaledTextProps}>EST. 1924</Text>
        <View style={p.pip} />
        <Text style={p.mastMeta} {...scaledTextProps}>{dateLabel}</Text>
      </View>
      <Text style={p.mastSub} {...scaledTextProps}>
        A journal of cinema — for those who see in the dark.
      </Text>
    </View>
  );
});

export const Ornament = memo(function Ornament() {
  return (
    <View style={p.orn}>
      <View style={p.ornLine} /><View style={p.ornDiamond} /><View style={p.ornLine} />
    </View>
  );
});

/** The divider that gives an endless feed a shape. Its label comes from the
 *  app's own date helpers: Hermes has no Intl. */
export const DayDivider = memo(function DayDivider({ label }: { label: string }) {
  return (
    <View style={p.dayRow}>
      <View style={p.dayLine} />
      <Text style={p.dayLabel} {...decorativeTextProps}>{label}</Text>
      <View style={p.dayLine} />
    </View>
  );
});

/**
 * A brass face: the shared ramp with its crown, never a flat gold rectangle.
 * `onPress` is REQUIRED: a control that exists only to be pressed cannot be
 * mounted without a handler (the compiler refuses it). PaperEmpty's alone.
 */
const BrassButton = memo(function BrassButton({
  label, onPress,
}: { label: string; onPress: () => void }) {
  return (
    <PressableScale
      style={[p.btn, p.btnBrass]} onPress={onPress} haptic="medium"
      accessibilityRole="button" accessibilityLabel={label}
    >
      <LinearGradient
        colors={BRASS} locations={BRASS_STOPS}
        start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />
      <LinearGradient
        colors={['rgba(240,232,176,0.40)', 'rgba(240,232,176,0.10)', 'transparent']}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '48%' }}
      />
      <Text style={[p.btnText, { color: ON_BRASS }]} {...scaledTextProps}>{label}</Text>
    </PressableScale>
  );
});

/** The ruling, fading as it runs down the page. See `emptyRules`. */
const RULED_ABOVE = [0.13, 0.115, 0.10, 0.086];
const RULED_BELOW = [0.072, 0.058, 0.044, 0.03, 0.016];

const Ruling = ({ ops }: { ops: number[] }) => (
  <View style={p.emptyRules} pointerEvents="none">
    {ops.map((o, i) => (
      <View key={i} style={[p.emptyRule, { borderBottomColor: `rgba(184,137,26,${o})` }]} />
    ))}
  </View>
);

/**
 * ── THE MARK AT THE END OF A THING ──────────────────────────────────────────
 * Rule, ornament, rule — what a compositor set where a piece finished, so a
 * page that has been read to the end says so instead of simply stopping. One
 * component for every list that ends.
 *
 * UNSPOKEN, in both directions: ✦ is furniture, and a screen reader announcing
 * "black four pointed star" at the foot of every finished list is the page
 * reading its own punctuation aloud.
 */
export const EndMark = memo(function EndMark() {
  return (
    <View style={p.endRow}>
      <View style={p.endLine} />
      <Text style={p.endMark} {...UNSPOKEN} {...decorativeTextProps}>✦</Text>
      <View style={p.endLine} />
    </View>
  );
});

/**
 * ── AN EMPTY PAGE STILL OFFERS A WAY FORWARD ────────────────────────────────
 * No glyph above the words: an icon over text over a button is the empty state
 * every app ships. The headline states what is absent, the line under it
 * teaches the form, the act is a verb, and it is omitted where a member cannot
 * perform it.
 *
 * `action` and `onAction` are a PAIR, expressed as a union so the type system
 * refuses one without the other. An empty state whose only button does nothing
 * is worse than an empty state with no button: the member is told there is
 * something they can do, and then finds there is not.
 *
 * `quiet` is the same pair, one weight down — a line of small caps that is a
 * link when it leads somewhere ("WHAT AN AUTEUR CAN DO →") and plain type when
 * it is only a reassurance ("NOTHING IS HIDDEN FROM YOU MEANWHILE").
 */
type EmptyAction =
  | { action: string; onAction: () => void }
  | { action?: undefined; onAction?: undefined };

type EmptyQuiet =
  | { quiet: string; onQuiet?: () => void }
  | { quiet?: undefined; onQuiet?: undefined };

export const PaperEmpty = memo(function PaperEmpty({
  title, body, action, quiet, end, onAction, onQuiet,
}: {
  title: string; body: string;
  end?: boolean;
} & EmptyAction & EmptyQuiet) {
  return (
    <View style={p.empty}>
      <Ruling ops={RULED_ABOVE} />
      <Text style={p.emptyTitle} accessibilityRole="header" {...displayTextProps}>{title}</Text>
      <Text style={p.emptyBody} {...scaledTextProps}>{body}</Text>
      {/* ONE button, everywhere: one act is never drawn two ways. */}
      {action && onAction ? <BrassButton label={action} onPress={onAction} /> : null}
      {quiet ? (
        onQuiet ? (
          <PressableScale
            onPress={onQuiet} haptic="selection"
            hitSlop={{ top: 8, bottom: 8, left: 0, right: 0 }}
            accessibilityRole="link" accessibilityLabel={quiet}
          >
            <Text style={[p.quiet, { color: colors.sepia }]} {...scaledTextProps}>{quiet}</Text>
          </PressableScale>
        ) : (
          <Text style={p.quiet} {...scaledTextProps}>{quiet}</Text>
        )
      ) : null}
      {end ? <EndMark /> : null}
      <Ruling ops={RULED_BELOW} />
    </View>
  );
});

/**
 * Skeletons follow the section you are in, so heights match what arrives and
 * nothing jumps. Four, never more: four reads as loading, twelve as a slot
 * machine. Still, not shimmering: a page of ink is quiet while it loads.
 */
const SHAPES: Record<string, number[][]> = {
  TAKES: [[97, 92, 58], [94, 70], [96, 88, 44], [90, 63]],
  SEEKING: [[96, 84, 52], [92, 61], [95, 80], [88, 55]],
  WIRE: [[93, 88, 46], [90, 58], [96, 72], [86, 50]],
  ALL: [[97, 90, 55], [93, 66], [95, 82, 48], [89, 60]],
};

export const PaperSkeletons = memo(function PaperSkeletons({
  section = 'ALL',
}: { section?: string }) {
  const shapes = (SHAPES[section] ?? SHAPES.ALL).slice(0, SKELETON_COUNT);
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Loading filings">
      {shapes.map((lines, i) => (
        <View key={i}>
          {i > 0 && <View style={p.hair} />}
          {/* Built from the post's own parts (margin, rule, column, byline
              first, a footer where the actions will be), so nothing moves when
              the writing arrives. */}
          <View style={p.skRow}>
            <View style={p.postRow}>
              <View style={p.margin}>
                <View style={[p.skBar, { width: 28, marginBottom: 0, marginTop: 6 }]} />
              </View>
              <View style={p.column}>
                <View style={[p.skByline, { marginTop: 0, marginBottom: 8 }]}>
                  <View style={p.skAvatar} />
                  <View style={[p.skBar, { width: 88, marginBottom: 0 }]} />
                </View>
                {lines.map((w, j) => (
                  <View key={j} style={[p.skBar, { width: `${w}%` }]} />
                ))}
              </View>
            </View>
            <View style={p.actions}>
              {[54, 50, 32, 28].map((w, j) => (
                <View key={j} style={[p.skBar, { width: w, marginBottom: 0, marginTop: 8 }]} />
              ))}
            </View>
          </View>
        </View>
      ))}
    </View>
  );
});

/** The paper, capped and centred. Inert on every phone; the whole point on iPad. */
export const PaperSheet = memo(function PaperSheet({
  top, children,
}: { top?: boolean; children: ReactNode }) {
  return (
    <View style={[p.docWrap, { maxWidth: PAPER_MAX }]}>
      {/* No paper texture: texture reads because a surface scatters light, and
          on a near-black page it reads as dirt. The rules, the type and the
          brass carry it. */}
      <View style={[p.doc, top && p.docTop]}>
        {children}
      </View>
    </View>
  );
});
