/**
 * paperMetrics — the Dispatch's geometry, stated once.
 * ─────────────────────────────────────────────────────────────────────────────
 * Every number the seven audit rounds settled lives here, not in a component,
 * for the same reason navMetrics exists: the moment a measurement is copied it
 * drifts, and nobody notices until two things that must agree are on screen
 * together.
 *
 * The two that matter most:
 *
 *   · MEASURE. The document frame is margin 12 + rail 1.5 + padding 24 on each
 *     side, so the text measure is exactly `width - 75`. Every contrast and
 *     wrap calculation in the plan was made against that number, and the
 *     skeletons derive their heights from it rather than guessing.
 *
 *   · PAPER_MAX. This app ships with `supportsTablet: true`. On a 12.9" iPad an
 *     unbounded measure sets lines ~990pt wide — forty words to a line. The
 *     paper is capped and centred instead, like a broadsheet on a reading desk.
 *     Phones are all far below the cap, so it is inert there.
 */

/**
 * ── THE FRAME COSTS LESS ON A SMALL SCREEN ───────────────────────────────────
 * These were three constants, so the document frame cost 75pt on every device.
 * On a 390pt iPhone that is 19% of the width. On a 320pt iPhone SE it is
 * **23%** — and measured at every real device width, ALL SEVEN unreflowable
 * rows failed at 320, and the byline failed at 360, which is the most common
 * Android width in the world.
 *
 * A frame is a proportion of a page, not a fixed number of points. Three steps,
 * because three is what the device widths actually cluster into, and because a
 * continuous function here would make the measure differ on every handset for
 * no reader's benefit.
 *
 * The 390-and-up case is unchanged, so nothing already drawn moves.
 */
import { colors } from '@/src/theme/theme';

export const DOC_RAIL = 1.5;

export const docPad = (w: number) => (w < 360 ? 14 : w < 390 ? 18 : 24);
export const docMargin = (w: number) => (w < 360 ? 6 : w < 390 ? 9 : 12);

/** The 390pt values, for styles that cannot see the width. */
export const DOC_MARGIN = 12;
export const DOC_PAD = 24;

/** The text measure at a given screen width. 390 -> 315, 375 -> 300. */
/** The text column, once the ordering margin and its rule are taken out. */
export const columnWidth = (screenWidth: number) =>
  measure(screenWidth) - MARGIN_W - RULE_W - RULE_GAP;

export const measure = (screenWidth: number) => {
  const w = Math.min(screenWidth, PAPER_MAX);
  return w - 2 * (docMargin(screenWidth) + DOC_RAIL + docPad(screenWidth));
};

/**
 * The widest the paper is ever set, in points. Beyond it the page's own ground
 * shows on either side.
 */
export const PAPER_MAX = 560;

/**
 * The one row of chrome: sections scroll left, tools pinned right.
 *
 * There is no `chromeHeight` here any more. One existed, exported, with a
 * docstring saying the height was "derived rather than declared — see the
 * test": there was no test, and nothing in the app ever called it. The row is a
 * plain View in normal flow with `alignItems: 'stretch'`, so it takes the
 * height its content needs at whatever type size the reader has chosen, and
 * nothing below it has to reserve anything. A declared height is exactly what
 * would have clipped it at large type.
 */
export const CHROME_PAD_V = 10;
export const CHROME_PAD_H = 14;

/**
 * Vertical padding on every post block.
 *
 * 13, not 19. A printed page has no slack in it — entries butt against each
 * other and the rules do the separating. At 19 the posts floated, which is
 * precisely what makes a feed look like a feed. Tightening it is the single
 * biggest thing that makes this read as a page rather than a list, and it
 * costs nothing but restraint.
 */
export const POST_PAD_V = 13;

/**
 * The tier rule: one slot, coloured by tier.
 *
 * The take's quote rule and the tier mark were two separate rules competing for
 * the same edge until round six caught it. There is one, and tier decides its
 * colour. The brass ramp runs along the rule's LENGTH — a four-stop gradient
 * across 2pt is a flat colour, which reads as yellow plastic.
 */
