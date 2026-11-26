/**
 * commit.test.ts — scripts/commit.cjs commits exactly the paths it is named,
 * in a throwaway repository: nothing already staged rides along, a path that
 * brings no change stops it, and what is staged is printed before it commits.
 */
import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const SCRIPT = join(__dirname, '..', 'commit.cjs');
let repo: string;

const git = (...args: string[]) => spawnSync('git', args, { cwd: repo, encoding: 'utf8' }).stdout.trimEnd();
const commit = (...args: string[]) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: repo, encoding: 'utf8' });
const write = (path: string, text: string) => writeFileSync(join(repo, path), text);

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'commit-'));
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  git('config', 'core.hooksPath', '/dev/null');
  mkdirSync(join(repo, 'src'));
  write('src/a.ts', 'a\n');
  write('src/b.ts', 'b\n');
  write('msg.txt', 'one change\n');
  git('add', 'src');
  git('commit', '-q', '-m', 'start');
});
afterEach(() => { rmSync(repo, { recursive: true, force: true }); });

it('commits the paths named and nothing else, and prints what it staged', () => {
  write('src/a.ts', 'a2\n');
  write('src/b.ts', 'b2\n');
  const r = commit('--message', 'msg.txt', '--', 'src/a.ts');
  expect(r.status).toBe(0);
  expect(r.stdout).toBe('M\tsrc/a.ts\n');
  expect(git('show', '--name-only', '--format=%s', 'HEAD')).toBe('one change\n\nsrc/a.ts');
  // The other change is still the member's own, unstaged.
  expect(git('status', '--porcelain')).toContain(' M src/b.ts');
});

it('refuses when something else is already staged, before staging anything', () => {
  write('src/a.ts', 'a2\n');
  write('src/b.ts', 'b2\n');
  git('add', 'src/b.ts');
  const r = commit('--message', 'msg.txt', '--', 'src/a.ts');
  expect(r.status).toBe(1);
  expect(r.stderr).toContain('REFUSED: already staged, and not by this commit: src/b.ts');
  expect(git('diff', '--cached', '--name-only')).toBe('src/b.ts');
  expect(git('rev-list', '--count', 'HEAD')).toBe('1');
});

it('refuses a named path that brings no change, and leaves the index as it was', () => {
  write('src/a.ts', 'a2\n');
  const r = commit('--message', 'msg.txt', '--', 'src/a.ts', 'src/b.ts');
  expect(r.status).toBe(1);
  expect(r.stderr).toContain('named but brings no change: src/b.ts');
  expect(git('diff', '--cached', '--name-only')).toBe('');
  expect(git('rev-list', '--count', 'HEAD')).toBe('1');
});

it('refuses an ignored path, and unstages what git staged before it stopped', () => {
  write('.gitignore', '*.log\n');
  write('src/a.ts', 'a2\n');
  write('src/run.log', 'kept\n');
  const r = commit('--message', 'msg.txt', '--', 'src/a.ts', 'src/run.log');
  expect(r.status).toBe(1);
  expect(r.stderr).toContain('REFUSED: git add:');
  expect(r.stderr).toContain('the index is as it was');
  expect(git('diff', '--cached', '--name-only')).toBe('');
  expect(git('rev-list', '--count', 'HEAD')).toBe('1');
});

it('commits a new file and a deleted one by name', () => {
  write('src/c.ts', 'c\n');
  rmSync(join(repo, 'src', 'b.ts'));
  const r = commit('--message', 'msg.txt', '--', 'src/c.ts', 'src/b.ts');
  expect([r.status, r.stderr]).toEqual([0, '']);
  expect(r.stdout).toBe('D\tsrc/b.ts\nA\tsrc/c.ts\n');
});

it('commits a renamed file by both its names', () => {
  // the same words under a new name: git reads it as a rename
  write('src/c.ts', 'b\n');
  rmSync(join(repo, 'src', 'b.ts'));
  const r = commit('--message', 'msg.txt', '--', 'src/b.ts', 'src/c.ts');
  expect([r.status, r.stderr]).toEqual([0, '']);
  expect(r.stdout).toBe('D\tsrc/b.ts\nA\tsrc/c.ts\n');
});

