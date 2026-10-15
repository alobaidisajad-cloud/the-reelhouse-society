/**
 * THE WALL, MEASURED — every size and every choice of layout on the Lobby,
 * worked out from the phone's width, the room between its bars, and the text
 * size the member reads at. Never guessed, never measured after drawing (a
 * second layout pass is a flicker), and the same on iOS and Android.
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO RULES THE WALL KEEPS
 *
 *   A LINE OF THE HOUSE'S OWN WORDS IS ONE LINE. It grows with the member's text
 *   size until its room is full and no further (`ceilingFor` → the line's
 *   maxFontSizeMultiplier). Where even its normal size would not fit, the layout
 *   gives way instead: a phrase in a half bill breaks between its words into
 *   lines of its own (`setLines`), a banner's door drops under its words
 *   (`planWall`). Nothing wraps, is cut, or shrinks below the size it was set at.
 *
 *   A NAME THAT MUST BE WHOLE STEPS DOWN BEFORE IT IS CUT. A film's name on its
 *   one-sheet, a stack's name on its bill: the size steps down, half a point at a
 *   time, to a floor; only a name longer than its lines can hold at the floor
 *   ends in … (`wholeSize`). On a half bill no word of it is broken mid-letter:
 *   it grows only as far as its longest word fits its line (`wholeName`).
 *
 * Widths come from the app's own font files (faceAdvances.ts), letter by
 * letter. Letter spacing is added as written: it does not grow with the text
 * size on either platform (the Text wrapper's androidTracking draws Android's
 * as iOS does). A 2% allowance for kerning keeps a near miss from passing.
 */
import {
  RYE, RYE_WIDEST, ELITE, ELITE_WIDEST, COURIER_ITALIC, COURIER_ITALIC_WIDEST, SPECTRAL_ITALIC, SPECTRAL_ITALIC_WIDEST,
} from '@/src/theme/faceAdvances';
import { TYPE_FLOOR } from '@/src/constants/textScaling';
import { FILINGS_BILL, KEEP_OFF, LOG_BILL, RANK_BILL, STACK_BILL, STATES, rankTicket } from './words';

export type Face = 'rye' | 'elite' | 'courierItalic' | 'spectralItalic';

const TABLES: Record<Face, readonly [Readonly<Record<string, number>>, number]> = {
  rye: [RYE, RYE_WIDEST],
  elite: [ELITE, ELITE_WIDEST],
  courierItalic: [COURIER_ITALIC, COURIER_ITALIC_WIDEST],
  spectralItalic: [SPECTRAL_ITALIC, SPECTRAL_ITALIC_WIDEST],
};

/** The house's ceiling on text size (the Text wrapper's default). A Lobby line never grows past it. */
export const HOUSE_CEILING = 1.35;
const KERN = 1.02;

/** A line's width in ems: each letter's advance; a letter the face's table lacks is its widest. */
export function emOf(text: string, face: Face): number {
  const [table, widest] = TABLES[face];
  let em = 0;
  for (const ch of text) em += table[ch] ?? widest;
  return em;
}

const letters = (text: string) => [...text].length;

/** A line's drawn width at `size`, at the member's text `scale`, with its letter spacing as written. */
export function lineWidth(text: string, face: Face, size: number, scale = 1, spacing = 0): number {
  return emOf(text, face) * size * scale * KERN + spacing * letters(text);
}

/** Does the line fit its room at the member's text size? */
export function fitsAt(text: string, face: Face, size: number, spacing: number, room: number, scale: number): boolean {
  return lineWidth(text, face, size, Math.min(scale, HOUSE_CEILING), spacing) <= room + 0.5;
}

/**
 * The line's maxFontSizeMultiplier: as far as its room lets it grow, between
 * its own size (1) and the house's ceiling. A line that does not fit at 1 gets
 * 1 — and its layout must give way (the caller asks `fitsAt` for that).
 */
export function ceilingFor(text: string, face: Face, size: number, spacing: number, room: number): number {
  const drawn = emOf(text, face) * size * KERN;
  const spaced = spacing * letters(text);
  if (drawn <= 0) return HOUSE_CEILING;
  const most = (room - spaced) / drawn;
  return Math.max(1, Math.min(HOUSE_CEILING, Math.floor(most * 100) / 100));
}

