/**
 * Every animation config is a plain literal whose keys all hold a value.
 * ─────────────────────────────────────────────────────────────────────────────
 * Reanimated copies every key of a withTiming / withSpring / withDecay config
 * over its defaults, so a key holding `undefined` replaces a default with
 * nothing: an `easing: undefined` aborted every launch with animations on. The
 * jest fake refuses such a key in every config a test RUNS; this reads every
 * config WRITTEN in src/ and app/, with TypeScript's own checker:
 *   - the config is an object literal, or a conditional whose two branches are
 *     object literals (each read with the condition's narrowing). A variable,
 *     a spread or a call is refused: a config built in a variable passed jest,
 *     yet Sealed E2E was red with it, and only the literal form is proven on
 *     the phone;
 *   - no key's type can be undefined.
 */
import { join } from 'path';
import ts from 'typescript';

const MOBILE = join(__dirname, '..', '..', '..');
const CALLS: Record<string, number> = { withTiming: 1, withSpring: 1, withDecay: 0 };
const UNSURE = ts.TypeFlags.Undefined | ts.TypeFlags.Void | ts.TypeFlags.Any | ts.TypeFlags.Unknown;

const parsed = ts.getParsedCommandLineOfConfigFile(join(MOBILE, 'tsconfig.json'), {}, {
  ...ts.sys, onUnRecoverableConfigFileDiagnostic: (d) => { throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n')); },
})!;
const appFile = (f: string) => /[\\/](src|app)[\\/]/.test(f.slice(MOBILE.length)) && !/__tests__|\.test\.|node_modules/.test(f);

/** Every config call in the files, each with what is wrong with its config ([] when nothing). */
const read = (files: string[]) => {
  const program = ts.createProgram({ rootNames: files, options: parsed.options });
  const checker = program.getTypeChecker();
  const canBeUndefined = (t: ts.Type): boolean => (t.flags & UNSURE) !== 0 || (t.isUnion() && t.types.some(canBeUndefined));
  const literalFaults = (o: ts.ObjectLiteralExpression): string[] => o.properties.flatMap((p) => {
    if (ts.isSpreadAssignment(p)) return ['a spread'];
    if (!ts.isPropertyAssignment(p) && !ts.isShorthandPropertyAssignment(p)) return ['a key that is not a plain value'];
    const type = checker.getTypeAtLocation(ts.isPropertyAssignment(p) ? p.initializer : p.name);
    return canBeUndefined(type) ? [`${p.name.getText()} can be undefined (${checker.typeToString(type)})`] : [];
  });
  const configFaults = (node: ts.Expression): string[] => {
    const e = ts.skipPartiallyEmittedExpressions(ts.isParenthesizedExpression(node) ? node.expression : node);
    if (ts.isObjectLiteralExpression(e)) return literalFaults(e);
    if (ts.isConditionalExpression(e)) {
      const branches = [e.whenTrue, e.whenFalse].map((b) => (ts.isParenthesizedExpression(b) ? b.expression : b));
      if (branches.every(ts.isObjectLiteralExpression)) return branches.flatMap((b) => literalFaults(b as ts.ObjectLiteralExpression));
    }
    return ['not a plain object literal'];
  };
  const found: { site: string; faults: string[] }[] = [];
  for (const sf of program.getSourceFiles().filter((s) => files.includes(s.fileName) || files.includes(s.fileName.replace(/\//g, '\\')))) {
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n)) {
        const callee = ts.isIdentifier(n.expression) ? n.expression.text : ts.isPropertyAccessExpression(n.expression) ? n.expression.name.text : '';
        if (callee in CALLS) {
          const arg = n.arguments[CALLS[callee]];
          const { line } = sf.getLineAndCharacterOfPosition(n.getStart());
          found.push({ site: `${sf.fileName.slice(MOBILE.length + 1).replace(/\\/g, '/')}:${line + 1} ${callee}`, faults: arg ? configFaults(arg) : [] });
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return found;
};

it('reads every animation config in the app, and each is a literal whose keys all hold a value', () => {
  const found = read(parsed.fileNames.filter(appFile));
  expect(found.length).toBeGreaterThanOrEqual(150);
  expect(found.filter((f) => f.faults.length).map((f) => `${f.site}: ${f.faults.join('; ')}`)).toEqual([]);
});

it('the jest fake refuses an empty key in every config a test runs, withDecay\'s included', () => {
  const R = jest.requireMock('react-native-reanimated') as Record<string, (...a: unknown[]) => unknown>;
  expect(() => R.withTiming(1, { duration: 1, easing: undefined })).toThrow('withTiming was given easing with no value');
  expect(() => R.withSpring(1, { damping: undefined })).toThrow('withSpring was given damping with no value');
  expect(() => R.withDecay({ velocity: undefined })).toThrow('withDecay was given velocity with no value');
  expect(() => R.withDecay({ velocity: 1 })).not.toThrow();
});

it('says NO to each shape that let an empty key through, and passes the forms proven on the phone', () => {
  const found = read([join(__dirname, 'fixtures', 'animationConfigs.fixture.ts')]).map((f) => f.faults);
  expect(found).toEqual([
    [expect.stringMatching(/^easing can be undefined/)],
    ['not a plain object literal'],
    [expect.stringMatching(/^easing can be undefined \(undefined\)/)],
    ['a spread'],
    ['not a plain object literal'],
    [],
    [],
    [],
  ]);
});
