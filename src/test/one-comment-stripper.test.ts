/**
 * one-comment-stripper.test.ts — comments are taken out by the parser, or not at all.
 *
 * Three web tests carried their own regex to remove comments before reading
 * source. A regex cannot tell a comment from a string: `'https://…'` lost
 * everything after its `//`, and a `/*` inside a string ate code up to the
 * next real comment. They go through readCode (src/test/readCode.ts) now, and
 * this keeps it so: a file that brings back one of the shapes below fails here,
 * by name. The app holds the same rule (mobile/test-utils/__tests__/oneCommentStripper.test.ts).
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import { join, relative, sep } from 'path'
import { WEB_SRC } from './readCode'

const SELF = 'test/one-comment-stripper.test.ts'

/** The hand-made strippers, as the text of a regex literal (backslashes and all). */
const SHAPES = [
    '\\/\\*[\\s\\S]*?\\*\\/',   // a block comment:  /\/\*[\s\S]*?\*\//
    '\\/\\*[^]*?\\*\\/',        // the same, with [^]
    '\\/\\/.*',                 // a line comment:   /\/\/.*$/
    '\\/\\/[^\\n]*',            // the same:         /\/\/[^\n]*/
    '^\\s*\\/\\/',              // a line that starts with //
    '^\\s*(\\/\\/|\\*)',        // a line that starts with // or *
]

const strippersIn = (text: string) => SHAPES.filter((s) => text.includes(s))

const sourceFiles = (dir: string, out: string[] = []): string[] => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules') continue
        const full = join(dir, e.name)
        if (e.isDirectory()) sourceFiles(full, out)
        else if (/\.(ts|tsx|js|jsx|cjs|mjs)$/.test(e.name)) out.push(relative(WEB_SRC, full).split(sep).join('/'))
    }
    return out
}

describe('one comment stripper, and it is the parser', () => {
    const files = sourceFiles(WEB_SRC).filter((f) => f !== SELF)

    it('reads the tree at all', () => {
        expect(files.length).toBeGreaterThan(200)
        expect(files).toContain('test/readCode.ts')
    })

    it('no file removes comments with a regex of its own', () => {
        const found = files.flatMap((f) => strippersIn(readFileSync(join(WEB_SRC, f), 'utf8')).map((s) => `${f}  ${s}`))
        expect(found).toEqual([])
    })

    it('would see every shape that was in the tree', () => {
        const was = [
            "s.replace(/\\/\\*[\\s\\S]*?\\*\\//g, ' ').replace(/\\/\\/.*$/gm, ' ')",
            "s.replace(/^\\s*\\/\\/.*$/gm, '')",
            ".filter((l) => !/^\\s*\\/\\//.test(l))",
        ]
        for (const line of was) expect(`${line}: ${strippersIn(line).length > 0}`).toBe(`${line}: true`)
    })

    it('and does not mistake a URL in a pattern, or SQL, for a stripper', () => {
        expect(strippersIn('expect(src).toMatch(/https:\\/\\/www\\.example\\.com/)')).toEqual([])
        expect(strippersIn("sql.replace(/--[^\\n]*/g, '')")).toEqual([])
    })
})
