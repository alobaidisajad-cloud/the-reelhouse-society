/**
 * Every route's parameters are read through the one parser (P4.4).
 *
 * Twenty-two places read them directly, each its own way. A finder over the syntax tree fails on
 * any app file but routeParams.ts that names useLocalSearchParams or useGlobalSearchParams in code
 * (an import, a call), and on a useRouteParams whose shape is not a name or a literal of kinds.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';
import { files, rel } from '@/test-utils/universe';

const ROOT = join(__dirname, '..', '..', '..');
const PARSER = 'src/utils/routeParams.ts';
const READERS = /^use(Local|Global)SearchParams$/;

export function faultsIn(file: string, text: string): string[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: string[] = [];
  const at = (n: ts.Node, what: string) => out.push(`${file}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1} ${what}`);
  const visit = (n: ts.Node) => {
    if (ts.isIdentifier(n) && READERS.test(n.text) && file !== PARSER) at(n, `${n.text}: read through useRouteParams`);
    if (ts.isCallExpression(n) && n.expression.getText(sf) === 'useRouteParams') {
      const shape = n.arguments[0];
      if (!shape || !(ts.isIdentifier(shape) || ts.isObjectLiteralExpression(shape))) at(n, 'useRouteParams: a shape that is not a name or a literal');
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

const scanned = files('appCode', { ext: ['.ts', '.tsx'] }).map(rel)
  .map((f) => ({ f, text: readFileSync(join(ROOT, f), 'utf8') }));

describe('every route', () => {
  it('is read (the scan has not gone blind)', () => {
    expect(scanned.filter(({ text }) => /useRouteParams\(/.test(text)).length).toBeGreaterThanOrEqual(20);
  });

  it('reads its parameters through the parser alone', () => {
    expect(scanned.flatMap(({ f, text }) => faultsIn(f, text))).toEqual([]);
  });

  it('says NO to a direct read, imported or called, and to a shape built on the spot', () => {
    const faults = (src: string) => faultsIn('probe.tsx', src).map((f) => f.replace(/^probe\.tsx:\d+ /, ''));
    expect(faults("import { useLocalSearchParams } from 'expo-router';")).toEqual(['useLocalSearchParams: read through useRouteParams']);
    expect(faults('const { id } = router.useGlobalSearchParams();')).toEqual(['useGlobalSearchParams: read through useRouteParams']);
    expect(faults('const p = useRouteParams(shapeFor(kind));')).toEqual(['useRouteParams: a shape that is not a name or a literal']);
    // A comment that names the router's reader is no read.
    expect(faults('// useLocalSearchParams decodes it back\nconst { id } = useRouteParams(PARAMS);')).toEqual([]);
  });
});
