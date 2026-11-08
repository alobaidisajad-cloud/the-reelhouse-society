/**
 * aScreenRedrawsForWhatItReads.guard.test.ts — no screen or hook takes a whole store (WORKLIST P4.53).
 *
 * `useXStore()` with no selector subscribes to every field the store holds, so each change anywhere in
 * it redraws whoever called it: the root layout (and every provider under it) at each change to the
 * signed-in member, the salon at each change to any room. Twenty-eight places took a store whole; each
 * now selects what it reads, one field plainly or several through one shallow selector. Read from
 * source, comments stripped.
 */
import { readCode } from '@/test-utils/readCode';
import { files, rel } from '@/test-utils/universe';

const WHOLE_STORE = /\buse[A-Z][A-Za-z]*Store\(\s*\)/g;

/** Each whole-store subscription in the code given, as file:line. */
const wholeStores = (sources: { file: string; code: string }[]) => sources.flatMap(({ file, code }) =>
  [...code.matchAll(WHOLE_STORE)].map((m) => `${file}:${code.slice(0, m.index).split('\n').length}`));

it('takes no store whole anywhere in the app', () => {
  const sources = files('appCode').map((f) => ({ file: rel(f), code: readCode(f) }));
  expect(sources.length).toBeGreaterThan(300);
  expect(wholeStores(sources)).toEqual([]);
});

it('says NO to a store taken whole, and not to a selection or a store read outside a render', () => {
  expect(wholeStores([{ file: 'a.tsx', code: 'const { user } = useAuthStore();' }])).toEqual(['a.tsx:1']);
  expect(wholeStores([{ file: 'b.tsx', code: 'const x = 1;\nconst blocks = useBlockStore( );' }])).toEqual(['b.tsx:2']);
  expect(wholeStores([{ file: 'c.tsx', code: 'const user = useAuthStore((s) => s.user);' }])).toEqual([]);
  expect(wholeStores([{ file: 'd.tsx', code: 'const { a, b } = useLoungeStore(useShallow((s) => ({ a: s.a, b: s.b })));' }])).toEqual([]);
  expect(wholeStores([{ file: 'e.ts', code: 'useAuthStore.getState().user;' }])).toEqual([]);
});
