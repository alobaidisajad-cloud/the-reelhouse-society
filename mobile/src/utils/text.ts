/**
 * text.ts - High-performance text utility engine.
 */
import { GRAPHEME_RUNS } from './graphemeTable';

const between = (cp: number, lo: number, hi: number) => cp >= lo && cp <= hi;

// The break classes, numbered as GRAPHEME_CLASSES lists them.
const CR = 1, LF = 2, CONTROL = 3, EXTEND = 4, ZWJ = 5, RI = 6, PREPEND = 7, SPACING_MARK = 8,
  L = 9, V = 10, T = 11, LV = 12, LVT = 13, PICTOGRAPH = 14, CONSONANT = 15, LINKER = 16, EXTEND_ONLY = 17;

/** The table, unpacked once on first use: where each run starts, and its class. */
let runStarts: Int32Array | null = null;
let runClasses: Uint8Array | null = null;
function unpack(): void {
  const starts: number[] = [];
  const classes: number[] = [];
  let at = 0;
  let digits = '';
  for (let i = 0; i < GRAPHEME_RUNS.length; i += 1) {
    const c = GRAPHEME_RUNS.charCodeAt(i);
    if (c >= 65 && c <= 90) { // a class letter closes the run
      at += parseInt(digits, 36);
      starts.push(at);
      classes.push(c - 65);
      digits = '';
    } else digits += GRAPHEME_RUNS[i];
  }
  runStarts = Int32Array.from(starts);
  runClasses = Uint8Array.from(classes);
}

/** A code point's grapheme break class (UAX #29), from the table. */
function classOf(cp: number): number {
  if (cp < 0x7f) return cp === 0x0d ? CR : cp === 0x0a ? LF : cp < 0x20 ? CONTROL : 0; // the common case, without a search
  if (!runStarts) unpack();
  const starts = runStarts as Int32Array;
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= cp) lo = mid; else hi = mid - 1;
  }
  return (runClasses as Uint8Array)[lo];
}

const extends_ = (k: number) => k === EXTEND || k === LINKER || k === EXTEND_ONLY;

const isHigh = (c: number) => c >= 0xd800 && c <= 0xdbff;
const isLow = (c: number) => c >= 0xdc00 && c <= 0xdfff;

/** The code point that ends just before `i`, and where it starts. */
function before(text: string, i: number): [number, number] {
  const start = i >= 2 && isLow(text.charCodeAt(i - 1)) && isHigh(text.charCodeAt(i - 2)) ? i - 2 : i - 1;
  return [text.codePointAt(start) ?? 0, start];
}

/**
 * Whether a cut at UTF-16 index `i` leaves every character whole: Unicode's
 * grapheme rules (UAX #29), in its order. No cut falls in front of a mark, a
 * vowel sign, a joiner or what it joins, a skin tone, a flag's second half, a
 * Korean syllable's later parts, or the consonant an Indic virama joins — 👍🏽
 * cut there is a thumb and a swatch, and ज़ without its dot is ज, another letter.
 */
// What two neighbouring classes say on their own, or which longer rule decides.
const JOINS = 0, PARTS = 1, CONJUNCT = 2, EMOJI_SEQUENCE = 3, FLAG = 4;
function pairRule(a: number, b: number): number {
  if (a === CR && b === LF) return JOINS; // GB3
  if (a === CR || a === LF || a === CONTROL || b === CR || b === LF || b === CONTROL) return PARTS; // GB4, GB5
  if (a === L && (b === L || b === V || b === LV || b === LVT)) return JOINS; // GB6
  if ((a === LV || a === V) && (b === V || b === T)) return JOINS; // GB7
  if ((a === LVT || a === T) && b === T) return JOINS; // GB8
  if (extends_(b) || b === ZWJ || b === SPACING_MARK) return JOINS; // GB9, GB9a
  if (a === PREPEND) return JOINS; // GB9b
  if (b === CONSONANT && (a === EXTEND || a === LINKER || a === ZWJ)) return CONJUNCT; // GB9c
  if (a === ZWJ && b === PICTOGRAPH) return EMOJI_SEQUENCE; // GB11
  if (a === RI && b === RI) return FLAG; // GB12, GB13
  return PARTS; // GB999
}

/**
 * `from`, when given, is a place at or before `i` where the flag count may stop:
 * a boundary, or the end of a character that is no flag half (a space). A
 * caller asking at many places in one long word passes the word's start, so a
 * page of flags is not counted back from every place.
 */
