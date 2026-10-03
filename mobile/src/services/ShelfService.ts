/**
 * ShelfService — putting a film's formats on a member's shelf (physical_archive).
 *
 * A log that names a disc files that format on the shelf as a side effect.
 * That write used to upsert the WHOLE row, with a blank note and a 'good'
 * condition, and with only the formats the device happened to know: a shelf
 * entry the member had described on the website lost its notes, its condition
 * and its other formats the next time they logged the film. A side effect may
 * add; it may never take away. So:
 *
 *   - a film not on the shelf is filed whole (notes and condition take the
 *     column's defaults);
 *   - a film already there only GAINS the formats, merged with what the
 *     server holds — not the device's copy, which may not be loaded.
 *
 * The live save and the offline queue's replay both go through here.
 */
import { supabase } from '../lib/supabase';

export interface ShelfEntry {
  user_id: string;
  film_id: number;
  film_title: string;
  poster_path: string | null;
  year: number | null;
}

/** The entry as the server now holds it: its id and every format on it. */
export interface Shelved { id: string; formats: string[] }

export async function fileOnShelf(entry: ShelfEntry, formats: string[], attempt = 0): Promise<Shelved> {
  // A new entry, or nothing: ON CONFLICT DO NOTHING answers no row when the film is already there.
  const made = await supabase
    .from('physical_archive')
    .upsert([{ ...entry, formats }], { onConflict: 'user_id,film_id', ignoreDuplicates: true })
    .select('id, formats');
  if (made.error) throw made.error;
  if (made.data && made.data.length > 0) return made.data[0] as Shelved;

  const held = await supabase
    .from('physical_archive')
    .select('id, formats')
    .eq('user_id', entry.user_id)
    .eq('film_id', entry.film_id)
    .maybeSingle();
  if (held.error) throw held.error;
  // Taken off the shelf between the two reads: the format files it anew, once.
  if (!held.data) {
    if (attempt > 0) throw new Error('physical_archive: the entry was neither made nor found');
    return fileOnShelf(entry, formats, attempt + 1);
  }

  const current = (held.data.formats ?? []) as string[];
  const merged = Array.from(new Set([...current, ...formats]));
  if (merged.length === current.length) return { id: held.data.id, formats: current };

  // Only the formats are written. `.select` so a refused row (RLS answers it
  // with 200 and nothing) is an error, not a silent success.
  const grown = await supabase
    .from('physical_archive')
    .update({ formats: merged })
    .eq('id', held.data.id)
    .select('id, formats')
    .single();
  if (grown.error) throw grown.error;
  return grown.data as Shelved;
}
