/**
 * everySourceReaderIsLedgered.test.ts — the ledger is the whole list.
 *
 * test-utils/SOURCE-READING-TESTS.md gives every test that reads a file the
 * reason it does. A ledger kept by hand is a list somebody forgets to add to —
 * the exact failure this project has named three times — so this reads the
 * test tree and fails, naming the file, when:
 *
 *   · a test reads a file (`readFileSync`, `readCode(`, or a whole TypeScript
 *     program, `createProgram(`) and is not listed;
 *   · a listed file no longer exists, or no longer reads anything — its row
 *     is then a reason for something that is not happening.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { MOBILE } from '../readCode';
import { files, rel } from '../universe';

const READS = /readFileSync|readCode\(|createProgram\(/;
const SELF = 'test-utils/__tests__/everySourceReaderIsLedgered.test.ts';

/** Every jest test in mobile/, wherever it lives (test-utils/universe.js names them). */
function testFiles(): string[] {
  return files('tests').filter((f) => /\.test\.tsx?$/.test(f)).map(rel);
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
