/**
 * commit.test.ts — scripts/commit.cjs commits exactly the paths it is named,
 * in a throwaway repository: nothing already staged rides along, a path that
 * brings no change stops it, and what is staged is printed before it commits.
 */
import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
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

it('refuses with no paths, no message, or an empty message', () => {
  write('src/a.ts', 'a2\n');
  write('empty.txt', '  \n');
  expect(commit('--message', 'msg.txt').stderr).toContain('no paths named after --');
  expect(commit('--', 'src/a.ts').stderr).toContain('no --message <file>');
  expect(commit('--message', 'empty.txt', '--', 'src/a.ts').stderr).toContain('is missing or empty');
  expect(git('rev-list', '--count', 'HEAD')).toBe('1');
});
