/**
 * typistShown — whether the house shows this reader a member who is typing in a salon.
 *
 * A salon's typing broadcast reaches every reader of the room, and names its typist; the house's read
 * rules shape everything else a reader is told, but not a broadcast. To a member someone has blocked,
 * the blocker is no one (their profile row, words, seats and reactions are rows that do not exist to
 * them, review round 14), so a broadcast naming the blocker "at the typewriter" would be the one place
 * the blocker still appeared. Before a typist is named, the house is asked for their row, as the reader
 * reads it: a row it does not give is a typist never named. A read that fails names no one (a typing
 * line is a courtesy; a name the house withholds is not). Each answer is kept for the reader and the
 * room it was asked in, and forgotten when the room is left.
 */
import { supabase } from '../lib/supabase';

const _shown = new Map<string, boolean>();

/** Whether the house gives `viewerId` the row of `memberId`; false when it does not, or could not say. */
export async function shownByTheHouse(viewerId: string | null | undefined, memberId: string): Promise<boolean> {
  const key = `${viewerId ?? ''}:${memberId}`;
  const known = _shown.get(key);
  if (known !== undefined) return known;
  try {
    const { data, error } = await supabase.from('profiles').select('id').eq('id', memberId).maybeSingle();
    if (error) return false;
    const shown = !!data;
    _shown.set(key, shown);
    return shown;
  } catch {
    return false;
  }
}

/** The answers kept, forgotten as a room is left (a block made since is asked again). */
export function forgetShownTypists(): void {
  _shown.clear();
}
