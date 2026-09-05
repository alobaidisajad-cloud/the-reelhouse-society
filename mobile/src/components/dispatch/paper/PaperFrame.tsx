import { memo, type ReactNode } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Bookmark, ChevronsUpDown } from 'lucide-react-native';

import PressableScale from '@/src/components/PressableScale';
import { colors } from '@/src/theme/theme';
import { BRASS, BRASS_STOPS, ON_BRASS } from '@/src/theme/brass';
import { scaledTextProps, decorativeTextProps, displayTextProps } from '@/src/constants/textScaling';
import { p } from './paperStyles';
import { SKELETON_COUNT, PAPER_MAX, folioOf, issueOf, SECTION_COLOR, UNSPOKEN } from './paperMetrics';

export const SECTIONS = ['ALL', 'TAKES', 'SEEKING', 'WIRE', 'BALLOTS', 'DOSSIER'] as const;
export type PaperSection = typeof SECTIONS[number];

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
  section, onSection,
}: {
  section: PaperSection;
  onSection?: (s: PaperSection) => void;
}) {
  return (
    <View style={p.chrome}>
      {/* ── THE INDEX IS CAPPED TOO ─────────────────────────────────────────
          `PAPER_MAX` capped the DOCUMENT and nothing else. Rendered at 834pt
          for the first time — the tablet width this app ships support for and
          that nobody had ever drawn — the paper sat centred while the index sat
          hard against the far-left edge, 250 points away from the page it
          indexes. Navigation that does not line up with the thing it navigates
          is not a small thing on a large screen; it is the first thing you see.

          The rule below the row still runs the full width, because that rule is
          the edge of the chrome, not of the paper. */}
      <View style={p.chromeWrap}>
      <View style={p.chromeIndex}>
        {/* The clip has to be SOFT. With `overflow: hidden` alone the last
            section is guillotined mid-word against the tools — it reads as a
            broken label rather than as more to scroll. A short fade over the
            trailing edge says "there is more this way" in the page's own ink. */}
        <LinearGradient
          colors={['rgba(8,6,4,0)', 'rgba(8,6,4,0.97)']}
          start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
          pointerEvents="none"
          style={p.chromeFade}
        />
        {/* ── AND IT ACTUALLY SCROLLS ────────────────────────────────────────
            The note at the top of this file has always said "the index
            scrolls", the fade above says "there is more this way", and
            `chromeIndex` carries `overflow: hidden` to clip it — and the row
            was a plain View. Nothing scrolled.

            At normal type all six departments fit, so it never showed. At 1.35
            the row overflows by 5.2pt, measured across all 66 screens, and
            DOSSIER is cut against the tools: a member who turns type up loses a
            whole department and has no way to reach it — a dead end that only
            appears for the people most likely to hit it.

            `alwaysBounceHorizontal` off, so a row that DOES fit does not rubber
            band and imply there is something past the end. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          alwaysBounceHorizontal={false}
          contentContainerStyle={p.chromeRow}
          accessibilityRole="tablist"
        >
          {SECTIONS.map((s, i) => (
            <View key={s} style={p.chromeRow}>
              {/* UNSPOKEN, because this is a rule made out of a character. The
                  index is a TABLIST: without it a member using VoiceOver hears
                  "ALL, middle dot, TAKES, middle dot, SEEKING, middle dot…" —
                  five interruptions between six departments, in the one control
                  that decides what the whole page is.

                  `decorativeTextProps` alone does NOT do this. It sets
                  `allowFontScaling: false` and nothing else; its name promises
                  the ear and delivers only the eye, which is exactly why this
                  mark was left spoken. */}
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
      </View>
    </View>
  );
});

/**
 * The full masthead. It is ordinary scroll content and is never animated — the
 * fold is the overlay arriving over it, which costs one opacity interpolation
 * on the animation thread instead of a layout pass per frame.
 */
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
      <Text style={p.runHeadText} numberOfLines={1} {...decorativeTextProps}>
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
      {/* The old masthead printed a volume counted in WEEKS from an arbitrary
          epoch, directly beside a line claiming the house was founded in 1924 —
          two numbers on one row disagreeing with each other. Now the volume is
          the house's year and the number is the day, both from the date. */}
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

