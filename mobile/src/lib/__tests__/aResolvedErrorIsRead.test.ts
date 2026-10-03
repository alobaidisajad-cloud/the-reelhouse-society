/**
 * aResolvedErrorIsRead.test.ts — every supabase answer's failure is read, or judged.
 * ─────────────────────────────────────────────────────────────────────────────
 * supabase-js RESOLVES a failure as `{ error }`; a try/catch around it never sees
 * one. Read for its data alone, a failed read is taken for "none": a member with
 * no films, a stack copied once per import, an offline write the queue deleted.
 *
 * This finds, in every app file, each awaited supabase call whose `error` is not
 * read, and each result taken out of a `Promise.all` whose `error` is not read.
 * The second shape was a blind spot of the sweep this replaces, and hid two.
 * A site may stand unread only when it is listed below with the reason that
 * makes it right; a new one fails until it is read, and a listed one that no
 * longer exists fails too, so the list is always the whole truth.
 */
import { readFileSync, readdirSync } from 'fs';
import { join, relative, sep } from 'path';
import ts from 'typescript';

const ROOT = join(__dirname, '..', '..', '..');

/** Each judged site, by file and shape, with how many there are and why each is right. */
const JUDGED: Record<string, { n: number; why: string }> = {
  'app/(modals)/membership.tsx · [auth] result discarded': {
    n: 2, why: 'a best-effort refresh; restoreSession follows and reads its own answer',
  },
  'app/reset-password.tsx · [auth] result discarded': {
    n: 1, why: 'a best-effort refresh; restoreSession follows and reads its own answer',
  },
  'src/services/ProfileWriteService.ts · [storage] destructured without error (data)': {
    n: 1, why: 'avatar clean-up: a listing that failed purges nothing',
  },
  'src/services/ProfileWriteService.ts · [storage] result discarded': {
    n: 1, why: 'avatar clean-up: a failed purge leaves old files, never the live one',
  },
  'src/stores/auth.ts · [from] destructured without error (data)': {
    n: 1, why: 'restore without a profile keeps the cached member: an error never signs anyone out',
  },
  'src/stores/domain/logSlice/helpers/logOperations.ts · [from] destructured without error (data)': {
    n: 3, why: 'the two lookups are backstopped by the unique key, whose refusal reaches the toast; '
      + 'the viewing read refuses honestly ("needs a connection")',
  },
  'src/stores/domain/socialSlice.ts · [from] destructured without error (data)': {
    n: 1, why: 'the insert below answers: a follow already held is a duplicate, taken as followed',
  },
  'src/stores/lounge.ts · [rpc] destructured without error (data)': {
    n: 1, why: 'member faces are decoration; a card without them shows its count',
  },
  'src/utils/offlineQueue.ts · [from] destructured without error (data)': {
    n: 1, why: 'the server refuses a banned member\'s writes; this purge is a courtesy in front of it',
  },
  ...Object.fromEntries(['logsCount', 'ledgerCount', 'watchCount', 'vaultCount', 'listsCount'].map((c) => [
    `src/services/ProfileDataService.ts · Promise.all · ${c}`, { n: 1, why: 'read by `countRead()`' },
  ])),
  'src/hooks/useMemberRoom.ts · Promise.all · totals': {
    n: 1, why: 'read through `r`, its typed alias',
  },
  'src/hooks/useUniversalSearch.ts · Promise.all · usersRes': { n: 1, why: 'read by `failed()`' },
  'src/hooks/useUniversalSearch.ts · Promise.all · exactRes': { n: 1, why: 'read by `failed()`' },
  'src/hooks/useUniversalSearch.ts · Promise.all · logsTextRes': { n: 1, why: 'read by `failed()`' },
  'src/hooks/useUniversalSearch.ts · Promise.all · logsAuthorRes': { n: 1, why: 'read by `failed()`' },
  'src/hooks/useUniversalSearch.ts · Promise.all · listsRes': { n: 1, why: 'read by `failed()`' },
};

// ── the scan ────────────────────────────────────────────────────────────────