/**
 * ── THE ORDERING COLUMN, AND WHY ITS CLOCK IS 24-HOUR ────────────────────────
 * The hour under LATEST, the certify count under CERTIFIED. 44pt wide with 6pt
 * of padding, so 38pt of room — and measured, that is the number that decides
 * something nobody had asked about.
 *
 *      21:40      27.4pt at normal size, 32.0 at the cap      fits
 *      10:40 PM   43.8                   51.3                OVERFLOWS
 *      9:40 PM    38.3                   44.9                OVERFLOWS
 *
 * Most of the United States, Australia, India and the Philippines run a
 * 12-hour clock, and this app already produces one: `NewsService` formats times
 * as `9:40 PM`. So the margin would have overflowed on every post, on every
 * screen, for a very large share of the members.
 *
 * Widening it is not the answer — 12-hour needs 58pt with its padding, which is
 * fourteen points taken out of the writing column at every width, on the same
 * phones where every point was just fought for.
 *
 * THE CLOCK IS 24-HOUR, EVERYWHERE, WHATEVER THE PHONE SAYS. Not because it
 * fits, though it does with six points to spare at the largest type — because
 * this column is a LEDGER, and a ledger keeps one notation. The whole page is
 * built on being one edition, No. 240, the same paper for every member on the
 * same day. A filing that printed `21:40` on one phone and `9:40 PM` on another
 * would be two different records of one event. The issue number is shared. The
 * hour is shared with it.
 */
export const MARGIN_W = 44;
/** 3, not 2. At two points the kind colours were present but not legible at a
 *  glance — and a colour code you have to squint at is decoration, not a code.
 *  Three reads instantly and is still a rule rather than a bar. */
export const RULE_W = 3;
export const RULE_GAP = 12;

/** Byline: the avatar is fixed, the row centres, so type scaling cannot skew it. */
export const AVATAR = 19;
export const BYLINE_INDENT = RULE_W + RULE_GAP;

/**
 * The plate's four measures are gone with the styles that used them.
 *
 * `plateImg`, `plateImgMini`, `plateNoArt`, `plateMeta` and `plateLine` were the
 * only readers, and none of them had been mounted on a screen — the feed carries
 * a CREDIT instead, which is a thumbnail and one line, and the full poster lives
 * on the post page. The numbers outlived the design decision that replaced them.
 *
 * (ProfileLedgerTab has its own PLATE_W/PLATE_H at 42x63. Different feature,
 * different numbers, never imported from here.)
 */

/** A still: 16:9 of the measure, capped so one post cannot own a screen. */
export const stillHeight = (m: number) => Math.min(Math.round(m * 0.5625), 108);

/** Caps, as settled. Counted in code points so JS and Postgres agree. */
/**
 * ── THERE IS NO SECOND TABLE OF LIMITS ───────────────────────────────────────
 * `CAPS` lived here with its own numbers — take 280, wire body 280, ballot
 * question 140 — and every one of them was WRONG against the app that shipped:
 * a take is 2,000 like any other filing (`MAX_LENGTHS.filingBody`), which was
 * settled explicitly, and the 280 survived here as a leftover from a draft that
 * had a character rule we decided not to make.
 *
 * It was not decorative. `DeskRail` counted down from `CAPS.wireBody`, so the
 * wire desk would have shown a member 280 characters of room on a field that
 * takes 2,000 — and the ballot's own field would have stopped accepting text at
 * 140 while the column allows 200.
 *
 * The limits live in ONE place, `MAX_LENGTHS`, which `dispatchFieldCaps.test.ts`
 * reconciles against the live CHECK constraints. A second table cannot be
 * reconciled against anything; it can only disagree.
 */

