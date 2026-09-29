/**
 * useCatalogueSearch — the film catalogue, searched as a member types.
 *
 * Every search box that asks the catalogue asks through here: the wait for the
 * member to stop typing, the latest words winning over a slower earlier reply,
 * and — why it is one hook — a catalogue that could not be reached reported as
 * that. Five boxes each kept their own copy of this, and each caught the
 * failure and drew it as "no films found": a member with no signal was told
 * the film they typed does not exist. Each box still filters and draws the
 * answer its own way.
 */
import { useCallback, useEffect, useState } from 'react';
import { tmdb } from '@/src/lib/tmdb';

type Answer = Awaited<ReturnType<typeof tmdb.search>>;
/** One film or person the catalogue matched. */
export type CatalogueMatch = Answer['results'][number];

export interface CatalogueSearch {
  /** The catalogue's matches (the last answer, while newer words are asked). */
  results: CatalogueMatch[];
  searchType: Answer['searchType'];
  matchedContext: string;
  /** The member is typing, or the catalogue is being asked. */
  searching: boolean;
  /** The catalogue could not be asked: NOT "nothing matched". */
  unreachable: boolean;
  /** Ask again, with the same words. */
  retry: () => void;
}

export function useCatalogueSearch(
  text: string,
  { delay = 400, minLength = 1, enabled = true }: { delay?: number; minLength?: number; enabled?: boolean } = {},
): CatalogueSearch {
  const words = text.trim();
  const live = enabled && words.length >= minLength;
  const [attempt, setAttempt] = useState(0);
  const asking = `${attempt}:${words}`;
  const [settled, setSettled] = useState<{ asked: string; answer: Answer | null; unreachable: boolean }>(
    { asked: '', answer: null, unreachable: false },
  );

  useEffect(() => {
    if (!live) return;
    let latest = true;
    const t = setTimeout(async () => {
      try {
        const answer = await tmdb.search(words, 1);
        if (latest) setSettled({ asked: asking, answer, unreachable: false });
      } catch {
        if (latest) setSettled({ asked: asking, answer: null, unreachable: true });
      }
    }, delay);
    return () => { latest = false; clearTimeout(t); };
  }, [live, words, asking, delay]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const answered = settled.asked === asking;
  const answer = live ? settled.answer : null;
  return {
    results: answer?.results ?? [],
    searchType: answer?.searchType,
    matchedContext: answer?.matchedContext ?? '',
    searching: live && !answered,
    unreachable: live && answered && settled.unreachable,
    retry,
  };
}
