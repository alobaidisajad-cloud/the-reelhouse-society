/**
 * THE VAULT on the web — the rules a private note lives by.
 * ─────────────────────────────────────────────────────────────────────────────
 * The mobile app carries the same guards (theVaultBelongsToItsViewing.test.tsx).
 * Every rule here was broken on the web at some point, invisibly:
 *
 *   · it read and wrote `logs.private_notes`, which the database keeps BLANK, so
 *     a member's Vault read back empty and the next save wrote the emptiness back;
 *   · a rewatch built the viewing history in the browser and JSON.stringify'd it,
 *     which shredded 16 members' histories into single characters;
 *   · log drafts — review AND private note — sat under a key with no member in
 *     it, and nothing cleared them on sign-out;
 *   · three copies of "write a log" existed, two of them unused, so a fix could
 *     land in one and not the others.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join, relative } from 'path'

const SRC = join(__dirname, '..')
const read = (p: string) => readFileSync(join(SRC, p), 'utf8')
/** Source minus comments, so the history of a bug never satisfies a test. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

const walk = (dir: string, out: string[] = []): string[] => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, e.name)
        if (e.isDirectory()) { if (e.name !== 'test' && e.name !== 'node_modules') walk(full, out) }
        else if (/\.(ts|tsx|js|jsx)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(full)
    }
    return out
}
const ALL = walk(SRC).map(f => ({ file: relative(SRC, f).replace(/\\/g, '/'), src: code(readFileSync(f, 'utf8')) }))

describe('a note is never read from, or written to, the log row', () => {
    it('no web file names the `private_notes` column', () => {
        // `log_private_notes` (the Vault's own table) does not match: there is no
        // word boundary between its underscore and "private".
        const offenders = ALL.filter(f => /\bprivate_notes\b/.test(f.src)).map(f => f.file)
        expect(offenders).toEqual([])
    })

    it('no log read asks for every column — `*` would include it', () => {
        const offenders = ALL
            .filter(f => /from\(\s*['"]logs['"]\s*\)[\s\S]{0,80}?\.select\(\s*['"]\*['"]/.test(f.src))
            .map(f => f.file)
        expect(offenders).toEqual([])
    })

    it('the member’s own log list carries the viewing, which is what a note belongs to', () => {
        const films = code(read('stores/films.ts'))
        const select = films.match(/from\('logs'\)\.select\('([^']+)'\)/)
        expect(select).not.toBeNull()
        expect(select![1]).toMatch(/\bviewing_id\b/)
    })

    it('the only door to a note is services/vault.ts', () => {
        const others = ALL
            .filter(f => f.file !== 'services/vault.ts')
            .filter(f => /from\(\s*['"]log_private_notes['"]|rpc\(\s*['"]viewing_note_/.test(f.src))
            .map(f => f.file)
        // The offline queue replays queued note acts by name — the one other
        // place allowed to call the note RPCs.
        expect(others).toEqual(['utils/offlineQueue.ts'])
    })
})

describe('a viewing is added by the server, never by rewriting the history', () => {
    it('nothing on the web writes `viewing_history` or `view_count`', () => {
        // Both are the server's now. The trigger computes the count from the
        // history, and only the two viewing operations may move a log on.
        const writes = ALL.filter(f =>
            /(update|insert|upsert)\(\s*\[?\s*\{[^}]*\b(viewing_history|view_count)\s*:/.test(f.src)
            || /\b(viewing_history|view_count)\s*:\s*(JSON\.stringify|'\[\]'|newHistory|newViewCount|1\b)/.test(f.src))
            .map(f => f.file)
        expect(writes).toEqual([])
    })

    it('no history is ever JSON.stringify’d — that is what shredded 16 of them', () => {
        const offenders = ALL.filter(f => /JSON\.stringify\([^)]*[Hh]istory/.test(f.src)).map(f => f.file)
        expect(offenders).toEqual([])
    })

    it('a rewatch goes through log_viewing_add, naming its viewing before the write', () => {
        const m = code(read('features/film/hooks/useFilmMutations.ts'))
        expect(m).toMatch(/const newViewingId = crypto\.randomUUID\(\)/)
        expect(m).toMatch(/Vault\.addViewing\(existingLog\.id, newViewingId, fields\)/)
        // …and offline, it queues the same act by the same name.
        expect(m).toMatch(/type: 'add_viewing', payload: \{ log_id: existingLog\.id, viewing_id: newViewingId, fields \}/)
    })

    it('every new log names its first viewing, so a note can be written on it at once', () => {
        const m = code(read('features/film/hooks/useFilmMutations.ts'))
        expect((m.match(/viewing_id: crypto\.randomUUID\(\)/g) ?? []).length).toBe(2) // a first log, and marking watched
    })

    it('there is ONE way to write a log — the unused copies are gone', () => {
        const films = code(read('stores/films.ts'))
        for (const gone of ['addLog:', 'markAsWatched:', 'unmarkWatched:', 'updateLog:']) expect(films).not.toContain(gone)
        expect(ALL.some(f => f.file === 'api/supabase.ts')).toBe(false)
        expect(code(read('features/film/hooks/useFilmMutations.ts'))).not.toMatch(/export function useUnmarkWatched/)
    })

    it('the offline queue replays all four Vault acts', () => {
        const q = code(read('utils/offlineQueue.ts'))
        for (const [type, rpc] of [
            ['add_viewing', 'log_viewing_add'], ['remove_viewing', 'log_viewing_remove'],
            ['set_viewing_note', 'viewing_note_set'], ['remove_viewing_note', 'viewing_note_remove'],
        ]) {
            expect(q).toContain(`'${type}'`)
            expect(q).toMatch(new RegExp(`mutation\\.type === '${type}'[\\s\\S]{0,200}rpc\\('${rpc}'`))
        }
    })
})

describe('the form waits for the Vault, and sends a note only when touched', () => {
    const form = code(read('components/log-modal/LogForm.tsx'))

    it('the field is shut until the note is in hand', () => {
        expect(form).toMatch(/!noteReady \?/)
        expect(form).toContain('Opening the Vault…')
        expect(form).toMatch(/Opens when you\\?'re back online\./)
    })

    it('an untouched note is not sent at all', () => {
        expect(form).toMatch(/\.\.\.\(noteTouched \? \{ privateNotes: privateNotes\.trim\(\) \} : \{\}\)/)
    })

    it('every change to the note counts as touching it', () => {
        expect(form).toMatch(/const setPrivateNotes = \(next: string\) => \{ setNoteTouched\(true\); setPrivateNotesRaw\(next\) \}/)
        // The Vault's own answer is loaded WITHOUT touching — only the member touches.
        expect(form).toMatch(/setPrivateNotesRaw\(vaultNote\.note\)\s*setNoteTouched\(false\)/)
    })

    it('a rewatch says the note belongs to this viewing', () => {
        expect(form).toContain('This note belongs to this viewing. Notes from your earlier viewings stay with them.')
    })

    it('a member whose rank has ended can read and remove their note, but not edit it', () => {
        // The read-only state exists, offers REMOVE, and asks first in the house's words.
        expect(form).toMatch(/: privateNotes \? \(/)
        expect(form).toContain('REMOVE NOTE')
        expect(form).toContain('Remove this note? The viewing stays. The note is gone for good.')
        expect(form).not.toMatch(/window\.confirm\('Remove this note/)
    })
})

describe('nothing of a member’s writing outlives their sign-out', () => {
    it('drafts are kept under the member, and swept by prefix on sign-out', () => {
        const form = code(read('components/log-modal/LogForm.tsx'))
        expect(form).toMatch(/logDraftKey\(user\.id, film\.id\)/)
        expect(form).not.toMatch(/`reelhouse_draft_\$\{film\.id\}`/)
        const auth = code(read('stores/auth.ts'))
        expect(auth).toMatch(/key\.startsWith\(LOG_DRAFT_PREFIX\)/)
        expect(auth).toMatch(/await clearOfflineQueue\(\)/)
    })

    it('the Vault store is never written to the browser’s disk', () => {
        const store = code(read('stores/vault.ts'))
        expect(store).not.toMatch(/persist\(|localStorage|sessionStorage|idb-keyval/)
    })

    it('the profile ledger never previews a note', () => {
        expect(code(read('components/profile/LedgerHelpers.tsx'))).not.toMatch(/privateNotes/)
    })
})

describe('only the writer ever sees a note', () => {
    it('the log page decides ownership by member id, not by username', () => {
        const card = code(read('components/feed/ActivityCard.tsx'))
        expect(card).toMatch(/const ownsLog = !!currentUser\?\.id && [^\n]*=== currentUser\.id/)
        // …and a feed card never asks for a note at all.
        expect(card).toMatch(/useLogVault\(isExpandedView && ownsLog \? log\.id : null, isExpandedView && ownsLog\)/)
    })

    it('the page draws a note only for its owner', () => {
        const page = code(read('components/feed/FocusView.tsx'))
        expect(page).toMatch(/const noteFor = ownsLog && vault \? vault\.noteFor : \(\) => ''/)
        expect(page).toMatch(/\{ownsLog && vault\?\.openedNote && \(/)
    })
})
