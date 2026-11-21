/**
 * coverage.test.ts — scripts/coverage.cjs takes what a reader opened from its own work log, and passes a scope
 * only when every line of it was opened and nothing outside the copy was touched. Each log here is written the way
 * the Agent tool writes one: a tool_use block, then a tool_result naming its id.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const cov = require('../coverage.cjs') as {
  norm: (p: string) => string;
  linesShown: (t: string) => [number, number] | null;
  missing: (want: number[][], have: number[][]) => number[][];
  check: (o: { logText: string; scope: Scope; allowWrite?: string[] }) => Rec;
  sealOf: (r: Rec) => string;
};
type Scope = { id: string; commit: string; copy: string; planted?: boolean; files: Record<string, 'whole' | number[][]>; cells?: { id: string; evidence: string[] }[] };
type Rec = { pass: boolean; percent: number; outside: { why: string }[]; files: Record<string, { missing: unknown[] }>; cells: Record<string, { missing: string[] }>; seal: string };

let copy: string;
let n = 0;
type Call = { name: string; input: Record<string, unknown>; result: unknown; error?: boolean; cwd?: string };
const logOf = (calls: Call[]) => calls.flatMap((c) => {
  const id = `toolu_${++n}`;
  return [
    JSON.stringify({ type: 'assistant', cwd: c.cwd ?? copy, timestamp: '2026-11-21T10:00:00.000Z', message: { role: 'assistant', content: [{ type: 'tool_use', id, name: c.name, input: c.input }] } }),
    JSON.stringify({ type: 'user', cwd: c.cwd ?? copy, timestamp: '2026-11-21T10:00:01.000Z', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: c.result, is_error: c.error === true }] } }),
  ];
}).join('\n');
/** What the Read tool answers for lines a..b of a file of `total` lines: each numbered, then a reminder. */
const shown = (a: number, b: number) => `${Array.from({ length: b - a + 1 }, (_, i) => `${a + i}\tline ${a + i}`).join('\n')}\n\n<system-reminder>\n12\tnot a line of the file\n</system-reminder>`;
const read = (rel: string, a: number, b: number): Call => ({ name: 'Read', input: { file_path: join(copy, rel) }, result: shown(a, b) });
const scope = (files: Scope['files'], extra: Partial<Scope> = {}): Scope => ({ id: 'test-1', commit: 'abc', copy, files, ...extra });

beforeEach(() => {
  copy = mkdtempSync(join(tmpdir(), 'cov-'));
  mkdirSync(join(copy, 'mobile', 'src'), { recursive: true });
  writeFileSync(join(copy, 'mobile', 'src', 'a.ts'), `${Array.from({ length: 30 }, (_, i) => `l${i + 1}`).join('\n')}\n`);
  writeFileSync(join(copy, 'mobile', 'src', 'b.ts'), `${Array.from({ length: 10 }, (_, i) => `b${i + 1}`).join('\n')}\n`);
  writeFileSync(join(copy, 'mobile', 'src', 'p.png'), 'not really a picture');
});
afterEach(() => rmSync(copy, { recursive: true, force: true }));

describe('what a Read answer showed', () => {
  it('is the run of numbered lines from the first, and stops where the run breaks', () => {
    expect(cov.linesShown(shown(5, 9))).toEqual([5, 9]);
    expect(cov.linesShown('File unchanged since last read.')).toBeNull();
    expect(cov.linesShown('1→one\n2→two')).toEqual([1, 2]);
  });
  it('names the parts of a range not held', () => {
    expect(cov.missing([[1, 30]], [[1, 10], [12, 29]])).toEqual([[11, 11], [30, 30]]);
    expect(cov.missing([[5, 8]], [[1, 30]])).toEqual([]);
  });
  it('reads git-bash and Windows spellings of a path as one', () => {
    expect(cov.norm('/d/house/x/../y/f.ts')).toBe('D:/house/y/f.ts');
    expect(cov.norm('d:\\house\\y\\f.ts')).toBe('D:/house/y/f.ts');
  });
});

