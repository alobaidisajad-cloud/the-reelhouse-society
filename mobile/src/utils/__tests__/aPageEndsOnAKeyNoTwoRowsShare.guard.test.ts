/**
 * aPageEndsOnAKeyNoTwoRowsShare.guard.test.ts — every read taken a page at a time is ordered, last,
 * by a key no two of its rows share (WORKLIST P4.53).
 *
 * A page is rows `from` to `from + n` of an order. Ordered by a key two rows can share (a moment, a
 * rank), the house may hand those two in either order on each read, so the next page can hold the
 * one this page held, and the other is never drawn. A member's room ordered its filings by the
 * moment alone; a stack's films by rank and moment, which every film of one import shares. Each
 * now ends on its row's id, or a key the table holds once within what the read asks for. Read from
 * source, comments stripped.
 */
import { readCode } from '@/test-utils/readCode';
import { files, rel } from '@/test-utils/universe';

/** Keys a table holds once among the rows of one value of another column, and the constraint that says so. */
const UNIQUE_WITHIN: Record<string, Record<string, string>> = {
  list_items: { film_id: 'list_id' }, // list_items_list_id_film_id_key UNIQUE (list_id, film_id)
};

/** Each paged read (a `.range(`) in the code given whose last order is a key rows may share, as file:line. */
const tiedPages = (sources: { file: string; code: string }[]) => sources.flatMap(({ file, code }) => {
  const found: string[] = [];
  for (const m of code.matchAll(/\.from\(\s*['"`](\w+)['"`]\s*\)/g)) {
    const rest = code.slice(m.index);
    const range = rest.indexOf('.range(');
    const next = rest.indexOf('.from(', 1);
    const end = rest.search(/;/);
    if (range < 0 || (next > 0 && next < range) || (end >= 0 && end < range)) continue;
    const chain = rest.slice(0, range);
    const orders = [...chain.matchAll(/\.order\(\s*['"`](\w+)['"`]/g)].map((o) => o[1]);
    const last = orders[orders.length - 1];
    const within = last ? UNIQUE_WITHIN[m[1] ?? '']?.[last] : undefined;
    const held = last === 'id' || (within !== undefined && new RegExp(`\\.eq\\(\\s*['"\`]${within}['"\`]`).test(chain));
    if (!held) found.push(`${file}:${code.slice(0, m.index).split('\n').length} ${m[1]} [${orders.join(', ')}]`);
  }
  return found;
});

it('ends every paged read of the app on a key no two of its rows share', () => {
  const sources = files('appCode').map((f) => ({ file: rel(f), code: readCode(f) }));
  expect(sources.length).toBeGreaterThan(300);
  expect(tiedPages(sources)).toEqual([]);
});

it("says NO to a page ordered by a moment or a rank alone, and not to one ended by an id or a stack's film", () => {
  const page = (table: string, chain: string) => [{ file: 'a.ts', code: `await supabase.from('${table}').select('id')${chain}.range(0, 19);` }];
  expect(tiedPages(page('dispatch_posts', ".eq('user_id', id).order('created_at', { ascending: false })"))).toEqual(['a.ts:1 dispatch_posts [created_at]']);
  expect(tiedPages(page('list_items', ".eq('list_id', id).order('rank_position').order('created_at')"))).toEqual(['a.ts:1 list_items [rank_position, created_at]']);
  expect(tiedPages(page('list_items', ".order('film_id')"))).toEqual(['a.ts:1 list_items [film_id]']);
  expect(tiedPages(page('dispatch_posts', ".order('created_at', { ascending: false }).order('id', { ascending: false })"))).toEqual([]);
  expect(tiedPages(page('list_items', ".eq('list_id', id).order('rank_position').order('film_id')"))).toEqual([]);
  expect(tiedPages([{ file: 'b.ts', code: "supabase.from('logs').select('id').order('created_at').limit(5);" }])).toEqual([]);
});
