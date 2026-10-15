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
import { readCode } from '../readCode';
import { files as universe, rel } from '../universe';

const BUILDERS = ['src/lib/queryClient.ts', 'test-utils/testQueryClient.ts'];

/** Every code file in mobile/: the app, its tests, what they share, the scripts and the mockups. */
function codeFiles(): string[] {
  return universe(['appCode', 'tests', 'testSupport', 'scripts', 'config', 'mockups'])
    .filter((f) => /\.(?:[cm]?js|jsx|ts|tsx)$/.test(f)).map(rel);
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
