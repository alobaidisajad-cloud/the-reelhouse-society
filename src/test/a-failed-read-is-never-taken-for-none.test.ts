/**
 * a-failed-read-is-never-taken-for-none.test.ts — every supabase answer's failure
 * is read on the website, or judged.
 *
 * supabase-js RESOLVES a failure as `{ error }`; a try/catch around it never
 * sees one. Read for its data alone, a failed read is taken for "none": the
 * transfer took an archive it could not read for an empty one and sent every
 * film already logged again. This finds, in every website file, each awaited
 * supabase call whose `error` is not read, and each result taken out of a
 * `Promise.all` whose `error` is not read. A site may stand unread only when it
 * is listed below with the reason that makes it right; a new one fails until it
 * is read, and a listed one that no longer exists fails too. The app holds the
 * same rule (mobile/src/lib/__tests__/aResolvedErrorIsRead.test.ts).
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import { join, relative, sep } from 'path'
import ts from 'typescript'
import { WEB_SRC } from './readCode'

/** Each judged site, by file and shape, with how many there are and why each is right. */
const JUDGED: Record<string, { n: number; why: string }> = {
    'errorLogger.ts · [from] result discarded': {
        n: 1, why: 'the logger writing its own row: logging a failed log write would loop, and no member waits on it',
    },
    'pages/DispatchPage.tsx · [rpc] result discarded': {
        n: 1, why: 'a view tally: a failed bump loses one view, and nothing the member sees or did depends on it',
    },
    'stores/lounge.ts · [from] result discarded': {
        n: 1, why: 'markAsRead: a failed write shows the count again on the next unread fetch, and the next open writes it again',
    },
    'stores/lounge.ts · [from] destructured without error (data)': {
        n: 1, why: 'a browser notice whose sender could not be read says "Someone", which is true; the message is read in the room',
    },
}

// ── the scan ────────────────────────────────────────────────────────────────

/** The supabase surface a chain starts at (from, rpc, storage, auth…), or null. */
function rootsAtSupabase(expr: ts.Node): string | null {
    let e: ts.Node | undefined = expr
    for (let i = 0; i < 40 && e; i++) {
        if (ts.isCallExpression(e)) { e = e.expression; continue }
        if (ts.isPropertyAccessExpression(e)) {
            if (ts.isIdentifier(e.expression) && e.expression.text === 'supabase') return e.name.text
            e = e.expression; continue
        }
        if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e)) { e = e.expression; continue }
        return null
    }
    return null
}

/** The supabase call in an expression, through wrappers, either arm of a `?:`, and a query built first in a variable. */
function supabaseIn(expr: ts.Node | undefined, depth = 0): string | null {
    if (!expr || depth > 4) return null
    const root = rootsAtSupabase(expr)
    if (root) return root
    if (ts.isConditionalExpression(expr)) return supabaseIn(expr.whenTrue, depth + 1) ?? supabaseIn(expr.whenFalse, depth + 1)
    if (ts.isIdentifier(expr)) {
        const init = declaredAs(expr)
        return init ? supabaseIn(init, depth + 1) : null
    }
    if (ts.isCallExpression(expr)) {
        for (const a of expr.arguments) {
            const inner = ts.isArrowFunction(a) || ts.isFunctionExpression(a) ? (ts.isBlock(a.body) ? undefined : a.body) : a
            const got = supabaseIn(inner, depth + 1)
            if (got) return got
        }
    }
    return null
}

/** What a name was declared as, within its own function: `let q = supabase.from(…)`. */
function declaredAs(name: ts.Identifier): ts.Expression | undefined {
    let scope: ts.Node | undefined = name.parent
    while (scope && !ts.isFunctionLike(scope) && !ts.isSourceFile(scope)) scope = scope.parent
    let init: ts.Expression | undefined
    const look = (n: ts.Node) => {
        if (init) return
        if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name.text && n.initializer) init = n.initializer
        else ts.forEachChild(n, look)
    }
    if (scope) look(scope)
    return init
}

const AUTH_LOCAL = /auth\.(getSession|getUser|signOut|onAuthStateChange|startAutoRefresh|stopAutoRefresh)\b/

const KIND: Record<string, ts.ScriptKind> = { ts: ts.ScriptKind.TS, tsx: ts.ScriptKind.TSX, js: ts.ScriptKind.JS, jsx: ts.ScriptKind.JSX }