/**
 * ── A ROW OF MARKS CAPS AT 1.2, NOT 1.35 ─────────────────────────────────────
 * Measured, not assumed: at 1.35 the four marks with their worst real counts
 * (`CERTIFIED 2.1K` beside `CRITIQUE 5.2K`) come to 322.5pt in a 315pt measure.
 * They overflow by seven and a half points.
 *
 * `adjustsFontSizeToFit` would absorb that on iOS — and is unreliable on
 * Android, which is exactly the prop this project has already been bitten by.
 * A row that cannot reflow must FIT, not be rescued.
 *
 * So the deck caps at 1.2, the same cap `displayTextProps` uses and for the
 * same reason: text in a fixed slot scales less because it has nowhere to go.
 * At 1.2 the row measures 299pt and fits with sixteen to spare, and shrink-to-
 * fit is left as a backstop rather than as the plan.
 */
/**
 * ── CRIMSON FOR MARKS, A LIGHTER CRIMSON FOR WORDS ───────────────────────────
 * `crimson` as TEXT composites to 2.49:1 on an Auteur's byline and 2.72:1 on a
 * certified count — both far under the 4.5 floor. The reasoning, the measured
 * ratios and the pigment now live in the Shade Ledger, which is where this
 * file's own comment always said they belonged: `colors.crimsonInk`.
 *
 * Re-exported under the name this page uses so the design reads in its own
 * vocabulary while there is exactly one place the value is written down.
 */
export const CRIMSON_INK = colors.crimsonInk;

/**
 * ── MARKS A READER MUST NOT NAME ─────────────────────────────────────────────
 * `decorativeTextProps` says "do not scale this with the member's text size".
 * It says nothing about whether a screen reader announces it, and a search of
 * the design found fifteen marks that a reader would read the NAME of:
 *
 *   |   the composer's caret — announced as "vertical line", in the middle of
 *       the member's own draft, eight times across the desks
 *   ✦   the section ornament — "black four pointed star", between every section
 *   —   the nil value in the ordering margin, where a ledger prints a dash
 *
 * Every one is a picture made out of a character. The eye reads a cursor, a
 * flourish, an empty cell; the ear gets the character's dictionary name.
 *
 * BOTH properties are needed and they are not aliases: `accessibilityElements-
 * Hidden` is iOS, `importantForAccessibility` is Android, and either alone
 * leaves the mark spoken on the other platform.
 */
export const UNSPOKEN = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

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

/**
 * Feed and comment paging — RE-EXPORTED, never redeclared.
 *
 * These used to be their own numbers here. `COMMENT_PAGE_SIZE` said 30 while the
 * store fetched 50, so the footer under a long filing promised `162 MORE · 30 AT
 * A TIME` about a page size that did not exist — and, since nothing could load
 * more anyway, nobody could tell. A component that prints a number about a query
 * must not own that number: it belongs to whoever issues the query.
 */
export { PAGE_SIZE, COMMENT_PAGE_SIZE } from '@/src/stores/dispatchTypes';

/** Never more than four skeletons: four reads as loading, twelve as a slot machine. */
export const SKELETON_COUNT = 4;

/**
 * Counts abbreviate past this. An exact count over millions is a full scan, and
 * nobody has ever needed the difference between 4,102 and 4,103.
 */
export const COUNT_EXACT_BELOW = 1000;

/**
 * ── THE VOLUME AND THE ISSUE ─────────────────────────────────────────────────
 * The masthead says EST. 1924 while the existing `volumeNumber()` counts WEEKS
 * since March 2026 — an arbitrary epoch that contradicts the line printed next
 * to it. A real masthead is not arbitrary:
 *
 *   VOLUME  the year of publication, counted from founding. 2026 is the house's
 *           102nd year, so VOL. 102.
 *   NUMBER  the issue within that volume. For a daily paper, the day of the
 *           year — 28 August is No. 240.
 *
 * Both derive from the date alone, so nothing has to be seeded, nothing drifts,
 * the number advances every night and the volume turns over every January. And
 * it agrees with the founding date the masthead has always claimed.
 */
export const FOUNDED = 1924;

export const volumeOf = (d: Date) => d.getFullYear() - FOUNDED + 1;

