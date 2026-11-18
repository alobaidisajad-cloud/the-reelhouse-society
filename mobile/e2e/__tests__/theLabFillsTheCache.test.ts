/**
 * theLabFillsTheCache.test.ts — the speed lab opens thirty films in a row as the member and judges
 * the query cache's writes at that size (round 13).
 *
 * The cache's writes were traced (cache.persist) and read only from what the E2E flows happened to
 * write, a cache a few reads large: the bound on how long a write may hold the JS thread never met
 * the cache of a member who has opened film after film. films.sh makes that run on the lab's
 * emulator; films.mjs judges its log, and the speed lab fails on its word.
 */
import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const LAB = join(__dirname, '..', 'lab');
const WORKFLOW = join(__dirname, '..', '..', '..', '.github', 'workflows', 'speed-lab.yml');
const SCRIPT = join(LAB, 'films.mjs');

const filmLine = (id: number) => `11-18 20:01:02.345  4321  4377 W ReactNativeJS: [e2e] film.data {"id":${id}}`;
const writeLine = (chars: number, ms: number) =>
  `11-18 20:02:05.000  4321  4377 W ReactNativeJS: [e2e] cache.persist {"chars":${chars},"ms":${ms}}`;
const thirty = Array.from({ length: 30 }, (_, i) => filmLine(1000 + i));

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'lab-films-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

/** films.mjs judge, run as the speed lab runs it, on a device log. */
function judged(lines: string[]) {
  writeFileSync(join(dir, 'films.log'), lines.join('\n'));
  const r = spawnSync(process.execPath, [SCRIPT, 'judge', dir], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
}

describe('the thirty films', () => {
  it('are thirty, each a film the sealed world holds, those whose page is recorded first', () => {
    const r = spawnSync(process.execPath, [SCRIPT, 'ids'], { encoding: 'utf8' });
    const ids = r.stdout.trim().split(/\r?\n/).map(Number);
    expect(ids).toHaveLength(30);
    expect(new Set(ids).size).toBe(30);
    // The pages recorded so far (The Godfather's 238 among them) come first.
    expect(ids.slice(0, 4)).toEqual(expect.arrayContaining([238]));
  });
});

describe("the judge of the cache's writes", () => {
  it('passes a run that read the thirty films and wrote a member-sized cache quickly', () => {
    const { code, out } = judged([...thirty, writeLine(120_000, 14), writeLine(380_000, 46)]);
    expect(code).toBe(0);
    expect(out).toMatch(/films read: 30 of 30/);
    expect(out).toMatch(/the largest 380000 characters, the slowest 46 ms/);
  });

  it('fails a write that held the JS thread over its bound, naming it', () => {
    const { code, out } = judged([...thirty, writeLine(380_000, 46), writeLine(390_000, 140)]);
    expect(code).toBe(1);
    expect(out).toMatch(/a write of the query cache held the JS thread 140 ms, over 100 ms/);
  });

  it('fails a run whose cache never reached a member\'s size: its times say nothing of it', () => {
    const { code, out } = judged([...thirty, writeLine(20_000, 3)]);
    expect(code).toBe(1);
    expect(out).toMatch(/the largest write held 20000 characters, under a member's 250000/);
  });

  it('fails a run that did not read the thirty films', () => {
    const { code, out } = judged([...thirty.slice(0, 12), writeLine(380_000, 30)]);
    expect(code).toBe(1);
    expect(out).toMatch(/only 12 of 30 films answered their read/);
  });
});

describe('the speed lab', () => {
  const yml = readFileSync(WORKFLOW, 'utf8');
  it('opens the thirty films on an emulator, and fails on the judge\'s word', () => {
    expect(yml).toMatch(/script: bash mobile\/e2e\/lab\/films\.sh/);
    const judge = /- name: The cache's writes, judged[\s\S]*?exit \$rc/.exec(yml)?.[0] ?? '';
    expect(judge).toMatch(/node e2e\/lab\/films\.mjs judge "\$F"/);
    expect(judge).toMatch(/rc=\$\?/);
  });

  it('opens each film in the same run of the app, so the cache grows as a member\'s does', () => {
    const sh = readFileSync(join(LAB, 'films.sh'), 'utf8');
    const loop = /while read -r id; do[\s\S]*?done < "\$OUT\/ids\.txt"/.exec(sh)?.[0] ?? '';
    expect(loop).toMatch(/reelhouse:\/\/film\/\$id/);
    expect(loop).not.toMatch(/force-stop|pm clear/);
    // Each adb call in the loop reads nothing of the loop's own input (adb shell eats it).
    expect(loop).toMatch(/< \/dev\/null/);
  });
});
