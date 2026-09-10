/**
 * draftSync.ts — the copy of an unfinished essay that is not on the phone.
 * ─────────────────────────────────────────────────────────────────────────────
 * Four thousand words used to live in exactly one place: MMKV on one handset. A
 * lost phone, a cracked screen, a reinstall or "I deleted the app to free up
 * space" took every one of them. This is not about writing on two devices — it
 * is that a member's unpublished work had NO BACKUP.
 *
 * ── THE SERVER IS THE BACKUP, NEVER THE BOSS ────────────────────────────────
 * The local draft stays the source of truth for the session. Nothing here can
 * block typing, delay a keystroke, or fail in a way the member has to deal with.
 * Every call swallows its own errors; the next push tries again.
 *
 * ── AND IT DOES NOT TRACK KEYSTROKES ────────────────────────────────────────
 * The first sketch of this pushed on a ten-second debounce. Measured against the
 * real ceiling — 25,000 characters — that is about NINE MEGABYTES AN HOUR of
 * somebody's mobile data, for a file that only matters if their phone dies.
 *
 * Every two minutes, plus when the app goes to the background, plus when the
 * room closes. Worst case a member loses two minutes of writing, and only if the
 * handset is destroyed inside that window — the local copy still has it in every
 * other case.
 *
 * ── IT ASKS, IT NEVER MERGES ────────────────────────────────────────────────
 * A merge rule for prose is a rule for silently producing text nobody wrote. The
 * room compares the two `savedAt` stamps and, when the remote one is newer, puts
 * the question to the member with both sides named. Nothing is overwritten until
 * they choose — which is also what makes this verifiable without a second phone.
 */
import { supabase } from '@/src/lib/supabase';
import { logger } from '@/src/utils/logger';

/** Only the essay. See the migration for why the log and the ballot are not here. */
export type SyncedKind = 'dossier' | 'edit';

/** The house's own ceiling, so a push that the database would refuse never leaves. */
export const SYNC_CEILING = 30_000;

/**
 * How often the backup is taken. NOT a debounce on typing — see the note above.
 * Exported so the room and its test read one number.
 */
export const SYNC_EVERY_MS = 120_000;

export interface RemoteDraft<T> {
  data: T;
  /** The MEMBER's clock, from whichever device last wrote it. */
  savedAt: string;
}

/**
 * Send the backup up. Returns whether it landed, and never throws.
 *
 * Not through the offline queue, deliberately: a queued push is superseded by
 * the next one, and replaying a stale draft after a reconnect could overwrite a
 * NEWER one written since. A backup that can go back in time is worse than a
 * backup that is occasionally a few minutes old.
 */
export async function pushDraft<T>(
  userId: string | null | undefined,
  kind: SyncedKind,
  data: T,
  savedAt: string,
  scope = '',
): Promise<boolean> {
  if (!userId) return false;
  try {
    const payload = JSON.stringify(data);
    if (payload.length > SYNC_CEILING) {
      // The database would refuse it. Saying so here keeps the local draft
      // authoritative and stops a doomed request going out every two minutes.
      logger.warn('[draftSync] too large to back up');
      return false;
    }
    const { error } = await supabase
      .from('member_drafts')
      .upsert(
        { user_id: userId, kind, scope, payload: data, saved_at: savedAt },
        { onConflict: 'user_id,kind,scope' },
      );
    if (error) { logger.warn(`[draftSync] push: ${error.message}`); return false; }
    return true;
  } catch (e) {
    logger.warn(`[draftSync] push: ${String(e)}`);
    return false;
  }
}

/** What the house is holding, or null — including when it cannot be asked. */
export async function pullDraft<T>(
  userId: string | null | undefined,
  kind: SyncedKind,
  scope = '',
): Promise<RemoteDraft<T> | null> {
  if (!userId) return null;
  try {
    const { data, error } = await supabase
      .from('member_drafts')
      .select('payload, saved_at')
      .eq('user_id', userId)
      .eq('kind', kind)
      .eq('scope', scope)
      .maybeSingle();
    if (error || !data) return null;
    return { data: data.payload as T, savedAt: data.saved_at as string };
  } catch {
    /**
     * Offline is the ordinary case and it is not an error to report. The room
     * carries on with the local draft, which is what it would have used anyway
     * — a member with no signal must never be told their writing is in danger
     * when it is sitting safely on their own phone.
     */
    return null;
  }
}

/** Once the essay is filed, or discarded. Never throws. */
export async function dropDraft(
  userId: string | null | undefined,
  kind: SyncedKind,
  scope = '',
): Promise<void> {
  if (!userId) return;
  try {
    await supabase
      .from('member_drafts')
      .delete()
      .eq('user_id', userId).eq('kind', kind).eq('scope', scope);
  } catch (e) {
    logger.warn(`[draftSync] drop: ${String(e)}`);
  }
}

/**
 * Which copy the room should open with.
 *
 * The MEMBER's clock decides, not the server's: the question is "which of these
 * did the writer touch most recently", not "which reached the server first". A
 * push from a phone that was offline for an hour arrives late and is still the
 * older piece of writing.
 */
export type Verdict = 'local' | 'remote' | 'ask';

export function whichCopy(
  localSavedAt: string | null | undefined,
  remoteSavedAt: string | null | undefined,
): Verdict {
  if (!remoteSavedAt) return 'local';
  if (!localSavedAt) return 'remote';   // a new phone — the whole point of this

  const local = Date.parse(localSavedAt);
  const remote = Date.parse(remoteSavedAt);
  // An unreadable stamp on either side is not a reason to overwrite anybody's
  // writing. The one in front of them wins, and nothing is thrown away.
  if (Number.isNaN(local) || Number.isNaN(remote)) return 'local';

  return remote > local ? 'ask' : 'local';
}