export const issueOf = (d: Date) => {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / 86_400_000);
};

/** `VOL. 102 · No. 240` */
export const folioOf = (d: Date) => `VOL. ${volumeOf(d)} · No. ${issueOf(d)}`;

/**
 * ── THE KIND'S COLOUR ────────────────────────────────────────────────────────
 * The rule used to carry TIER. It now carries KIND, because kind changes how
 * you read a post and tier does not — knowing someone pays a subscription tells
 * you nothing about the sentence. Tier moved to the avatar's ring, which is
 * where a property of the MEMBER belongs.
 *
 * Five hues, chosen for distinctness first: red, gold, blue, green, silver.
 * Every one is drawn from what the app already uses — three are Shade Ledger
 * tokens, two are the Darkroom's own mood accents — so no new colour enters the
 * palette and the mood filter and this page speak the same aged register.
 */
// Each pigment, and why it is that pigment and not the obvious one, is written
// down once — in the Shade Ledger, beside every other colour in the app.
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
 * ── THE COLOUR BELONGS TO THE WORD ───────────────────────────────────────────
 * I first hung these on a rule beside each post — a stripe you had to learn.
 * The Darkroom already solved this properly: tap a mood and the MOOD ITSELF is
 * that colour, so the word teaches the code the first time you see it and you
 * never have to decode a stripe.
 *
 * So the section name carries its colour in the index, in the standing head,
 * and in the lead-in a post prints. The rule keeps it too — but as an echo of
 * something already named, not as the only place it appears.
 *
 * ALL is deliberately colourless: it is not a kind, it is the absence of a
 * filter, and giving it a hue would imply a sixth department.
 */
/**
 * ── ONE TABLE, NOT TWO ───────────────────────────────────────────────────────
 * The section names and the filing kinds are the same five departments under
 * two vocabularies — the index says TAKES, a post is a `take`. This used to be
 * a second hardcoded copy of all five hues, which meant the index and the post
 * it indexed could disagree after any edit to one of them. Derived now, so they
 * cannot.
 *
 * ALL is deliberately colourless — it is not a department, it is the absence of
 * a filter, and giving it a hue would imply a sixth.
 */
export const SECTION_COLOR: Record<string, string> = {
  ALL: colors.parchment,
  TAKES: KIND_RULE.take,
  SEEKING: KIND_RULE.seeking,
  WIRE: KIND_RULE.wire,
  BALLOTS: KIND_RULE.ballot,
  DOSSIER: KIND_RULE.dossier,
};

/** `12` · `1.2K` · `1M` — and nothing at all at zero, which is the point. */
/**
 * `25000` → `25,000`. A grouped number, not an abbreviated one.
 *
 * ── WHY NOT `toLocaleString()` ──────────────────────────────────────────────
 * Three places in the Dispatch called it, and every one of them was right in
 * every test and wrong on every phone. Node has a full Intl, so a test sees
 * `25,000`. Hermes ships without one and this app carries no polyfill, so
 * `Number.prototype.toLocaleString` falls back to `toString` and the separator
 * simply does not appear — no error, no warning, nothing to notice. The word
 * count under a dossier read `24310`.
 *
 * It is the same trap `dayLabel.ts` was written to avoid, and it caught the
 * numbers after the dates because nothing had looked at the numbers.
 *
 * Grouped by hand rather than by regex: a lookahead like `\B(?=(\d{3})+(?!\d))`
 * is the usual one-liner and it also groups the digits after a decimal point.
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

export const formatCount = (n: number): string | null => {
  if (!n || n < 1) return null;
  if (n < COUNT_EXACT_BELOW) return String(n);
  if (n < 1_000_000) {
    const k = n / 1000;
    return `${k < 10 ? k.toFixed(1).replace(/\.0$/, '') : Math.round(k)}K`;
  }
  const m = n / 1_000_000;
  return `${m < 10 ? m.toFixed(1).replace(/\.0$/, '') : Math.round(m)}M`;
};