/** How many lines `text` takes at a width: words kept whole where they fit, a word wider than a line broken across lines. */
export function linesAt(text: string, face: Face, size: number, scale: number, spacing: number, width: number): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  const space = lineWidth(' ', face, size, scale, spacing);
  let lines = 1;
  let used = 0;
  for (const word of words) {
    const w = lineWidth(word, face, size, scale, spacing);
    if (w > width) {
      // a word longer than a whole line breaks across lines of its own
      if (used > 0) lines++;
      lines += Math.ceil(w / width) - 1;
      used = w - (Math.ceil(w / width) - 1) * width;
      continue;
    }
    if (used === 0) used = w;
    else if (used + space + w <= width) used += space + w;
    else { lines++; used = w; }
  }
  return lines;
}

/**
 * The largest size, from `size` down to `floor` by half points, at which a name
 * fits whole in `maxLines` at this width. `whole: false` means it does not fit
 * even at the floor: it is set at the floor, and its last line ends in ….
 */
export function wholeSize(
  text: string, face: Face, size: number, floor: number, maxLines: number, width: number, scale: number, spacing = 0,
): { size: number; whole: boolean } {
  const drawn = Math.min(scale, HOUSE_CEILING);
  for (let s = size; s >= floor - 1e-9; s -= 0.5) {
    if (linesAt(text, face, s, drawn, spacing, width) <= maxLines) return { size: s, whole: true };
  }
  return { size: floor, whole: false };
}

/**
 * `wholeSize` for a name on a half bill, where a line is narrow enough that one
 * long word could be wider than it. At each size the name grows only as far as
 * its longest word fits a line (`cap`, its maxFontSizeMultiplier), so no word is
 * ever broken mid-letter; the size steps down until the name fits `maxLines`.
 * A word too wide for a line even at the floor takes the size below it, as far
 * as the type floor, to the first size it fits at.
 */
export function wholeName(
  text: string, face: Face, size: number, floor: number, maxLines: number, width: number, scale: number, spacing = 0,
): { size: number; whole: boolean; cap: number } {
  const s = Math.min(scale, HOUSE_CEILING);
  const words = text.trim().split(/\s+/).filter(Boolean);
  const wordsFit = (at: number) => words.every((w) => lineWidth(w, face, at, 1, spacing) <= width + 0.5);
  const capAt = (at: number) => Math.max(1, Math.min(s, ...words.map((w) => ceilingFor(w, face, at, spacing, width))));
  let lowest = floor;
  while (lowest - 0.5 >= TYPE_FLOOR - 1e-9 && !wordsFit(lowest)) lowest -= 0.5;
  for (let at = size; at >= lowest - 1e-9; at -= 0.5) {
    if (!wordsFit(at)) continue;
    const cap = capAt(at);
    if (linesAt(text, face, at, cap, spacing, width) <= maxLines) return { size: at, whole: true, cap };
  }
  return { size: lowest, whole: false, cap: capAt(lowest) };
}

/**
 * The narrowest width at which `text` still takes the lines it takes at `width`:
 * the box a short quote is set in, so its lines come out even and its last is
 * never one word alone (React Native has no text-wrap: balance).
 */
export function balancedWidth(text: string, face: Face, size: number, scale: number, width: number): number {
  const drawn = Math.min(scale, HOUSE_CEILING);
  const lines = linesAt(text, face, size, drawn, 0, width);
  if (lines <= 1) return width;
  let lo = width / 2;
  let hi = width;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (linesAt(text, face, size, drawn, 0, mid) <= lines) hi = mid; else lo = mid;
  }
  return Math.min(width, Math.ceil(hi) + 2);
}

// ── THE WALL'S GEOMETRY ─────────────────────────────────────────────────────
// Every number here is a style the bills are built from: a copy anywhere else
// would let the arithmetic describe a wall that is not the one on screen.
export const WALL = {
  gutter: 14,       // the wall's own margin, each side
  widest: 560,      // on a tablet the wall stands as one centred column this wide
  gap: 10,          // between bills
  rim: 3,           // the brass case round the one-sheet
  besideCase: 8,    // between the case and the bill column
  halfPad: 12,      // a half bill's inset
  halfDoorPad: 12,  // a vacant half's door: its inset, each side, inside its 1pt border
  fanEdge: 10,      // the stack's fan stands at least this far in from its half's edges
  filmThumb: 40,    // the log's film: its poster's width
  filmGap: 10,      // between the poster and the film's name
  factsGap: 6,      // between the stack's count and SEE ALL, on one line
  slabPadX: 9,      // a slab's inset, each side
  creditInset: 2,   // a credit strip's second line (the mark, an admin's switch) stands in this far
  filingPad: 14,    // a filing's inset
  filingNum: 22,    // a filing's number column
  filingNumGap: 10, // between the number and the words
  bylineInset: 2,   // a filing's byline stands in this far past the inset
  ticketStub: 16,   // a ticket's torn stub
  ticketPad: 10,    // a ticket's inset
  ticketGap: 8,     // between two tickets, beside or above one another
  recruitMargin: 5, // the slanted banner stands in from the wall
  recruitPad: 14,
  recruitEye: 44,
  recruitGap: 12,
  bannerPad: 14,
  bannerGap: 10,
  doorPadX: 10,     // a bordered door's inset, each side
  refreshGap: 10,   // a failed refresh: between its words and TRY AGAIN
  refreshDoorPad: 4, // TRY AGAIN's inset, each side
} as const;

