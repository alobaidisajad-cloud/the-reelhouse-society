/**
 * everySourceReaderIsLedgered.test.ts — the ledger is the whole list.
 *
 * test-utils/SOURCE-READING-TESTS.md gives every test that reads a file the
 * reason it does. A ledger kept by hand is a list somebody forgets to add to —
 * the exact failure this project has named three times — so this reads the
 * test tree and fails, naming the file, when:
 *
 *   · a test reads a file (`readFileSync`, `readCode(`) and is not listed;
 *   · a listed file no longer exists, or no longer reads anything — its row
 *     is then a reason for something that is not happening.
 */
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join, relative, sep } from 'path';
import { MOBILE } from '../readCode';

const ROOTS = ['app', 'src', 'mockups', 'test-utils', 'scripts'];
const SKIP = new Set(['node_modules', 'out', '.git', 'android', 'ios', '.expo']);
const READS = /readFileSync|readCode\(/;
const SELF = 'test-utils/__tests__/everySourceReaderIsLedgered.test.ts';

function testFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(e.name)) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.test\.tsx?$/.test(e.name)) out.push(relative(MOBILE, full).split(sep).join('/'));
    }
  };
  for (const r of ROOTS) if (existsSync(join(MOBILE, r))) walk(join(MOBILE, r));
  return out;
}

const ledger = readFileSync(join(MOBILE, 'test-utils/SOURCE-READING-TESTS.md'), 'utf8');
/** Every file named in a table row: | `path` | why | */
const listed = [...ledger.matchAll(/^\|\s*`([^`]+\.test\.tsx?)`\s*\|/gm)].map((m) => m[1]);

describe('every test that reads source says why, in the ledger', () => {
  const readers = testFiles().filter((f) => f !== SELF && READS.test(readFileSync(join(MOBILE, f), 'utf8')));

  it('finds the readers at all', () => {
    // A walker that finds nothing would pass both checks below while proving nothing.
    expect(readers.length).toBeGreaterThan(80);
    expect(listed.length).toBeGreaterThan(80);
  });

  it('lists every file that reads source', () => {
    const missing = readers.filter((f) => !listed.includes(f));
    expect(missing).toEqual([]);
  });

  it('lists nothing that is gone, or no longer reads', () => {
    const stale = listed.filter((f) => !readers.includes(f));
    expect(stale).toEqual([]);
  });

  it('lists each file once, with a reason', () => {
    const twice = listed.filter((f, i) => listed.indexOf(f) !== i);
    expect(twice).toEqual([]);
    for (const m of ledger.matchAll(/^\|\s*`([^`]+\.test\.tsx?)`\s*\|\s*([^|]*)\|/gm)) {
      expect(`${m[1]}: ${m[2].trim().length > 20 ? 'has a reason' : 'NO REASON'}`).toBe(`${m[1]}: has a reason`);
    }
  });
});
