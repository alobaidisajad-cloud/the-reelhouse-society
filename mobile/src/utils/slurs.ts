/**
 * slurs — the eight slurs a member may ask to have struck out of members'
 * writing where they read it (Settings, READING: "Hide slurs"; off unless they ask).
 *
 * Nothing is refused: everyone writes what they write, and a reader who asked
 * sees these words struck through on the page, the sentence around them kept.
 * Swear words are never struck: a critique may quote a film.
 *
 * Words are read whole (letters and apostrophes make a word), letters
 * stretched and digits read as letters, as a handle's are (validateUsername);
 * -s, -'s and a closing apostrophe end the same word. So snigger, niggardly,
 * Niger, spick and span, spices and retardant are words of their own.
 */

/**
 * The marks a struck word is held between (components/StruckWords): Unicode's private use, typed
 * by no keyboard, so nothing a member writes is read as struck. The app's Text draws what they
 * hold in brass, and says it as "struck".
 */
export const STRUCK_OPENS = '\uE000';
export const STRUCK_CLOSES = '\uE001';
/** A struck word as the marks hold it. */
export const STRUCK_WORD = /\uE000([^\uE001]*)\uE001/gu;

/** The slurs, each as the letters it is spelled with, stretched. */
export const SLURS =
  'n+i+g+g+(e+r|a+|u+h)|f+a+g+g*o+t|w+e+t+b+a+c+k|k+i+k+e|s+p+i+c+|c+h+i+n+k|t+r+a+n+n+(y|i+e)|r+e+t+a+r+d+(e+d)?';

const SLUR = new RegExp(`^(${SLURS})('?s)?$`);
const DIGITS: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '’': "'" };
const IN_WORD = /^[a-z']$/;

/** Where each slur stands in `words`: [start, end) in its characters as JavaScript counts them. */
export function slurSpans(words: string): [number, number][] {
  const spans: [number, number][] = [];
  // Read a code point at a time, each on its own, so the reading stays in step with the
  // writing (a whole string lowered can grow: İ becomes two).
  const points = [...words];
  let at = 0;
  let start = -1;
  let startAt = 0;
  let read = '';
  for (let i = 0; i <= points.length; i += 1) {
    const c = points[i];
    const l = c === undefined ? '' : (DIGITS[c.toLowerCase()] ?? c.toLowerCase());
    const inWord = c !== undefined && IN_WORD.test(l);
    if (inWord) {
      if (start === -1) { start = i; startAt = at; read = ''; }
      read += l;
    } else if (start !== -1) {
      // An apostrophe opening or closing the word is the sentence's, not the word's.
      const lead = read.length - read.replace(/^'+/, '').length;
      const tail = read.length - read.replace(/'+$/, '').length;
      if (SLUR.test(read.slice(lead, read.length - tail))) {
        const from = startAt + points.slice(start, start + lead).join('').length;
        const to = at - points.slice(i - tail, i).join('').length;
        spans.push([from, to]);
      }
      start = -1;
    }
    if (c !== undefined) at += c.length;
  }
  return spans;
}

/** `words` cut at each slur: the words around them, and each slur marked to be struck. */
export function inkedOut(words: string): { text: string; struck: boolean }[] {
  const spans = slurSpans(words);
  if (spans.length === 0) return [{ text: words, struck: false }];
  const parts: { text: string; struck: boolean }[] = [];
  let at = 0;
  for (const [from, to] of spans) {
    if (from > at) parts.push({ text: words.slice(at, from), struck: false });
    parts.push({ text: words.slice(from, to), struck: true });
    at = to;
  }
  if (at < words.length) parts.push({ text: words.slice(at), struck: false });
  return parts;
}