/** Type the bills are set in: face, size, letter spacing. */
export const TYPE = {
  kick: { face: 'elite', size: 10, spacing: 6 },
  mastName: { face: 'rye', size: 40, spacing: 0 },
  dateline: { face: 'elite', size: 10, spacing: 1.6 },
  whisper: { face: 'courierItalic', size: 11, spacing: 0 },
  tagline: { face: 'elite', size: 10, spacing: 1.6 },
  billing: { face: 'elite', size: 10, spacing: 1.6 },
  now: { face: 'elite', size: 10, spacing: 4 },
  billHead: { face: 'elite', size: 10, spacing: 1 },
  cta: { face: 'elite', size: 10, spacing: 2 },
  slab: { face: 'rye', size: 17, spacing: 0 },
  slogan: { face: 'elite', size: 10, spacing: 1.6 },
  vacant: { face: 'spectralItalic', size: 16, spacing: 0 },
  vacantFiling: { face: 'spectralItalic', size: 14, spacing: 0 },
  filmLine: { face: 'elite', size: 10, spacing: 1.2 },
  stackName: { face: 'rye', size: 18, spacing: 0 },
  stackFacts: { face: 'elite', size: 10, spacing: 1.2 },
  bannerKick: { face: 'elite', size: 10, spacing: 2.4 },
  bannerName: { face: 'rye', size: 22, spacing: 0 },
  kind: { face: 'elite', size: 10, spacing: 2 },
  recruitName: { face: 'rye', size: 24, spacing: 0 },
  recruitSub: { face: 'courierItalic', size: 11.5, spacing: 0 },
  ticketKick: { face: 'elite', size: 10, spacing: 2 },
  ticketName: { face: 'rye', size: 18, spacing: 0 },
  ticketLine: { face: 'courierItalic', size: 11.5, spacing: 0 },
  ticketDoor: { face: 'elite', size: 10, spacing: 1.4 },
  fine: { face: 'elite', size: 10, spacing: 1.2 },
  refresh: { face: 'courierItalic', size: 11, spacing: 0 },
  darkName: { face: 'rye', size: 20, spacing: 0 },
  darkSub: { face: 'courierItalic', size: 11, spacing: 0 },
  signoff: { face: 'courierItalic', size: 11, spacing: 0 },
} as const satisfies Record<string, { face: Face; size: number; spacing: number }>;

export type TypeKey = keyof typeof TYPE;

const fits = (key: TypeKey, text: string, room: number, scale: number) =>
  fitsAt(text, TYPE[key].face, TYPE[key].size, TYPE[key].spacing, room, scale);
const width = (key: TypeKey, text: string, scale: number) =>
  lineWidth(text, TYPE[key].face, TYPE[key].size, Math.min(scale, HOUSE_CEILING), TYPE[key].spacing);

/** A line's room-limited ceiling, for a Text of this type. */
export const ceilingOf = (key: TypeKey, text: string, room: number) =>
  ceilingFor(text, TYPE[key].face, TYPE[key].size, TYPE[key].spacing, room);

/** Every way to set `words` in `count` lines, in order. */
function* splitsOf(words: readonly string[], count: number): Generator<string[]> {
  if (count === 1) { yield [words.join(' ')]; return; }
  for (let i = 1; i <= words.length - count + 1; i++) {
    for (const rest of splitsOf(words.slice(i), count - 1)) yield [words.slice(0, i).join(' '), ...rest];
  }
}

