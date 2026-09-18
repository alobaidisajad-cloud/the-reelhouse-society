import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';
import { useVaultStore } from '@/src/stores/vaultStore';
import reelToast from '@/src/utils/reelToast';

/**
 * THE VAULT, on one log's page.
 *
 * Holds everything the page needs to show a member their own notes and let them
 * take one back: which note belongs to which viewing, whether the Vault has been
 * opened yet, and the note that is currently open in the sheet.
 *
 * ── THE RULES IT KEEPS ─────────────────────────────────────────────────────
 *  · Notes are asked for ONLY when the reader owns the log. A visitor's device
 *    never requests them, so there is nothing to leak even if RLS were wrong.
 *  · They are asked for again when the app comes back to the front, so a note
 *    written or removed on another device is not stale on this one.
 *  · Removing asks first, and says exactly what is lost: the note, not the
 *    viewing. Members read "remove" on a rewatch elsewhere in this screen, and
 *    the two must not be confusable.
 *  · Taking a note back is never gated, so this path has no rank check at all.
 */
export function useVault(logId: string | null | undefined, isOwner: boolean) {
  const notes = useVaultStore((s) => s.notes);
  const loadForLog = useVaultStore((s) => s.loadForLog);
  const dropNote = useVaultStore((s) => s.dropNote);
  const loaded = useVaultStore((s) => (logId ? s.loaded[logId] === true : false));
  const unreachable = useVaultStore((s) => (logId ? s.unreachable[logId] === true : false));

  const [open, setOpen] = useState<{ viewingId: string; label: string; canEdit: boolean } | null>(null);

  useEffect(() => {
    if (!logId || !isOwner) return;
    void loadForLog(logId);
  }, [logId, isOwner, loadForLog]);

  // Another device may have written or removed a note while this one was away.
  const appState = useRef(AppState.currentState);
  useEffect(() => {
    if (!logId || !isOwner) return;
    const sub = AppState.addEventListener('change', (next) => {
      const cameForward = appState.current.match(/inactive|background/) && next === 'active';
      appState.current = next;
      if (cameForward) void loadForLog(logId, { force: true });
    });
    return () => sub.remove();
  }, [logId, isOwner, loadForLog]);

  const noteFor = useCallback(
    (viewingId: string | null | undefined) => (viewingId ? (notes[viewingId] ?? '') : ''),
    [notes],
  );

  const openNote = useCallback((viewingId: string, label: string, canEdit: boolean) => {
    setOpen({ viewingId, label, canEdit });
  }, []);

  const closeNote = useCallback(() => setOpen(null), []);

  const confirmRemove = useCallback(() => {
    const target = open;
    if (!target || !logId) return;
    Alert.alert(
      'Remove this note?',
      'The viewing stays. The note is gone for good.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setOpen(null);
            void (async () => {
              try {
                // One message, and it is spoken: the toast announces itself on
                // both platforms, so there is nothing to say a second time.
                const { queuedOffline } = await dropNote(logId, target.viewingId);
                reelToast(queuedOffline ? 'Note removed. Will sync when connected.' : 'Note removed.');
              } catch {
                reelToast.error('The note could not be removed. Try again.');
              }
            })();
          },
        },
      ],
      { cancelable: true },
    );
  }, [open, logId, dropNote]);

  return {
    /** The note written about this viewing, or '' — the reader's own, always. */
    noteFor,
    /** True once this log's notes are known. Until then, nothing is missing — it is unread. */
    loaded,
    /** The Vault could not be reached: offline, or the request was refused. */
    unreachable,
    /** The note currently open in the sheet, if any. */
    openedNote: open,
    openNote,
    closeNote,
    confirmRemove,
  };
}