/** The divider that gives an endless feed a shape. Dates come from the app's own
 *  helpers — Hermes has no Intl here, and the current masthead may already be
 *  proving that on a device. */
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
 * ── THE APP'S OWN SECTION HEAD ───────────────────────────────────────────────
 * I had invented a centred Rye heading. The app already HAS a shared one, used
 * across the film page: a slim brass index-bar with its own glow, the label in
 * Special Elite, and a hairline rule fading to nothing on the right.
 *
 * Using it rather than a second design is the whole difference between this
 * page looking like the app and looking like a page beside it — and it is the
 * one component in the app whose comment says "one source of truth so the
 * sections can never drift". Drifting was exactly what I was about to do.
 */
/* ── NO SECTION HEAD LIVES HERE ───────────────────────────────────────────
 * There was one: a hand copy of the app's `FilmSectionHeader` — brass index
 * bar, label, hairline fading right — with a tint the shared component does
 * not have. It was never mounted on any screen, and its own comment said the
 * way to ship it is an optional `tint` prop on the real component so the film
 * page and this page can never drift.
 *
 * Keeping the copy WAS the drift. The instruction survives; the duplicate
 * does not, because an unmounted component rots and a note does not.
 */

/** A brass face: the shared ramp with its crown, never a flat gold rectangle. */
/**
 * `onPress` is REQUIRED, and that is the whole point.
 *
 * This component exists only to be pressed. With an optional handler it was
 * mounted without one — `PaperEmpty` rendered `<BrassButton label={action} />`
 * on the day-one screen and on every empty department, so the one control a new
 * member is offered in their first minute did nothing at all.
 *
 * A test could catch that. A required prop makes it impossible, which is better:
 * the compiler is checked on every build and by every editor, and it names the
 * line rather than a file.
 */
export const BrassButton = memo(function BrassButton({
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

/**
 * ── AN EMPTY SECTION ─────────────────────────────────────────────────────────
 * No glyph above the words. Five invented symbols would be exactly the
 * vocabulary this design spent a week trimming, and an icon-over-text-over-
 * button is the empty state every app ships. The section head above IS the mark.
 *
 * The headline states what is absent; the line under it teaches the form in one
 * breath; the act is a verb. `action` is omitted where a member cannot perform
 * it — offering a locked door is worse than offering nothing.
 */
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
 * ── AN EMPTY PAGE STILL OFFERS A WAY FORWARD ────────────────────────────────
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
      {/* ONE button, everywhere. Day one offered a brass plate and an empty
          department offered an outline — the same act, drawn two ways, on two
          screens a member sees within a minute of each other. Two treatments of
          one control is how an app stops feeling like one app. */}
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
      {end ? (
        <View style={p.endRow}>
          <View style={p.endLine} />
          <Text style={{ color: colors.sepia, fontSize: 12.5, opacity: 0.7 }} {...decorativeTextProps} {...UNSPOKEN}>✦</Text>
          <View style={p.endLine} />
        </View>
      ) : null}
      <Ruling ops={RULED_BELOW} />
    </View>
  );
});

/**
 * Skeletons follow the section you are in, so heights match what arrives and
 * nothing jumps. Four, never more: four reads as loading, twelve as a slot
 * machine. One shimmer value drives all of them — one animation, not four.
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
    <View accessibilityLabel="Loading filings">
      {shapes.map((lines, i) => (
        <View key={i}>
          {i > 0 && <View style={p.hair} />}
          {/* ── THE SHAPE HAS TO BE THE POST'S SHAPE ────────────────────────
              These bars used to run the full measure from the document's left
              edge, with the byline UNDER the body — so when the real posts
              landed every line jumped 59 points right and the byline jumped to
              the top. A skeleton whose geometry is not the content's geometry
              is not holding a place, it is guaranteeing a lurch.

              It is now built from the post's own parts: the same margin, the
              same rule, the same column, byline first, and a footer where the
              action row will be, so nothing moves at all when the writing
              arrives. */}
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
      {/* ── NO SURFACE ───────────────────────────────────────────────────────
          A tiled paper stock lived here. It was built, rendered, looked at, and
          it was wrong — not badly made, wrong in principle.

          Texture reads because a surface SCATTERS LIGHT. A near-black page has
          almost none to scatter, so the tile did not read as pulp; it read as
          sensor noise, dirt on the lens of a dark page. That is also why the
          app's own material is FILM grain: film grain belongs to a projected
          image, which is light. This page is ink.

          The richness here is carried by the rules, the type and the brass. On
          this ground, surface is not depth — it is dirt. */}
      <View style={[p.doc, top && p.docTop]}>
        {children}
      </View>
    </View>
  );
});
