/**
 * The opening of an essay, as prose — for the card in the feed.
 * ─────────────────────────────────────────────────────────────────────────────
 * A dossier's `body` is an excerpt of its `full_content`, which the feed card
 * prints. Markup is unwrapped only where it IS markup: `a well-made film (see
 * below)` keeps its hyphen and brackets, and a link keeps its words, not its URL.
 *
 * Deliberately not a markdown parser: it unwraps what members write and leaves
 * the rest as written, since over-matching here edits somebody's sentence.
 */

/** Strip the markup, keep the words. Whitespace collapsed to single spaces. */
export function excerptOf(markdown: string): string {
  let s = markdown;

  // Fenced code and images carry nothing a card can use.
  s = s.replace(/```[\s\S]*?```/g, ' ');
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');

  // A link is its text, never its URL.
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');

  // Line-leading markers only — a heading, a quotation, a bullet, a rule.
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, '');
  s = s.replace(/^\s{0,3}>\s?/gm, '');
  s = s.replace(/^\s{0,3}[-*+]\s+/gm, '');
  s = s.replace(/^\s{0,3}\d+\.\s+/gm, '');
  s = s.replace(/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/gm, ' ');

  // Emphasis, in pairs. Unpaired characters are left alone: a lone asterisk in
  // an essay is a lone asterisk, and removing it would be editing the member.
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1');
  s = s.replace(/__([^_]+)__/g, '$1');
  s = s.replace(/\*([^*\n]+)\*/g, '$1');
  // `_` only at a word boundary, so `snake_case_name` survives intact.
  s = s.replace(/(^|\s)_([^_\n]+)_(?=$|\s|[.,;:!?])/g, '$1$2');
  s = s.replace(/`([^`\n]+)`/g, '$1');

  return s.replace(/\s+/g, ' ').trim();
}

/** 150 is the card's (two or three lines); the database's `excerpt_ceiling` allows 500. */
export const EXCERPT_CHARS = 150;

/** The excerpt as it is stored: unwrapped, cut on a word, and marked if cut. */
export function excerptFor(markdown: string, limit: number = EXCERPT_CHARS): string {
  const prose = excerptOf(markdown);
  if (prose.length <= limit) return prose;
  // Cut at the last space inside the limit, so a card never ends mid-word.
  const cut = prose.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}
