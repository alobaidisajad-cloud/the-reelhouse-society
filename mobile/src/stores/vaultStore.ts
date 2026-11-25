import { create } from 'zustand';
import { carriedForward, SAVED_VERSION } from './savedVersion';
import { createJSONStorage, persist } from 'zustand/middleware';
import { zustandMMKVStorageSensitive } from './mmkv-storage';
import { registerStoreReset } from './resetAllStores';
import { VaultService } from '@/src/services/VaultService';
import { captureError } from '@/src/lib/sentry';
import { isNetworkError } from '@/src/utils/networkError';
import { enqueueMutation, getOfflineQueue } from '@/src/utils/offlineQueue';
import { actsAsAsked, keyOf, whenNotesAreSent, writeOnline } from '@/src/utils/oneWritePerThing';
import { houseIso } from '@/src/lib/houseClock';
import { useAuthStore } from '@/src/stores/auth';
import { stillSignedIn } from '@/src/stores/domain/helpers/sessionGuard';
import { sanitizeInput } from '@/src/utils/sanitizeInput';

/**
 * THE VAULT, on the device.
 *
 * Notes are held BY VIEWING, because that is what they belong to. The log page
 * draws several viewings at once, so they are fetched a whole log at a time and
 * kept here until the member signs out.
 *
 * ── WHAT THIS STORE IS CAREFUL ABOUT ───────────────────────────────────────
 *  · It holds the member's own writing, so it reaches disk only through the
 *    SENSITIVE adapter — which writes nothing at all when the device keystore
 *    is unavailable and storage could not be encrypted.
 *  · It is erased on sign-out, by prefix, so the next member on the same phone
 *    cannot be handed a line of it. `clear()` empties the state AND the key.
 *  · `loaded` is what the screen reads to know the difference between "this
 *    viewing has no note" and "the Vault has not been opened yet". Without it a
 *    member with a note would see an empty field for a moment and a save in that
 *    moment would erase writing they never touched. The form stays shut until a
 *    log's notes are loaded, and that is the whole reason this flag exists.
 */

type VaultState = {
  /** viewingId → the note written about that viewing. */
  notes: Record<string, string>;
  /**
   * viewingId → the log that viewing belongs to. Kept so a reload of ONE log can
   * drop the notes that log used to have without touching any other log's.
   */
  notesLog: Record<string, string>;
  /** logId → the Vault has been opened for this log and holds the truth for it. */
  loaded: Record<string, true>;
  /** logId → a request is in flight. */
  loading: Record<string, true>;
  /** logId → the last attempt could not reach the Vault (offline, or refused). */
  unreachable: Record<string, true>;

  noteFor: (viewingId: string | null | undefined) => string;
  isLoaded: (logId: string | null | undefined) => boolean;
  isLoading: (logId: string | null | undefined) => boolean;
  isUnreachable: (logId: string | null | undefined) => boolean;

  loadForLog: (logId: string, opts?: { force?: boolean }) => Promise<void>;
  /** Put a note in the local Vault without going to the server (optimistic). */
  rememberNote: (viewingId: string, note: string, logId?: string) => void;
  forgetNote: (viewingId: string) => void;

  /**
   * Write a note on a viewing, or clear it by writing an empty one.
   * Answers whether it had to be queued, so the screen can say the true thing
   * instead of claiming the Vault holds something the queue is still carrying.
   */
  saveNote: (logId: string, viewingId: string, note: string) => Promise<{ queuedOffline: boolean }>;
  /** Take a note back. Never gated — a lapsed member may always do this. */
  dropNote: (logId: string, viewingId: string) => Promise<{ queuedOffline: boolean }>;
  /** Every note the member has, forgotten. */
  clear: () => void;
};

const STORAGE_KEY = 'reelhouse-vault';

/** Records asked to be read again (forced) while a read of them was out: read once more after it. */
const _readAgain = new Set<string>();

