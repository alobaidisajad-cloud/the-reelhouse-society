/**
 * anInstantIsReadByTheHouse.guard.test.ts — no line of the app hands text to the engine's own
 * reading of a date (WORKLIST P4.52).
 *
 * `new Date(text)` reads the text as the engine chooses, and the phone's engine is not Node's:
 * the house's own stamps (six places after the second, an offset of `+00`) and anything out of
 * range are read differently there. Fifty places did it, sorting salon messages and grouping
 * notices among them. Each reads through dateOf or instantOf (src/utils/instant.ts) now.
 *
 * Found by the type checker: a `new Date(x)` whose one argument may be a string (or is untyped)
 * stands only in instant.ts. A number of milliseconds, or a Date, is no text to read.
 */
import { readFileSync } from 'fs';
import { join, relative, sep } from 'path';
import ts from 'typescript';
import { MOBILE } from '@/test-utils/readCode';
import { files } from '@/test-utils/universe';

const HOME = 'src/utils/instant.ts';

const mayBeText = (t: ts.Type): boolean =>
  (t.isUnion() ? t.types.some(mayBeText) : !!(t.flags & (ts.TypeFlags.StringLike | ts.TypeFlags.Any | ts.TypeFlags.Unknown)));

/** Each `new Date(x)` with text for its argument in `roots`, as file:line. */
function textDates(program: ts.Program, roots: string[]): string[] {
  const checker = program.getTypeChecker();
  const found: string[] = [];
  for (const file of roots) {
    const rel = relative(MOBILE, file).split(sep).join('/');
    const sf = program.getSourceFile(file);
    if (!sf || rel === HOME) continue;
    const visit = (n: ts.Node): void => {
      if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'Date'
        && n.arguments?.length === 1 && n.arguments[0] && mayBeText(checker.getTypeAtLocation(n.arguments[0]))) {
        found.push(`${rel}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}  ${n.getText(sf)}`);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return found;
}

const options = (): ts.CompilerOptions => {
  const config = ts.readConfigFile(join(MOBILE, 'tsconfig.json'), ts.sys.readFile).config;
  return { ...ts.parseJsonConfigFileContent(config, ts.sys, MOBILE).options, noEmit: true };
};

it('hands no text to the engine to read as a date, but in instant.ts', () => {
  const roots = files('appCode', { ext: ['.ts', '.tsx'] });
  expect(roots.length).toBeGreaterThan(300);
  expect(textDates(ts.createProgram(roots, options()), roots)).toEqual([]);
});

it('finds a date made from text, and not one made from a number, a Date or nothing', () => {
  const file = join(MOBILE, 'src', 'planted.ts');
  const lines = [
    'const a = new Date(stamp);',
    'const b = new Date(whatever);',
    'const c = new Date(ms);',
    'const d = new Date(when);',
    'const e = new Date();',
    'const f = new Date(2026, 1, 9);',
  ];
  const text = `declare const stamp: string;\ndeclare const whatever: any;\ndeclare const ms: number;\ndeclare const when: Date;\n${lines.join('\n')}\n`;
  const host = ts.createCompilerHost(options());
  const read = host.getSourceFile;
  host.getSourceFile = (name, version) => (name.split('\\').join('/').endsWith('src/planted.ts') ? ts.createSourceFile(name, text, version) : read(name, version));
  const program = ts.createProgram([file], options(), host);
  expect(textDates(program, [file]).map((f) => f.replace(/^[^ ]+ {2}/, ''))).toEqual(['new Date(stamp)', 'new Date(whatever)']);
});

it('is the guard instant.ts names', () => {
  expect(readFileSync(join(MOBILE, HOME), 'utf8')).toContain('anInstantIsReadByTheHouse');
});
