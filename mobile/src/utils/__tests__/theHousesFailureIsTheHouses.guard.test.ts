/**
 * A failure of the house's own is said as the house's.
 * ─────────────────────────────────────────────────────────────────────────────
 * An edge function speaks for the house. When what it leans on cannot answer (a provider refusing
 * the house's own key, a service of the house's unreachable), the caller is told the house is
 * unavailable (5xx), and a 4xx is kept for what the caller sent. Every function, in both trees, is
 * read with TypeScript's parser for four shapes:
 *   - PASSED ON: an outside answer's own status handed to the caller with no branch before it that
 *     answers that outside's 401 and 403 as the house's;
 *   - KEY TOLD AS THEIRS: a branch on an outside answer's 401, 403 or not-ok that answers a 4xx, or
 *     that takes its 401 or 403 in one branch with its 404 (the data counted as not there);
 *   - ERROR TOLD AS THEIRS: a branch on an error the house's own call returned, taken whole (not
 *     its code or status), that answers a 4xx;
 *   - CAUGHT AS THEIRS: a catch around anything awaited but the request's own body that answers a 4xx.
 * Each rule is shown first to say no on planted text.
 */
import { files, rel } from '@/test-utils/universe';
import { readFileSync } from 'fs';

const ts = jest.requireActual('typescript') as typeof import('typescript');
type Node = import('typescript').Node;
type SourceFile = import('typescript').SourceFile;

type Shape = 'PASSED ON' | 'KEY TOLD AS THEIRS' | 'ERROR TOLD AS THEIRS' | 'CAUGHT AS THEIRS';
type Finding = { at: string; shape: Shape; line: number };

/** A call that reaches outside the function: fetch, or a fetch the function wrapped. */
const OUTSIDE_CALL = /^(fetch|withinLimit|fetchWithinLimit|timedFetch)$/;

/** The statuses an expression answers with, where a number is written: json(x, N), { status: N }. */
function answeredStatuses(node: Node, sf: SourceFile): number[] {
  const out: number[] = [];
  const visit = (n: Node) => {
    if (ts.isFunctionLike(n) && n !== node) return;
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'json' && n.arguments.length >= 2) {
      const s = n.arguments[1];
      if (s && ts.isNumericLiteral(s)) out.push(Number(s.text));
    }
    if (ts.isPropertyAssignment(n) && n.name.getText(sf) === 'status' && ts.isNumericLiteral(n.initializer)) out.push(Number(n.initializer.text));
    ts.forEachChild(n, visit);
  };
  visit(node);
  return out;
}

/** The statuses a branch returns, leaving out the branches inside it whose test matches `skip`. */
function branchAnswers(node: Node, sf: SourceFile, skip: RegExp | null): number[] {
  const out: number[] = [];
  const visit = (n: Node) => {
    if (ts.isFunctionLike(n)) return;
    if (skip && ts.isIfStatement(n) && skip.test(n.expression.getText(sf))) return;
    if (ts.isReturnStatement(n) && n.expression) out.push(...answeredStatuses(n.expression, sf));
    ts.forEachChild(n, visit);
  };
  visit(node);
  return out;
}

const is4xx = (s: number) => s >= 400 && s < 500;
const esc = (name: string) => name.split('$').join('[$]');

