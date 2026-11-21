import { supabase } from '@/src/lib/supabase';

const STEP = 1000;

/**
 * Every row a member owns in one table, for their export, a thousand at a time.
 *
 * Each page is every row after the last one read, by the table's key: an order
 * the pages agree on, and a place that does not move. Paged by count instead, a
 * row removed while the export read on shifted the next page by one, and a row
 * it should have held was skipped. The key is each row's own (`id`, or the
 * private notes' viewing), so no two rows share it. Throws on the first page
 * that fails — a partial export is not one.
 */
export async function readAllRows(
  userId: string, table: string, select = '*', key = 'id',
): Promise<any[]> {
  let all: any[] = [];
  let after: unknown = null;
  for (;;) {
    let q = supabase
      .from(table)
      .select(select)
      .eq('user_id', userId);
    if (after !== null) q = q.gt(key, after);
    const { data, error } = await q.order(key, { ascending: true }).limit(STEP);
    if (error) throw error;
    if (!data || data.length === 0) return all;
    all = all.concat(data);
    if (data.length < STEP) return all;
    after = (data[data.length - 1] as unknown as Record<string, unknown>)[key];
    // A page with no key to go on from would be asked again for ever.
    if (after === null || after === undefined) throw new Error('readAllRows: a page of rows carried no key to go on from');
  }
}
