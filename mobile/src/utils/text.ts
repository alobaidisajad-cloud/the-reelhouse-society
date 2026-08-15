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
 * Strips legacy HTML formatting tags from text while preserving structural newlines
 * and ignoring literal user input (e.g., "<The Batman>").
 */
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
 * of the line, detached from the words it ends. Android resolves this itself.
 *
 * Ranges: Hebrew, Arabic (incl. supplement + extended-A), Syriac/Thaana/N'Ko,
 * and the Arabic presentation forms.
 */
const RTL_STRONG = /[֐-׿؀-޿ࢠ-ࣿיִ-﷿ﹰ-﻿]/;
const LTR_STRONG = /[A-Za-zÀ-ʯͰ-֏]/;

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
 * entity decoding and total tag-stripping.
 *
 * `&amp;` is decoded LAST so that `&amp;lt;` yields `&lt;` rather than `<` —
 * decoding it first would let an escaped entity smuggle a bracket through.
 */
export function stripHTML(html: string): string {
    if (!html) return '';
    const withBreaks = html
        .replace(/<\/?(p|div|br)(?:\s+[^>]*|)\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '');
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
    const cut = raw.lastIndexOf(' ', max);
    return raw.slice(0, cut > 40 ? cut : max).trimEnd() + '…';
}