/**
 * A phrase of the house's words, set in as few lines as hold it at the member's
 * text size: broken only between words, and as evenly as it can be (its widest
 * line as narrow as it can be). A › stays with the word before it. A word wider
 * than the room takes a line of its own, and grows only as far as its room.
 * A phrase that fits is one line, as written.
 */
export function setLines(text: string, key: TypeKey, room: number, scale: number): string[] {
  const words: string[] = [];
  for (const w of text.split(' ').filter(Boolean)) {
    if (w === '›' && words.length) words[words.length - 1] += ' ›';
    else words.push(w);
  }
  const holds = (line: string) => fits(key, line, room, scale) || !line.includes(' ');
  for (let count = 1; count <= words.length; count++) {
    let best: string[] | null = null;
    let widest = Infinity;
    for (const lines of splitsOf(words, count)) {
      if (!lines.every(holds)) continue;
      const w = Math.max(...lines.map((l) => width(key, l, scale)));
      if (w < widest) { best = lines; widest = w; }
    }
    if (best) return best;
  }
  return [text];
}

/** Each line of a block set by `setLines`, in order. */
export const setBlock = (lines: readonly string[], key: TypeKey, room: number, scale: number) =>
  lines.flatMap((line) => setLines(line, key, room, scale));

/** The height the masthead takes: its four lines' set heights, and the gaps between. */
export const MAST_LINES = { kick: 14, name: 44, dateline: 14, whisper: 16 } as const;
export const MAST_GAPS = { afterKick: 4, afterName: 8, afterDateline: 6, foot: 6 } as const;
const MAST_H = Object.values(MAST_LINES).reduce((a, b) => a + b, 0) + Object.values(MAST_GAPS).reduce((a, b) => a + b, 0);

/** The bill column's head: three lines at this set height. */
export const BILL_HEAD_LINE = 13.5;
/** ALL › — 48 tall, past the 48pt line under which PressableScale adds a halo that would reach the poster above. */
export const BILL_ALL_H = 48;
export const BILL_GAP = 6;

export interface WallPlan {
  wallW: number;
  /** the bill column beside the one-sheet */
  col: number;
  sheetW: number;
  sheetH: number;
  billCount: number;
  /** the one-sheet's title, at the size it is whole */
  titleSize: (title: string) => { size: number; whole: boolean };
  /** the Featured Log and the Featured Stack: side by side on every phone, each set to its half */
  pair: PairPlan;
  /** the second and third filings side by side */
  runners: boolean;
  /** the two rank tickets side by side */
  tickets: boolean;
  /** the Featured Filings banner: its door under its name */
  bannerStacked: boolean;
  /** the banner's name and kick: the whole banner when stacked, else what its door leaves */
  bannerWordsRoom: number;
  /** the banner door's words */
  bannerDoorRoom: number;
  /** Take Your Rank: its eye above its words */
  recruitStacked: boolean;
  /** a failed refresh: TRY AGAIN under its words */
  refreshStacked: boolean;
  /** its words: the whole strip when stacked, else what TRY AGAIN leaves */
  refreshWordsRoom: number;
  /** TRY AGAIN's words */
  refreshDoorRoom: number;
  /** an admin's KEEP OFF THE LOBBY, on its own line: on a credit strip, under the lead filing, under a runner */
  switchRoom: { credit: number; lead: number; runner: number };
}

/** A half bill's own words, each phrase in the lines `setLines` sets it in at the member's size. */
export interface HalfWords {
  slogan: string[];
  vacant: string[];
  /** the vacant bill's door */
  door: string[];
}

export interface PairPlan {
  /** a half's width: the wall, less the gap between the two, halved */
  width: number;
  /** the width a half sets its words in */
  room: number;
  /** a slab's words, inside its own inset */
  slabRoom: number;
  /** a vacant half's door: its words' width */
  doorRoom: number;
  log: HalfWords;
  stack: HalfWords;
  /** the stack's count and SEE ALL: one above the other where they cannot share a line */
  factsStacked: boolean;
  /** SEE ALL's room: beside the widest count, or the whole line */
  seeAllRoom: number;
  /** the most lines a quote is set in before it ends in … */
  quoteLines: number;
  /** an admin's KEEP OFF THE LOBBY on a half's credit strip, in its lines */
  keepOff: string[];
}

export interface WallRoom {
  /** the window's width */
  width: number;
  /** the height between the top bar and the tab bar */
  visible: number;
  /** the member's text size, capped at the house's ceiling (useTextScale) */
  scale: number;
  /** how much a SET line height grows (useLineScale): on Android past the ceiling */
  lineScale: number;
  /** an admin: the wall also holds their KEEP OFF THE LOBBY switches */
  admin?: boolean;
}