describe('a scope opened in full', () => {
  it('passes when every line was opened, in parts, and the record is sealed', () => {
    const r = cov.check({ logText: logOf([read('mobile/src/a.ts', 1, 20), read('mobile/src/a.ts', 18, 31), read('mobile/src/b.ts', 3, 6)]), scope: scope({ 'mobile/src/a.ts': 'whole', 'mobile/src/b.ts': [[3, 6]] }) });
    expect(r.outside).toEqual([]);
    expect(r).toMatchObject({ pass: true, percent: 100 });
    expect(r.seal).toBe(cov.sealOf(r));
    expect(cov.sealOf({ ...r, percent: 99 })).not.toBe(r.seal);
  });
  it('counts a picture opened whole when the answer held the image', () => {
    const pic: Call = { name: 'Read', input: { file_path: join(copy, 'mobile/src/p.png') }, result: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AA==' } }] };
    expect(cov.check({ logText: logOf([pic]), scope: scope({ 'mobile/src/p.png': 'whole' }) }).pass).toBe(true);
  });
  it("covers a cell when every one of its pictures and trees was opened", () => {
    writeFileSync(join(copy, 'tree.json'), '{\n}\n');
    const cells = [{ id: 'lobby/empty/narrow/android/normal', evidence: ['mobile/src/b.ts', 'tree.json'] }];
    const half = cov.check({ logText: logOf([read('mobile/src/b.ts', 1, 10)]), scope: scope({}, { cells }) });
    expect(half.pass).toBe(false);
    expect(half.cells['lobby/empty/narrow/android/normal']?.missing).toEqual(['tree.json']);
    const whole = cov.check({ logText: logOf([read('mobile/src/b.ts', 1, 10), read('tree.json', 1, 2)]), scope: scope({}, { cells }) });
    expect(whole.pass).toBe(true);
  });
});

describe('a scope not opened in full fails', () => {
  it('when one range of one file was never opened', () => {
    const r = cov.check({ logText: logOf([read('mobile/src/a.ts', 1, 14), read('mobile/src/a.ts', 16, 31)]), scope: scope({ 'mobile/src/a.ts': 'whole' }) });
    expect(r.pass).toBe(false);
    expect(r.files['mobile/src/a.ts']?.missing).toEqual([[15, 15]]);
  });
  it('when the lines came only from the call asking for them, the answer failing', () => {
    const failed: Call = { ...read('mobile/src/b.ts', 1, 10), error: true };
    expect(cov.check({ logText: logOf([failed]), scope: scope({ 'mobile/src/b.ts': 'whole' }) }).pass).toBe(false);
  });
  it('when the reader only searched the file, which shows lines but opens none', () => {
    const grep: Call = { name: 'Grep', input: { pattern: 'b', path: copy, output_mode: 'content' }, result: 'mobile/src/b.ts:1:b1' };
    expect(cov.check({ logText: logOf([grep]), scope: scope({ 'mobile/src/b.ts': 'whole' }) }).pass).toBe(false);
  });
});

describe('a touch outside the copy voids the record', () => {
  const full = () => read('mobile/src/b.ts', 1, 10);
  const voids = (c: Call) => {
    const r = cov.check({ logText: logOf([full(), c]), scope: scope({ 'mobile/src/b.ts': 'whole' }) });
    expect(r.pass).toBe(false);
    return r.outside.map((o) => o.why).join('; ');
  };
  it('a file read outside it', () => {
    expect(voids({ name: 'Read', input: { file_path: 'D:/elsewhere/repo/mobile/register/classes.yaml' }, result: shown(1, 3) })).toContain('read D:/elsewhere/repo/mobile/register/classes.yaml');
  });
  it('a search outside it, or with no folder from a working folder outside it', () => {
    expect(voids({ name: 'Grep', input: { pattern: 'x', path: 'D:/elsewhere/repo' }, result: '' })).toContain('searched');
    expect(voids({ name: 'Glob', input: { pattern: '**/*.ts' }, cwd: 'D:/elsewhere/repo', result: '' })).toContain('searched');
  });
  it('a shell that names a path outside, climbs above, runs outside, or reaches the network', () => {
    expect(voids({ name: 'Bash', input: { command: `cd ${copy} && cat /d/elsewhere/repo/notes.md` }, result: '' })).toContain('named');
    expect(voids({ name: 'Bash', input: { command: `cd ${copy} && cat ../../secret.md` }, result: '' })).toContain('above');
    expect(voids({ name: 'PowerShell', input: { command: 'Get-Content notes.md' }, cwd: 'D:/elsewhere/repo', result: '' })).toContain('ran a shell in');
    expect(voids({ name: 'Bash', input: { command: `cd ${copy} && curl https://example.com` }, result: '' })).toContain('network');
  });
  it('another agent, the web, or a change to the copy', () => {
    expect(voids({ name: 'Agent', input: { prompt: 'read the notes' }, result: 'done' })).toContain('another agent');
    expect(voids({ name: 'WebFetch', input: { url: 'https://example.com' }, result: '' })).toContain('network');
    expect(voids({ name: 'Edit', input: { file_path: join(copy, 'mobile/src/b.ts'), old_string: 'b1', new_string: 'b0' }, result: 'ok' })).toContain('changed the copy');
  });
  it('a copy on Linux is its own POSIX path: a shell inside it is clean, one naming a path beside it is not', () => {
    const linux = '/tmp/cov-on-linux';
    const outside = (command: string) => cov.check({
      logText: logOf([{ name: 'Bash', input: { command }, cwd: linux, result: '' }]),
      scope: scope({}, { copy: linux }),
    }).outside.map((o: { why: string }) => o.why);
    expect(outside(`cd ${linux} && cat ${linux}/mobile/src/a.ts`)).toEqual([]);
    expect(outside(`cd ${linux} && cat /tmp/cov-beside/notes.md`)).toEqual(['named /tmp/cov-beside/notes.md']);
  });
  it('but not the findings file it was given, nor a long answer saved where the tool said', () => {
    const findings = 'C:/rounds/R15/findings/A10.jsonl';
    const savedAt = 'D:\\elsewhere\\.claude\\projects\\p\\s\\tool-results\\x.txt';
    const shell: Call = { name: 'Bash', input: { command: `cd ${copy} && cat mobile/src/a.ts` }, result: `<persisted-output>\nOutput too large. Full output saved to: ${savedAt}\n` };
    const r = cov.check({
      logText: logOf([full(), shell, { name: 'Read', input: { file_path: savedAt }, result: shown(1, 5) }, { name: 'Write', input: { file_path: findings, content: '{}' }, result: 'ok' }]),
      scope: scope({ 'mobile/src/b.ts': 'whole' }),
      allowWrite: [findings],
    });
    expect(r.outside).toEqual([]);
    expect(r.pass).toBe(true);
  });
});
