import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { zustandMMKVStorageSensitive } from './mmkv-storage';
import { registerStoreReset } from './resetAllStores';
import { VaultService } from '@/src/services/VaultService';
import { captureError } from '@/src/lib/sentry';
import { isNetworkError } from '@/src/utils/networkError';
import { enqueueMutation } from '@/src/utils/offlineQueue';
import { useAuthStore } from '@/src/stores/auth';
import { stillSignedIn } from '@/src/stores/domain/helpers/sessionGuard';

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
        if (state.loading[logId]) return;
        if (!opts?.force && state.loaded[logId]) return;

        // WHO asked. A note is the one thing in this app that must never land in
        // the wrong hands, and a request in flight across a sign-out would do
        // exactly that: the answer arrives after the Vault was emptied and
        // writes one member's private writing into the next member's store —
        // and onto their disk, because a change here is persisted.
        const askedBy = useAuthStore.getState().user?.id ?? null;

        set((s) => ({ loading: { ...s.loading, [logId]: true } }));
        try {
          const rows = await VaultService.fetchNotesForLog(logId);
          if (!stillSignedIn(askedBy)) { useVaultStore.getState().clear(); return; }
          set((s) => {
            // Rebuilt for THIS log rather than merged: a note removed on another
            // device has no row to arrive, so merging would keep it for ever.
            const notes = { ...s.notes };
            const notesLog = { ...s.notesLog };
            for (const viewingId of Object.keys(notesLog)) {
              if (notesLog[viewingId] === logId) {
                delete notes[viewingId];
                delete notesLog[viewingId];
              }
            }
            for (const row of rows) {
              notes[row.viewing_id] = row.notes;
              notesLog[row.viewing_id] = row.log_id;
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
        const text = (note ?? '').trim();
        const before = get().notes[viewingId];
        const askedBy = useAuthStore.getState().user?.id ?? null;

        // Shown as written straight away. A note is the member's own writing
        // about their own viewing — there is nothing for the server to decide,
        // so waiting on the round trip would only make it feel unsure.
        if (text) get().rememberNote(viewingId, text, logId);
        else get().forgetNote(viewingId);

        try {
          await VaultService.setNote(logId, viewingId, text);
          return { queuedOffline: false };
        } catch (e) {
          // Nothing is put back into a Vault that now belongs to someone else.
          if (!stillSignedIn(askedBy)) throw e;
          if (isNetworkError(e)) {
            enqueueMutation({
              type: text ? 'set_viewing_note' : 'remove_viewing_note',
              payload: text
                ? { log_id: logId, viewing_id: viewingId, notes: text }
                : { viewing_id: viewingId },
            });
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
        get().forgetNote(viewingId);
        try {
          await VaultService.removeNote(viewingId);
          return { queuedOffline: false };
        } catch (e) {
          if (!stillSignedIn(askedBy)) throw e;
          if (isNetworkError(e)) {
            enqueueMutation({ type: 'remove_viewing_note', payload: { viewing_id: viewingId } });
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
      storage: createJSONStorage(() => zustandMMKVStorageSensitive),
      // Only the writing itself survives a restart. What was loaded, what was in
      // flight and what could not be reached all belong to one run of the app:
      // persisting `loaded` would let a cold start believe a log's notes are
      // known when the server has not been asked yet.
      partialize: (s) => ({ notes: s.notes, notesLog: s.notesLog }) as Partial<VaultState>,
    },
  ),
);

/**
 * The Vault is emptied when a member signs out — the state and the key on disk.
 * A cleared state alone is not enough: zustand's persist writes the emptied
 * state back, but only after a tick, and a crash in between leaves the previous
 * member's writing on the device.
 */
registerStoreReset(() => {
  useVaultStore.getState().clear();
  try {
    zustandMMKVStorageSensitive.removeItem(STORAGE_KEY);
  } catch {
    /* the store is already empty in memory; the key is rewritten empty anyway */
  }
});
