/**
 * HTML stripping and entity decoding utilities for display text.
 * T3-16: Extracted from duplicate declarations in FilmDetailLayout.tsx and FilmReviews.tsx.
 * T4-1: Upgraded with robust entity decoding (handles named entities, decimal/hex codes,
 *        nested tags, and script/style content stripping).
 *
 * NOT suitable for sanitizing untrusted input for XSS — this is display-only stripping.
 * For input sanitization, use sanitizeInput.ts.
 */

// ── Named HTML entities (most common ones in TMDB/review text) ──
const ENTITY_MAP: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>',
  '&quot;': '"', '&apos;': "'", '&#39;': "'",
  '&nbsp;': ' ', '&ndash;': '–', '&mdash;': '—',
  '&lsquo;': '\u2018', '&rsquo;': '\u2019',
  '&ldquo;': '\u201C', '&rdquo;': '\u201D',
  '&hellip;': '…', '&bull;': '•', '&copy;': '©',
  '&reg;': '®', '&trade;': '™', '&times;': '×',
  '&divide;': '÷', '&frac12;': '½', '&frac14;': '¼',
  '&frac34;': '¾', '&deg;': '°', '&euro;': '€',
  '&pound;': '£', '&yen;': '¥', '&cent;': '¢',
};

// ── Precompiled patterns ──
const SCRIPT_STYLE_RE = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi;
const TAG_RE = /<[^>]*>?/gm;
const NAMED_ENTITY_RE = /&[a-zA-Z]+;/g;
const NUMERIC_ENTITY_RE = /&#(\d+);/g;
const HEX_ENTITY_RE = /&#x([0-9a-fA-F]+);/g;
const MULTI_SPACE_RE = /[ \t]{2,}/g;
const MULTI_NEWLINE_RE = /\n{3,}/g;

/**
 * Decode a named HTML entity (e.g., &amp; → &).
 * Falls back to the raw entity if not recognized.
 */
function decodeNamedEntity(entity: string): string {
  return ENTITY_MAP[entity] ?? entity;
}

/**
 * Decode a decimal numeric entity (e.g., &#8217; → ').
 */
function decodeNumericEntity(_match: string, code: string): string {
  const n = parseInt(code, 10);
  return n > 0 && n < 0x10FFFF ? String.fromCodePoint(n) : '';
}

/**
 * Decode a hex numeric entity (e.g., &#x2019; → ').
 */
function decodeHexEntity(_match: string, hex: string): string {
  const n = parseInt(hex, 16);
  return n > 0 && n < 0x10FFFF ? String.fromCodePoint(n) : '';
}

/**
 * Remove HTML tags from a string and decode entities for plain-text display.
 *
 * Processing order:
 * 1. Strip <script> and <style> blocks entirely (content + tags)
 * 2. Strip all remaining HTML tags
 * 3. Decode named entities (&amp; → &)
 * 4. Decode decimal numeric entities (&#8217; → ')
 * 5. Decode hex numeric entities (&#x2019; → ')
 * 6. Normalize whitespace
 */
export function stripHtml(html: string): string {
  if (!html) return '';

  return html
    .replace(SCRIPT_STYLE_RE, '')           // 1. Remove script/style blocks
    .replace(TAG_RE, '')                     // 2. Strip tags
    .replace(NAMED_ENTITY_RE, decodeNamedEntity)  // 3. Named entities
    .replace(NUMERIC_ENTITY_RE, decodeNumericEntity) // 4. Decimal entities
    .replace(HEX_ENTITY_RE, decodeHexEntity)  // 5. Hex entities
    .replace(MULTI_SPACE_RE, ' ')            // 6a. Normalize spaces
    .replace(MULTI_NEWLINE_RE, '\n\n')       // 6b. Normalize newlines
    .trim();
}

/**
 * Decode HTML entities without stripping tags.
 * Useful when you already have tag-free text but need entity decoding.
 */
export function decodeEntities(text: string): string {
  if (!text) return '';
  return text
    .replace(NAMED_ENTITY_RE, decodeNamedEntity)
    .replace(NUMERIC_ENTITY_RE, decodeNumericEntity)
    .replace(HEX_ENTITY_RE, decodeHexEntity);
}
