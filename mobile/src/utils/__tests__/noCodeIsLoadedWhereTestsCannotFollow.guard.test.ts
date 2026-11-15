/**
 * noCodeIsLoadedWhereTestsCannotFollow.guard.test.ts — the app loads a module late with require(),
 * never import().
 *
 * Under jest, import() throws ("invoked without --experimental-vm-modules"), and every one of them
 * sat in a try whose catch hid it: the sign-out's store reset and its channel's teardown, a stale
 * session's reset, and the memory trim never ran in any test, so no test could tell whether they
 * worked (review round 2: a member signed in over another, whose hand-over was built on them).
 * A require() inside the function loads as late, breaks the same import loop, and runs in both.
 * Type positions (`typeof import(…)`, `as import(…)`, `: import(…)`) load nothing and are allowed.
 */
import { execSync } from 'child_process';
import { readCode } from '@/test-utils/readCode';

const ROOT = `${__dirname}/../../..`;
const files = execSync('git ls-files -- src app', { cwd: ROOT, encoding: 'utf8' })
  .split('\n').filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes('__tests__') && !f.endsWith('.d.ts'));

/** Each import( written where it runs: not after typeof, as, a colon, or a type's angle bracket. */
const loads = files.flatMap((file) => [...readCode(file).matchAll(/(.{0,12})\bimport\(/g)]
  .filter((m) => !/(typeof|as|:|<|\|)\s*$/.test(m[1] ?? ''))
  .map((m) => `${file}: ${(m[1] ?? '').trim()}import(`));

it('reads the app’s code', () => {
  expect(files.length).toBeGreaterThan(300);
});

it('loads no module with import()', () => {
  expect(loads).toEqual([]);
});

it('would see one', () => {
  const seen = [...'    const { x } = await import(\'./x\');'.matchAll(/(.{0,12})\bimport\(/g)]
    .filter((m) => !/(typeof|as|:|<|\|)\s*$/.test(m[1] ?? ''));
  expect(seen).toHaveLength(1);
});
