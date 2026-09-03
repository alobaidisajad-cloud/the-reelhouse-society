/**
 * The opening of an essay, as prose — for the card in the feed.
 * ─────────────────────────────────────────────────────────────────────────────
 * A dossier's `body` column holds an excerpt of its `full_content`, and the feed
 * card prints that excerpt. It was made like this:
 *
 *     content.replace(/[#*_[\]()>-]/g, '').replace(/\n+/g, ' ').trim()
 *
 * which deletes those characters from ANY position, not only where they are
 * markdown. So an essay saying `a well-made film (see below)` produced a card
 * saying `a wellmade film see below`, and `[the poll](https://…)` — where the
 * whole point is to drop the URL and keep the words — became
 * `the pollhttpsexamplecom`.
 *
 * The rule is the same one the essay body already follows: markup is markup and
 * prose is prose, and a hyphen inside a word was never markup.
 *
 * This is deliberately NOT a markdown parser. It unwraps the constructs a member
 * actually uses in an essay and leaves everything else exactly as written —
 * because the failure mode of over-matching here is silently editing somebody's
 * sentence, which is worse than leaving a stray asterisk in a preview.
 */

/** Strip the markup, keep the words. Whitespace collapsed to single spaces. */
export function excerptOf(markdown: string): string {
  let s = markdown;

  // Fenced code and images carry nothing a card can use.
  s = s.replace(/```[\s\S]*?```/g, ' ');
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');

  // A link is its text. This is the case the old version got exactly backwards:
  // it deleted the brackets and parentheses and kept the URL.
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

/**
 * How long an excerpt may be.
 *
 * 150 characters is the design's, not the database's — `excerpt_ceiling` allows
 * a dossier 500. The card prints two or three lines and the rest would never be
 * seen, so the shorter number is a choice about the page rather than a limit.
 */
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
