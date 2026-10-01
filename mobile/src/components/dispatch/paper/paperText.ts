/**
 * paperText — how the paper sets a member's words: where a line may break,
 * where a card's excerpt stops, and how a count is printed.
 *
 * `softBreak` lives in `src/utils/softBreak` now (the film page needed it) and
 * is re-exported here, so the Dispatch reads it where it always did.
 */
export { softBreak, MAX_RUN } from '@/src/utils/softBreak';

/**
 * What a filing still in the offline queue says, wherever it is drawn: its
 * card, a ballot's foot, an essay's head in the reader. One sentence, so no
 * kind says it differently or forgets to.
 */
export const NOT_SENT_LINE = 'NOT SENT YET · THE HOUSE HAS NOT SEEN THIS';

/** Roman numerals, which is how the paper prints a part. Bounded by the cap. */
const ROMAN: [number, string][] = [
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];
export function roman(n: number): string {
  if (!Number.isFinite(n) || n < 1) return '';
  let left = Math.floor(n);
  let out = '';
  for (const [v, s] of ROMAN) while (left >= v) { out += s; left -= v; }
  return out;
}

/**
 * A part of a series, as printed (`Part II of …`) and as said (`Part 2 of …`):
 * a screen reader may spell a numeral out letter by letter.
 */
export function partOf(part: number | null, title: string): { printed: string; said: string } {
  if (part == null || part < 1) return { printed: title, said: title };
  return { printed: `Part ${roman(part)} of ${title}`, said: `Part ${part} of ${title}` };
}

/**
 * ── THE CUT ON A SHARE CARD ──────────────────────────────────────────────────
 * An essay runs to 25,000 characters. A card is one image. So the card carries
 * the opening, and something has to decide where the opening stops.
 *
 * Not the author: asking a writer to compose a second, shorter version of their
 * essay for the sharing of it is asking them to do a job the machine can do,
 * and most would skip it — leaving the best filings in the house with no card.
 *
 * Not a character count either. A clipping cut at "the room is what the film is
 * ab" is a clipping that reads as broken software, and this one asset is the
 * only thing a stranger ever sees of the house.
 *
 * So: the last COMPLETE SENTENCE that fits. The card ends where a thought ends,
 * every time, without anyone doing anything.
 *
 * Returns `{ text, clipped }` — `clipped` is what the card uses to decide
 * whether to print the continuation mark, because an essay short enough to fit
 * whole must not claim to run on.
 */
/**
 * Words that end in a stop without ending a sentence.
 *
 * Deliberately short. This is an excerpt on a card, not a parser: the cost of
 * missing one is a slightly early cut, and the cost of a long list is a rule
 * nobody can hold in their head. What a film essay actually contains is titles,
 * `No.`, and initials — and initials are covered by the single-letter rule
 * rather than by naming every letter here.
 */
const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'st', 'jr', 'sr', 'no', 'vs', 'etc',
  'ie', 'eg', 'ca', 'approx', 'dir', 'ed', 'vol', 'pt', 'us', 'uk',
]);

export function clipToSentence(text: string, max: number): { text: string; clipped: boolean } {
  const whole = (text ?? '').trim();
  if (whole.length <= max) return { text: whole, clipped: false };

  const window = whole.slice(0, max);
  const STOPS = '.!?';
  const TRAILING = '»”"\')]';

  // Walk back from the end of the window to the last sentence stop. A closing
  // quote or bracket may follow the stop — `…the outliving."` — and belongs to
  // the sentence, so the cut goes after it, not before.
  for (let i = window.length - 1; i >= 0; i--) {
    if (!STOPS.includes(window[i])) continue;

    let end = i + 1;
    while (end < window.length && TRAILING.includes(window[end])) end++;

    // A stop only ends a sentence if whitespace follows it. Tested against the
    // WHOLE essay, not the window: a stop sitting on the window's last character
    // may be `Mr.` with the rest of the name just past the cut, and the window
    // alone cannot tell.
    if (end < whole.length && !/\s/.test(whole[end])) continue;

    /**
     * Whitespace alone also follows `No. 17`, `Mr. Ozu` and `U.S. desk` (cut
     * there, a card reads "Ballot No." or "J. L."). Two more conditions:
     *   WHAT FOLLOWS BEGINS A SENTENCE: a capital, or the essay's end. Not the
     *   digit of `No. 17` or the lowercase of `U.S. desk`.
     *   WHAT PRECEDES IS NOT AN ABBREVIATION: `Mr. Ozu` and `J. L. Godard` are
     *   followed by capitals, so a short list of titles, and any single
     *   letter, catches them.
     */
    const after = whole.slice(end).replace(/^\s+/, '');
    if (after && !/^[A-Z«“"'([]/.test(after[0] + (after[1] ?? ''))) continue;

    const word = /([A-Za-z.]+)$/.exec(window.slice(0, i))?.[1] ?? '';
    const bare = word.replace(/\./g, '');
    if (bare.length === 1 || ABBREVIATIONS.has(bare.toLowerCase())) continue;

    return { text: window.slice(0, end), clipped: true };
  }

  // No sentence ended inside the window — one very long opening. Fall back to a
  // word boundary and say so with an ellipsis, which is honest about the cut in
  // a way a bare word is not.
  //
  // Then back up past any word that cannot end a phrase. Cut blindly, the very
  // first draw produced `…left the frame, and…` — an excerpt ending on a
  // conjunction, which reads as software that ran out of room rather than as a
  // passage that stopped. Dropping the dangling word costs one word and buys a
  // line that sounds deliberate.
  const DANGLING = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'nor', 'so', 'yet', 'of', 'to', 'in',
    'on', 'at', 'by', 'for', 'from', 'with', 'as', 'that', 'which', 'who',
    'is', 'was', 'are', 'were', 'be', 'been', 'it', 'its', 'his', 'her', 'their',
  ]);
  const space = window.lastIndexOf(' ');
  const words = (space > 0 ? window.slice(0, space) : window).trimEnd().split(' ');
  while (words.length > 1) {
    const last = words[words.length - 1].replace(/[^A-Za-z']/g, '').toLowerCase();
    if (!DANGLING.has(last)) break;
    words.pop();
  }
  // a comma or dash left hanging at the new end is debris from the word we cut
  return { text: words.join(' ').replace(/[\s,;:—-]+$/, '') + '…', clipped: true };
}

/**
 * ── COUNTING, IN A HOUSE THAT PRINTS ─────────────────────────────────────────
 * The paper said `1 CRITIQUES`.
 *
 * It said it on every card carrying exactly one critique, on the ledger line of
 * every share sheet, and — worse — in the spoken labels, so a screen reader
 * announced "Critique. 1 critiques" and "1 members have certified this". Nine
 * places, all of them a count glued to a plural noun with nothing deciding
 * between the two forms.
 *
 * A house that sets its own type does not print `1 CRITIQUES`.
 *
 * The count is FORMATTED but the decision is made on the RAW number: at a
 * thousand `formatCount` returns `1K`, and `1K CRITIQUE` would be the same
 * mistake in the other direction. Only exactly one takes the singular.
 *
 * The plural is passed in rather than derived. Guessing it means guessing the
 * case as well — this page prints `CRITIQUES` in the ledger and `critiques` in
 * the spoken label — and an `+ 's'` rule is a rule that will be wrong the first
 * time somebody counts a BALLOT CAST or a PERSON.
 */
export function counted(
  n: number,
  singular: string,
  plural: string,
  format: (n: number) => string | null = String,
): string {
  return `${format(n) ?? String(n)} ${n === 1 ? singular : plural}`;
}