/** The supabase surface a chain starts at (from, rpc, storage, auth…), or null. */
function rootsAtSupabase(expr: ts.Node): string | null {
  let e: ts.Node | undefined = expr;
  for (let i = 0; i < 40 && e; i++) {
    if (ts.isCallExpression(e)) { e = e.expression; continue; }
    if (ts.isPropertyAccessExpression(e)) {
      if (ts.isIdentifier(e.expression) && e.expression.text === 'supabase') return e.name.text;
      e = e.expression; continue;
    }
    if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e)) { e = e.expression; continue; }
    return null;
  }
  return null;
}

/**
 * The supabase call in an expression, through wrappers such as withAbortSignal(q) and
 * timed(() => q), either arm of a `?:`, and a query built first in a variable.
 */
function supabaseIn(expr: ts.Node | undefined, depth = 0): string | null {
  if (!expr || depth > 4) return null;
  const root = rootsAtSupabase(expr);
  if (root) return root;
  if (ts.isConditionalExpression(expr)) return supabaseIn(expr.whenTrue, depth + 1) ?? supabaseIn(expr.whenFalse, depth + 1);
  if (ts.isIdentifier(expr)) {
    const init = declaredAs(expr);
    return init ? supabaseIn(init, depth + 1) : null;
  }
  if (ts.isCallExpression(expr)) {
    for (const a of expr.arguments) {
      const inner = ts.isArrowFunction(a) || ts.isFunctionExpression(a) ? (ts.isBlock(a.body) ? undefined : a.body) : a;
      const got = supabaseIn(inner, depth + 1);
      if (got) return got;
    }
  }
  return null;
}

/** What a name was declared as, within its own function: `let q = supabase.from(…)`. */
function declaredAs(name: ts.Identifier): ts.Expression | undefined {
  let scope: ts.Node | undefined = name.parent;
  while (scope && !ts.isFunctionLike(scope) && !ts.isSourceFile(scope)) scope = scope.parent;
  let init: ts.Expression | undefined;
  const look = (n: ts.Node) => {
    if (init) return;
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name.text && n.initializer) init = n.initializer;
    else ts.forEachChild(n, look);
  };
  if (scope) look(scope);
  return init;
}

const AUTH_LOCAL =/auth\.(getSession|getUser|signOut|onAuthStateChange|startAutoRefresh|stopAutoRefresh)\b/;