export function isCharacterBoundary(text: string, i: number, from = 0): boolean {
  if (i <= 0 || i >= text.length) return true;
  if (isLow(text.charCodeAt(i)) && isHigh(text.charCodeAt(i - 1))) return false;
  const [prev, prevAt] = before(text, i);
  const rule = pairRule(classOf(prev), classOf(text.codePointAt(i) ?? 0));
  if (rule === JOINS) return false;
  if (rule === PARTS) return true;
  if (rule === CONJUNCT) { // a consonant, a virama, a consonant
    let linked = false;
    for (let j = i; j > 0;) {
      const [p, start] = before(text, j);
      const k = classOf(p);
      if (k === LINKER) linked = true;
      else if (k !== EXTEND && k !== ZWJ) return !(k === CONSONANT && linked);
      j = start;
    }
    return true;
  }
  if (rule === EMOJI_SEQUENCE) { // a picture, its extenders, a joiner, a picture
    for (let j = prevAt; j > 0;) {
      const [p, start] = before(text, j);
      const k = classOf(p);
      if (!extends_(k)) return k !== PICTOGRAPH;
      j = start;
    }
    return true;
  }
  // A flag is two halves: in a run of them, only an even count is a seam.
  let halves = 0;
  for (let j = i; j > from;) {
    const [p, start] = before(text, j);
    if (classOf(p) !== RI) break;
    halves += 1;
    j = start;
  }
  return halves % 2 === 0;
}

/**
 * Where the character that starts at `start` (itself a boundary) ends. It reads
 * forward and carries what the longer rules need — whether a conjunct is open,
 * an emoji sequence, how many flag halves — so walking a text character by
 * character costs its length once. Asking isCharacterBoundary at every place
 * instead counts a run of flags back from each: a page of flags, squared.
 */
export function characterEnd(text: string, start: number): number {
  if (start >= text.length) return text.length;
  let cp = text.codePointAt(start) ?? 0;
  let a = classOf(cp);
  let i = start + (cp > 0xffff ? 2 : 1);
  let consonant = a === CONSONANT; // a consonant, then only extenders and joiners so far
  let linked = false; // ...one of which was a virama
  let picture = a === PICTOGRAPH; // a picture, then only extenders so far
  let pictureJoined = false; // ...then a joiner
  let halves = a === RI ? 1 : 0;
  while (i < text.length) {
    cp = text.codePointAt(i) ?? 0;
    const b = classOf(cp);
    const rule = pairRule(a, b);
    const joins = rule === JOINS || (rule === CONJUNCT && consonant && linked)
      || (rule === EMOJI_SEQUENCE && pictureJoined) || (rule === FLAG && halves % 2 === 1);
    if (!joins) break;
    if (b === CONSONANT) { consonant = true; linked = false; } else if (b === LINKER) linked = consonant; else if (b !== EXTEND && b !== ZWJ) { consonant = false; linked = false; }
    pictureJoined = b === ZWJ && picture;
    picture = b === PICTOGRAPH || (picture && extends_(b));
    halves = b === RI ? halves + 1 : 0;
    a = b;
    i += cp > 0xffff ? 2 : 1;
  }
  return i;
}

/** The last place at or before `at` where a cut leaves every character whole. */
export function characterStart(text: string, at: number): number {
  let i = Math.max(0, Math.min(at, text.length));
  while (!isCharacterBoundary(text, i)) i -= 1;
  return i;
}

/** The first character of `text` as a reader counts one, whole; '' for empty text. */
export function firstCharacter(text: string | null | undefined): string {
  const t = text ?? '';
  return t.slice(0, characterEnd(t, 0));
}

/** Georgian's everyday letters: their capitals are an all-capitals style, never an initial. */
const GEORGIAN = (cp: number) => between(cp, 0x10d0, 0x10ff);

/** A character as a capital, where the script has one that stands for it alone. */
function capitalOf(first: string): string {
  if (!first || GEORGIAN(first.codePointAt(0) ?? 0)) return first;
  const upper = first.toUpperCase();
  return Array.from(upper).length === Array.from(first).length ? upper : first;
}

/**
 * A name's letter for a portrait without a photograph: its first character, as
 * a capital where the script has one that stands for it alone ("ß" is "SS" as a
 * capital, two letters, so it keeps its one; Georgian's capitals are an
 * all-capitals style, never an initial). '' when there is no name: a departed
 * member's disc is empty.
 */
export function initialOf(name: string | null | undefined): string {
  return capitalOf(firstCharacter((name ?? '').trim()));
}

