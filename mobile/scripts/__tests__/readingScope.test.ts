/**
 * readingScope.test.ts — scripts/reading-scope.cjs gives a reader every never-read file whole and every changed
 * part with its whole function and each statement that calls it, in its own file and in the files importing it,
 * in slices of whole files.
 */
import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const rs = require('../reading-scope.cjs') as {
  partsOf: (entries: object[], o: { repo: string }) => Map<string, 'whole' | number[][]>;
  paragraph: (lines: string[], r: number[]) => number[];
  slicesOf: (parts: Map<string, 'whole' | number[][]>, lineCount: (r: string) => number, max: number) => { files: Record<string, unknown>; lines: number }[];
};

let repo: string;
const git = (...a: string[]) => spawnSync('git', a, { cwd: repo, encoding: 'utf8' });
const put = (rel: string, text: string) => { mkdirSync(join(repo, rel, '..'), { recursive: true }); writeFileSync(join(repo, rel), text); };

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'scope-'));
  git('init', '-q');
  put('mobile/src/utils/price.ts', [
    'export function priceOf(n: number) {', // 1
    '  const tax = n * 0.2;', //                 2
    '  return n + tax;', //                      3
    '}', //                                      4
    '', //                                       5
    'export const free = () => 0;', //           6
    '', //                                       7
    'export const twice = (n: number) => priceOf(n) * 2;', // 8
  ].join('\n'));
  put('mobile/src/screens/Till.tsx', [
    "import { priceOf } from '../utils/price';", // 1
    '', //                                          2
    'export function Till() {', //                  3
    '  const shown = 3;', //                        4
    '  return priceOf(shown);', //                  5
    '}', //                                         6
    '', //                                          7
    'export const other = 1;', //                   8
  ].join('\n'));
  put('mobile/supabase/x.sql', 'select 1;\nselect 2;\n\nselect 3;\n');
  git('add', '.');
});
afterAll(() => rmSync(repo, { recursive: true, force: true }));

it('grows a changed line to its function and to every statement calling that function, here and in importers', () => {
  const parts = rs.partsOf([
    { path: 'mobile/src/utils/price.ts', status: 'changed', changed: [[2, 2]], lines: 8, binary: false },
    { path: 'mobile/supabase/x.sql', status: 'changed', changed: [[2, 2]], lines: 4, binary: false },
    { path: 'mobile/src/screens/Old.tsx', status: 'never', changed: [[1, 9]], lines: 9, binary: false },
    { path: 'mobile/src/screens/Same.tsx', status: 'current', changed: [], lines: 9, binary: false },
  ], { repo });
  expect(parts.get('mobile/src/utils/price.ts')).toEqual([[1, 4], [8, 8]]);
  expect(parts.get('mobile/src/screens/Till.tsx')).toEqual([[1, 1], [3, 6]]);
  expect(parts.get('mobile/supabase/x.sql')).toEqual([[1, 2]]);
  expect(parts.get('mobile/src/screens/Old.tsx')).toBe('whole');
  expect(parts.has('mobile/src/screens/Same.tsx')).toBe(false);
});

it('cuts slices of whole files at the limit, a longer file alone', () => {
  const parts = new Map<string, 'whole' | number[][]>([['a', 'whole'], ['b', [[1, 30]]], ['c', 'whole'], ['d', 'whole']]);
  const lines: Record<string, number> = { a: 50, c: 200, d: 10 };
  const slices = rs.slicesOf(parts, (r) => lines[r] ?? 0, 100);
  expect(slices.map((s) => [Object.keys(s.files), s.lines])).toEqual([[['a', 'b'], 80], [['c'], 200], [['d'], 10]]);
});