/** The three shapes, in one file's source. */
export function houseFailingSaidAsTheirs(source: string, at: string): Finding[] {
  const sf = ts.createSourceFile(at, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const found: Finding[] = [];
  const lineOf = (n: Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const outside = new Set<string>();
  const errors = new Set<string>();

  // Names bound to an outside answer, and to the error a call of the house's returned.
  const bind = (n: Node) => {
    if (ts.isVariableDeclaration(n) && n.initializer) {
      let init = n.initializer;
      while (ts.isAwaitExpression(init) || ts.isParenthesizedExpression(init)) init = init.expression;
      if (ts.isIdentifier(n.name) && ts.isCallExpression(init) && ts.isIdentifier(init.expression) && OUTSIDE_CALL.test(init.expression.text)) {
        outside.add(n.name.text);
      }
      if (ts.isObjectBindingPattern(n.name)) {
        for (const el of n.name.elements) {
          const key = el.propertyName ? el.propertyName.getText(sf) : el.name.getText(sf);
          if (key === 'error' && ts.isIdentifier(el.name)) errors.add(el.name.text);
        }
      }
    }
    ts.forEachChild(n, bind);
  };
  bind(sf);

  // Where each outside answer's 401 and 403 are answered (by their start), for PASSED ON.
  const answeredAt = new Map<string, number[]>();
  const branches = (n: Node) => {
    if (ts.isIfStatement(n)) {
      const cond = n.expression.getText(sf);
      for (const x of outside) {
        const s = esc(x);
        const names401 = new RegExp(`\\b${s}\\.status\\s*===?\\s*401\\b`).test(cond);
        const names403 = new RegExp(`\\b${s}\\.status\\s*===?\\s*403\\b`).test(cond);
        const notOk = new RegExp(`!\\s*${s}\\.ok\\b|\\b${s}\\.status\\s*>=?\\s*4\\d\\d\\b`).test(cond);
        if (!(names401 || names403 || notOk)) continue;
        // Answered 4xx, or in one branch with the outside's "not there" (404, 410), which the data is counted for.
        const withNotThere = (names401 || names403) && new RegExp(`\\b${s}\\.status\\s*===?\\s*(404|410)\\b`).test(cond);
        if (withNotThere || branchAnswers(n.thenStatement, sf, null).some(is4xx)) found.push({ at, shape: 'KEY TOLD AS THEIRS', line: lineOf(n) });
        if ((names401 && names403) || notOk) answeredAt.set(x, [...(answeredAt.get(x) ?? []), n.getStart(sf)]);
      }
      for (const e of errors) {
        const s = esc(e);
        // Taken whole: named in the test, and nowhere in it by its code, status or name.
        const examined = new RegExp(`\\b${s}\\s*[?]?\\.\\s*(code|status|name)\\b`);
        if (!new RegExp(`\\b${s}\\b`).test(cond) || examined.test(cond)) continue;
        if (branchAnswers(n.thenStatement, sf, examined).some(is4xx)) found.push({ at, shape: 'ERROR TOLD AS THEIRS', line: lineOf(n) });
      }
    }
    // A catch around a call of the house's or an outside's (anything awaited but the request's own
    // body) that answers 4xx: whatever failed there, the caller is told it was theirs.
    if (ts.isTryStatement(n) && n.catchClause) {
      const asked: string[] = [];
      const awaited = (m: Node) => {
        if (ts.isFunctionLike(m)) return;
        if (ts.isAwaitExpression(m)) asked.push(m.expression.getText(sf));
        ts.forEachChild(m, awaited);
      };
      awaited(n.tryBlock);
      const beyondTheBody = asked.some((a) => !/^req\.(json|text|formData|arrayBuffer)\(\)$/.test(a));
      if (beyondTheBody && branchAnswers(n.catchClause.block, sf, null).some(is4xx)) found.push({ at, shape: 'CAUGHT AS THEIRS', line: lineOf(n.catchClause) });
    }
    ts.forEachChild(n, branches);
  };
  branches(sf);

  const handed = (n: Node) => {
    let status: import('typescript').Expression | undefined;
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'json' && n.arguments.length >= 2) status = n.arguments[1];
    if (ts.isPropertyAssignment(n) && n.name.getText(sf) === 'status') status = n.initializer;
    if (status && ts.isPropertyAccessExpression(status) && status.name.text === 'status' && ts.isIdentifier(status.expression)
      && outside.has(status.expression.text)) {
      if (!(answeredAt.get(status.expression.text) ?? []).some((pos) => pos < n.getStart(sf))) found.push({ at, shape: 'PASSED ON', line: lineOf(n) });
    }
    ts.forEachChild(n, handed);
  };
  handed(sf);
  return found;
}

/** Judged: a hit that is no failure of the house's, each with why. */
const JUDGED: { at: string; shape: Shape; why: string }[] = [];

describe('can say NO: each shape is found on planted text, and the right ones are not', () => {
  const find = (src: string) => houseFailingSaidAsTheirs(src, 'planted.ts').map((f) => f.shape);

  it('an outside status handed on is found; handed on after its 401 and 403 are answered as the house\'s, it is not', () => {
    expect(find('async function f() { const res = await fetch(u); return json(await res.json(), res.status) }')).toEqual(['PASSED ON']);
    expect(find('async function f() { const r = await withinLimit(u); return new Response(b, { status: r.status }) }')).toEqual(['PASSED ON']);
    expect(find(`async function f() { const res = await fetch(u);
      if (res.status === 401 || res.status === 403) return json({ need: 'KEY' }, 503);
      return json(await res.json(), res.status) }`)).toEqual([]);
    expect(find(`async function f() { const res = await fetch(u);
      if (res.status === 401) return json({ need: 'KEY' }, 503);
      return json(await res.json(), res.status) }`)).toEqual(['PASSED ON']);
    expect(find('function f() { const kept = getKept(k); return json(kept.data, kept.status) }')).toEqual([]);
  });

  it('a branch on an outside 401, 403 or not-ok that answers 4xx is found; one that answers 5xx is not', () => {
    expect(find(`async function f() { const res = await fetch(u);
      if (res.status === 401 || res.status === 403) return json({ error: 'x' }, 401) }`)).toEqual(['KEY TOLD AS THEIRS']);
    expect(find(`async function f() { const res = await fetch(u);
      if (!res.ok) return json({ error: 'x' }, 400) }`)).toEqual(['KEY TOLD AS THEIRS']);
    expect(find(`async function f() { const res = await fetch(u);
      if (!res.ok) return json({ error: 'x' }, 503) }`)).toEqual([]);
    expect(find(`async function f() { const res = await withinLimit(u);
      if (res.status === 400 || res.status === 422) return json({ error: 'x' }, 401) }`)).toEqual([]);
    // A refusal of the key in one branch with "not there": the data is counted for the house's key.
    expect(find(`async function f() { const res = await fetch(u);
      if (res.status === 404 || res.status === 401 || res.status === 403) { await db.rpc('strike', {}); return } }`)).toEqual(['KEY TOLD AS THEIRS']);
    expect(find(`async function f() { const res = await fetch(u);
      if (res.status === 401 || res.status === 403) { stop = true; return }
      if (res.status === 404) { await db.rpc('strike', {}); return } }`)).toEqual([]);
  });

  it('a catch around a call beyond the request\'s body that answers 4xx is found; around the body alone, it is not', () => {
    expect(find(`async function f(req) { try { const { data } = await admin.rpc('a', {}); return json(data, 200) }
      catch { return json({ error: 'x' }, 401) } }`)).toEqual(['CAUGHT AS THEIRS']);
    expect(find(`async function f(req) { try { const body = await req.json() } catch { return json({ error: 'x' }, 400) } }`)).toEqual([]);
    expect(find(`async function f(req) { try { await fetch(u) } catch { return json({ error: 'x' }, 503) } }`)).toEqual([]);
  });

  it('an error of the house\'s call taken whole and answered 4xx is found; examined by its code or status first, or answered 5xx, it is not', () => {
    expect(find(`async function f() { const { data: { user }, error: e1 } = await client.auth.getUser();
      if (e1 || !user) return json({ error: 'x' }, 401) }`)).toEqual(['ERROR TOLD AS THEIRS']);
    expect(find(`async function f() { const { data, error } = await admin.rpc('a', {});
      if (error) return json({ error: 'x' }, 404) }`)).toEqual(['ERROR TOLD AS THEIRS']);
    expect(find(`async function f() { const { data, error } = await admin.rpc('a', {});
      if (error) { if (error.code === 'P0002') return { ok: false, status: 404 }; return { ok: false, status: 500 } } }`)).toEqual([]);
    expect(find(`async function f() { const { data, error: e2 } = await admin.rpc('a', {});
      if (e2) return json({ error: 'x' }, 503) }`)).toEqual([]);
    expect(find(`async function f() { const { error } = await client.auth.getUser();
      if (error && error.status >= 400 && error.status < 500) return json({ error: 'x' }, 401) }`)).toEqual([]);
  });
});

describe('every edge function, in both trees', () => {
  const all = files('functions', { ext: ['.ts', '.js'] }).map((path) => ({ path, at: rel(path) }));

  it('reads the functions that call outside and the house: the proxy, the film reader, the handle sign-in and the store sync among them', () => {
    const ats = all.map((f) => f.at);
    for (const must of ['tmdb-proxy/index.ts', 'sync-films/index.ts', 'sign-in-with-username/index.ts', 'sync-entitlement/index.ts', '_shared/storeRecord.ts']) {
      expect([must, ats.some((a) => a.endsWith(must))]).toEqual([must, true]);
    }
  });

  it('says no failure of the house\'s own as the caller\'s or the data\'s, but where judged', () => {
    const hits = all.flatMap(({ path, at }) => houseFailingSaidAsTheirs(readFileSync(path, 'utf8'), at));
    const unjudged = hits.filter((h) => !JUDGED.some((j) => j.at === h.at && j.shape === h.shape)).map((h) => `${h.at}:${h.line} ${h.shape}`);
    expect(unjudged).toEqual([]);
    for (const j of JUDGED) expect([j.at, hits.some((h) => h.at === j.at && h.shape === j.shape)]).toEqual([j.at, true]);
  });
});
