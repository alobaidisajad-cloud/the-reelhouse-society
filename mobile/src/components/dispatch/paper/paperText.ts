/**
 * paperText — the one thing standing between this page and a pasted link.
 * ─────────────────────────────────────────────────────────────────────────────
 * React Native does not break a word wider than its box. It lets it out, and
 * the document's edge cuts it. Drawn for the first time with content a member
 * can actually type, the result was:
 *
 *     WIRE — Full programme at https://www.bfi.org.uk/news/napo|
 *            restoration-tour-2026-full-
 *            city-listing
 *
 * The middle of the URL is not truncated with an ellipsis. It is GONE — cut by
 * the page edge, unreadable and unrecoverable, while the tail wraps below as if
 * nothing happened. A German compound noun does the same. So does a hashtag, a
 * long handle, or anyone holding a key down.
 *
 * The caps in `paperMetrics` bound how MANY characters a filing may carry.
 * Nothing bounded how long a single unbroken RUN of them could be, and that is
 * the number that decides whether a line can wrap at all.
 *
 * ── WHY A ZERO-WIDTH SPACE ───────────────────────────────────────────────────
 * There is no cross-platform `overflow-wrap: break-word` in React Native.
 * Android's hyphenation frequency hyphenates dictionary words; it does not
 * break a URL. The one mechanism both platforms honour is a real break
 * opportunity in the string, and U+200B is exactly that: a character with no
 * width, no ink, and no meaning except "you may wrap here".
 *
 * ── AND WHY IT IS RENDER-ONLY ────────────────────────────────────────────────
 * These characters are inserted on the way to the screen and never on the way
 * to the database. A stored take must be the characters the member typed —
 * anything else corrupts their writing, breaks the character count they were
 * shown while writing it, and would travel out of the app inside share cards.
 */

/**
 * The longest unbroken run allowed before a wrap point is offered.
 *
 * 18, measured: at 13.5pt Courier Prime a run of 18 characters is ~146pt, and
 * the narrowest column this design produces is 218pt on a 320pt phone. So an
 * eighteen-character run always fits, with room for the ordering margin's rule
 * and the indent beside it, at every width the app ships to.
 */
export const MAX_RUN = 18;

const ZWSP = '​';

/**
 * Offer a wrap point inside any run longer than the narrowest column can hold.
 * Everything shorter is returned untouched, so ordinary prose — which is almost
 * all of it — pays nothing.
 */
export function softBreak(text: string, run: number = MAX_RUN): string {
  if (!text) return text;
  let out = '';
  let since = 0;
  for (const ch of text) {
    // any whitespace resets the run; the string could already wrap there
    if (/\s/.test(ch)) {
      out += ch;
      since = 0;
      continue;
    }
    if (since >= run) {
      out += ZWSP;
      since = 0;
    }
    out += ch;
    since++;
  }
  return out;
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
    // alone cannot tell. This is also what keeps `No. 17` and `U.S.` from
    // reading as endings.
    if (end < whole.length && !/\s/.test(whole[end])) continue;

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
