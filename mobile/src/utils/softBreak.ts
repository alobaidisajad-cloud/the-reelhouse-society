/**
 * softBreak — the one thing standing between a page and a pasted link.
 * ─────────────────────────────────────────────────────────────────────────────
 * React Native does not wrap a word wider than its box at a place a reader
 * would choose. It breaks it mid-letter, or — in a picture of the screen — lets
 * it out, and the edge cuts it. Drawn for the first time with content a member
 * can actually type, the Dispatch showed:
 *
 *     WIRE — Full programme at https://www.bfi.org.uk/news/napo|
 *            restoration-tour-2026-full-
 *            city-listing
 *
 * A German compound noun does the same. So does a hashtag, a long handle, or
 * anyone holding a key down — and so does a film's own tagline, which TMDB
 * gives as `Sensational...Daring...Unforgettable...` with no space anywhere.
 *
 * Length caps bound how MANY characters a text may carry. Nothing bounded how
 * long a single unbroken RUN of them could be, and that is the number that
 * decides whether a line can wrap at all.
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
 *
 * It lived in the Dispatch's `paperText` until the film page needed it; that
 * file re-exports it, so the Dispatch reads it where it always did.
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
 * ── AND WHERE, INSIDE THAT RUN, THE BREAK SHOULD GO ─────────────────────────
 * This used to cut blind at the eighteenth character, so the wire's own example
 * — a pasted BFI link — came apart as `https://www.bfi.or` / `g.uk/news/…`. A
 * URL split in the middle of `org` reads as a typo rather than as a link, and
 * the WIRE form exists for news from elsewhere carrying its source, so it is
 * the form where pasted links are the norm rather than the exception.
 *
 * AFTER a separator that CLOSES what it follows — a line ending on `napoleon-`
 * or `news/` reads as hyphenation and as a path, which is what they are.
 *
 * BEFORE a mark that OPENS what comes next. A line ending on `www.bfi.` reads
 * as a sentence that has finished, and `#` belongs to its tag: the first
 * version of this had `#` in the set below and broke `#thelongsilenceinozu`
 * into a lone `#` on one line and the words on the next.
 *
 * AN ELLIPSIS CLOSES. One dot opens the next part of an address; two or more,
 * or `…`, end what came before — `Sensational...` / `Daring...` is how a
 * poster reads, and `Sensational` / `...Daring` is not. So a run of dots is
 * one joint, placed after its last dot.
 */
const BREAK_AFTER = new Set(['/', '-', '_', '…']);
const BREAK_BEFORE = new Set(['.', '?', '&', '#', '=', '+']);

/**
 * A break that leaves one or two characters behind is worse than none: it
 * spends a line on an orphan and shortens the run by nothing worth having.
 */
const MIN_SEGMENT = 3;

/** Where a break may go at character `i` of `s`, or -1. */
function jointAt(s: string, i: number): number {
  const ch = s[i];
  if (ch === '.' && (s[i - 1] === '.' || s[i + 1] === '.')) {
    // an ellipsis: one joint, after its last dot (and only once it is complete)
    return s[i + 1] === '.' || i + 1 >= s.length ? -1 : i + 1;
  }
  if (BREAK_AFTER.has(ch)) return i + 1;
  if (BREAK_BEFORE.has(ch)) return i;
  return -1;
}

/**
 * Offer a wrap point inside any run longer than the narrowest column can hold.
 * Everything shorter is returned untouched, so ordinary prose — which is almost
 * all of it — pays nothing.
 */
export function softBreak(text: string, run: number = MAX_RUN): string {
  if (!text) return text;
  let out = '';
  /** The run being built. Held rather than emitted, so a break can be placed
   *  behind a joint that has already gone past. */
  let buf = '';

  for (const ch of text) {
    // any whitespace resets the run; the string could already wrap there
    if (/\s/.test(ch)) {
      out += buf + ch;
      buf = '';
      continue;
    }

    buf += ch;
    if (buf.length < run) continue;

    /**
     * How many characters stay on the line. The LAST joint wins, so the line
     * is filled rather than broken at the first opportunity; never 0, which
     * would emit an empty segment and leave the run no shorter.
     *
     * The guarantee MAX_RUN was measured for is untouched: every candidate is
     * at most `run`, so this only ever breaks EARLIER than the blind cut did.
     */
    let cut = -1;
    for (let i = 0; i < buf.length; i++) {
      const at = jointAt(buf, i);
      if (at >= MIN_SEGMENT) cut = at;
    }
    if (cut < MIN_SEGMENT) cut = buf.length; // no usable joint — cut where it always did

    out += buf.slice(0, cut) + ZWSP;
    buf = buf.slice(cut);
  }

  return out + buf;
}
