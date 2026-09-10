/**
 * memberDrafts.ts — a member's unfinished work on this phone, and whose it is.
 * ─────────────────────────────────────────────────────────────────────────────
 * Every draft this app keeps used to live under a key with NO MEMBER IN IT, and
 * logout cleared a hand-written list that none of them were on:
 *
 *   reelhouse_dispatch_draft    an unpublished essay
 *   reelhouse_log_draft         a review, a rating, and PRIVATE NOTES
 *   reelhouse_handle_history    every username they have had
 *   reelhouse_pending_handle    a username they asked for
 *
 * So a member wrote, did not file, and signed out — and the next person to sign
 * in on that phone opened the same room and found it all there. Readable, and
 * filable under their own name. `private_notes` is the sharpest of them: it is
 * owner-only at the row level, there is a trigger that diverts it, and a guard
 * names it as a column anon must never read. On the phone it was public to
 * whoever held the phone.
 *
 * ── ERASED BY SWEEP, NOT BY A LIST ──────────────────────────────────────────
 * The fault was never one key. It was that erasing them was a LIST somebody had
 * to remember to add to, and four keys in a row were forgotten.
 *
 * So every draft now shares one prefix and logout erases the prefix. A draft
 * kind invented next year is carried out with the rest of them without anybody
 * remembering anything, which is the only version of this that stays true.
 *
 * ── THE DRAFTS THAT ALREADY EXIST ───────────────────────────────────────────
 * Splitting the keys orphans real work on real phones, and both obvious answers
 * are wrong: hand the orphan to whoever signs in first — the leak, performed by
 * the fix — or delete it and throw away somebody's evening.
 *
 * `last_user_id` decides it. It is written on every sign-in and deleted on
 * logout, so if it is still there and matches the member arriving, nobody has
 * signed out since that draft was written and it is theirs. Anything else is
 * unattributable, and an unattributable private note is not a thing to gamble.
 */
import { storage } from '@/src/stores/mmkv-storage';
import { logger } from '@/src/utils/logger';

/** Everything a member leaves unfinished shares this, so one sweep clears it. */
export const DRAFT_PREFIX = 'reelhouse_draft_';

/**
 * The kinds of unfinished work. `edit` and `critique` are SCOPED — there is one
 * per filing and one per post — and the scope rides at the end of the key so the
 * member's prefix still sweeps them.
 */
export type DraftKind = 'dossier' | 'log' | 'edit' | 'critique' | 'ballot';

/** How many scoped drafts of one kind a member keeps. See `evictOldest`. */
export const SCOPED_KEPT = 3;

/**
 * `reelhouse_draft_<member>_<kind>` — and `_<scope>` when there is one.
 *
 * The MEMBER comes first on purpose: `reelhouse_draft_<member>_` is then a
 * prefix that means "everything this member has left unfinished", which is
 * exactly what logout needs and what a per-kind ordering could not give it.
 */
export const draftKey = (userId: string, kind: DraftKind, scope?: string) =>
  `${DRAFT_PREFIX}${userId}_${kind}${scope ? `_${scope}` : ''}`;

/** What every draft carries, whatever kind it is. */
export interface DraftEnvelope<T> {
  v: number;
  savedAt: string;
  data: T;
}

export const DRAFT_VERSION = 2;

/**
 * The writing room's own draft — the WHOLE piece.
 *
 * It used to be `{ title, content }`, and a member who picked a film, chose a
 * series and wrote for an hour got the words back and nothing else. The film
 * carries its cover now too, so half a draft would have lost the picture at the
 * head of the essay as well.
 *
 * Every field optional: a draft is by definition unfinished.
 */
export interface DossierDraft {
  title?: string;
  content?: string;
  film?: {
    id: number; title: string; sub: string | null;
    image: string | null; backdrop: string | null;
  } | null;
  /** `part` is stored for the line that names it and RE-DERIVED on restore. */
  series?: { id: string; title: string; part: number } | null;
}

