/**
 * readingLog.test.ts — the reading log is written only by scripts/ledger-write.cjs, from a passing coverage record
 * it takes itself. In the repo: READING-LOG.md holds exactly the map's files comment-truth does not check, and
 * every read dated from READS_NEED_RECORDS names a kept record, sealed, that passed and wrote that file. In a
 * throwaway repository: the writer writes from a full reading and refuses a short one, one outside the copy, a
 * planted copy and a copy that is not the commit.
 */
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..');
const lw = require('../ledger-write.cjs') as {
  READS_NEED_RECORDS: string; RECORDS: string; ROW: RegExp;
  commentChecked: (repo: string) => Set<string>;
  write: (o: { repo: string; logPath: string; scopePath: string; allowWrite?: string[]; today?: string; checked?: Set<string> }) => { refused: string | null; written: string[]; kept: string[] };
};
const rm = require('../reading-map.cjs') as { trackedFiles: (r: string) => string[]; decideAll: (f: string[], o: { repo: string }) => { path: string; area?: string }[] };
const { sealOf } = require('../coverage.cjs') as { sealOf: (r: object) => string };

const rowsOf = (file: string) => readFileSync(join(ROOT, 'mobile', 'scripts', file), 'utf8').split(/\r?\n/)
  .map((l) => lw.ROW.exec(l)).filter((m): m is RegExpExecArray => !!m && m[1] !== 'File')
  .map((m) => ({ file: m[1] ?? '', read: m[2] ?? '', said: m[3] ?? '' }));

describe('the reading log in the repo', () => {
  const log = rowsOf('READING-LOG.md');
  const comments = rowsOf('COMMENTS-READ.md');

  it('holds every file of the reading map that comment-truth does not check, and nothing else', () => {
    const checked = lw.commentChecked(ROOT);
    const want = rm.decideAll(rm.trackedFiles(ROOT), { repo: ROOT }).filter((d) => d.area && !checked.has(d.path)).map((d) => d.path).sort();
    expect(want.length).toBeGreaterThan(300);
    expect(log.map((r) => r.file).sort()).toEqual(want);
    expect(log.length).toBe(new Set(log.map((r) => r.file)).size);
  });

  it('dates every read from READS_NEED_RECORDS by a record the writer kept, sealed, passing, naming the file', () => {
    const late = [...comments.map((r) => ({ ...r, rel: r.file.startsWith('../') ? r.file.slice(3) : `mobile/${r.file}` })), ...log.map((r) => ({ ...r, rel: r.file }))]
      .filter((r) => r.read !== '—' && r.read >= lw.READS_NEED_RECORDS);
    const faults = late.flatMap((r) => {
      const id = /\brecord ([a-z0-9-]+)\b/.exec(r.said)?.[1];
      if (!id) return [`${r.rel}: read ${r.read} with no record`];
      const at = join(ROOT, lw.RECORDS, `${id}.json`);
      if (!existsSync(at)) return [`${r.rel}: record ${id} is not kept`];
      const rec = JSON.parse(readFileSync(at, 'utf8'));
      if (rec.seal !== sealOf(rec)) return [`${r.rel}: record ${id} was changed after it was written`];
      if (!rec.pass || rec.planted || !rec.written.includes(r.rel)) return [`${r.rel}: record ${id} did not pass, was planted, or did not write it`];
      return [];
    });
    expect(faults).toEqual([]);
  });
});

