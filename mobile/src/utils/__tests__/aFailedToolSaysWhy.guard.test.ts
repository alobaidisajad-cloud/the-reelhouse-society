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
 *
 * And where a script catches that error, it reports the cause: never only the
 * first line of Node's message, which is "Command failed:" and the command. A
 * failed fetch is the same mistake by another door: its message is "fetch
 * failed", and what failed is its cause.
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

/** The names in a text that run a program and throw when it fails: Node's own, and each helper wrapping one. */
const throwingRunners = (text: string): string[] => {
  const names = ['execSync', 'execFileSync'];
  for (const m of text.matchAll(/(?:function\s+(\w+)\s*\(|(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>)/g)) {
    const body = text.slice((m.index ?? 0) + m[0].length).split(/\n(?=\S)/)[0] ?? '';
    if (/\b(execSync|execFileSync)\(/.test(body)) names.push(m[1] ?? m[2] ?? '');
  }
  return names.filter(Boolean);
};

/** Each catch whose error came from a run or a fetch and whose report drops the cause, in words. */
export function causesDropped(text: string): string[] {
  const runners = throwingRunners(text);
  const runs = new RegExp(`\\b(${runners.join('|')})\\(`);
  const dropped: string[] = [];
  for (const t of text.matchAll(/\btry\s*\{/g)) {
    const open = (t.index ?? 0) + t[0].length - 1;
    const close = closingOf(text, open);
    const tried = text.slice(open, close);
    const c = /^\s*catch\s*\((\w+)\)\s*\{/.exec(text.slice(close + 1));
    if (!c?.[1]) continue;
    const at = close + 1 + c[0].length - 1;
    const caught = text.slice(at, closingOf(text, at));
    const e = c[1];
    const firstLine = new RegExp(`\\b${e}\\.message\\b[^;\\n]*?\\.split\\([^)]*\\)\\s*\\[0\\]`);
    if (runs.test(tried) && firstLine.test(caught) && !new RegExp(`\\b${e}\\.stderr\\b`).test(caught)) {
      dropped.push(`a run's failure told by the first line of its message: ${caught.trim().split('\n')[0]?.slice(0, 80)}`);
    }
    if (/\bfetch\(/.test(tried) && new RegExp(`\\b${e}\\.message\\b`).test(caught) && !new RegExp(`\\b${e}\\.cause\\b`).test(caught)) {
      dropped.push(`a fetch's failure told without its cause: ${caught.trim().split('\n')[0]?.slice(0, 80)}`);
    }
  }
  return dropped;
}

it('reports a failed run or fetch by its cause, never by Node\'s first line alone', () => {
  const files = [...new Set(all.map((r) => r.file))];
  expect(files.length).toBeGreaterThan(30);
  const texts = scripts.map((p) => ({ file: relative(ROOT, p).split('\\').join('/'), text: readFileSync(p, 'utf8') }));
  expect(texts.flatMap(({ file, text }) => causesDropped(text).map((d) => `${file}: ${d}`))).toEqual([]);
});

it('finds a dropped cause in a planted script, and none where the cause is read', () => {
  const sh = 'function sh(cmd) {\n  return execSync(cmd).toString();\n}\n';
  expect(causesDropped(`${sh}try { sh('supabase functions list'); } catch (e) {\n  console.warn(\`skipped: \${e.message.split('\\n')[0]}\`);\n}`)).toHaveLength(1);
  expect(causesDropped(`${sh}try { sh('psql'); } catch (e) {\n  console.warn(\`skipped: \${(e.stderr || e.message).split('\\n')[0]}\`);\n}`)).toEqual([]);
  expect(causesDropped("try { await fetch(url); } catch (e) {\n  console.warn(`skipped: ${e.message}`);\n}")).toHaveLength(1);
  expect(causesDropped("try { await fetch(url); } catch (e) {\n  console.warn(`skipped: ${e.message} ${e.cause?.code}`);\n}")).toEqual([]);
  expect(causesDropped("try { JSON.parse(x); } catch (e) {\n  console.warn(e.message.split('\\n')[0]);\n}")).toEqual([]);
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