/**
 * Was there something here that could not be read?
 *
 * `readDraft` returns null for an empty room and for a corrupt one, and clears
 * the corrupt key so it cannot fail again — which means the caller cannot tell
 * the two apart afterwards, and "nothing was ever written" is a very different
 * thing to say to somebody than "what was here could not be read".
 *
 * So the clear leaves a mark. It is removed by the asking, so the room says it
 * once and never again.
 */
const unreadable = new Set<string>();

export function unreadableDraftFound(
  userId: string | null | undefined, kind: DraftKind, scope?: string,
): boolean {
  if (!userId) return false;
  const key = draftKey(userId, kind, scope);
  const found = unreadable.has(key);
  unreadable.delete(key);
  return found;
}

// ── READ · WRITE · CLEAR ────────────────────────────────────────────────────
/**
 * Every touch is wrapped, and not for symmetry.
 *
 * These run inside a debounce timer where an exception is unhandled and silent,
 * and MMKV throws on a full disk. The WRITE returns whether it landed, so the
 * room can warn at the exit — the only moment the loss is real — rather than
 * printing a status line nobody asked for. The DELETE is wrapped because if the
 * delete after a successful filing throws, the room reopens holding an essay the
 * member has already published and offers to file it again.
 */
export function readDraft<T>(
  userId: string | null | undefined, kind: DraftKind, scope?: string,
): { data: T; savedAt?: string } | null {
  if (!userId) return null;
  const key = draftKey(userId, kind, scope);
  const raw = safeGet(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DraftEnvelope<T> | T;
    // An envelope, or a bare payload written before there were envelopes.
    const enveloped = parsed && typeof parsed === 'object' && 'v' in (parsed as object)
      && 'data' in (parsed as object);
    if (enveloped) {
      const e = parsed as DraftEnvelope<T>;
      return { data: e.data, savedAt: e.savedAt };
    }
    return { data: parsed as T };
  } catch {
    // Unreadable. Cleared rather than left to fail on every open — and marked,
    // so the room can say so instead of opening blank as though nothing was
    // ever written. See `unreadableDraftFound`.
    unreadable.add(key);
    clearDraft(userId, kind, scope);
    return null;
  }
}

export function writeDraft<T>(
  userId: string | null | undefined, kind: DraftKind, data: T, scope?: string,
): boolean {
  if (!userId) return false;
  try {
    const envelope: DraftEnvelope<T> = {
      v: DRAFT_VERSION, savedAt: new Date().toISOString(), data,
    };
    storage.set(draftKey(userId, kind, scope), JSON.stringify(envelope));
    if (scope) evictOldest(userId, kind);
    return true;
  } catch (e) {
    logger.warn(`[drafts] could not save ${kind}: ${String(e)}`);
    return false;
  }
}

export function clearDraft(
  userId: string | null | undefined, kind: DraftKind, scope?: string,
): void {
  if (!userId) return;
  try { storage.delete(draftKey(userId, kind, scope)); } catch (e) {
    logger.warn(`[drafts] could not clear ${kind}: ${String(e)}`);
  }
}

/**
 * Everything one member has left unfinished. Called on logout.
 *
 * A SWEEP of the member's prefix, not a list of kinds — the whole reason four
 * keys went unerased for as long as they existed is that erasing them was a list
 * somebody had to remember.
 */
export function clearAllDrafts(userId: string | null | undefined): void {
  if (!userId) return;
  try {
    const mine = `${DRAFT_PREFIX}${userId}_`;
    for (const key of storage.getAllKeys()) {
      if (key.startsWith(mine)) storage.delete(key);
    }
  } catch (e) {
    logger.warn(`[drafts] could not clear on logout: ${String(e)}`);
  }
}

