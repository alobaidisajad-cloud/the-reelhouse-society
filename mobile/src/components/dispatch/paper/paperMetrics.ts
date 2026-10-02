/**
 * paperMetrics — the Dispatch's geometry, stated once.
 * ─────────────────────────────────────────────────────────────────────────────
 * Every number two components must agree on lives here, not in a component:
 * the moment a measurement is copied it drifts, and nobody notices until the
 * two copies are on screen together.
 *
 *   · THE FRAME. Margin + rail + padding on each side, in three steps by screen
 *     width (under 360, under 390, and the rest). At a fixed 75pt the frame took
 *     23% of a 320pt screen, and measured at every real device width, all seven
 *     rows that cannot reflow failed at 320 and the byline failed at 360, the
 *     commonest Android width. Three steps because the widths cluster into
 *     three; a continuous function would give every handset its own measure.
 *
 *   · PAPER_MAX. The app ships with `supportsTablet: true`, and on a 12.9" iPad
 *     an unbounded measure sets lines about 950pt wide. The paper is capped and
 *     centred instead, like a broadsheet on a reading desk. Every phone is far
 *     below the cap.
 *
 *   · NOT HERE: length limits. They live only in `MAX_LENGTHS`, which
 *     `dispatchFieldCaps.test.ts` checks against the live CHECK constraints.
 *     A second table of limits could only disagree with it.
 */
import { colors } from '@/src/theme/theme';

export const DOC_RAIL = 1.5;

export const docPad = (w: number) => (w < 360 ? 14 : w < 390 ? 18 : 24);
export const docMargin = (w: number) => (w < 360 ? 6 : w < 390 ? 9 : 12);

/** The 390pt values, for styles that cannot see the width. */
export const DOC_MARGIN = 12;
export const DOC_PAD = 24;

/** The text column, once the ordering margin and its rule are taken out. */
export const columnWidth = (screenWidth: number) =>
  measure(screenWidth) - MARGIN_W - RULE_W - RULE_GAP;

/** The text measure at a screen width: 390 → 315, 375 → 318, 320 → 277. */
export const measure = (screenWidth: number) => {
  const w = Math.min(screenWidth, PAPER_MAX);
  return w - 2 * (docMargin(screenWidth) + DOC_RAIL + docPad(screenWidth));
};

/** The widest the paper is ever set; beyond it the page's own ground shows. */
export const PAPER_MAX = 560;

// The chrome row has no set height: it takes what its words need at any size.
export const CHROME_PAD_V = 10;
export const CHROME_PAD_H = 14;

/** 13, not 19: on a printed page the rules separate the entries, not slack. */
export const POST_PAD_V = 13;

/** The ordering column: the hour under LATEST, the count under CERTIFIED. */
export const MARGIN_W = 44;
/** The column's rule. 3, not 2: at two points its colours were not told apart at a glance. */
export const RULE_W = 3;
export const RULE_GAP = 12;

/** Byline: the avatar is fixed, the row centres, so type scaling cannot skew it. */
export const AVATAR = 19;
export const BYLINE_INDENT = RULE_W + RULE_GAP;

/** A still: 16:9 of the measure, capped so one post cannot own a screen. */
export const stillHeight = (m: number) => Math.min(Math.round(m * 0.5625), 108);

/** Crimson for words, under this page's own name: the pigment fails as text. */
export const CRIMSON_INK = colors.crimsonInk;

/**
 * For a mark made of a character (a caret, a ✦, a nil dash), which a screen
 * reader would otherwise read by its dictionary name. Both keys are needed:
 * the first is iOS only, the second Android only.
 */
export const UNSPOKEN = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

/**
 * A row of marks caps at 1.2, not 1.35. Measured: at 1.35 the four marks with
 * their worst real counts come to 322.5pt in a 315pt measure; at 1.2, 299pt.
 * A row that cannot reflow must fit. Shrink-to-fit is only a backstop, as
 * Android does not honour it reliably.
 */
export const actionLabelProps = {
  allowFontScaling: true,
  maxFontSizeMultiplier: 1.2,
  numberOfLines: 1 as const,
  adjustsFontSizeToFit: true,
  minimumFontScale: 0.75,
} as const;

/** The counter stays out of the way until it could plausibly matter. */
export const COUNTER_SHOWS_AT = 60;

/** Ballot: two to six films, never plain text, never seven. */
export const BALLOT_MIN = 2;
export const BALLOT_MAX = 6;
/** Percentages are hidden until a ballot has enough votes to mean anything. */
export const BALLOT_PERCENT_FLOOR = 10;

/** A ballot's closing times: the label is what the desk, its rail and a draft hold. */
export const CLOSING_TIMES = [
  { label: '1 DAY', days: 1 },
  { label: '2 DAYS', days: 2 },
  { label: '1 WEEK', days: 7 },
] as const;
export type ClosingTime = (typeof CLOSING_TIMES)[number]['label'];
export const DEFAULT_CLOSING: ClosingTime = '2 DAYS';
export const isClosingTime = (label: unknown): label is ClosingTime =>
  CLOSING_TIMES.some((c) => c.label === label);
/** The days a closing time stands for. */
export const closingDays = (label: ClosingTime) => CLOSING_TIMES.find((c) => c.label === label)!.days;
/** The closing time after `label`, and round again from the first. */
export const nextClosing = (label: ClosingTime): ClosingTime =>
  CLOSING_TIMES[(CLOSING_TIMES.findIndex((c) => c.label === label) + 1) % CLOSING_TIMES.length].label;

