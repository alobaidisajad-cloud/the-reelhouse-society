/**
 * text.ts - High-performance text utility engine.
 */

const between = (cp: number, lo: number, hi: number) => cp >= lo && cp <= hi;

/** Devanagari to Malayalam share one layout: these offsets in each block are signs, not letters. */
const INDIC = (cp: number) => between(cp, 0x0900, 0x0d7f);
const indicSign = (cp: number) => {
  const at = cp & 0x7f;
  return between(at, 0x00, 0x03) || between(at, 0x3a, 0x3c) || between(at, 0x3e, 0x4f)
    || between(at, 0x51, 0x57) || between(at, 0x62, 0x63);
};
const indicVirama = (cp: number) => INDIC(cp) && (cp & 0x7f) === 0x4d;
const indicConsonant = (cp: number) => INDIC(cp) && (between(cp & 0x7f, 0x15, 0x39) || between(cp & 0x7f, 0x58, 0x5f));

/** A mark written after the letter it sits on. */
const isMark = (cp: number): boolean =>
  between(cp, 0x0300, 0x036f) || between(cp, 0x0483, 0x0489) // accents; Cyrillic marks
  || between(cp, 0x0591, 0x05bd) || cp === 0x05bf || between(cp, 0x05c1, 0x05c2) || between(cp, 0x05c4, 0x05c5) || cp === 0x05c7 // Hebrew points
  || between(cp, 0x0610, 0x061a) || between(cp, 0x064b, 0x065f) || cp === 0x0670 // Arabic marks
  || between(cp, 0x06d6, 0x06dc) || between(cp, 0x06df, 0x06e4) || between(cp, 0x06e7, 0x06e8) || between(cp, 0x06ea, 0x06ed)
  || (INDIC(cp) && indicSign(cp))
  || between(cp, 0x0d81, 0x0d83) || cp === 0x0dca || between(cp, 0x0dcf, 0x0dd4) || cp === 0x0dd6 // Sinhala signs
  || between(cp, 0x0dd8, 0x0ddf) || between(cp, 0x0df2, 0x0df3)
  || cp === 0x0e31 || between(cp, 0x0e34, 0x0e3a) || between(cp, 0x0e47, 0x0e4e) // Thai
  || cp === 0x0eb1 || between(cp, 0x0eb4, 0x0ebc) || between(cp, 0x0ec8, 0x0ece) // Lao
  || between(cp, 0x1ab0, 0x1aff) || between(cp, 0x1dc0, 0x1dff) || between(cp, 0x20d0, 0x20ff) // more accents; keycaps
  || between(cp, 0xfe00, 0xfe0f) || between(cp, 0xfe20, 0xfe2f) // variation selectors; half marks
  || between(cp, 0x1f3fb, 0x1f3ff) // skin tones
  || between(cp, 0xe0020, 0xe007f) || between(cp, 0xe0100, 0xe01ef); // a flag's tags; ideographic variation

const hangulLead = (cp: number) => between(cp, 0x1100, 0x115f);
const hangulVowel = (cp: number) => between(cp, 0x1160, 0x11a7);
const hangulTail = (cp: number) => between(cp, 0x11a8, 0x11ff);
const hangulSyllable = (cp: number) => between(cp, 0xac00, 0xd7a3);

/**
 * A code point drawn as part of the character before it: a joiner or what a
 * joiner joins, a variation selector, a skin tone, an accent or point or vowel
 * sign, a keycap, a flag's tag, the consonant after an Indic virama, the parts
 * of a Korean syllable typed apart. No cut may fall in front of one — 👍🏽 cut
 * there is a thumb and a swatch, 🤷‍♀️ a shrug and a sign, and ज़ without its dot
 * is ज, another letter. Hermes has no Intl.Segmenter, so the rules are written out.
 */
export const joinsThePrevious = (cp: number, prev: number): boolean =>
  prev === 0x200d || cp === 0x200d || cp === 0x200c || isMark(cp)
  || (indicVirama(prev) && indicConsonant(cp))
  || (hangulLead(prev) && (hangulLead(cp) || hangulVowel(cp)))
  || ((hangulVowel(prev) || hangulSyllable(prev)) && (hangulVowel(cp) || hangulTail(cp)))
  || (hangulTail(prev) && hangulTail(cp));

const isHigh = (c: number) => c >= 0xd800 && c <= 0xdbff;
const isLow = (c: number) => c >= 0xdc00 && c <= 0xdfff;
const isFlagHalf = (cp: number) => cp >= 0x1f1e6 && cp <= 0x1f1ff;

/** The code point that ends just before `i`, and where it starts. */
function before(text: string, i: number): [number, number] {
  const start = i >= 2 && isLow(text.charCodeAt(i - 1)) && isHigh(text.charCodeAt(i - 2)) ? i - 2 : i - 1;
  return [text.codePointAt(start) ?? 0, start];
}

/** Whether a cut at UTF-16 index `i` leaves every character whole. */
export function isCharacterBoundary(text: string, i: number): boolean {
  if (i <= 0 || i >= text.length) return true;
  if (isLow(text.charCodeAt(i)) && isHigh(text.charCodeAt(i - 1))) return false;
  const cp = text.codePointAt(i) ?? 0;
  const [prev] = before(text, i);
  if (joinsThePrevious(cp, prev)) return false;
  // A flag is two halves: inside a run of them, only an even count is a seam.
  if (isFlagHalf(cp) && isFlagHalf(prev)) {
    let halves = 0;
    for (let j = i; j > 0;) {
      const [p, start] = before(text, j);
      if (!isFlagHalf(p)) break;
      halves += 1;
      j = start;
    }
    return halves % 2 === 0;
  }
  return true;
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
  let end = Math.min(1, t.length);
  while (end < t.length && !isCharacterBoundary(t, end)) end += 1;
  return t.slice(0, end);
}

/** Georgian's everyday letters: their capitals are an all-capitals style, never an initial. */
const GEORGIAN = (cp: number) => between(cp, 0x10d0, 0x10ff);

/**
 * A name's letter for a portrait without a photograph, or the raised first
 * letter of a review: its first character, as a capital where the script has
 * one that stands for it alone ("ß" is "SS" as a capital, two letters, so it
 * keeps its one). '' when there is no name: a departed member's disc is empty.
 */
export function initialOf(name: string | null | undefined): string {
  const first = firstCharacter((name ?? '').trim());
  if (!first || GEORGIAN(first.codePointAt(0) ?? 0)) return first;
  const upper = first.toUpperCase();
  return Array.from(upper).length === Array.from(first).length ? upper : first;
}

/**
 * Extracts the first grapheme (Unicode-aware character) and the remainder of the text.
 * 
 * @param text The input string to segment.
 * @returns An object containing the first grapheme (`first`) and the remaining text (`rest`).
 */
export function extractDropCap(text: string): { first: string; rest: string } {
    if (!text) return { first: '', rest: '' };

    // 1. Strip leading punctuation to find the true first character
    // We match leading punctuation/whitespace, capture the core text, and ignore the leading garbage.
    const match = text.match(/^([\s"'«»’”\[\(\-\.]*)(.*)$/su);
    const coreText = match ? match[2] : text;

    if (!coreText) return { first: '', rest: '' };

    // The phone's rule, in the tests as on the phone: Hermes has no Intl.Segmenter.
    const first = firstCharacter(coreText);
    const rest = coreText.slice(first.length);

    return { first, rest };
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