const clamp = (lo: number, hi: number, v: number) => Math.max(lo, Math.min(hi, v));

export function planWall({ width: windowW, visible, scale, lineScale, admin = false }: WallRoom): WallPlan {
  const s = Math.min(scale, HOUSE_CEILING);
  const wallW = Math.min(windowW - WALL.gutter * 2, WALL.widest);

  // THE ONE-SHEET. Its bill column is sized so four posters stand beside a 2:3
  // sheet; the sheet is a poster's 2:3 where the first screen allows it, and
  // never taller than the room left under the masthead (so the bills below
  // start to show at the foot of the first screen).
  const col = Math.round(clamp(54, 80, (1.5 * wallW - 58) / 7.5));
  const sheetW = wallW - col - WALL.besideCase - WALL.rim * 2;
  const mastH = MAST_H * lineScale;
  const sheetH = Math.round(clamp(260, sheetW * 1.5, visible - 12 - mastH - 26));
  const head = 3 * BILL_HEAD_LINE * lineScale + 2;
  const billCount = clamp(2, 4, Math.round((sheetH + WALL.rim * 2 - head - BILL_ALL_H - BILL_GAP) / (col * 1.5 + BILL_GAP)));
  const titleBase = sheetW >= 270 ? 32 : 26;
  const titleRoom = sheetW - 24;
  const titleSize = (title: string) => {
    const start = title.length <= 14 ? titleBase : title.length <= 24 ? titleBase - 6 : titleBase - 10;
    return wholeSize(title, 'rye', start, 16, 5, titleRoom, s);
  };

  // THE PAIR stands side by side on every phone, at every text size. Each half
  // sets its own words to its width at the member's size: a phrase too wide for
  // a line breaks between its words (the slogan, a vacant door, an admin's
  // switch); the stack's count and SEE ALL stand one above the other; a quote
  // is given more lines in a narrower half, so its excerpt holds as many words.
  const half = (wallW - WALL.gap) / 2;
  const halfRoom = half - WALL.halfPad * 2;
  const doorRoom = halfRoom - WALL.halfDoorPad * 2 - 2;
  const halfWords = (bill: typeof LOG_BILL | typeof STACK_BILL): HalfWords => ({
    slogan: setBlock(bill.slogan.map((t) => t.toUpperCase()), 'slogan', halfRoom, s),
    vacant: setBlock(bill.vacant, 'vacant', halfRoom, s),
    door: setLines(bill.vacantDoor, 'cta', doorRoom, s),
  });
  const filmsW = width('stackFacts', STACK_BILL.films(999), s);
  const factsStacked = filmsW + WALL.factsGap + width('stackFacts', STACK_BILL.seeAll, s) > halfRoom;
  const pair: PairPlan = {
    width: half,
    room: halfRoom,
    slabRoom: halfRoom - WALL.slabPadX * 2,
    doorRoom,
    log: halfWords(LOG_BILL),
    stack: halfWords(STACK_BILL),
    factsStacked,
    seeAllRoom: factsStacked ? halfRoom : halfRoom - WALL.factsGap - filmsW,
    // six lines in a half of 150 or more, as many more as keep the excerpt's words
    quoteLines: Math.max(6, Math.ceil((6 * 150) / halfRoom)),
    keepOff: setLines(KEEP_OFF, 'cta', halfRoom - WALL.creditInset, s),
  };

  // The runners: the second and third filings in two columns, where a column
  // holds its kind's name at the member's size — and an admin's switch under it.
  // A byline row stands inside the bill's border; the second column also inside its rule.
  const runnerRoom = (wallW - 2) / 2 - WALL.filingPad * 2;
  const runnerByline = (wallW - 2) / 2 - 1 - WALL.filingPad * 2 - WALL.bylineInset;
  const runners = runnerRoom >= 130 * s
    && ['✦ SEEKING', '✦ BALLOT', '✦ ESSAY · 99 MIN'].every((t) => fits('kind', t, runnerRoom, s))
    && (!admin || fits('cta', KEEP_OFF, runnerByline, s));
  const fullByline = wallW - 2 - WALL.filingPad * 2 - WALL.bylineInset;
  const switchRoom = {
    credit: halfRoom - WALL.creditInset,
    lead: fullByline - WALL.filingNum - WALL.filingNumGap,
    runner: runners ? runnerByline : fullByline,
  };

  // The tickets, where each holds its rank's name, its two lines and its door.
  const ticketRoom = (wallW - WALL.ticketGap) / 2 - 2 - WALL.ticketStub - WALL.ticketPad * 2;
  const tickets = (['archivist', 'auteur'] as const).every((r) => {
    const t = rankTicket(r);
    return fits('ticketName', t.name, ticketRoom, s)
      && t.lines.every((l) => fits('ticketLine', l, ticketRoom, s))
      && width('ticketDoor', RANK_BILL.privileges, s) + 12 <= ticketRoom
      && fits('ticketKick', RANK_BILL.enlistAs, ticketRoom, s);
  });

  // The banner's door drops under its name when the two cannot share a line.
  const bannerRoom = wallW - 2 - WALL.bannerPad * 2;
  const doorW = width('cta', FILINGS_BILL.door, s) + WALL.doorPadX * 2 + 2;
  const bannerWords = Math.max(width('bannerKick', FILINGS_BILL.kick, s), width('bannerName', FILINGS_BILL.name, s));
  const bannerStacked = bannerWords + WALL.bannerGap + doorW > bannerRoom;
  // each is given the room it truly has: the whole banner when stacked, else what the other leaves
  const bannerWordsRoom = bannerStacked ? bannerRoom : bannerRoom - WALL.bannerGap - doorW;
  const bannerDoorRoom = bannerStacked ? bannerRoom - WALL.doorPadX * 2 - 2 : doorW - WALL.doorPadX * 2 - 2;

  // Take Your Rank: the eye stands above the words when they cannot share a line.
  const recruitRoom = wallW - WALL.recruitMargin * 2 - WALL.recruitPad * 2 - WALL.recruitEye - WALL.recruitGap;
  const recruitStacked = ![RANK_BILL.name, ...RANK_BILL.thanks].every((t) => fits('recruitName', t, recruitRoom, s))
    || ![...RANK_BILL.sub, ...RANK_BILL.subArchivist, ...RANK_BILL.thanksSub].every((t) => fits('recruitSub', t, recruitRoom, s));

  // A failed refresh: TRY AGAIN drops under its words when they cannot share a line.
  const refreshRoom = wallW - 2 - 24;
  const refreshWords = Math.max(...STATES.refreshFailed.map((t) => width('refresh', t, s)));
  const refreshDoorW = width('cta', STATES.tryAgain, s) + WALL.refreshDoorPad * 2;
  const refreshStacked = refreshWords + WALL.refreshGap + refreshDoorW > refreshRoom;
  const refreshWordsRoom = refreshStacked ? refreshRoom : refreshRoom - WALL.refreshGap - refreshDoorW;
  const refreshDoorRoom = (refreshStacked ? refreshRoom : refreshDoorW) - WALL.refreshDoorPad * 2;

  return {
    wallW, col, sheetW, sheetH, billCount, titleSize, pair, runners, tickets,
    bannerStacked, bannerWordsRoom, bannerDoorRoom, recruitStacked, refreshStacked, refreshWordsRoom, refreshDoorRoom,
    switchRoom,
  };
}

/**
 * The film under a featured log. Its name stands beside its poster where it is
 * whole there in two lines at the member's size, else under it, across the
 * half, in up to three. Its reels stand beside the poster where they fit there,
 * else under the poster and the name.
 */
export function filmLine(title: string, room: number, scale: number, reelsW: number) {
  const t = TYPE.filmLine;
  const text = LOG_BILL.on(title);
  const meta = room - WALL.filmThumb - WALL.filmGap;
  const reelsBeside = reelsW <= meta;
  const there = wholeName(text, t.face, t.size, t.size, 2, meta, scale, t.spacing);
  if (there.whole && there.cap >= Math.min(scale, HOUSE_CEILING)) return { ...there, beside: true, reelsBeside, lines: 2 };
  return { ...wholeName(text, t.face, t.size, t.size, 3, room, scale, t.spacing), beside: false, reelsBeside, lines: 3 };
}

/** A name on a half: four lines in a half of 150 or more, as many more as keep its words. */
export const nameLines = (room: number) => Math.max(4, Math.ceil((4 * 150) / room));

/** A critique's quote is set larger the shorter it is. */
export const quoteSize = (length: number) => (length <= 40 ? 19 : length <= 90 ? 16.5 : 15);
