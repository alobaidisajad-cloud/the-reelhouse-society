/**
 * oneCommentStripper.test.ts — comments are taken out by the parser, or not at all.
 *
 * Sixty-seven files carried their own regex to remove comments before reading
 * source. A regex cannot tell a comment from a string: `'https://…'` lost
 * everything after its `//`, a `/*` inside a string ate code up to the next
 * real comment, and `// text` inside JSX was taken for a comment. Each copy was
 * a test that could pass by reading less than the file. They all go through
 * readCode/stripComments now (test-utils/readCode.ts), and this keeps it so:
 * a file that brings back one of the shapes below fails here, by name.
 *
 * SQL and YAML have their own comment syntax (`--`, `#`), which these shapes
 * do not match, so a test reading a migration is not caught by mistake.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { MOBILE } from '../readCode';
import { files as universe, rel } from '../universe';

const SELF = 'test-utils/__tests__/oneCommentStripper.test.ts';

/**
 * The hand-made strippers, as they were written in this project — each one
 * the text of a regex literal (backslashes and all), not a pattern to run.
 */
const SHAPES = [
  '\\/\\*[\\s\\S]*?\\*\\/',   // a block comment:  /\/\*[\s\S]*?\*\//
  '\\/\\*[^]*?\\*\\/',        // the same, with [^]
  '\\/\\/.*',                 // a line comment:   /\/\/.*$/
  '\\/\\/[^\\n]*',            // the same:         /\/\/[^\n]*/
  '^\\s*\\/\\/',              // a line that starts with //
  '^\\s*(\\/\\/|\\*)',        // a line that starts with // or *
];

const strippersIn = (text: string) => SHAPES.filter((s) => text.includes(s));

/** Every code file in mobile/ and the edge functions: test-utils/universe.js names them. */
function sourceFiles(): string[] {
  return universe(['appCode', 'tests', 'testSupport', 'scripts', 'config', 'mockups', 'functions', 'standIns'])
    .filter((f) => /\.(ts|tsx|js|jsx|cjs|mjs)$/.test(f)).map(rel);
}

describe('one comment stripper, and it is the parser', () => {
  const files = sourceFiles().filter((f) => f !== SELF);

  it('reads the tree at all', () => {
    // A walk that found nothing would pass the check below while proving nothing.
    expect(files.length).toBeGreaterThan(800);
    expect(files).toContain('test-utils/readCode.ts');
  });

  it('no file removes comments with a regex of its own', () => {
    const found = files.flatMap((f) => strippersIn(readFileSync(join(MOBILE, f), 'utf8')).map((s) => `${f}  ${s}`));
    expect(found).toEqual([]);
  });

  it('would see every shape that was in the tree', () => {
    // The lines as they were, before readCode replaced them.
    const was = [
      "s.replace(/\\/\\*[\\s\\S]*?\\*\\//g, '').replace(/\\/\\/.*$/gm, '')",
      "raw.replace(/\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\//g, '')",
      "src.replace(/\\/\\*[\\s\\S]*?\\*\\//g, '').split('\\n').filter((l) => !/^\\s*(\\/\\/|\\*)/.test(l))",
      "s.replace(/^\\s*\\/\\/.*$/gm, '')",
      "code.filter((l) => !/^\\s*\\/\\//.test(l))",
    ];
    for (const line of was) expect(`${line}: ${strippersIn(line).length > 0}`).toBe(`${line}: true`);
  });

  it('and does not mistake a URL in a pattern, or SQL, for a stripper', () => {
    expect(strippersIn("expect(src).toMatch(/https:\\/\\/www\\.example\\.com/)")).toEqual([]);
    expect(strippersIn("sql.replace(/--[^\\n]*/g, '')")).toEqual([]);
  });
});
