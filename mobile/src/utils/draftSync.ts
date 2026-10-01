/**
 * draftSync.ts — the copy of an unfinished essay that is not on the phone.
 * ─────────────────────────────────────────────────────────────────────────────
 * The backup of a member's unpublished work: a lost phone, a reinstall or "I
 * deleted the app to free up space" must not take four thousand words with it.
 * Not a way of writing on two devices.
 *
 * ── THE SERVER IS THE BACKUP, NEVER THE BOSS ────────────────────────────────
 * The local draft is the source of truth for the session. Nothing here can
 * block typing, delay a keystroke, or fail in a way the member has to handle;
 * every call swallows its own errors.
 *
 * ── TAKEN EVERY TWO MINUTES, NOT PER KEYSTROKE ──────────────────────────────
 * A push every ten seconds is about nine megabytes an hour of a member's data at
 * the 25,000-character ceiling. Two minutes, plus on background and when the
 * room closes: a member loses at most two minutes, and only if the handset is
 * destroyed inside them.
 *
 * ── IT ASKS, IT NEVER MERGES ────────────────────────────────────────────────
 * A merge rule for prose produces text nobody wrote. The room compares the two
 * `savedAt` stamps (whichCopy) and puts a newer remote copy to the member with
 * both sides named, and pushes nothing over a copy it has not settled with.
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

/**
 * What the house is holding: the draft, null for nothing, or 'unreachable'.
 *
 * Nothing and unreachable are kept apart because a push that follows them
 * differs: over nothing it is safe, over a backup the room never saw it would
 * replace that backup with whatever was typed meanwhile. Unreachable is still
 * not an error to show: the local draft is safe on the phone.
 */
export async function pullDraft<T>(
  userId: string | null | undefined,
  kind: SyncedKind,
  scope = '',
): Promise<RemoteDraft<T> | null | 'unreachable'> {
  if (!userId) return null;
  try {
    const { data, error } = await supabase
      .from('member_drafts')
      .select('payload, saved_at')
      .eq('user_id', userId)
      .eq('kind', kind)
      .eq('scope', scope)
      .maybeSingle();
    if (error) return 'unreachable';
    if (!data) return null;
    return { data: data.payload as T, savedAt: data.saved_at as string };
  } catch {
    return 'unreachable';
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
    // supabase-js RESOLVES a failure, so its error is read. A drop that failed
    // leaves a filed essay's backup standing, which another phone would offer
    // to restore: not retried (fire-and-forget), but logged.
    const { error } = await supabase
      .from('member_drafts')
      .delete()
      .eq('user_id', userId).eq('kind', kind).eq('scope', scope);
    if (error) logger.warn(`[draftSync] drop refused: ${error.message}`);
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
