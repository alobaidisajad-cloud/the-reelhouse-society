/**
 * Every listener and timer an effect starts is torn down by it (P4.41).
 *
 * A listener left on after its screen unmounts keeps the screen's state alive and answers for a
 * screen that is gone; a timer fires into it. A finder over the syntax tree reads every useEffect
 * and useLayoutEffect, finds each addEventListener, addListener, setInterval and setTimeout it
 * starts, follows what it is kept in (a name, a ref, a list it is pushed to, the array a .map makes)
 * and fails unless a cleanup in that file names it, or the effect returns it directly (an
 * unsubscribe handed back). The few left on by design are listed with why.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';
import { files, rel } from '@/test-utils/universe';

const ROOT = join(__dirname, '..', '..', '..');
const START = /(^|\.)(addEventListener|addListener|setInterval|setTimeout)$/;

/** Left on by design: file, the call, and why. */
const BY_DESIGN: { file: string; call: string; why: string }[] = [
  { file: 'src/providers/AppBootstrapper.tsx', call: 'setTimeout', why: 'the hop out of the auth listener (never await auth inside it): 0 ms, in the listener the cleanup removes' },
];

type Left = { file: string; line: number; call: string };

const isFn = (n: ts.Node): n is ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration =>
  ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n);

/** Each start in an effect that no cleanup in the file names. */
export function leftOn(file: string, text: string): Left[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const effects: (ts.ArrowFunction | ts.FunctionExpression)[] = [];
  const find = (n: ts.Node) => {
    if (ts.isCallExpression(n) && /^(React\.)?(useEffect|useLayoutEffect)$/.test(n.expression.getText(sf))) {
      const cb = n.arguments[0];
      if (cb && (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb))) effects.push(cb);
    }
    ts.forEachChild(n, find);
  };
  find(sf);

  /** What an effect hands back: its expression body, or each return of its own (not a nested function's). */
  const returnsOf = (cb: ts.ArrowFunction | ts.FunctionExpression): ts.Node[] => {
    if (!ts.isBlock(cb.body)) return [cb.body];
    const out: ts.Node[] = [];
    const walk = (n: ts.Node) => {
      if (n !== cb.body && isFn(n)) return;
      if (ts.isReturnStatement(n) && n.expression) out.push(n.expression);
      ts.forEachChild(n, walk);
    };
    walk(cb.body);
    return out;
  };
  const cleanups = effects.flatMap(returnsOf).map((r) => r.getText(sf)).join('\n');
  /** A cleanup names it: the whole name, never a part of another (a `t` is not in `setTimer`). */
  const named = (kept: string) => new RegExp(`(^|[^\\w.$])${kept.replace(/[.$]/g, '\\$&')}(?![\\w$])`).test(cleanups);

  /** The name a start is kept in, followed through a .map's array and a push into a list. */
  const keptAs = (call: ts.CallExpression, effect: ts.Node): string | null => {
    let n: ts.Node = call;
    // Inside `xs.map((…) => setTimeout(…))`: the array the map makes.
    const mapArrow = n.parent && ts.isArrowFunction(n.parent) ? n.parent : null;
    if (mapArrow && ts.isCallExpression(mapArrow.parent) && /\.map$/.test(mapArrow.parent.expression.getText(sf))) n = mapArrow.parent;
    let p = n.parent;
    while (p && (ts.isAsExpression(p) || ts.isParenthesizedExpression(p))) p = p.parent;
    let name: string | null = null;
    if (p && ts.isVariableDeclaration(p)) name = p.name.getText(sf);
    else if (p && ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.EqualsToken) name = p.left.getText(sf);
    if (!name) return null;
    const pushed = new RegExp(`([\\w.]+)\\.push\\(\\s*${name.replace(/[.$]/g, '\\$&')}\\s*\\)`).exec(effect.getText(sf));
    return pushed ? pushed[1]! : name;
  };

  const out: Left[] = [];
  for (const cb of effects) {
    const handedBack = returnsOf(cb);
    const visit = (n: ts.Node) => {
      if (handedBack.includes(n) && !ts.isCallExpression(n)) return;
      if (ts.isCallExpression(n) && START.test(n.expression.getText(sf))) {
        const returnedDirectly = handedBack.includes(n);
        const kept = keptAs(n, cb);
        if (!returnedDirectly && !(kept && named(kept))) {
          out.push({ file, line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, call: n.expression.getText(sf).replace(/^.*\./, '') });
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(cb.body);
  }
  return out;
}

const all = files('appCode', { ext: ['.ts', '.tsx'] }).map(rel)
  .map((f) => ({ f, text: readFileSync(join(ROOT, f), 'utf8') }))
  .filter(({ text }) => /useEffect|useLayoutEffect/.test(text));
const left = all.flatMap(({ f, text }) => leftOn(f, text));

describe('every effect', () => {
  it('is read (the scan has not gone blind)', () => {
    expect(all.length).toBeGreaterThanOrEqual(100);
  });

  it('tears down every listener and timer it starts, or it is listed with why', () => {
    const unlisted = left.filter((l) => !BY_DESIGN.some((d) => d.file === l.file && d.call === l.call));
    expect(unlisted.map((l) => `${l.file}:${l.line} ${l.call}`)).toEqual([]);
    const stale = BY_DESIGN.filter((d) => !left.some((l) => l.file === d.file && l.call === d.call));
    expect(stale).toEqual([]);
  });

  it('says NO to one left on, and yes to each way of taking one down', () => {
    const probe = (body: string) => leftOn('probe.tsx', body).map((l) => l.call);
    expect(probe('useEffect(() => { const t = setTimeout(f, 9); }, []);')).toEqual(['setTimeout']);
    expect(probe('useEffect(() => { const t = setTimeout(f, 9); return () => stopTimer(); }, []);')).toEqual(['setTimeout']);
    expect(probe('useEffect(() => { AppState.addEventListener("change", f); }, []);')).toEqual(['addEventListener']);
    expect(probe('useEffect(() => { const t = setTimeout(f, 9); return () => clearTimeout(t); }, []);')).toEqual([]);
    expect(probe('useEffect(() => NetInfo.addEventListener(f), []);')).toEqual([]);
    expect(probe('useEffect(() => { if (a) { const t = setTimeout(f, 1); return () => clearTimeout(t); } }, [a]);')).toEqual([]);
    expect(probe('useEffect(() => { const ts = xs.map(() => setTimeout(f, 1)); return () => ts.forEach(clearTimeout); }, []);')).toEqual([]);
    expect(probe('useEffect(() => { const t = setTimeout(f, 1); list.current.push(t); return () => list.current.forEach(clearTimeout); }, []);')).toEqual([]);
  });
});