/** Every unread failure in one file, as `file · shape` (no line: lines move). */
export function unreadErrors(rel: string, text: string): string[] {
  // By extension: parsed as TSX, a .ts file's `<Type>value` cast reads as JSX and the rest is lost.
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: string[] = [];
  const reads = (scope: ts.Node, name: string) =>
    new RegExp(`\\b${name}\\??\\.error\\b|\\{[^}]*\\berror\\b[^}]*\\}\\s*=\\s*${name}\\b`).test(scope.getText(sf));
  const enclosing = (n: ts.Node) => {
    let f: ts.Node | undefined = n;
    while (f && !ts.isFunctionLike(f)) f = f.parent;
    return f ?? sf;
  };

  const visit = (node: ts.Node) => {
    if (ts.isAwaitExpression(node)) {
      const kind = supabaseIn(node.expression);
      if (kind && !(kind === 'auth' && AUTH_LOCAL.test(node.expression.getText(sf))) && kind !== 'channel' && kind !== 'removeChannel') {
        const parent = node.parent;
        let shape: string | null = null;
        if (ts.isExpressionStatement(parent)) shape = 'result discarded';
        else if (ts.isVariableDeclaration(parent) && ts.isObjectBindingPattern(parent.name)) {
          const names = parent.name.elements.map((el) => (el.propertyName || el.name).getText(sf));
          if (!names.includes('error')) shape = `destructured without error (${names.join(', ')})`;
        } else if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
          if (!reads(enclosing(parent), parent.name.text)) shape = `assigned to ${parent.name.text}, .error never read`;
        }
        if (shape) found.push(`${rel} · [${kind}] ${shape}`);
      }
    }
    // supabase….then(({ data }) => …) or .then((res) => …): the answer taken in a callback
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'then') {
      const kind = supabaseIn(node.expression.expression);
      const handler = node.arguments[0];
      const local = kind === 'auth' && AUTH_LOCAL.test(node.expression.expression.getText(sf));
      if (kind && !local && handler && (ts.isArrowFunction(handler) || ts.isFunctionExpression(handler)) && handler.parameters[0]) {
        const p = handler.parameters[0].name;
        if (ts.isObjectBindingPattern(p)) {
          const names = p.elements.map((el) => (el.propertyName || el.name).getText(sf));
          if (!names.includes('error')) found.push(`${rel} · [${kind}] then without error (${names.join(', ')})`);
        } else if (ts.isIdentifier(p) && !reads(handler, p.text)) {
          found.push(`${rel} · [${kind}] then, ${p.text}.error never read`);
        }
      }
    }
    // const [a, b] = await Promise.all([supabase…, supabase…])
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isArrayBindingPattern(node.name)) {
      const init = ts.isAwaitExpression(node.initializer) ? node.initializer.expression : node.initializer;
      if (ts.isCallExpression(init) && /Promise\.all(Settled)?$/.test(init.expression.getText(sf))
        && init.arguments[0] && ts.isArrayLiteralExpression(init.arguments[0])) {
        const elems = init.arguments[0].elements;
        node.name.elements.forEach((b, i) => {
          if (!ts.isBindingElement(b) || !elems[i] || !supabaseIn(elems[i])) return;
          if (ts.isObjectBindingPattern(b.name)) {
            const names = b.name.elements.map((e) => (e.propertyName || e.name).getText(sf));
            if (!names.includes('error')) found.push(`${rel} · Promise.all · {${names.join(', ')}}`);
          } else if (!reads(enclosing(node), b.name.getText(sf))) {
            found.push(`${rel} · Promise.all · ${b.name.getText(sf)}`);
          }
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

function appFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '__tests__', 'generated'].includes(e.name) || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) appFiles(p, out);
    else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name) && !e.name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

// ── the tests ───────────────────────────────────────────────────────────────

describe('a resolved error is read', () => {
  it('the scan sees both shapes, and passes over a read one', () => {
    const probe = [
      'async function f() {',
      "  const { data } = await supabase.from('t').select('x');",
      "  const [one, two] = await Promise.all([supabase.from('t').select('x'), supabase.rpc('r')]);",
      '  if (two.error) throw two.error;',
      "  let q = supabase.from('v').select('z');",
      "  const [held, maybe] = await Promise.all([withAbortSignal(q, s), on ? supabase.from('w').select('a') : skip]);",
      '  void held.data; void maybe.data;',
      "  const { data: d2, error } = await supabase.from('u').select('y');",
      "  supabase.from('t').select('x').then(({ data: d3 }) => use(d3));",
      "  supabase.from('t').select('x').then((res) => use(res.data));",
      "  supabase.from('t').select('x').then(({ data: d4, error: e4 }) => use(e4 ? null : d4));",
      '  return [data, one.data, d2, error];',
      '}',
    ].join('\n');
    expect(unreadErrors('probe.ts', probe)).toEqual([
      'probe.ts · [from] destructured without error (data)',
      'probe.ts · Promise.all · one',
      'probe.ts · Promise.all · held',
      'probe.ts · Promise.all · maybe',
      'probe.ts · [from] then without error (data)',
      'probe.ts · [from] then, res.error never read',
    ]);
  });

  it('in every app file, or the site is judged with its reason', () => {
    const counts = new Map<string, number>();
    const files = [...appFiles(join(ROOT, 'app')), ...appFiles(join(ROOT, 'src'))];
    expect(files.length).toBeGreaterThan(300);
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      if (!text.includes('supabase')) continue;
      for (const k of unreadErrors(relative(ROOT, f).split(sep).join('/'), text)) counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const unjudged = [...counts].filter(([k, n]) => n > (JUDGED[k]?.n ?? 0)).map(([k, n]) => `${k} ×${n}`);
    expect(unjudged).toEqual([]);
    // A judgement for a site that is gone, or fewer than it names, is a door left open.
    const stale = Object.entries(JUDGED).filter(([k, j]) => (counts.get(k) ?? 0) !== j.n).map(([k]) => k);
    expect(stale).toEqual([]);
  });
});