/**
 * ── SCOPED DRAFTS ARE BOUNDED BY EVICTION, NOT BY ONE SLOT ──────────────────
 * A member edits one filing at a time, so a single slot per kind looks like the
 * elegant answer. It is not: edit essay A, back out, open essay B, and A's
 * unsaved rewrite is gone with no word — which is precisely the fault all of
 * this exists to fix, reintroduced in the name of tidiness.
 *
 * So a few are kept and the oldest goes. Bounded, and a member who returns to A
 * finds their work where they left it.
 *
 * Ordered by the envelope's own `savedAt`, so eviction follows what the member
 * actually touched last rather than whatever order the keys came back in.
 */
export function evictOldest(userId: string, kind: DraftKind, keep = SCOPED_KEPT): void {
  try {
    const mine = `${DRAFT_PREFIX}${userId}_${kind}_`;
    const held: { key: string; at: number }[] = [];
    for (const key of storage.getAllKeys()) {
      if (!key.startsWith(mine)) continue;
      const raw = safeGet(key);
      let at = 0;
      try { at = Date.parse((JSON.parse(raw ?? '{}') as DraftEnvelope<unknown>).savedAt) || 0; } catch { at = 0; }
      held.push({ key, at });
    }
    if (held.length <= keep) return;
    held.sort((a, b) => b.at - a.at);
    for (const { key } of held.slice(keep)) storage.delete(key);
  } catch (e) {
    logger.warn(`[drafts] could not evict ${kind}: ${String(e)}`);
  }
}

// ── THE KEYS WRITTEN BEFORE ANY OF THIS ─────────────────────────────────────
/**
 * The two member-less DRAFT keys, and what each becomes.
 *
 * ── AND THE TWO THAT ARE NOT DRAFTS ────────────────────────────────────────
 * `reelhouse_handle_history` and `reelhouse_pending_handle` also carried no
 * member in the key and also survived logout — but they are not the same fault
 * and they must not be handled the same way.
 *
 * Both write the member's id INSIDE the payload and every read of them checks
 * it: `existing.id !== uid` returns nothing. So a second member on the phone
 * cannot read them, which is the difference between these and a draft. Handling
 * them here would have DELETED a member's own handle history the first time
 * they opened the writing room — and that history is what redirects a stale
 * link to their old name onto their profile. A fix that breaks a working
 * feature is not a fix.
 *
 * What was true of them is that they were left on the phone after their member
 * had gone. That is a logout job, and both already export the function for it;
 * logout simply never called either. It does now.
 */
const LEGACY: { key: string; becomes: DraftKind | null }[] = [
  { key: 'reelhouse_dispatch_draft', becomes: 'dossier' },
  { key: 'reelhouse_log_draft', becomes: 'log' },
];

/**
 * Called once, on the first draft read of a session.
 *
 * Never overwrites work the member already has, and removes the old key either
 * way so the decision is made once per device. If the adopting WRITE fails, the
 * old key is left alone — a full disk must not be how somebody loses an essay.
 */
export function adoptLegacyDrafts(userId: string | null | undefined): void {
  if (!userId) return;
  const lastUserId = safeGet('last_user_id');
  const provablyTheirs = lastUserId === userId;

  for (const { key, becomes } of LEGACY) {
    const legacy = safeGet(key);
    if (legacy === undefined) continue;

    if (becomes && provablyTheirs && !safeGet(draftKey(userId, becomes))) {
      try {
        // Wrapped into an envelope so it is read like everything else. The old
        // payload becomes `data` and keeps every field it had.
        storage.set(draftKey(userId, becomes), JSON.stringify({
          v: DRAFT_VERSION, savedAt: new Date().toISOString(), data: JSON.parse(legacy),
        }));
      } catch (e) {
        logger.warn(`[drafts] could not adopt ${key}: ${String(e)}`);
        continue;   // leave it so a later launch can try again
      }
    }
    try { storage.delete(key); } catch { /* tried again next launch */ }
  }
}

function safeGet(key: string): string | undefined {
  try { return storage.getString(key); } catch { return undefined; }
}

/** Named for the tests that prove each old key is dealt with. */
export const __LEGACY_KEYS = LEGACY.map((l) => l.key);
