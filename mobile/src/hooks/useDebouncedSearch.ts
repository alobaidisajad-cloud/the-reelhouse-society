/**
 * useDebouncedSearch — a search box whose words reach its room a moment after the last key.
 * ─────────────────────────────────────────────────────────────────────────────────────
 * The box shows every key at once; the room's filter (and the house's read) follows `waitMs`
 * behind, so a word typed is asked once, not once a letter. Five member rooms each kept their own
 * copy of the timer, and none of their ✕ cancelled it: a box cleared inside the wait was emptied,
 * and the wait then ran out and narrowed the room to the words just cleared, under an empty box
 * with no ✕ left to press (review round 12). Here a clear cancels the wait and empties both at
 * once, and the wait never outlives the room.
 *
 *   const box = useDebouncedSearch(ledgerSearch, setLedgerSearch);
 *   <RoomSearch value={box.value} onChange={box.onChange} onClear={box.clear} />
 *
 * `stored` is the room's own search; changed from outside (the room wiped for another member, an
 * empty state's CLEAR THE SEARCH), the box takes it, and a wait still running is dropped.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/** How long a room waits after the last key before it searches. */
export const SEARCH_WAIT_MS = 300;

export function useDebouncedSearch(
  stored: string | null | undefined,
  commit: ((words: string) => void) | undefined,
  waitMs: number = SEARCH_WAIT_MS,
) {
  const [value, setValue] = useState(stored ?? '');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The words this box last gave the room: a stored search that differs came from elsewhere. */
  const given = useRef(stored ?? '');
  const commitRef = useRef(commit);
  useEffect(() => { commitRef.current = commit; }, [commit]);

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => {
    const now = stored ?? '';
    if (now === given.current) return;
    cancel();
    given.current = now;
    setValue(now);
  }, [stored, cancel]);

  // A wait never outlives the room.
  useEffect(() => cancel, [cancel]);

  const onChange = useCallback((words: string) => {
    setValue(words);
    cancel();
    timer.current = setTimeout(() => {
      timer.current = null;
      given.current = words;
      commitRef.current?.(words);
    }, waitMs);
  }, [cancel, waitMs]);

  /** The box and the room emptied together, the wait dropped: nothing comes back after. */
  const clear = useCallback(() => {
    cancel();
    setValue('');
    given.current = '';
    commitRef.current?.('');
  }, [cancel]);

  return { value, onChange, clear };
}
