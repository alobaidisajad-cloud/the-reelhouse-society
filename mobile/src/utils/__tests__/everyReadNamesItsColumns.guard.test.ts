/**
 * everyReadNamesItsColumns.guard.test.ts — no read of the house asks for every column (WORKLIST P4.53).
 *
 * `select('*')` carries every column a row has: what the screen never draws (the salon page took each
 * room's invite code and limits with it), and every column a migration adds later, unasked. The last one
 * read a salon; it reads ROOM_COLUMNS now. Read from source, comments stripped.
 */
import { readCode } from '@/test-utils/readCode';
import { files, rel } from '@/test-utils/universe';

const EVERY_COLUMN = /\.select\(\s*(['"`])\*\1/g;

/** Each read of every column in the code given, as file:line. */
const starReads = (sources: { file: string; code: string }[]) => sources.flatMap(({ file, code }) =>
  [...code.matchAll(EVERY_COLUMN)].map((m) => `${file}:${code.slice(0, m.index).split('\n').length}`));

it('names its columns in every read of the app', () => {
  const sources = files('appCode').map((f) => ({ file: rel(f), code: readCode(f) }));
  expect(sources.length).toBeGreaterThan(300);
  expect(starReads(sources)).toEqual([]);
});

it('says NO to a read of every column, and not to a named one or a comment', () => {
  expect(starReads([{ file: 'a.ts', code: "await supabase.from('lounges').select('*').eq('id', id);" }])).toEqual(['a.ts:1']);
  expect(starReads([{ file: 'b.ts', code: "supabase.from('lists').select(`*`)" }])).toEqual(['b.ts:1']);
  expect(starReads([{ file: 'c.ts', code: "supabase.from('lounges').select(ROOM_COLUMNS)" }])).toEqual([]);
  expect(starReads([{ file: 'd.ts', code: "supabase.from('x').select('id', { count: 'exact', head: true })" }])).toEqual([]);
});
