/**
 * The letter on a member's portrait when they have no photograph: the first of
 * the name their file shows (persona, else display name, else handle), so every
 * screen shows the same member the same letter.
 */
export function portraitInitial(member: {
  persona?: string | null;
  display_name?: string | null;
  username?: string | null;
} | null | undefined): string {
  const first = firstCharacter(member?.persona || member?.display_name || member?.username || '?');
  const upper = first.toUpperCase();
  // A capital that is two letters ("ß" is "SS") would put two in the circle: keep the one.
  return Array.from(upper).length === Array.from(first).length ? upper : first;
}

/** Marks that belong to the character before them: accents, variation selectors, skin tones, keycaps, tags. */
const joinsTheOneBefore = (cp: number) =>
  (cp >= 0x0300 && cp <= 0x036f) || (cp >= 0x1ab0 && cp <= 0x1aff) || (cp >= 0x1dc0 && cp <= 0x1dff)
  || (cp >= 0x20d0 && cp <= 0x20ff) || (cp >= 0xfe20 && cp <= 0xfe2f) || cp === 0xfe0e || cp === 0xfe0f
  || (cp >= 0x1f3fb && cp <= 0x1f3ff) || (cp >= 0xe0020 && cp <= 0xe007f);
const ZWJ = 0x200d;
const isRegionalIndicator = (cp: number) => cp >= 0x1f1e6 && cp <= 0x1f1ff;

/**
 * The first character a reader sees, whole: a flag is two regional letters, a
 * family is people joined by zero-width joiners, a skin tone or an accent rides
 * on the one before. Hermes has no Intl.Segmenter, so the few rules a name's
 * first character needs are kept here.
 */
export function firstCharacter(text: string): string {
  const cps = Array.from(text);
  if (cps.length === 0) return '';
  const at = (i: number) => cps[i].codePointAt(0) ?? 0;
  let end = 1;
  if (isRegionalIndicator(at(0)) && cps.length > 1 && isRegionalIndicator(at(1))) end = 2;
  for (;;) {
    if (end < cps.length && joinsTheOneBefore(at(end))) { end += 1; continue; }
    if (end + 1 < cps.length && at(end) === ZWJ) { end += 2; continue; }
    break;
  }
  return cps.slice(0, end).join('');
}
