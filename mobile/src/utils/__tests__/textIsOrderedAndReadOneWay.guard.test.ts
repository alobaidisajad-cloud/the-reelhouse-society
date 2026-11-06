/**
 * textIsOrderedAndReadOneWay.guard.test.ts — no line of app/ or src/ orders text or
 * reads an instant but through src/utils/order.ts and src/utils/instant.ts (WORKLIST P4.52).
 * ─────────────────────────────────────────────────────────────────────────────
 * What localeCompare and Date.parse answer is the engine's own, and the phone's
 * engine is not Node's: so each is called in one helper, whose tests run on
 * Hermes too (scripts/hermes-suites.cjs). ESLint says so as the code is written;
 * this reads every file of the app's code, linted or not.
 */
import { readFileSync } from 'fs';
import { files, rel } from '@/test-utils/universe';
import { stripComments } from '@/test-utils/stripComments';

const HELPERS = ['src/utils/order.ts', 'src/utils/instant.ts'];
const BARE = /\.localeCompare\s*\(|\bDate\s*\.\s*parse\s*\(/g;

/** Each bare call in the code given, as file:line. */
const bareCalls = (sources: { file: string; text: string }[]) => sources.flatMap(({ file, text }) => {
  if (HELPERS.includes(file)) return [];
  const code = stripComments(text, file);
  return [...code.matchAll(BARE)].map((m) => `${file}:${code.slice(0, m.index).split('\n').length}`);
});

it('every order and every instant in app/ and src/ goes through the two helpers', () => {
  const sources = files('appCode').map((f) => ({ file: rel(f), text: readFileSync(f, 'utf8') }));
  // It read the app: a walker that found nothing would pass on nothing.
  expect(sources.length).toBeGreaterThan(300);
  expect(sources.map((s) => s.file)).toEqual(expect.arrayContaining(HELPERS));
  expect(bareCalls(sources)).toEqual([]);
});

it('says NO to each call written anywhere else, and not to one in a comment or a helper', () => {
  const planted = [
    { file: 'src/utils/standing.ts', text: 'const until = Date.parse(user.suspended_until);' },
    { file: 'app/stacks/[id].tsx', text: "const at = Date . parse ('2026');\nrows.sort((a, b) => a.title.localeCompare(b.title));" },
  ];
  expect(bareCalls(planted)).toEqual(['src/utils/standing.ts:1', 'app/stacks/[id].tsx:1', 'app/stacks/[id].tsx:2']);
  expect(bareCalls([{ file: 'src/a.ts', text: '// Date.parse(x) and a.localeCompare(b), said\nconst parse = 1;' }])).toEqual([]);
  expect(bareCalls([{ file: 'src/utils/order.ts', text: 'export const byTitle = (a, b) => a.localeCompare(b);' }])).toEqual([]);
});
