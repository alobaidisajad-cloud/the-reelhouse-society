/**
 * text.ts - High-performance text utility engine.
 */

/**
 * Extracts the first grapheme (Unicode-aware character) and the remainder of the text.
 * Backed by Intl.Segmenter for O(1) performance with fallback for older JS engines.
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

    let first = '';
    let rest = '';

    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
        const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
        const segments = segmenter.segment(coreText);
        first = segments[Symbol.iterator]().next().value?.segment ?? coreText.charAt(0);
        rest = coreText.slice(first.length);
    } else {
        // high-performance regex fallback for surrogate pairs
        const fallbackMatch = coreText.match(/^./su);
        first = fallbackMatch ? fallbackMatch[0] : coreText.charAt(0);
        rest = coreText.slice(first.length);
    }

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
const RTL_STRONG = /[֐-׿؀-޿ࢠ-ࣿיִ-﷿ﹰ-﻿]/;
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
export const RTL_MARK = '‏';

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
    // `slice` counts UTF-16 units, so cutting at `at` can land BETWEEN the two
    // halves of an astral character and leave a lone high surrogate, which
    // renders as a replacement mark at the end of the excerpt.
    //
    // It is not the exotic path it looks like. The word-boundary branch above
    // only applies when there IS a space in the first 350 characters — and a
    // review written in Chinese or Japanese has none, so those fall through to
    // the raw index every time.
    //
    // sanitizeInput's cleanForStorage carries this same guard, with the note
    // that an unpaired surrogate also makes PostgreSQL refuse the whole
    // request. This is the display-side twin of it.
    const cut = raw.slice(0, at);
    const last = cut.charCodeAt(cut.length - 1);
    const safe = last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;

    return safe.trimEnd() + '…';
}