describe('--merge: a finished branch brought in by a merge commit, its history and its mutant verdicts kept', () => {
  const RESULTS = 'mobile/register/mutant-results.json';
  const entry = (id: string, commit: string) => ({ class: 'X-y', mutant: id, proof: 'm1', commit, verdict: 'caught' });
  const record = (a: string, b: string) => write(RESULTS, `${JSON.stringify([entry('shape-a', a), entry('shape-b', b)], null, 2)}\n`);
  const head = () => git('rev-parse', 'HEAD');
  let start: string;
  beforeEach(() => {
    git('config', 'core.autocrlf', 'false');
    mkdirSync(join(repo, 'mobile', 'register'), { recursive: true });
    write('mobile/register/mutants.yaml', 'mutants:\n  - { id: shape-a, class: X-y, source: shape, edits: [{ file: src/a.ts, find: a, replace: b }] }\n'
      + '  - { id: shape-b, class: X-y, source: shape, edits: [{ file: src/b.ts, find: b, replace: c }] }\n');
    record('0000000', '0000000');
    git('add', 'mobile');
    git('commit', '-q', '-m', 'the registry');
    start = head();
    record(start, start);
    git('add', 'mobile');
    git('commit', '-q', '-m', 'both run');
    // The branch changes b and records b's run at its own commit; main does the same for a.
    git('checkout', '-q', '-b', 'feature');
    write('src/b.ts', 'b on the branch\n');
    git('commit', '-q', '-am', 'b changed');
    record(start, head());
    git('commit', '-q', '-am', 'b run');
    git('checkout', '-q', '-');
    write('src/a.ts', 'a on main\n');
    git('commit', '-q', '-am', 'a changed');
    record(head(), start);
    git('commit', '-q', '-am', 'a run');
  });

  it('makes a merge commit of both, writing each mutant\'s verdict from the side that ran it last', () => {
    const main = git('rev-parse', 'HEAD~1');
    const branch = git('rev-parse', 'feature~1');
    const r = commit('--merge', 'feature', '--message', 'msg.txt');
    expect([r.status, r.stderr]).toEqual([0, '']);
    expect(r.stdout).toContain('mobile/register/mutant-results.json: written from both sides');
    expect(git('rev-list', '--parents', '-1', 'HEAD').split(' ')).toHaveLength(3);
    expect(git('log', '-1', '--format=%s')).toBe('one change');
    expect(JSON.parse(git('show', `HEAD:${RESULTS}`)).map((x: { commit: string }) => x.commit)).toEqual([main, branch]);
    // Both histories are whole: every commit a verdict names is in HEAD's.
    expect(spawnSync('git', ['merge-base', '--is-ancestor', branch, 'HEAD'], { cwd: repo }).status).toBe(0);
  }, 60_000);

  it('leaves a conflict elsewhere in hand, named, and --merge-continue finishes it once no conflict mark is left', () => {
    git('checkout', '-q', 'feature');
    write('src/a.ts', 'a on the branch too\n');
    git('commit', '-q', '-am', 'a on the branch');
    git('checkout', '-q', '-');
    const r = commit('--merge', 'feature', '--message', 'msg.txt');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('--merge-continue --message msg.txt -- src/a.ts');
    expect(commit('--merge-continue', '--message', 'msg.txt', '--', 'src/a.ts').stderr).toContain('still holds a conflict mark: src/a.ts');
    write('src/a.ts', 'a as both want it\n');
    const done = commit('--merge-continue', '--message', 'msg.txt', '--', 'src/a.ts');
    expect([done.status, git('rev-list', '--parents', '-1', 'HEAD').split(' ').length]).toEqual([0, 3]);
    expect(commit('--merge', 'feature', '--message', 'msg.txt').stderr).toContain('REFUSED: git merge: Already up to date');
  }, 60_000);

  it('writes the results itself once the registry is resolved by hand: a mark git left in the results is not the hand\'s', () => {
    const REGISTRY = 'mobile/register/mutants.yaml';
    const row = (id: string, file: string) => `  - { id: ${id}, class: X-y, source: shape, edits: [{ file: ${file}, find: x, replace: y }] }\n`;
    const registry = readFileSync(join(repo, REGISTRY), 'utf8');
    // Each side adds a mutant at the registry's end and records both rows at its own commit: both files conflict.
    git('checkout', '-q', 'feature');
    write(REGISTRY, registry + row('shape-c', 'src/b.ts'));
    record(head(), head());
    git('commit', '-q', '-am', 'c added');
    git('checkout', '-q', '-');
    write(REGISTRY, registry + row('shape-d', 'src/a.ts'));
    record(head(), head());
    git('commit', '-q', '-am', 'd added');
    const r = commit('--merge', 'feature', '--message', 'msg.txt');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`-- ${RESULTS} ${REGISTRY}`);
    write(REGISTRY, registry + row('shape-c', 'src/b.ts') + row('shape-d', 'src/a.ts'));
    const done = commit('--merge-continue', '--message', 'msg.txt', '--', REGISTRY, RESULTS);
    expect([done.status, done.stderr]).toEqual([0, '']);
    expect(done.stdout).toContain(`${RESULTS}: written from both sides`);
    expect(git('show', `HEAD:${RESULTS}`)).not.toMatch(/^(<{7}|>{7}) /m);
  }, 60_000);
});

it('refuses with no paths, no message, or an empty message', () => {
  write('src/a.ts', 'a2\n');
  write('empty.txt', '  \n');
  expect(commit('--message', 'msg.txt').stderr).toContain('no paths named after --');
  expect(commit('--', 'src/a.ts').stderr).toContain('no --message <file>');
  expect(commit('--message', 'empty.txt', '--', 'src/a.ts').stderr).toContain('is missing or empty');
  expect(git('rev-list', '--count', 'HEAD')).toBe('1');
});
