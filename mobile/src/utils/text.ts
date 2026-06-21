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
export function stripHTML(html: string): string {
    if (!html) return '';
    return html
        .replace(/<\/?(p|div|br)(?:\s+[^>]*|)\/?>/gi, '\n')
        .replace(/<\/?(strong|em|b|i|u|span|h[1-6]|ul|li|ol|a)(?:\s+[^>]*|)\/?>/gi, '')
        .trim();
}