/** What may open a review before its first letter: quotes, brackets, a dash, an ellipsis. */
const OPENING = /^[\s"'«»‘’“”„‚‹›()[\]{}¿¡*.…–—-]+/;
/** The most of it that may ride up with the letter: a quote and a bracket, or an ellipsis typed as three dots. */
const MARK_MOST = 3;

/**
 * A review's raised first letter, and the words after it. The letter is the
 * whole first character, as a capital; a short mark the member opened with
 * before it — a quote, a bracket, a dash — rides up with it, so not one mark
 * they typed is lost. An opening that is longer, or holds a space, raises no
 * cap, and neither does text with no letter: `first` is '' and `rest` is all of it. Callers raise no letter from right-to-left text, where
 * the letters join and one lifted out is a different shape.
 */
export function extractDropCap(text: string): { first: string; rest: string } {
  const lead = OPENING.exec(text ?? '')?.[0] ?? '';
  const body = (text ?? '').slice(lead.length);
  const letter = firstCharacter(body);
  const mark = lead.trimStart();
  // Only a mark that touches the letter rides up, and only a short one: a row of
  // dashes or "*** SPOILERS" raised whole is wider than the column beside it.
  if (!letter || mark.length > MARK_MOST || /\s/.test(mark)) return { first: '', rest: text ?? '' };
  return { first: `${mark}${capitalOf(letter)}`, rest: body.slice(letter.length) };
}

/**
 * Does this text read right-to-left?
 *
 * First-strong: the direction of a paragraph is set by its first strong
 * character, which is what every text engine does and what a reader expects.
 * Neutrals — quotes, guillemets, digits, spaces — are skipped, so a review that
 * opens with « or a year still resolves to the language underneath.
 *
 * WHY THIS EXISTS. `writingDirection` is an iOS-only style and the app never
 * set it, so on iPhone an Arabic review inherited the app's own left-to-right
 * base. The visible symptom is a sentence's full stop appearing at the far LEFT
 * of the line, detached from the words it ends.
 *
 * ── AND WHAT THIS COMMENT USED TO GET WRONG ─────────────────────────────────
 * It said "Android resolves this itself", which is true only while the member's
 * own words are the first thing in the paragraph. Android never reads
 * `writingDirection` at all: `ParagraphShadowNode.cpp` takes the paragraph's
 * direction from the VIEW's layout direction (Yoga), and `TextLayoutManager`
 * builds the layout without calling `setTextDirection`, so it falls back to
 * Android's default heuristic — first strong character wins, over the WHOLE
 * concatenated string.
 *
 * The Dispatch prints `TAKE — ` in front of the sentence, inside the same
 * <Text>. So the first strong character is the T, the paragraph goes
 * left-to-right, and an Arabic member sees the kind label stranded at the END of
 * the first line with the full stop thrown to the opposite side. `RTL_MARK`
 * below is the fix and `theParagraphKnowsItsDirection` is the guard.
 *
 * Ranges: Hebrew, Arabic (incl. supplement + extended-A), Syriac/Thaana/N'Ko,
 * and the Arabic presentation forms.
 */
const RTL_STRONG = /[֐-׿؀-޿ࢠ-ࣿיִ-﷿ﹰ-\uFEFF]/;
const LTR_STRONG = /[A-Za-zÀ-ʯͰ-֏]/;

/**
 * U+200F RIGHT-TO-LEFT MARK — invisible, zero width, and STRONGLY right-to-left.
 *
 * Printed as the first thing inside a <Text> whose visible content opens with a
 * Latin label, it is what the first-strong rule lands on, so the paragraph lays
 * out right-to-left on BOTH platforms — which is what iOS already did from
 * `writingDirection` and Android did not do at all.
 *
 * ── WHY A MARK AND NOT AN ISOLATE ───────────────────────────────────────────
 * `LRI … PDI` (U+2066 … U+2069) around the label is the more elegant answer: the
 * first-strong scan skips an isolate's contents, so the member's own words would
 * decide the direction and the same wrapping would serve English bodies too. It
 * is not used here because it depends on the engine implementing that part of
 * UAX#9, which Android's heuristic does only on newer API levels — and there is
 * no device in this project to test the older ones on. The mark depends on one
 * thing instead: that U+200F is strongly RTL, which is true of every text engine
 * ever written.
 *
 * It is printed as its OWN child of the outer <Text>, never concatenated into a
 * label, so `TAKE — ` stays exactly `TAKE — ` for everything that matches on it.
 */
export const RTL_MARK = '\u200F';

export function isRTLText(text: string | null | undefined): boolean {
    if (!text) return false;
    // Only the first 400 characters are inspected: the paragraph's direction is
    // decided long before that, and reviews can be very long.
    const head = text.slice(0, 400);
    const rtl = head.search(RTL_STRONG);
    if (rtl === -1) return false;
    const ltr = head.search(LTR_STRONG);
    return ltr === -1 || rtl < ltr;
}

/**
 * The named entities a review can realistically carry out of the web editor.
 * Anything else is left alone rather than mangled.
 */
const HTML_ENTITIES: Record<string, string> = {
    '&quot;': '"', '&apos;': "'", '&#39;': "'", '&amp;': '&',
    '&lt;': '<', '&gt;': '>', '&nbsp;': ' ',
    '&mdash;': '—', '&ndash;': '–', '&hellip;': '…',
    '&lsquo;': '‘', '&rsquo;': '’', '&ldquo;': '“', '&rdquo;': '”',
};

/**
 * ONE cleaner for a review, wherever it is read.
 *
 * There used to be two: this, and a second inline copy in the feed card. They
 * disagreed three ways, so the same review read differently on its card than on
 * its own page —
 *   · entities: the card decoded seven, this decoded none, so the page showed
 *     a literal `&quot;` where the card showed a quotation mark;
 *   · unknown tags: the card stripped everything, this stripped a whitelist, so
 *     a `<blockquote>` survived as visible text on the page only;
 *   · paragraphs: this mapped opening AND closing block tags to a newline and
 *     the card only opening ones, so only the page could find the breaks.
 *
 * Keeping this one's paragraph handling (it is the correct half) and the card's
 * entity decoding.
 *
 * Tags are matched by NAME, not by "anything between angle brackets". The card
 * used the latter and it quietly ate a member's own words: a review reading
 * `<The Batman> is the best of them` lost its first two words on the card, and
 * would have lost them everywhere once these two merged. So the name must be a
 * real element and must END where the tag's name ends — `<pre>` is a tag,
 * `<president>` is a member writing a sentence.
 *
 * `&amp;` is decoded LAST so that `&amp;lt;` yields `&lt;` rather than `<` —
 * decoding it first would let an escaped entity smuggle a bracket through.
 */
const HTML_TAG = new RegExp(
    '<\\/?(?:' + [
        'p', 'div', 'br', 'hr', 'span', 'section', 'article', 'aside', 'header', 'footer', 'nav', 'main',
        'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'ins', 'mark', 'small', 'big', 'sub', 'sup',
        'h[1-6]', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'a', 'blockquote', 'q', 'cite', 'abbr', 'address',
        'pre', 'code', 'kbd', 'samp', 'var', 'tt', 'font', 'center', 'time', 'wbr', 'bdi', 'bdo',
        'img', 'figure', 'figcaption', 'picture', 'source', 'video', 'audio', 'track', 'iframe', 'embed', 'object',
        'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'col', 'colgroup',
        'details', 'summary', 'ruby', 'rt', 'rp', 'template', 'noscript', 'script', 'style',
        'form', 'input', 'button', 'select', 'option', 'textarea', 'label', 'fieldset', 'legend',
        'meta', 'link', 'html', 'head', 'body', 'title',
    ].join('|') + ')(?=[\\s/>])[^>]*>',
    'gi',
);
const HTML_BLOCK_TAG = /<\/?(?:p|div|br)(?=[\s/>])[^>]*>/gi;

export function stripHTML(html: string): string {
    if (!html) return '';
    const withBreaks = html
        .replace(HTML_BLOCK_TAG, '\n')
        .replace(HTML_TAG, '');
    const decoded = withBreaks.replace(/&(?!amp;)[a-z0-9#]+;/gi, (m) => HTML_ENTITIES[m.toLowerCase()] ?? m);
    return decoded.replace(/&amp;/gi, '&').trim();
}

/**
 * Word-boundary review truncation — single source of truth shared by every
 * share card (Dossier, ShareCardModal, LogShareCard) and matched to the web
 * card, so the same review yields the same truncated text on both platforms.
 */
export function truncateReview(text: string, max = 350): string {
    const raw = String(text || '').trim();
    if (raw.length <= max) return raw;
    const space = raw.lastIndexOf(' ', max);
    const at = space > 40 ? space : max;

    // ── A CUT AT A CODE-UNIT INDEX CAN SPLIT AN EMOJI ───────────────────────
    // `slice` counts UTF-16 units, so cutting at `at` could land inside a
    // character: between a surrogate pair's halves (a replacement mark), or
    // inside a joined emoji or a skin tone. The cut steps back to the start of
    // the character it fell in.
    //
    // It is not the exotic path it looks like. The word-boundary branch above
    // only applies when there IS a space in the first 350 characters — and a
    // review written in Chinese or Japanese has none, so those fall through to
    // the raw index every time. sanitizeInput's cap uses the same step.
    return raw.slice(0, characterStart(raw, at)).trimEnd() + '…';
}
