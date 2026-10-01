import { supabase } from '@/src/lib/supabase';

const STEP = 1000;

/**
 * Every row a member owns in one table, for their export, a thousand at a time.
 *
 * Ordered by the table's key: the pages of an unordered read are not promised
 * to agree, so an export past a thousand rows could repeat some and miss
 * others. Throws on the first page that fails — a partial export is not one.
 */
export async function readAllRows(
  userId: string, table: string, select = '*', key = 'id',
): Promise<any[]> {
  let all: any[] = [];
  for (let from = 0; ; from += STEP) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .eq('user_id', userId)
      .order(key, { ascending: true })
      .range(from, from + STEP - 1);
    if (error) throw error;
    if (!data || data.length === 0) return all;
    all = all.concat(data);
    if (data.length < STEP) return all;
  }
}