/** Paging belongs to the store that runs the query: re-exported, never redeclared. */
export { PAGE_SIZE, COMMENT_PAGE_SIZE } from '@/src/stores/dispatchTypes';

/** Never more than four skeletons: four reads as loading, twelve as a slot machine. */
export const SKELETON_COUNT = 4;

/** Counts abbreviate from here: nobody needs 4,102 told apart from 4,103. */
export const COUNT_EXACT_BELOW = 1000;

/** The house's founding year, the EST. on the masthead. */
export const FOUNDED = 1924;

/** The volume is the year of publication counted from founding, 1924 being VOL. 1: 2026 is VOL. 103. */
export const volumeOf = (d: Date) => d.getFullYear() - FOUNDED + 1;

/**
 * The issue is the day of the year, as for a daily paper: 28 August is No. 240.
 * Both come from the date alone, so nothing is seeded and nothing drifts.
 * Counted in calendar days, not elapsed hours: under summer time a local day
 * is an hour short of the last midnight's, and the number fell back by one
 * every night from midnight to one.
 */
export const issueOf = (d: Date) =>
  (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 86_400_000;

/** `VOL. 103 · No. 240` */
export const folioOf = (d: Date) => `VOL. ${volumeOf(d)} · No. ${issueOf(d)}`;

/**
 * The KIND's hue, on the lead-in that opens an entry and the rule that closes
 * it. (Rank is the member's: the avatar's ring and the column's rule.) Five
 * hues chosen to be told apart; the theme's colours say why each is that pigment.
 */
export const KIND_RULE = {
  /** Heat, opinion — an ember, not a formal red. */
  take: colors.dispatchTake,
  /** A question put to the house — duplicator violet, the ink of want-ads. */
  seeking: colors.dispatchSeeking,
  /** Telegraphic, cold, from elsewhere. */
  wire: colors.dispatchWire,
  /** A ballot paper. */
  ballot: colors.dispatchBallot,
  /** The silver screen: the most considered form. */
  dossier: colors.silverNitrate,
} as const;

/**
 * The printed word for each `kind` column value. The column's words live in
 * every row; what a member reads is a separate choice, made only here. The
 * long form is an ESSAY: a dossier is a file ABOUT a subject (a profile, a
 * film's panel). `oneWordNamesOneThing.test.ts` refuses a kind printed raw.
 */
export const KIND_NAME = {
  take: 'TAKE',
  seeking: 'SEEKING',
  wire: 'WIRE',
  ballot: 'BALLOT',
  dossier: 'ESSAY',
} as const;

/** The printed name for a kind held as a plain string; an unknown one prints as itself. */
export const nameOf = (kind: string): string =>
  KIND_NAME[kind.toLowerCase() as keyof typeof KIND_NAME] ?? kind.toUpperCase();

/**
 * The colour belongs to the word, as a Darkroom mood does: a section's name
 * wears its kind's hue in the index, the standing head and a post's lead-in,
 * so the code is taught by the word, not by a stripe. Derived from KIND_RULE,
 * so an index and the posts it lists cannot disagree. ALL has no hue: it is no
 * filter at all, and a hue would imply a sixth department.
 */
export const SECTION_COLOR: Record<string, string> = {
  ALL: colors.parchment,
  TAKES: KIND_RULE.take,
  SEEKING: KIND_RULE.seeking,
  WIRE: KIND_RULE.wire,
  BALLOTS: KIND_RULE.ballot,
  ESSAYS: KIND_RULE.dossier,
};

/**
 * `25000` → `25,000`: grouped, not abbreviated. Never `toLocaleString()`:
 * a test in Node sees `24,310`, but on the phone a word count printed `24310`.
 * By hand, not by the usual lookahead regex, which also groups the digits
 * after a decimal point.
 */
export const groupDigits = (n: number): string => {
  const negative = n < 0;
  const digits = String(Math.trunc(Math.abs(n)));
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
    out += digits[i];
  }
  return negative ? '-' + out : out;
};

const COUNT_UNITS: readonly (readonly [number, string])[] = [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']];

/**
 * `7` · `999` · `1K` · `2.1K` · `24K` · `999K` · `1.2M` · `3B`, and nothing at
 * zero. CUT, never rounded: a count on the house's mark must not claim more
 * than happened, so 1,960 is `1.9K` (not `2K`) and 999,999 is `999K` (not
 * `1000K`). Counted in whole tenths, as `2.14 * 10` in floating point is not
 * always 21.4. Never wider than four characters: MarkFigure's room on the
 * narrowest bar is measured for exactly that.
 */
export const formatCount = (n: number): string | null => {
  if (!Number.isFinite(n) || n < 1) return null;
  const whole = Math.floor(n);
  if (whole < COUNT_EXACT_BELOW) return String(whole);
  const [size, unit] = COUNT_UNITS.find(([s]) => whole >= s)!;
  const tenths = Math.floor((whole * 10) / size);
  if (tenths < 100) {
    const units = Math.floor(tenths / 10);
    const tenth = tenths % 10;
    return tenth ? `${units}.${tenth}${unit}` : `${units}${unit}`;
  }
  // Ten units and up: whole units only, and a trillion or more stays 999B.
  return `${Math.min(Math.floor(tenths / 10), 999)}${unit}`;
};