export const useVaultStore = create<VaultState>()(
  persist(
    (set, get) => ({
      notes: {},
      notesLog: {},
      loaded: {},
      loading: {},
      unreachable: {},

      noteFor: (viewingId) => (viewingId ? (get().notes[viewingId] ?? '') : ''),
      isLoaded: (logId) => (logId ? get().loaded[logId] === true : false),
      isLoading: (logId) => (logId ? get().loading[logId] === true : false),
      isUnreachable: (logId) => (logId ? get().unreachable[logId] === true : false),

      loadForLog: async (logId, opts) => {
        if (!logId) return;
        const state = get();
        if (state.loading[logId]) {
          // A forced read asked while another is out is kept, and made once that one is answered.
          if (opts?.force) _readAgain.add(logId);
          return;
        }
        if (!opts?.force && state.loaded[logId]) return;

        // WHO asked. A note is the one thing in this app that must never land in
        // the wrong hands, and a request in flight across a sign-out would do
        // exactly that: the answer arrives after the Vault was emptied and
        // writes one member's private writing into the next member's store —
        // and onto their disk, because a change here is persisted.
        const askedBy = useAuthStore.getState().user?.id ?? null;

        set((s) => ({ loading: { ...s.loading, [logId]: true } }));
        const untouched = actsAsAsked();
        try {
          const rows = await VaultService.fetchNotesForLog(logId);
          if (!stillSignedIn(askedBy)) { useVaultStore.getState().clear(); return; }
          set((s) => {
            // Rebuilt for THIS log rather than merged: a note removed on another
            // device has no row to arrive, so merging would keep it for ever.
            const notes = { ...s.notes };
            const notesLog = { ...s.notesLog };
            // A note the member wrote or took back since this read was asked is theirs, as it stands:
            // the read may be older than the write.
            const asRead = (viewingId: string) => untouched(`note:${viewingId}`);
            for (const viewingId of Object.keys(notesLog)) {
              if (notesLog[viewingId] === logId && asRead(viewingId)) {
                delete notes[viewingId];
                delete notesLog[viewingId];
              }
            }
            for (const row of rows) {
              if (!asRead(row.viewing_id)) continue;
              notes[row.viewing_id] = row.notes;
              notesLog[row.viewing_id] = row.log_id;
            }
            // And over the house's answer, this member's own writes still waiting to be sent, in
            // the order they were made: read again on the way back to the front, a note written
            // with no signal vanished from its viewing (and one removed came back) until a later
            // read, though the queue was still holding it.
            for (const m of getOfflineQueue()) {
              const viewingId = m.payload.viewing_id;
              if (typeof viewingId !== 'string') continue;
              if (m.type === 'set_viewing_note' && m.payload.log_id === logId && typeof m.payload.notes === 'string') {
                notes[viewingId] = m.payload.notes;
                notesLog[viewingId] = logId;
              } else if (m.type === 'remove_viewing_note' && notesLog[viewingId] === logId) {
                delete notes[viewingId];
                delete notesLog[viewingId];
              }
            }
            const loading = { ...s.loading };
            delete loading[logId];
            const unreachable = { ...s.unreachable };
            delete unreachable[logId];
            return { notes, notesLog, loaded: { ...s.loaded, [logId]: true }, loading, unreachable };
          });
        } catch (e) {
          if (!isNetworkError(e)) captureError(e, { scope: 'vault.loadForLog', logId });
          if (!stillSignedIn(askedBy)) return;
          set((s) => {
            const loading = { ...s.loading };
            delete loading[logId];
            return { loading, unreachable: { ...s.unreachable, [logId]: true } };
          });
        } finally {
          // Asked to read it again while this read was out (the queue had just sent a note): this
          // answer may predate the send, so it is read once more now.
          if (_readAgain.delete(logId) && stillSignedIn(askedBy)) void useVaultStore.getState().loadForLog(logId, { force: true });
        }
      },

      rememberNote: (viewingId, note, logId) =>
        set((s) => ({
          notes: { ...s.notes, [viewingId]: note },
          notesLog: logId ? { ...s.notesLog, [viewingId]: logId } : s.notesLog,
        })),

      forgetNote: (viewingId) =>
        set((s) => {
          const notes = { ...s.notes };
          delete notes[viewingId];
          const notesLog = { ...s.notesLog };
          delete notesLog[viewingId];
          return { notes, notesLog };
        }),

      saveNote: async (logId, viewingId, note) => {
        // Cleaned and capped as the offline replay cleans it: one note, one rule.
        const text = sanitizeInput(note ?? '', 'privateNotes');
        const before = get().notes[viewingId];
        const askedBy = useAuthStore.getState().user?.id ?? null;
        // The moment it was written, sent with it: the house lays it only over a note written no
        // later, so a note queued on another phone before it never lands over it (round 13).
        const writtenAt = houseIso();
        const queued: Parameters<typeof enqueueMutation>[0] = {
          type: text ? 'set_viewing_note' : 'remove_viewing_note',
          payload: text
            ? { log_id: logId, viewing_id: viewingId, notes: text, written_at: writtenAt }
            : { log_id: logId, viewing_id: viewingId, written_at: writtenAt },
        };

        // Shown as written straight away. A note is the member's own writing
        // about their own viewing — there is nothing for the server to decide,
        // so waiting on the round trip would only make it feel unsure.
        if (text) get().rememberNote(viewingId, text, logId);
        else get().forgetNote(viewingId);

        try {
          // Through the one door of a viewing's note (writeOnline): a note for it still queued,
          // older than this one, is let go when this lands, never sent over it.
          await writeOnline(keyOf(queued), () => VaultService.setNote(logId, viewingId, text, writtenAt));
          return { queuedOffline: false };
        } catch (e) {
          // Nothing is put back into a Vault that now belongs to someone else.
          if (!stillSignedIn(askedBy)) throw e;
          if (isNetworkError(e)) {
            enqueueMutation({ type: text ? 'set_viewing_note' : 'remove_viewing_note', payload: queued.payload });
            return { queuedOffline: true };
          }
          // Put back exactly what was there. A refusal — the rank, most likely —
          // must not leave the screen showing writing the Vault does not hold.
          if (before === undefined) get().forgetNote(viewingId);
          else get().rememberNote(viewingId, before, logId);
          throw e;
        }
      },

      dropNote: async (logId, viewingId) => {
        const before = get().notes[viewingId];
        const askedBy = useAuthStore.getState().user?.id ?? null;
        const writtenAt = houseIso();
        const queued: Parameters<typeof enqueueMutation>[0] = {
          type: 'remove_viewing_note', payload: { log_id: logId, viewing_id: viewingId, written_at: writtenAt },
        };
        get().forgetNote(viewingId);
        try {
          // The same door as saveNote: an older note still queued for this viewing is let go.
          await writeOnline(keyOf(queued), () => VaultService.removeNote(viewingId, writtenAt));
          return { queuedOffline: false };
        } catch (e) {
          if (!stillSignedIn(askedBy)) throw e;
          if (isNetworkError(e)) {
            enqueueMutation({ type: 'remove_viewing_note', payload: queued.payload });
            return { queuedOffline: true };
          }
          if (before !== undefined) get().rememberNote(viewingId, before, logId);
          throw e;
        }
      },

      clear: () => set({ notes: {}, notesLog: {}, loaded: {}, loading: {}, unreachable: {} }),
    }),
    {
      name: STORAGE_KEY,
      // What the last release saved, named and carried (savedVersion.ts).
      version: SAVED_VERSION,
      migrate: carriedForward,
      storage: createJSONStorage(() => zustandMMKVStorageSensitive),
      // Only the writing itself survives a restart. What was loaded, what was in
      // flight and what could not be reached all belong to one run of the app:
      // persisting `loaded` would let a cold start believe a log's notes are
      // known when the server has not been asked yet.
      partialize: (s) => ({ notes: s.notes, notesLog: s.notesLog }) as Partial<VaultState>,
      // Read once the encryption key is known (the root layout), as every other
      // persisted store is: read at import, it found the empty pre-key storage,
      // and the notes kept for a restart were never read back.
      skipHydration: true,
    },
  ),
);

export const rehydrateVaultStore = () => useVaultStore.persist.rehydrate();

/**
 * The Vault is emptied when a member signs out — the state and the key on disk.
 * A cleared state alone is not enough: zustand's persist writes the emptied
 * state back, but only after a tick, and a crash in between leaves the previous
 * member's writing on the device.
 */
registerStoreReset(() => {
  _readAgain.clear();
  useVaultStore.getState().clear();
  try {
    zustandMMKVStorageSensitive.removeItem(STORAGE_KEY);
  } catch {
    /* the store is already empty in memory; the key is rewritten empty anyway */
  }
});

/**
 * Once the offline queue has sent a record's notes, that record's notes are read again if they are
 * held here: a note sent late may have been done unwritten at the house (a later note, or a later
 * removal, stands there), and while it waited its words were laid over every read (round 13).
 */
whenNotesAreSent((logIds) => {
  for (const logId of logIds) {
    if (useVaultStore.getState().isLoaded(logId)) void useVaultStore.getState().loadForLog(logId, { force: true });
  }
});
