/**
 * everyScreenTreeHoldsItsReadyPoint.test.ts — a screen that marks when its content is in places
 * the mark in every tree it returns (useScreenReady).
 *
 * The member page's rooms returned a tree of their own without it: a room opened by its address
 * never said it was ready, the flow waited in vain, and Sentry never timed a room (house_link,
 * run 42156632009). Read with the TypeScript parser: in the function that calls useScreenReady,
 * each return of JSX (not one inside a function of its own, such as a list's renderItem) holds
 * the mark the call returned.
 */
import { readFileSync } from 'fs';
import ts from 'typescript';
import { files, rel } from '@/test-utils/universe';

type Finding = { file: string; line: number; mark: string };

/** Every JSX return of the function calling useScreenReady that does not hold its mark. */
function unmarked(file: string): { calls: number; missing: Finding[] } {
  const text = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const missing: Finding[] = [];
  let calls = 0;
  const isFunction = (n: ts.Node) => ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n);
  const holds = (n: ts.Node, mark: string): boolean => {
    let found = false;
    const look = (x: ts.Node) => {
      if (found) return;
      if (ts.isJsxExpression(x) && x.expression && ts.isIdentifier(x.expression) && x.expression.text === mark) { found = true; return; }
      ts.forEachChild(x, look);
    };
    look(n);
    return found;
  };
  const isJsx = (e: ts.Expression | undefined): boolean => {
    while (e && ts.isParenthesizedExpression(e)) e = e.expression;
    return !!e && (ts.isJsxElement(e) || ts.isJsxFragment(e) || ts.isJsxSelfClosingElement(e));
  };
  const visit = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && n.initializer && ts.isCallExpression(n.initializer)
      && ts.isIdentifier(n.initializer.expression) && n.initializer.expression.text === 'useScreenReady' && ts.isIdentifier(n.name)) {
      calls++;
      const mark = n.name.text;
      let owner: ts.Node = n.parent;
      while (owner && !isFunction(owner)) owner = owner.parent;
      const walk = (x: ts.Node) => {
        if (x !== owner && isFunction(x)) return;
        if (ts.isReturnStatement(x) && isJsx(x.expression) && !holds(x.expression!, mark)) {
          missing.push({ file: rel(file), line: source.getLineAndCharacterOfPosition(x.getStart()).line + 1, mark });
        }
        ts.forEachChild(x, walk);
      };
      walk(owner);
    }
    ts.forEachChild(n, visit);
  };
  visit(source);
  return { calls, missing };
}

const screens = files('appCode').filter((f) => f.endsWith('.tsx') && readFileSync(f, 'utf8').includes('useScreenReady('));
const read = screens.map(unmarked);

it('finds the screens that mark when their content is in', () => {
  expect(read.reduce((n, r) => n + r.calls, 0)).toBeGreaterThan(10);
});

it('each tree such a screen returns holds its mark', () => {
  expect(read.flatMap((r) => r.missing).map((f) => `${f.file}:${f.line} (${f.mark})`)).toEqual([]);
});
