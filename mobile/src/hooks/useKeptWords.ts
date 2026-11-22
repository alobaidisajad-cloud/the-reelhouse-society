/**
 * useKeptWords — what a member is writing in a short box (a critique under a log or a stack, a
 * salon message, a reason, a report, a salon's name), kept on the phone as they write it
 * (memberDrafts), taken up when they come back to the same place, and let go once the house or the
 * queue has it (WORKLIST P4.14, P4.32). A long form keeps its own (the log, the essay, the stack,
 * the profile, a take's desk).
 *
 * `[words, setWords, letGo]`: letGo is for words the house or the queue now holds; words the
 * house refused are put back with setWords while the box stands, or putBackWords once it has gone,
 * so the member never types them twice.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { clearDraft, readDraft, writeDraft, type WordsKind } from '@/src/utils/memberDrafts';
import { useAuthStore } from '@/src/stores/auth';

/** How long the box rests before its words are kept: a keystroke is not a write. */
export const KEPT_WORDS_REST_MS = 1000;

export function useKeptWords(memberId: string | null | undefined, kind: WordsKind, scope: string | null | undefined) {
  const place = memberId && scope ? `${memberId}:${kind}:${scope}` : null;
  const [words, setWords] = useState('');
  // Taken up as it renders, each time a place opens: another log or room opens on its own words or
  // none, and a sheet closed and opened again on the same place opens on the words kept for it.
  const [takenFor, setTakenFor] = useState<string | null>(null);
  if (takenFor !== place) {
    setTakenFor(place);
    if (place) setWords(readDraft(memberId, kind, scope ?? undefined)?.data.body ?? '');
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

  // Nothing is left waiting to be kept: a box that goes in the same moment (a sheet closed on the
  // house's answer) would otherwise keep again the words just let go.
  const letGo = useCallback(() => {
    unsaved.current = null;
    setWords('');
    clearDraft(memberId, kind, scope ?? undefined);
  }, [memberId, kind, scope]);

  return [words, setWords, letGo] as const;
}

/**
 * Words let go when they were sent, put back in their place once the house refused them and the
 * box has gone (a sheet closed on the send): after any the member has written there since, as the
 * offline queue gives words back. Never for a member no longer signed in.
 */
export function putBackWords(memberId: string | null | undefined, kind: WordsKind, scope: string, words: string): void {
  if (!memberId || !words.trim() || useAuthStore.getState().user?.id !== memberId) return;
  const there = readDraft(memberId, kind, scope)?.data.body?.trim() ?? '';
  writeDraft(memberId, kind, { body: there && there !== words.trim() ? `${there}\n\n${words}` : words }, scope);
}
