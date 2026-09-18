import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/stores/auth';
import { z } from 'zod';

/**
 * THE VAULT — a member's private notes.
 *
 * ── THE ONE RULE ───────────────────────────────────────────────────────────
 * A note belongs to the VIEWING it was written about, and only the member who
 * wrote it can ever read it. A rewatch does not inherit the note from the
 * viewing before it: that note was about that night.
 *
 * ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
 * Before this, notes travelled on the log row itself, in `logs.private_notes`.
 * That column is kept blank by a trigger on purpose, so both apps read back an
 * empty Vault from a member who had written in it — and the same column, sent
 * blank on an ordinary save, could not be told apart from the member clearing
 * their note. Notes now live in `log_private_notes`, keyed by viewing, and this
 * is the ONLY place in the app that touches them.
 *
 * `logs.private_notes` is never read and never written here. The database still
 * accepts it from the shipped build, and still pins whatever arrives to the
 * current viewing, but nothing in this app uses that door any more.
 *
 * ── WHAT THE SERVER GUARANTEES (rehearsed on production, 2026-09-18) ───────
 *   · `log_private_notes` is readable only by the member who wrote the note —
 *     RLS, owner-only, no rank check. Reading is never gated.
 *   · `viewing_note_set` with an empty note, and `viewing_note_remove`, carry no
 *     rank check either. WITHDRAWING your own writing is never gated, so a
 *     lapsed member can always take a note back.
 *   · Writing or changing a note meets the Archivist rank at the table's own
 *     triggers, which answer 'The Vault is an Archivist feature'.
 *   · A note can only be pinned to a viewing of the writer's own log.
 *   · A removed viewing takes its note with it.
 */

const NoteRowSchema = z.object({
  viewing_id: z.string().uuid(),
  log_id: z.string().uuid(),
  notes: z.string(),
  updated_at: z.string().nullable().optional(),
});

export type VaultNoteRow = z.infer<typeof NoteRowSchema>;

/** A note holds this many characters. The database refuses more. */
export const NOTE_MAX = 1000;

/** The message the rank gate answers with, matched rather than guessed at. */
export const RANK_REFUSAL = 'The Vault is an Archivist feature';

export const isRankRefusal = (e: unknown): boolean =>
  typeof (e as { message?: unknown })?.message === 'string' &&
  ((e as { message: string }).message.includes(RANK_REFUSAL));

/**
 * Every note on one log, for its owner.
 *
 * Asked for by LOG, not by viewing: a log page draws the current viewing and
 * every past one at once, so one request answers the whole screen. RLS does the
 * filtering, and the `user_id` filter is here as well so a mistake shows up as
 * an empty answer rather than somebody else's writing.
 */
export const fetchNotesForLog = async (logId: string): Promise<VaultNoteRow[]> => {
  const userId = useAuthStore.getState().user?.id;
  if (!userId || !logId) return [];

  const { data, error } = await supabase
    .from('log_private_notes')
    .select('viewing_id, log_id, notes, updated_at')
    .eq('log_id', logId)
    .eq('user_id', userId);

  if (error) throw error;
  return (data ?? []).flatMap((row) => {
    const parsed = NoteRowSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
};

/**
 * Write a note on one viewing. An empty note CLEARS it — that is the same act
 * as removing it, and it is open to every member, paying or not.
 */
export const setNote = async (logId: string, viewingId: string, notes: string): Promise<void> => {
  const { error } = await supabase.rpc('viewing_note_set', {
    p_log_id: logId,
    p_viewing_id: viewingId,
    p_notes: notes,
  });
  if (error) throw error;
};

/** Take a note back. Never gated; removing one that is already gone is fine. */
export const removeNote = async (viewingId: string): Promise<void> => {
  const { error } = await supabase.rpc('viewing_note_remove', { p_viewing_id: viewingId });
  if (error) throw error;
};

/**
 * A rewatch: the log moves on to a new viewing, and the one it leaves keeps its
 * own identity, its own fields and its own note.
 *
 * The app chooses `viewingId`, so a call that is retried — by the offline queue,
 * or by a member who pressed twice — finds the viewing already there and does
 * nothing the second time. `fields` is keyed by COLUMN name; anything not named
 * is left as it was, and anything that is not part of a viewing is ignored by
 * the server rather than trusted.
 */
export const addViewing = async (
  logId: string,
  viewingId: string,
  fields: Record<string, unknown>,
): Promise<string | null> => {
  const { data, error } = await supabase.rpc('log_viewing_add', {
    p_log_id: logId,
    p_viewing_id: viewingId,
    p_fields: fields,
  });
  if (error) throw error;
  return (data as string | null) ?? null;
};

/**
 * Remove the viewing the log is on: the one before it becomes current again,
 * with its own fields and its own note, and the removed viewing's note goes with
 * it. Asked to remove a viewing that is no longer current — because the call was
 * retried — it does nothing and answers with the viewing the log is on now.
 */
export const removeViewing = async (logId: string, viewingId: string): Promise<string | null> => {
  const { data, error } = await supabase.rpc('log_viewing_remove', {
    p_log_id: logId,
    p_viewing_id: viewingId,
  });
  if (error) throw error;
  return (data as string | null) ?? null;
};

export const VaultService = {
  fetchNotesForLog,
  setNote,
  removeNote,
  addViewing,
  removeViewing,
};