/** Every unread failure in one file, as `file · shape` (no line: lines move). */
function unreadErrors(rel: string, text: string): string[] {
    const ext = (/\.([a-z]+)$/.exec(rel)?.[1] ?? 'ts')
    const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, KIND[ext] ?? ts.ScriptKind.TS)
    const found: string[] = []
    const reads = (scope: ts.Node, name: string) =>
        new RegExp(`\\b${name}\\??\\.error\\b|\\{[^}]*\\berror\\b[^}]*\\}\\s*=\\s*${name}\\b`).test(scope.getText(sf))
    const enclosing = (n: ts.Node) => {
        let f: ts.Node | undefined = n
        while (f && !ts.isFunctionLike(f)) f = f.parent
        return f ?? sf
    }

    const visit = (node: ts.Node) => {
        if (ts.isAwaitExpression(node)) {
            const kind = supabaseIn(node.expression)
            if (kind && !(kind === 'auth' && AUTH_LOCAL.test(node.expression.getText(sf))) && kind !== 'channel' && kind !== 'removeChannel') {
                const parent = node.parent
                let shape: string | null = null
                if (ts.isExpressionStatement(parent)) shape = 'result discarded'
                else if (ts.isVariableDeclaration(parent) && ts.isObjectBindingPattern(parent.name)) {
                    const names = parent.name.elements.map((el) => (el.propertyName || el.name).getText(sf))
                    if (!names.includes('error')) shape = `destructured without error (${names.join(', ')})`
                } else if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
                    if (!reads(enclosing(parent), parent.name.text)) shape = `assigned to ${parent.name.text}, .error never read`
                }
                if (shape) found.push(`${rel} · [${kind}] ${shape}`)
            }
        }
        // supabase….then(({ data }) => …) or .then((res) => …): the answer taken in a callback
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'then') {
            const kind = supabaseIn(node.expression.expression)
            const handler = node.arguments[0]
            const local = kind === 'auth' && AUTH_LOCAL.test(node.expression.expression.getText(sf))
            if (kind && !local && handler && (ts.isArrowFunction(handler) || ts.isFunctionExpression(handler)) && handler.parameters[0]) {
                const p = handler.parameters[0].name
                if (ts.isObjectBindingPattern(p)) {
                    const names = p.elements.map((el) => (el.propertyName || el.name).getText(sf))
                    if (!names.includes('error')) found.push(`${rel} · [${kind}] then without error (${names.join(', ')})`)
                } else if (ts.isIdentifier(p) && !reads(handler, p.text)) {
                    found.push(`${rel} · [${kind}] then, ${p.text}.error never read`)
                }
            }
        }
        // const [a, b] = await Promise.all([supabase…, supabase…])
        if (ts.isVariableDeclaration(node) && node.initializer && ts.isArrayBindingPattern(node.name)) {
            const init = ts.isAwaitExpression(node.initializer) ? node.initializer.expression : node.initializer
            if (ts.isCallExpression(init) && /Promise\.all(Settled)?$/.test(init.expression.getText(sf))
                && init.arguments[0] && ts.isArrayLiteralExpression(init.arguments[0])) {
                const elems = init.arguments[0].elements
                node.name.elements.forEach((b, i) => {
                    if (!ts.isBindingElement(b) || !elems[i] || !supabaseIn(elems[i])) return
                    if (ts.isObjectBindingPattern(b.name)) {
                        const names = b.name.elements.map((e) => (e.propertyName || e.name).getText(sf))
                        if (!names.includes('error')) found.push(`${rel} · Promise.all · {${names.join(', ')}}`)
                    } else if (!reads(enclosing(node), b.name.getText(sf))) {
                        found.push(`${rel} · Promise.all · ${b.name.getText(sf)}`)
                    }
                })
            }
        }
        ts.forEachChild(node, visit)
    }
    visit(sf)
    return found
}

function webFiles(dir: string, out: string[] = []): string[] {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', 'test', '__tests__'].includes(e.name) || e.name.startsWith('.')) continue
        const p = join(dir, e.name)
        if (e.isDirectory()) webFiles(p, out)
        else if (/\.(ts|tsx|js|jsx)$/.test(e.name) && !/\.test\./.test(e.name) && !e.name.endsWith('.d.ts')) out.push(p)
    }
    return out
}

// ── the tests ───────────────────────────────────────────────────────────────

describe('a failed read is never taken for none', () => {
    it('the scan sees both shapes, and passes over a read one', () => {
        const probe = [
            'async function f() {',
            "  const { data } = await supabase.from('t').select('x');",
            "  const [one, two] = await Promise.all([supabase.from('t').select('x'), supabase.rpc('r')]);",
            '  if (two.error) throw two.error;',
            "  const { data: d2, error } = await supabase.from('u').select('y');",
            "  await supabase.from('v').delete().eq('id', 1);",
            "  supabase.from('t').select('x').then(({ data: d3 }) => use(d3));",
            "  supabase.from('t').select('x').then((res) => use(res.data));",
            "  supabase.from('t').select('x').then(({ data: d4, error: e4 }) => use(e4 ? null : d4));",
            '  return [data, one.data, d2, error];',
            '}',
        ].join('\n')
        expect(unreadErrors('probe.ts', probe)).toEqual([
            'probe.ts · [from] destructured without error (data)',
            'probe.ts · Promise.all · one',
            'probe.ts · [from] result discarded',
            'probe.ts · [from] then without error (data)',
            'probe.ts · [from] then, res.error never read',
        ])
    })

    it('in every website file, or the site is judged with its reason', () => {
        const counts = new Map<string, number>()
        const files = webFiles(WEB_SRC)
        expect(files.length).toBeGreaterThan(100)
        for (const f of files) {
            const text = readFileSync(f, 'utf8')
            if (!text.includes('supabase')) continue
            for (const k of unreadErrors(relative(WEB_SRC, f).split(sep).join('/'), text)) counts.set(k, (counts.get(k) ?? 0) + 1)
        }
        const unjudged = [...counts].filter(([k, n]) => n > (JUDGED[k]?.n ?? 0)).map(([k, n]) => `${k} ×${n}`)
        expect(unjudged).toEqual([])
        // A judgement for a site that is gone, or fewer than it names, is a door left open.
        const stale = Object.entries(JUDGED).filter(([k, j]) => (counts.get(k) ?? 0) !== j.n).map(([k]) => k)
        expect(stale).toEqual([])
    })
})
