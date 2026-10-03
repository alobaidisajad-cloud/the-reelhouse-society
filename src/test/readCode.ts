/**
 * readCode — a source file as CODE, for the tests whose contract is the source.
 *
 * A regex cannot tell a comment from a string: `'https://…'` loses everything
 * after its `//`, and a `/*` inside a string starts a "comment" that eats code
 * up to the next real one. This parses the file with TypeScript and blanks
 * exactly the comments the parser found between tokens — never a `//` inside a
 * string, a regex, a template or JSX text. The app keeps the same helper
 * (mobile/test-utils/readCode.ts); the two packages share no test code.
 *
 *   readCode('components/CSVImport.tsx')    // relative to src/
 *   stripComments(text, fileName)           // the same, for text in hand
 */
import { readFileSync } from 'fs'
import { isAbsolute, join } from 'path'
import ts from 'typescript'

export const WEB_SRC = join(__dirname, '..')

const KIND: Record<string, ts.ScriptKind> = { ts: ts.ScriptKind.TS, tsx: ts.ScriptKind.TSX, js: ts.ScriptKind.JS, jsx: ts.ScriptKind.JSX, mjs: ts.ScriptKind.JS, cjs: ts.ScriptKind.JS }

/**
 * The text with every comment blanked: its line breaks kept, everything else a
 * space, so positions and line numbers still match the file.
 */
export function stripComments(text: string, file: string): string {
    const ext = (/\.([a-z]+)$/.exec(file)?.[1] ?? '').toLowerCase()
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, KIND[ext] ?? ts.ScriptKind.TSX)
    // JSX text is words on the screen: a `//` in it is a character, not a comment.
    const jsxText: [number, number][] = []
    const found = new Map<number, number>()
    const note = (rs: ts.CommentRange[] | undefined) => rs?.forEach((r) => found.set(r.pos, r.end))
    const visit = (node: ts.Node): void => {
        if (node.kind === ts.SyntaxKind.JsxText) { jsxText.push([node.getFullStart(), node.getEnd()]); return }
        note(ts.getLeadingCommentRanges(text, node.getFullStart()))
        note(ts.getTrailingCommentRanges(text, node.getEnd()))
        node.getChildren(sf).forEach(visit)
    }
    visit(sf)
    const chars = text.split('')
    for (const [pos, end] of found) {
        if (jsxText.some(([a, b]) => pos >= a && pos < b)) continue
        for (let i = pos; i < end; i++) if (chars[i] !== '\n' && chars[i] !== '\r') chars[i] = ' '
    }
    return chars.join('')
}

/** A file under src/ (or an absolute path), as code: its comments blanked. */
export function readCode(file: string): string {
    const path = isAbsolute(file) ? file : join(WEB_SRC, file)
    return stripComments(readFileSync(path, 'utf8'), path)
}
