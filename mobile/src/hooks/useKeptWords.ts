/**
 * useKeptWords — what a member is writing in a short box (a critique under a log or a stack, a
 * salon message), kept on the phone as they write it (memberDrafts), taken up when they come back
 * to the same place, and let go once the house or the queue has it (WORKLIST P4.14, P4.32). A long
 * form keeps its own (the log, the essay, the stack, the profile).
 *
 * `[words, setWords, letGo]`: letGo is for words the house or the queue now holds; words the
 * house refused are put back with setWords, so the member never types them twice.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { clearDraft, readDraft, writeDraft, type WordsKind } from '@/src/utils/memberDrafts';
import { useAuthStore } from '@/src/stores/auth';

/** How long the box rests before its words are kept: a keystroke is not a write. */
export const KEPT_WORDS_REST_MS = 1000;

export function useKeptWords(memberId: string | null | undefined, kind: WordsKind, scope: string | null | undefined) {
  const place = memberId && scope ? `${memberId}:${kind}:${scope}` : null;
  const [words, setWords] = useState('');
  // Taken up as it renders, once per place: another log or room opens on its own words or none.
  const [takenFor, setTakenFor] = useState<string | null>(null);
  if (place && takenFor !== place) {
    setTakenFor(place);
    setWords(readDraft(memberId, kind, scope ?? undefined)?.data.body ?? '');
  }

  // The words are kept once they rest, and at once if the screen goes, or the place changes, before
  // they have: the last second's typing was lost (all of a short critique). Never for a member no
  // longer signed in: a draft kept after the sign-out (or a deletion's wipe) is theirs left behind.
  const unsaved = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!memberId || !scope) return undefined;
    const save = () => {
      if (useAuthStore.getState().user?.id !== memberId) return;
      if (words.trim()) writeDraft(memberId, kind, { body: words }, scope);
      else clearDraft(memberId, kind, scope);
    };
    unsaved.current = save;
    const t = setTimeout(() => { unsaved.current = null; save(); }, KEPT_WORDS_REST_MS);
    return () => clearTimeout(t);
  }, [words, memberId, kind, scope]);
  useEffect(() => () => {
    const save = unsaved.current;
    unsaved.current = null;
    save?.();
  }, [place]);

  const letGo = useCallback(() => {
    setWords('');
    clearDraft(memberId, kind, scope ?? undefined);
  }, [memberId, kind, scope]);

  return [words, setWords, letGo] as const;
}
