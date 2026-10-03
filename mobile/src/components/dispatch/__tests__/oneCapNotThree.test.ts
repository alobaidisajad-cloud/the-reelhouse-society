/**
 * oneCapNotThree.test.ts — the box, the sanitiser and the column.
 * ─────────────────────────────────────────────────────────────────────────────
 * Three numbers decide how long a member's headline may be: what the input box
 * accepts, what `sanitizeInput` trims to, and what the column's CHECK allows.
 * They have to be the same number, and they were not.
 *
 * The essay title input carried a literal `maxLength={100}` while
 * `MAX_LENGTHS.filingTitle` is 200 and `dispatch_posts.title_ceiling` is 200.
 * The box refused the second half of a headline both of the others would have
 * accepted — silently, because `maxLength` does not reject, it simply stops
 * taking keystrokes. A member would find the title would not go any further and
 * never learn why.
 *
 * The sanitiser against each column's ceiling is dispatchFieldCaps', parsed from
 * the snapshot of production; this holds the box.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../../..');

describe('the box may not be stricter than the column', () => {
  // Every box in the app, not the Dispatch's alone: the film review stopped at
  // 2,000 against a column, a cleaner and an import that all kept 5,000, and on
  // Android a box's limit cuts the text it is GIVEN — an imported long review
  // would have been cut on its first edit. A box names its cap (MAX_LENGTHS,
  // held to its column by everyCapAnswersToItsColumn) or a named limit of its own.
  it('no input in the app hardcodes a LITERAL maxLength', () => {
    const files = execFileSync('git', ['ls-files', 'app', 'src'], {
      cwd: ROOT, encoding: 'utf8',
    }).split('\n').filter((f) => /\.tsx$/.test(f) && !/__tests__/.test(f));

    expect(files.length).toBeGreaterThan(200); // the app's screens were found
    expect(files).toContain('src/components/log/LogForm.tsx');
    const literals: string[] = [];
    for (const f of files) {
      fs.readFileSync(path.join(ROOT, f), 'utf8').split(/\r?\n/).forEach((line, i) => {
        // `maxLength={MAX_LENGTHS.x}` is the right shape; `maxLength={100}` is not.
        if (/maxLength=\{?\d+\}?/.test(line)) literals.push(`${f}:${i + 1}  ${line.trim()}`);
      });
    }
    expect(literals).toEqual([]);
  });

  it('the detector can SEE a literal maxLength — not passing on an empty sweep', () => {
    expect(/maxLength=\{?\d+\}?/.test('  maxLength={100}')).toBe(true);
    // …and accepts the shape that names the cap instead of repeating it.
    expect(/maxLength=\{?\d+\}?/.test('  maxLength={MAX_LENGTHS.filingTitle}')).toBe(false);
  });
});
