/**
 * contractsCommit.test.ts — the nightly asks production the questions of the code its schema matches
 * (scripts/contracts-commit.cjs): while a migration is pending, the commit that last recorded a train in
 * mobile/supabase/APPLIED.txt; once none is, HEAD. Proven in a throwaway repository through a train's
 * whole life (recorded, a migration added, the train recorded), and on this checkout as it stands.
 */
import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const { asked, choose } = require('../contracts-commit.cjs') as {
  choose: (a: { pending: string[]; recorded: string; head: string }) => string;
  asked: (root?: string) => { commit: string; pending: string[]; recorded: string; head: string };
};
const { pendingIn } = require('../../supabase/diagnostics/train.cjs') as { pendingIn: () => { name: string }[] };

it('asks the commit that last recorded a train while any migration is pending, and HEAD once none is', () => {
  expect(choose({ pending: ['20990101_01_a.sql'], recorded: 'r', head: 'h' })).toBe('r');
  expect(choose({ pending: [], recorded: 'r', head: 'h' })).toBe('h');
});

describe('in a repository, through a train\'s life', () => {
  let repo: string;
  const git = (...args: string[]) => spawnSync('git', args, { cwd: repo, encoding: 'utf8' }).stdout.trim();
  const write = (path: string, text: string) => writeFileSync(join(repo, path), text);
  const commit = (message: string) => { git('add', '-A'); git('commit', '-q', '-m', message); return git('rev-parse', 'HEAD'); };

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'contracts-commit-'));
    git('init', '-q');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    git('config', 'core.hooksPath', '/dev/null');
    mkdirSync(join(repo, 'supabase', 'migrations'), { recursive: true });
    mkdirSync(join(repo, 'mobile', 'supabase', 'migrations'), { recursive: true });
  });
  afterEach(() => { rmSync(repo, { recursive: true, force: true }); });

  it('a train recorded, then a migration added: the recorded commit; the next train recorded: HEAD', () => {
    write('supabase/migrations/20990101_01_a.sql', 'SELECT 1;\n');
    write('mobile/supabase/APPLIED.txt', '20990101_01_a.sql\n');
    const recorded = commit('the train of the 1st recorded');
    write('supabase/migrations/20990102_01_b.sql', 'SELECT 2;\n');
    const added = commit('a migration for the next train');
    const pending = asked(repo);
    expect(pending).toEqual({ commit: recorded, pending: ['20990102_01_b.sql'], recorded, head: added });

    write('mobile/supabase/APPLIED.txt', '20990101_01_a.sql\n20990102_01_b.sql\n');
    const next = commit('the train of the 2nd recorded');
    expect(asked(repo)).toEqual({ commit: next, pending: [], recorded: next, head: next });
  });

  it('a commit that changes no migration after the train leaves HEAD the one asked', () => {
    write('supabase/migrations/20990101_01_a.sql', 'SELECT 1;\n');
    write('mobile/supabase/APPLIED.txt', '20990101_01_a.sql\n');
    commit('the train recorded');
    write('README.md', 'words\n');
    const head = commit('words alone');
    expect(asked(repo).commit).toBe(head);
  });
});

it('on this checkout: the train\'s own pending list, and the commit that follows from it', () => {
  const now = asked();
  expect(now.pending).toEqual(pendingIn().map((m) => m.name));
  expect(now.recorded).toMatch(/^[0-9a-f]{40}$/);
  expect(now.commit).toBe(now.pending.length ? now.recorded : now.head);
});
