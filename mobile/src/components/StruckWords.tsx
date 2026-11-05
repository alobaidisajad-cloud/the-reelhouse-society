/**
 * StruckWords — members' writing, with the eight slurs struck out for a member
 * who asked (Settings, READING: "Hide slurs"; utils/slurs.ts).
 *
 * Struck as a typist strikes a word: each letter typed over with an x, the
 * sentence around it as written. The words stay words: each struck one is
 * held between two marks no keyboard types (STRUCK_OPENS, STRUCK_CLOSES), so
 * they pass through every helper that measures or cuts words (softBreak, a
 * review's line plan) the length they will be drawn; the app's Text draws what
 * the marks hold in the house's brass, and a screen reader hears "struck"
 * (components/text). A member who did not ask reads every word as written.
 *
 *   const struck = useStruck();
 *   <Text …>{softBreak(struck(c.body))}</Text>
 */
import { useCallback } from 'react';
import { useAuthStore } from '@/src/stores/auth';
import { inkedOut, STRUCK_CLOSES, STRUCK_OPENS, STRUCK_WORD } from '@/src/utils/slurs';

/** Whether this member asked for the slurs to be struck. */
export const useHidesSlurs = () => useAuthStore((s) => s.user?.preferences?.hide_slurs === true);

/** `words` with each slur typed over in x (its apostrophes kept) and held between the marks. */
export function markStruck(words: string): string {
  const parts = inkedOut(words);
  if (parts.length === 1 && !parts[0]!.struck) return words;
  return parts.map((p) => (p.struck ? `${STRUCK_OPENS}${p.text.replace(/[^'’]/gu, 'x')}${STRUCK_CLOSES}` : p.text)).join('');
}

/**
 * For a member who asked, members' words with each slur struck; for anyone else, the words
 * as written. Its answer is the words' own kind: a string for a string, nothing for nothing.
 */
export function useStruck() {
  const on = useHidesSlurs();
  return useCallback(<W extends string | null | undefined>(words: W): W =>
    (on && words ? markStruck(words) : words) as W, [on]);
}

/** Marked words as a label says them: each struck slur "struck", for the labels a screen reader reads. */
export const saidStruck = <W extends string | null | undefined>(words: W): W =>
  (words ? words.replace(STRUCK_WORD, 'struck') : words) as W;