describe('the writer, in a throwaway repository', () => {
  let repo: string;
  let copy: string;
  let n = 0;
  const git = (...a: string[]) => spawnSync('git', a, { cwd: repo, encoding: 'utf8' }).stdout.trim();
  const put = (dir: string, rel: string, text: string) => { mkdirSync(join(dir, rel, '..'), { recursive: true }); writeFileSync(join(dir, rel), text); };
  const A = `${Array.from({ length: 12 }, (_, i) => `const a${i} = ${i};`).join('\n')}\n`;
  const S = 'select 1;\nselect 2;\n';
  const ledger = (title: string, rows: string[]) => `# ${title}\n\n| File | Read | What changed |\n|---|---|---|\n${rows.join('\n')}\n`;
  const shown = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => `${a + i}\tx`).join('\n');
  const logOf = (calls: { name: string; input: object; result: string }[]) => calls.flatMap((c) => {
    const id = `t${++n}`;
    return [JSON.stringify({ cwd: copy, timestamp: '2026-11-22T09:00:00.000Z', message: { content: [{ type: 'tool_use', id, name: c.name, input: c.input }] } }),
      JSON.stringify({ cwd: copy, timestamp: '2026-11-22T09:00:01.000Z', message: { content: [{ type: 'tool_result', tool_use_id: id, content: c.result }] } })];
  }).join('\n');
  const reads = (extra: { name: string; input: object; result: string }[] = [], aTo = 12) => [
    { name: 'Read', input: { file_path: join(copy, 'mobile/src/a.ts') }, result: shown(1, aTo) },
    { name: 'Read', input: { file_path: join(copy, 'mobile/supabase/x.sql') }, result: shown(1, 2) },
    ...extra,
  ];
  const run = (calls: ReturnType<typeof reads>, scopeExtra: object = {}, id = 'area-test-1') => {
    const logPath = join(copy, '..', `log-${n}.jsonl`);
    const scopePath = join(copy, '..', `scope-${n}.json`);
    writeFileSync(logPath, logOf(calls));
    writeFileSync(scopePath, JSON.stringify({ id, commit: git('rev-parse', 'HEAD'), copy, planted: false, files: { 'mobile/src/a.ts': 'whole', 'mobile/supabase/x.sql': 'whole' }, ...scopeExtra }));
    return lw.write({ repo, logPath, scopePath, checked: new Set(['mobile/src/a.ts']) });
  };

  beforeEach(() => {
    const top = mkdtempSync(join(tmpdir(), 'ledger-'));
    repo = join(top, 'repo');
    copy = join(top, 'copy');
    mkdirSync(repo);
    git('init', '-q');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    git('config', 'core.hooksPath', '/dev/null');
    git('config', 'core.autocrlf', 'false');
    put(repo, 'mobile/src/a.ts', A);
    put(repo, 'mobile/supabase/x.sql', S);
    put(repo, 'mobile/scripts/COMMENTS-READ.md', ledger('Every comment, read', ['| src/a.ts | — |  |']));
    put(repo, 'mobile/scripts/READING-LOG.md', ledger('Every other file, read', ['| mobile/supabase/x.sql | — |  |']));
    git('add', '.');
    git('commit', '-q', '-m', 'start');
    put(copy, 'mobile/src/a.ts', A);
    put(copy, 'mobile/supabase/x.sql', S);
  });
  afterEach(() => rmSync(join(repo, '..'), { recursive: true, force: true }));

  it('writes each file read whole, in its own ledger, and keeps the sealed record', () => {
    const r = run(reads());
    expect(r.refused).toBeNull();
    expect(r.written.sort()).toEqual(['mobile/src/a.ts', 'mobile/supabase/x.sql']);
    const sha = git('rev-parse', 'HEAD').slice(0, 8);
    expect(readFileSync(join(repo, 'mobile/scripts/COMMENTS-READ.md'), 'utf8')).toContain(`| src/a.ts | 2026-11-22 | read whole at ${sha}, record area-test-1 |`);
    expect(readFileSync(join(repo, 'mobile/scripts/READING-LOG.md'), 'utf8')).toContain(`| mobile/supabase/x.sql | 2026-11-22 | read whole at ${sha}, record area-test-1 |`);
    const rec = JSON.parse(readFileSync(join(repo, lw.RECORDS, 'area-test-1.json'), 'utf8'));
    expect(rec.seal).toBe(sealOf(rec));
  });

  it('refuses a reading that missed one line, and writes nothing', () => {
    const r = run(reads([], 11));
    expect(r.refused).toMatch(/does not pass/);
    expect(readFileSync(join(repo, 'mobile/scripts/COMMENTS-READ.md'), 'utf8')).toContain('| src/a.ts | — |  |');
    expect(existsSync(join(repo, lw.RECORDS, 'area-test-1.json'))).toBe(false);
  });

  it('refuses a reading that opened a file outside the copy', () => {
    const r = run(reads([{ name: 'Read', input: { file_path: join(repo, 'mobile/scripts/COMMENTS-READ.md') }, result: shown(1, 5) }]));
    expect(r.refused).toMatch(/touches outside the copy/);
  });

  it('refuses a planted copy, and a copy that is not the commit', () => {
    expect(run(reads(), { planted: true }).refused).toMatch(/planted/);
    put(copy, 'mobile/supabase/x.sql', 'select 1;\nselect 3;\n');
    expect(run(reads()).refused).toMatch(/copy is not the commit: mobile\/supabase\/x.sql/);
  });

  it('after a change, writes a file only when the scope held what changed since its read', () => {
    expect(run(reads()).refused).toBeNull();
    put(repo, 'mobile/src/a.ts', A.replace('const a9 = 9;', 'const a9 = 90;'));
    put(repo, 'mobile/supabase/x.sql', 'select 1;\nselect 20;\n');
    git('commit', '-q', '-am', 'change');
    put(copy, 'mobile/src/a.ts', A.replace('const a9 = 9;', 'const a9 = 90;'));
    put(copy, 'mobile/supabase/x.sql', 'select 1;\nselect 20;\n');
    const narrow = run([
      { name: 'Read', input: { file_path: join(copy, 'mobile/src/a.ts') }, result: shown(1, 3) },
      { name: 'Read', input: { file_path: join(copy, 'mobile/supabase/x.sql') }, result: shown(1, 2) },
    ], { files: { 'mobile/src/a.ts': [[1, 3]], 'mobile/supabase/x.sql': [[2, 2]] } }, 'area-test-2');
    expect(narrow.refused).toBeNull();
    expect(narrow.written).toEqual(['mobile/supabase/x.sql']);
    expect(narrow.kept).toEqual(['mobile/src/a.ts: its unread changes reach outside the scope']);
  });
});
