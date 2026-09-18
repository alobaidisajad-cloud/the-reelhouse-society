import { create } from 'zustand'
import * as Vault from '../services/vault'
import { useAuthStore } from './auth'
import { enqueueMutation } from '../utils/offlineQueue'

/**
 * THE VAULT, in the browser.
 *
 * Held in MEMORY ONLY — deliberately not persisted. A browser is the device
 * most likely to be shared, and a member's private writing has no business on
 * its disk. Sign-out reloads the page, which empties this store; a note is one
 * request away from the server whenever it is needed again.
 *
 * `loaded` is what the screen reads to tell "this viewing has no note" from
 * "the Vault has not answered yet". Without it the form would show an empty box
 * for a moment, and a save in that moment would erase writing the member never
 * touched. The note field stays shut until a log's notes are loaded.
 */

type VaultState = {
    /** viewingId → the note written about that viewing. */
    notes: Record<string, string>
    /** viewingId → its log, so reloading one log never touches another's notes. */
    notesLog: Record<string, string>
    loaded: Record<string, true>
    loading: Record<string, true>
    unreachable: Record<string, true>

    loadForLog: (logId: string, opts?: { force?: boolean }) => Promise<void>
    /** Write, or clear by writing nothing. Answers whether it had to be queued. */
    saveNote: (logId: string, viewingId: string, note: string) => Promise<{ queuedOffline: boolean }>
    /** Take a note back. Never gated. */
    dropNote: (logId: string, viewingId: string) => Promise<{ queuedOffline: boolean }>
    clear: () => void
}

const memberNow = () => useAuthStore.getState().user?.id ?? null

export const useVaultStore = create<VaultState>()((set, get) => {
    const remember = (viewingId: string, note: string, logId: string) =>
        set(s => ({ notes: { ...s.notes, [viewingId]: note }, notesLog: { ...s.notesLog, [viewingId]: logId } }))
    const forget = (viewingId: string) =>
        set(s => {
            const notes = { ...s.notes }; delete notes[viewingId]
            const notesLog = { ...s.notesLog }; delete notesLog[viewingId]
            return { notes, notesLog }
        })

    return {
        notes: {}, notesLog: {}, loaded: {}, loading: {}, unreachable: {},

        loadForLog: async (logId, opts) => {
            if (!logId) return
            const s0 = get()
            if (s0.loading[logId]) return
            if (!opts?.force && s0.loaded[logId]) return
            // WHO asked. An answer that arrives for a member who has since left
            // is written nowhere — it would put one member's private writing in
            // front of the next.
            const askedBy = memberNow()
            set(s => ({ loading: { ...s.loading, [logId]: true } }))
            try {
                const rows = await Vault.fetchNotesForLog(logId)
                if (askedBy === null || memberNow() !== askedBy) { get().clear(); return }
                set(s => {
                    // Rebuilt for THIS log, not merged: a note removed elsewhere has
                    // no row to arrive, so merging would keep it for ever.
                    const notes = { ...s.notes }
                    const notesLog = { ...s.notesLog }
                    for (const v of Object.keys(notesLog)) {
                        if (notesLog[v] === logId) { delete notes[v]; delete notesLog[v] }
                    }
                    for (const r of rows) { notes[r.viewing_id] = r.notes; notesLog[r.viewing_id] = r.log_id }
                    const loading = { ...s.loading }; delete loading[logId]
                    const unreachable = { ...s.unreachable }; delete unreachable[logId]
                    return { notes, notesLog, loaded: { ...s.loaded, [logId]: true }, loading, unreachable }
                })
            } catch {
                if (askedBy === null || memberNow() !== askedBy) return
                set(s => {
                    const loading = { ...s.loading }; delete loading[logId]
                    return { loading, unreachable: { ...s.unreachable, [logId]: true } }
                })
            }
        },

        saveNote: async (logId, viewingId, note) => {
            const text = (note ?? '').trim()
            const before = get().notes[viewingId]
            const askedBy = memberNow()
            if (text) remember(viewingId, text, logId); else forget(viewingId)
            try {
                await Vault.setNote(logId, viewingId, text)
                return { queuedOffline: false }
            } catch (e) {
                if (memberNow() !== askedBy) throw e
                if (Vault.isNetworkError(e)) {
                    await enqueueMutation(text
                        ? { type: 'set_viewing_note', payload: { log_id: logId, viewing_id: viewingId, notes: text } }
                        : { type: 'remove_viewing_note', payload: { viewing_id: viewingId } })
                    return { queuedOffline: true }
                }
                // Put back exactly what was there: a refused note must not stay on
                // screen as if the Vault held it.
                if (before === undefined) forget(viewingId); else remember(viewingId, before, logId)
                throw e
            }
        },

        dropNote: async (logId, viewingId) => {
            const before = get().notes[viewingId]
            const askedBy = memberNow()
            forget(viewingId)
            try {
                await Vault.removeNote(viewingId)
                return { queuedOffline: false }
            } catch (e) {
                if (memberNow() !== askedBy) throw e
                if (Vault.isNetworkError(e)) {
                    await enqueueMutation({ type: 'remove_viewing_note', payload: { viewing_id: viewingId } })
                    return { queuedOffline: true }
                }
                if (before !== undefined) remember(viewingId, before, logId)
                throw e
            }
        },

        clear: () => set({ notes: {}, notesLog: {}, loaded: {}, loading: {}, unreachable: {} }),
    }
})
