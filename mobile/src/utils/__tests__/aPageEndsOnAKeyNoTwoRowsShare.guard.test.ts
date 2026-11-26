/**
 * aPageEndsOnAKeyNoTwoRowsShare.guard.test.ts — every read taken a page at a time is ordered, last,
 * by a key no two of its rows share (WORKLIST P4.53).
 *
 * A page is rows `from` to `from + n` of an order. Ordered by a key two rows can share (a moment, a
 * rank), the house may hand those two in either order on each read, so the next page can hold the
 * one this page held, and the other is never drawn. A member's room ordered its filings by the
 * moment alone; a stack's films by rank and moment, which every film of one import shares. Each
 * now ends on its row's id, or a key the table holds once within what the read asks for. Read from
 * source, comments stripped. A page asked after its last row (a keyset: the read kept in a name and
 * narrowed by `.or(` once there is a row to start after) is a page as much as a `.range(` is: the room
 * and the archive page so since review round 9, and the guard read past them until it was told.
 */
import { readCode } from '@/test-utils/readCode';
import { files, rel } from '@/test-utils/universe';

/** Keys a table holds once among the rows of one value of another column, and the constraint that says so. */
const UNIQUE_WITHIN: Record<string, Record<string, string>> = {
  list_items: { film_id: 'list_id' }, // list_items_list_id_film_id_key UNIQUE (list_id, film_id)
  // interactions_user_target_type_key UNIQUE (user_id, target_user_id, type): one follow a pair.
  interactions: { user_id: 'target_user_id', target_user_id: 'user_id' },
};

/** Each paged read (a `.range(`, or a read kept in a name later narrowed by `.or(`) in the code given whose last order is a key rows may share, as file:line. */
const tiedPages = (sources: { file: string; code: string }[]) => sources.flatMap(({ file, code }) => {
  const found: string[] = [];
  for (const m of code.matchAll(/\.from\(\s*['"`](\w+)['"`]\s*\)/g)) {
    const rest = code.slice(m.index);
    const next = rest.indexOf('.from(', 1);
    const end = rest.search(/;/);
    const ranged = rest.indexOf('.range(');
    // The name the read is kept in, when its statement begins `let x =` (or `const x =`).
    const before = code.slice(0, m.index);
    const opened = Math.max(before.lastIndexOf(';'), before.lastIndexOf('{'), before.lastIndexOf('}'));
    const kept = /^\s*(?:let|const)\s+(\w+)\s*=/.exec(before.slice(opened + 1))?.[1];
    const after = end >= 0 ? rest.slice(end, next > 0 ? next : undefined) : '';
    const keyset = !!kept && new RegExp(`\\b${kept}\\s*=\\s*${kept}\\.or\\(`).test(after);
    // A read of the order the next pages walk (`.limit(HELD_FILMS)`, `.limit(HELD_ORDER)`): its ties
    // would stand in another order on the next read, and the walk would skip one and repeat the other.
    const holds = rest.search(/\.limit\(\s*HELD_[A-Z_]+\s*\)/);
    const inRead = (at: number) => at >= 0 && !(next > 0 && next < at) && !(end >= 0 && end < at);
    const range = inRead(ranged) ? ranged : keyset ? end : inRead(holds) ? holds : -1;
    if (range < 0) continue;
    const chain = rest.slice(0, range);
    // A read kept in a name may be ordered by the statements after it (one order a branch). An order
    // of an embedded table (foreignTable) orders that table's rows, not the page.
    const ordered = keyset && range === end ? chain + after : chain;
    const orders = [...ordered.matchAll(/\.order\(\s*['"`](\w+)['"`]\s*(?:,\s*\{([^}]*)\})?/g)]
      .filter((o) => !/foreignTable|referencedTable/.test(o[2] ?? '')).map((o) => o[1]);
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
  // The order the next pages walk, read once: a page as much as a range is.
  const held = (orders: string) => [{ file: 'e.ts', code: `const order = await supabase.from('list_items').select('film_id').eq('list_id', id)${orders}.limit(HELD_FILMS);` }];
  expect(tiedPages(held(".order('rank_position').order('created_at')"))).toEqual(['e.ts:1 list_items [rank_position, created_at]']);
  expect(tiedPages(held(".order('rank_position').order('created_at').order('film_id')"))).toEqual([]);
  // A keyset page: kept in a name, narrowed after its last row; ended by the moment alone it is a tie.
  const keyset = (orders: string) => [{ file: 'c.ts', code: `let read = supabase.from('dispatch_posts').select('id')${orders};\nif (past) read = read.or(past);\nawait read.limit(20);` }];
  expect(tiedPages(keyset(".order('created_at', { ascending: false })"))).toEqual(['c.ts:1 dispatch_posts [created_at]']);
  expect(tiedPages(keyset(".order('created_at', { ascending: false }).order('id', { ascending: false })"))).toEqual([]);
  // Ordered by the statement after it, or with an embedded table's own order last: read as the page's.
  const later = (order: string) => [{ file: 'd.ts', code: `let q = supabase.from('dispatch_posts').select('id');\nq = q${order};\nif (after) q = q.or(after);\nawait q.limit(20);` }];
  expect(tiedPages(later(".order('created_at').order('id')"))).toEqual([]);
  expect(tiedPages(later(".order('created_at')"))).toEqual(['d.ts:1 dispatch_posts [created_at]']);
  expect(tiedPages(keyset(".order('created_at').order('rank_position', { foreignTable: 'list_items' })"))).toEqual(['c.ts:1 dispatch_posts [created_at]']);
});
