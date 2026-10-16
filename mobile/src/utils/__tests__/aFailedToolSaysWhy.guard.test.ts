/**
 * A tool that fails says why, in its own words (CI-19).
 *
 * When a script runs another program and that program fails, the program's own
 * words are the cause: psql's "connection refused", gh's "no valid artifacts".
 * A script that drops them reports something else instead: "Command failed"
 * and a wall of SQL, a missing file, or "no logs" for a download that never
 * reached GitHub.
 *
 * So, in every script that ships, each run of another program either:
 *   - lets the program write straight to the console (`stdio: 'inherit'`);
 *   - throws, so Node's error carries the program's error output; or
 *   - keeps its answer, and the script reads that answer's output.
 * A run that throws its error output away (`'ignore'`) is named below with why
 * the cause is not needed there.
 */
import { readFileSync } from 'fs';
import { join, relative } from 'path';
import { files as universe } from '@/test-utils/universe';
import { closingOf } from '@/test-utils/schema';

const ROOT = join(__dirname, '..', '..', '..', '..');
const CALL = /\b(spawnSync|execSync|execFileSync)\(/g;

/** Runs whose error output is thrown away, by file and count, each with why. */
const QUIET: Record<string, { count: number; why: string }> = {
  'mobile/scripts/comment-truth.js': { count: 1, why: '`git check-ignore -q` answers by its exit alone: 0 ignored, 1 not' },
  'mobile/scripts/install-hooks.cjs': { count: 2, why: 'outside a git checkout there are no hooks to install, and a worktree with no hooks path set has none to unset' },
  'mobile/test-utils/universe.js': { count: 1, why: 'a folder that is not a checkout ignores nothing' },
};

type Run = { file: string; fn: string; args: string; kept: string | null; statement: boolean };

/** Every run of another program in a text: its function, arguments, and the name its answer is kept under. */
export function runsIn(file: string, text: string): Run[] {
  const runs: Run[] = [];
  for (const m of text.matchAll(CALL)) {
    const open = (m.index ?? 0) + m[0].length - 1;
    const args = text.slice(open + 1, closingOf(text, open));
    const before = text.slice(Math.max(0, (m.index ?? 0) - 120), m.index).split('\n').pop() ?? '';
    const kept = /(?:const|let|var)\s+(\w+)\s*=\s*$|(?:^|[^=!<>])\b(\w+)\s*=\s*$/.exec(before);
    runs.push({ file, fn: m[1] ?? '', args, kept: kept ? (kept[1] ?? kept[2] ?? null) : null, statement: /^\s*$/.test(before) });
  }
  return runs;
}

/** Whether a run throws its error output away. */
export const quiet = (run: Run) => /stdio:\s*'ignore'|stdio:\s*\[[^\]]*,\s*'ignore'\s*\]/.test(run.args);

/** Whether a kept answer's output is read, or the run writes to the console itself. */
export const heard = (run: Run, text: string) => /stdio:\s*'inherit'/.test(run.args)
  || run.fn !== 'spawnSync'
  || (!!run.kept && new RegExp(`\\b${run.kept}\\.(stderr|stdout|output)\\b`).test(text))
  || (!run.kept && !run.statement);

const scripts = universe('scripts').filter((p) => /\.(c|m)?js$|\.ts$/.test(p) && !/\.test\./.test(p))
  .concat(universe('testSupport').filter((p) => /\.(c|m)?js$|\.ts$/.test(p)));
const all = scripts.flatMap((p) => {
  const text = readFileSync(p, 'utf8');
  return runsIn(relative(ROOT, p).split('\\').join('/'), text).map((r) => ({ ...r, text }));
});

it('reads every run of another program in the scripts — it is not passing on nothing', () => {
  expect(all.length).toBeGreaterThan(60);
});

it('hears what every program it runs says, unless it names why not', () => {
  const counted: Record<string, number> = {};
  for (const r of all.filter(quiet)) counted[r.file] = (counted[r.file] ?? 0) + 1;
  expect(counted).toEqual(Object.fromEntries(Object.entries(QUIET).map(([f, q]) => [f, q.count])));
  const unheard = all.filter((r) => !quiet(r) && !heard(r, r.text)).map((r) => `${r.file}: ${r.fn}(${r.args.slice(0, 60)}…)`);
  expect(unheard).toEqual([]);
});

it('says NO to a run whose answer is dropped, kept and never read, or thrown away', () => {
  const plant = (text: string) => runsIn('planted.cjs', text).map((r) => ({ quiet: quiet(r), heard: heard(r, text) }));
  expect(plant("spawnSync('node', ['layout.cjs'], { encoding: 'utf8' });\nconst report = read();")).toEqual([{ quiet: false, heard: false }]);
  expect(plant("const r = spawnSync('gitleaks', ['dir'], { encoding: 'utf8' });\nif (r.error) fail();")).toEqual([{ quiet: false, heard: false }]);
  expect(plant("execFileSync('gh', ['run', 'download'], { stdio: 'ignore' });")).toEqual([{ quiet: true, heard: true }]);
  expect(plant("execFileSync('git', ['x'], { stdio: ['ignore', 'pipe', 'ignore'] });")).toEqual([{ quiet: true, heard: true }]);
  expect(plant("const r = spawnSync('psql', [url], { encoding: 'utf8' });\nif (r.status) throw new Error(r.stderr);")).toEqual([{ quiet: false, heard: true }]);
  expect(plant("const run = (a) => spawnSync(bin, a, { encoding: 'utf8' });")).toEqual([{ quiet: false, heard: true }]);
  expect(plant("spawnSync('jest', [], { stdio: 'inherit' });")).toEqual([{ quiet: false, heard: true }]);
});
