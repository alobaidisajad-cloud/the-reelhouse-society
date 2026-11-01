/**
 * useKeptWords — what a member is writing in a short box (a critique under a log or a stack, a
 * salon message), kept on the phone as they write it (memberDrafts), taken up when they come back
 * to the same place, and let go once the house or the queue has it (WORKLIST P4.14, P4.32). A long
 * form keeps its own (the log, the essay, the stack, the profile).
 *
 * `[words, setWords, letGo]`: letGo is for words the house or the queue now holds; words the
 * house refused are put back with setWords, so the member never types them twice.
 */
import { useCallback, useEffect, useState } from 'react';
import { clearDraft, readDraft, writeDraft, type DraftKind } from '@/src/utils/memberDrafts';

/** How long the box rests before its words are kept: a keystroke is not a write. */
export const KEPT_WORDS_REST_MS = 1000;

export function useKeptWords(memberId: string | null | undefined, kind: DraftKind, scope: string | null | undefined) {
  const place = memberId && scope ? `${memberId}:${kind}:${scope}` : null;
  const [words, setWords] = useState('');
  // Taken up as it renders, once per place: another log or room opens on its own words or none.
  const [takenFor, setTakenFor] = useState<string | null>(null);
  if (place && takenFor !== place) {
    setTakenFor(place);
    setWords(readDraft<{ body?: string }>(memberId, kind, scope ?? undefined)?.data.body ?? '');
  }

  useEffect(() => {
    if (!memberId || !scope) return;
    const t = setTimeout(() => {
      if (words.trim()) writeDraft(memberId, kind, { body: words }, scope);
      else clearDraft(memberId, kind, scope);
    }, KEPT_WORDS_REST_MS);
    return () => clearTimeout(t);
  }, [words, memberId, kind, scope]);

  const letGo = useCallback(() => {
    setWords('');
    clearDraft(memberId, kind, scope ?? undefined);
  }, [memberId, kind, scope]);

  return [words, setWords, letGo] as const;
}
