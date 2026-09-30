/**
 * everyCommentIsTrue.test.ts — the reading ledger lists every file whose
 * comments are read, and nothing else.
 *
 * scripts/COMMENTS-READ.md records, per file, the day its comments were last
 * read against its code. Its header promised this test, which did not exist:
 * within two days 41 files went unlisted and 9 rows named files that were gone —
 * the ledger drifting in exactly the way it was written to catch. The list of
 * files is not restated here: it is the one scripts/comment-truth.js checks.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const MOBILE = join(__dirname, '..', '..');
const { checkedFiles } = require(join(MOBILE, 'scripts', 'comment-truth.js')) as {
  checkedFiles: () => { code: string[]; hash: string[]; docs: string[] };
};

const rows = readFileSync(join(MOBILE, 'scripts', 'COMMENTS-READ.md'), 'utf8')
  .split(/\r?\n/)
  .map((l) => /^\| ([^|]+?) \| ([^|]*?) \|/.exec(l))
  .filter((m): m is RegExpExecArray => !!m && m[1] !== 'File' && !m[1].startsWith('---'))
  .map((m) => ({ file: m[1], read: m[2].trim() }));

const checked = (() => {
  const was = process.cwd();
  process.chdir(MOBILE);
  try {
    const f = checkedFiles();
    return [...f.code, ...f.hash, ...f.docs];
  } finally {
    process.chdir(was);
  }
})();

describe('the reading ledger', () => {
  it('found the files and the rows, rather than two empty lists that agree', () => {
    expect(checked.length).toBeGreaterThan(800);
    expect(rows.length).toBeGreaterThan(800);
  });

  it('has a row for every file whose comments are checked', () => {
    const listed = new Set(rows.map((r) => r.file));
    expect(checked.filter((f) => !listed.has(f))).toEqual([]);
  });

  it('has no row for a file that is not checked, or gone', () => {
    const there = new Set(checked);
    expect(rows.map((r) => r.file).filter((f) => !there.has(f))).toEqual([]);
  });

  it('lists each file once, and says when it was read or that it was not', () => {
    const seen = new Set<string>();
    const twice = rows.filter((r) => (seen.has(r.file) ? true : (seen.add(r.file), false)));
    expect(twice).toEqual([]);
    expect(rows.filter((r) => !/^(—|\d{4}-\d{2}-\d{2})$/.test(r.read))).toEqual([]);
  });
});
