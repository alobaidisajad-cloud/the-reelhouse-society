import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useVaultStore } from '../stores/vault'
import { useFilmStore } from '../stores/films'
import reelToast from '../utils/reelToast'

/**
 * THE VAULT on one log's page — the web twin of the mobile useVault.
 *
 *  · Notes are asked for ONLY when the reader owns the log. A visitor's browser
 *    never sends the request, so there is nothing for RLS to have to refuse.
 *  · Asked for again when the tab comes back into view, so a note written or
 *    removed on another device is not stale here.
 *  · Taking a note back is never gated, so removal carries no rank check.
 */
export function useLogVault(logId: string | null | undefined, isOwner: boolean) {
    const notes = useVaultStore(s => s.notes)
    const loadForLog = useVaultStore(s => s.loadForLog)
    const dropNote = useVaultStore(s => s.dropNote)
    const [open, setOpen] = useState<{ viewingId: string; label: string; canEdit: boolean } | null>(null)

    useEffect(() => {
        if (!logId || !isOwner) return
        void loadForLog(logId)
    }, [logId, isOwner, loadForLog])

    useEffect(() => {
        if (!logId || !isOwner || typeof document === 'undefined') return
        const onShow = () => { if (document.visibilityState === 'visible') void loadForLog(logId, { force: true }) }
        document.addEventListener('visibilitychange', onShow)
        return () => document.removeEventListener('visibilitychange', onShow)
    }, [logId, isOwner, loadForLog])

    const noteFor = useCallback((viewingId: string | null | undefined) => (viewingId ? (notes[viewingId] ?? '') : ''), [notes])
    const openNote = useCallback((viewingId: string, label: string, canEdit: boolean) => setOpen({ viewingId, label, canEdit }), [])
    const closeNote = useCallback(() => setOpen(null), [])

    /** Called from the dialog's own confirmation — the asking has already happened. */
    const removeOpened = useCallback(async () => {
        const target = open
        if (!target || !logId) return
        setOpen(null)
        try {
            const { queuedOffline } = await dropNote(logId, target.viewingId)
            reelToast(queuedOffline ? 'Note removed. Will sync when connected.' : 'Note removed.')
        } catch {
            reelToast.error('The note could not be removed. Try again.')
        }
    }, [open, logId, dropNote])

    return { noteFor, openedNote: open, openNote, closeNote, removeOpened }
}

/**
 * The note for the log being EDITED in the form, and whether the field may open.
 *
 * A note belongs to the viewing the log is on, so it is read from the Vault by
 * that viewing's name — never from the log row. Until the Vault has answered,
 * `ready` is false and the form keeps the field shut: an empty box that is about
 * to be filled, and saved in the meantime, would erase writing the member never
 * touched. For a new log or a rewatch there is nothing to wait for — the note
 * starts empty, for the viewing about to begin.
 */
export function useLogNote(editLogId: string | null | undefined) {
    const storeViewing = useFilmStore(s => (editLogId ? s.logs.find(l => l.id === editLogId)?.viewingId ?? null : null))
    const [fetchedViewing, setFetchedViewing] = useState<string | null>(null)
    const loadForLog = useVaultStore(s => s.loadForLog)
    const loaded = useVaultStore(s => (editLogId ? s.loaded[editLogId] === true : false))
    const unreachable = useVaultStore(s => (editLogId ? s.unreachable[editLogId] === true : false))
    const viewingId = storeViewing ?? fetchedViewing
    const note = useVaultStore(s => (viewingId ? s.notes[viewingId] ?? '' : ''))

    useEffect(() => {
        if (!editLogId) return
        void loadForLog(editLogId)
    }, [editLogId, loadForLog])

    // A log cached before viewings had names does not know its own; ask once.
    useEffect(() => {
        setFetchedViewing(null)
        if (!editLogId || storeViewing) return
        let live = true
        void supabase.from('logs').select('viewing_id').eq('id', editLogId).maybeSingle().then(({ data }) => {
            if (live) setFetchedViewing((data as { viewing_id?: string } | null)?.viewing_id ?? null)
        })
        return () => { live = false }
    }, [editLogId, storeViewing])

    return {
        ready: !editLogId || (loaded && !!viewingId),
        unreachable: !!editLogId && unreachable && !loaded,
        note,
        viewingId,
    }
}
