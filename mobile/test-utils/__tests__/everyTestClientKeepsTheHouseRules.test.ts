/**
 * everyTestClientKeepsTheHouseRules.test.ts — a React Query client is built in
 * two places, both from the one policy (src/lib/queryPolicy.ts): the app's
 * (src/lib/queryClient.ts) and every test's (test-utils/testQueryClient.ts).
 *
 * A client built anywhere else keeps rules of its own. In a test that meant a
 * read that paused offline where the phone's fails, a five-minute collection
 * timer left behind, and an error no one heard — each found in a test that had
 * built its own. So the whole tree is read, and `new QueryClient(` may stand
 * in those two files only.
 */
import { readdirSync } from 'fs';
import { join, relative, sep } from 'path';
import { MOBILE, readCode } from '../readCode';

const ROOTS = ['app', 'src', 'mockups', 'test-utils', 'scripts', '__tests__'];
const SKIP = new Set(['node_modules', 'out', '.git', 'android', 'ios', '.expo']);
const BUILDERS = ['src/lib/queryClient.ts', 'test-utils/testQueryClient.ts'];

function codeFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(e.name)) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(?:[cm]?js|jsx|ts|tsx)$/.test(e.name)) out.push(relative(MOBILE, full).split(sep).join('/'));
    }
  };
  for (const r of ROOTS) walk(join(MOBILE, r));
  return out;
}

describe('every React Query client keeps the house rules', () => {
  const files = codeFiles();
  const building = files.filter((f) => /\bnew\s+QueryClient\s*\(/.test(readCode(f)));

  it('reads the whole tree, and finds both builders', () => {
    expect(files.length).toBeGreaterThan(1000);
    expect(building).toEqual(expect.arrayContaining(BUILDERS));
  });

  it('is built nowhere else', () => {
    expect(building.filter((f) => !BUILDERS.includes(f))).toEqual([]);
  });
});
