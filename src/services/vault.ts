import { supabase } from '../supabaseClient'
import { useAuthStore } from '../stores/auth'

/**
 * THE VAULT — a member's private notes. The web's only door to them.
 *
 * ── THE ONE RULE ───────────────────────────────────────────────────────────
 * A note belongs to the VIEWING it was written about, and only the member who
 * wrote it can ever read it. A rewatch does not inherit the note from the
 * viewing before it: that note was about that night.
 *
 * ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
 * The web used to read and write `logs.private_notes`. The database keeps that
 * column BLANK on purpose, so a member's Vault read back empty — and the next
 * ordinary save offered to write the emptiness back. Notes live in
 * `log_private_notes` now, keyed by viewing. The mobile app does exactly the
 * same through its own VaultService; the server rules below are shared, and
 * were rehearsed against production on 2026-09-18.
 *
 *   · Reading is owner-only, with no rank check. Reading is never gated.
 *   · Clearing (an empty note) and removing carry no rank check either, so a
 *     member whose rank has ended can always take their writing back.
 *   · Writing or changing a note meets the Archivist rank at the table's own
 *     triggers, which refuse with RANK_REFUSAL below.
 *   · A note can only belong to a viewing of the writer's own log.
 *   · A removed viewing takes its note with it.
 */

export type VaultNoteRow = { viewing_id: string; log_id: string; notes: string; updated_at?: string | null }

/** A note holds this many characters. The database refuses more. */
export const NOTE_MAX = 1000

/** The rank gate's own refusal, matched rather than guessed at. */
export const RANK_REFUSAL = 'The Vault is an Archivist feature'

export const isRankRefusal = (e: unknown): boolean =>
    typeof (e as { message?: unknown } | null)?.message === 'string'
    && (e as { message: string }).message.includes(RANK_REFUSAL)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A request that never reached the server — kept, and retried, rather than lost. */
export const isNetworkError = (e: unknown): boolean => {
    const m = String((e as { message?: unknown } | null)?.message ?? '').toLowerCase()
    return m.includes('fetch') || m.includes('network') || m.includes('load failed')
}

/**
 * Every note on one log, for its owner. Asked for by LOG, because a log page
 * draws the current viewing and every past one at once. RLS does the filtering;
 * the `user_id` filter is here too, so a mistake shows up as an empty answer
 * rather than as somebody else's writing.
 */
export async function fetchNotesForLog(logId: string): Promise<VaultNoteRow[]> {
    const userId = useAuthStore.getState().user?.id
    if (!userId || !logId) return []
    const { data, error } = await supabase
        .from('log_private_notes')
        .select('viewing_id, log_id, notes, updated_at')
        .eq('log_id', logId)
        .eq('user_id', userId)
    if (error) throw error
    return ((data ?? []) as VaultNoteRow[]).filter(r =>
        typeof r?.notes === 'string' && UUID.test(String(r?.viewing_id)) && UUID.test(String(r?.log_id)))
}

/** Every note the member has — for their own export. */
export async function fetchAllMyNotes(): Promise<VaultNoteRow[]> {
    const userId = useAuthStore.getState().user?.id
    if (!userId) return []
    const out: VaultNoteRow[] = []
    const STEP = 1000
    for (let from = 0; ; from += STEP) {
        const { data, error } = await supabase
            .from('log_private_notes')
            .select('viewing_id, log_id, notes, updated_at')
            .eq('user_id', userId)
            .range(from, from + STEP - 1)
        if (error) throw error
        out.push(...((data ?? []) as VaultNoteRow[]))
        if (!data || data.length < STEP) break
    }
    return out
}

/** Write a note on one viewing. An empty note CLEARS it — never gated. */
export async function setNote(logId: string, viewingId: string, notes: string): Promise<void> {
    const { error } = await supabase.rpc('viewing_note_set', {
        p_log_id: logId, p_viewing_id: viewingId, p_notes: notes,
    })
    if (error) throw error
}

/** Take a note back. Never gated; removing one that is already gone is fine. */
export async function removeNote(viewingId: string): Promise<void> {
    const { error } = await supabase.rpc('viewing_note_remove', { p_viewing_id: viewingId })
    if (error) throw error
}

/**
 * A rewatch: the log moves on to a new viewing, and the one it leaves keeps its
 * own identity, fields and note — archived by the SERVER, from the row it holds.
 * The caller names the new viewing, so a retried call is the same rewatch and
 * does nothing the second time. `fields` is keyed by column name; anything not
 * part of a viewing is ignored by the server rather than trusted.
 */
export async function addViewing(logId: string, viewingId: string, fields: Record<string, unknown>): Promise<string | null> {
    const { data, error } = await supabase.rpc('log_viewing_add', {
        p_log_id: logId, p_viewing_id: viewingId, p_fields: fields,
    })
    if (error) throw error
    return (data as string | null) ?? null
}

/**
 * Remove the viewing the log is on: the one before becomes current again, note
 * and all, and the removed viewing's note goes with it. A retry — the log is no
 * longer on that viewing — does nothing.
 */
export async function removeViewing(logId: string, viewingId: string): Promise<string | null> {
    const { data, error } = await supabase.rpc('log_viewing_remove', {
        p_log_id: logId, p_viewing_id: viewingId,
    })
    if (error) throw error
    return (data as string | null) ?? null
}
