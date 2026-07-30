/**
 * undoImport.ts — take back exactly what one import created.
 *
 * The receipt names only rows the import genuinely inserted (see
 * importReceipt.ts), so this deletes precisely those and nothing else. A film
 * the member logged themselves, a stack they already owned, a rating they set
 * by hand — none of it is reachable from here.
 *
 * Every delete is additionally scoped by user_id. RLS already enforces that
 * server-side; the redundant filter means a corrupted or tampered receipt still
 * cannot reach another member's rows even if RLS were ever misconfigured.
 */
import { supabase } from '@/src/lib/supabase';
import { logger } from '@/src/utils/logger';
import { storage } from '@/src/stores/mmkv-storage';
import {
  ImportReceipt,
  parseReceipt,
  receiptIsEmpty,
  receiptSize,
} from './importReceipt';

const RECEIPT_KEY = 'import_receipt_last';

/** Postgres caps parameters per statement; delete ids in chunks well under it. */
const DELETE_CHUNK = 200;

export interface UndoResult {
  removed: number;
  errors: string[];
}

/** Persist the receipt for the most recent import. Never throws. */
export function saveReceipt(receipt: ImportReceipt): void {
  try {
    if (receiptIsEmpty(receipt)) {
      // An import that created nothing has nothing to take back. Clear any
      // older receipt so undo can't offer to reverse a previous import the
      // member has since built on top of.
      storage.delete(RECEIPT_KEY);
      return;
    }
    storage.set(RECEIPT_KEY, JSON.stringify(receipt));
  } catch (e) {
    logger.warn('[undoImport] could not save receipt:', e);
  }
}

/**
 * The receipt for the last import, if one exists and belongs to this member.
 * Returns null when there is nothing to undo — which is what the UI keys off.
 */
export function loadReceipt(userId: string | null | undefined): ImportReceipt | null {
  if (!userId) return null;
  try {
    const raw = storage.getString(RECEIPT_KEY);
    if (!raw) return null;
    return parseReceipt(JSON.parse(raw), userId);
  } catch (e) {
    logger.warn('[undoImport] discarding unreadable receipt:', e);
    return null;
  }
}

/** Forget the stored receipt (after a successful undo, or on sign-out). */
export function clearReceipt(): void {
  try {
    storage.delete(RECEIPT_KEY);
  } catch {
    // A receipt we cannot clear is harmless: it is validated on load and the
    // rows it names are already gone, so every delete would be a no-op.
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Reverses the import described by `receipt`.
 *
 * Ordering matters: list_items are removed before the lists that own them, so a
 * partial failure can never strand items pointing at a deleted stack. Each step
 * collects its own errors rather than aborting — a member undoing a bad import
 * should get as much of it reversed as possible, not stop at the first problem.
 */
export async function undoImport(receipt: ImportReceipt, userId: string): Promise<UndoResult> {
  const errors: string[] = [];
  let removed = 0;

  if (receipt.userId !== userId) {
    return { removed: 0, errors: ['This import belongs to a different account.'] };
  }

  // 1. Films added to stacks that already existed — remove only those films.
  //    The stack itself, and everything the member put in it, stays.
  for (const { listId, filmIds } of receipt.listItemsAdded) {
    for (const batch of chunk(filmIds, DELETE_CHUNK)) {
      const { data, error } = await supabase
        .from('list_items')
        .delete()
        .eq('list_id', listId)
        .in('film_id', batch)
        .select('film_id');
      if (error) errors.push(`Stack films: ${error.message}`);
      else removed += data?.length ?? 0;
    }
  }

  // 2. Stacks the import created outright. list_items cascade with them.
  for (const batch of chunk(receipt.listsCreated, DELETE_CHUNK)) {
    const { data, error } = await supabase
      .from('lists')
      .delete()
      .eq('user_id', userId)
      .in('id', batch)
      .select('id');
    if (error) errors.push(`Stacks: ${error.message}`);
    else removed += data?.length ?? 0;
  }

  // 3. Film logs.
  for (const batch of chunk(receipt.logIds, DELETE_CHUNK)) {
    const { data, error } = await supabase
      .from('logs')
      .delete()
      .eq('user_id', userId)
      .in('id', batch)
      .select('id');
    if (error) errors.push(`Film logs: ${error.message}`);
    else removed += data?.length ?? 0;
  }

  // 4. Watchlist.
  for (const batch of chunk(receipt.watchlistIds, DELETE_CHUNK)) {
    const { data, error } = await supabase
      .from('watchlists')
      .delete()
      .eq('user_id', userId)
      .in('id', batch)
      .select('id');
    if (error) errors.push(`Watchlist: ${error.message}`);
    else removed += data?.length ?? 0;
  }

  // 5. Physical archive.
  for (const batch of chunk(receipt.physicalArchiveIds, DELETE_CHUNK)) {
    const { data, error } = await supabase
      .from('physical_archive')
      .delete()
      .eq('user_id', userId)
      .in('id', batch)
      .select('id');
    if (error) errors.push(`Vault: ${error.message}`);
    else removed += data?.length ?? 0;
  }

  // Only forget the receipt on a clean sweep. If anything failed, keep it so
  // the member can try again once they are back on a stable connection —
  // deleting rows that are already gone is a no-op, so a retry is safe.
  if (errors.length === 0) clearReceipt();

  logger.debug(`[undoImport] removed ${removed}/${receiptSize(receipt)} rows, ${errors.length} errors`);
  return { removed, errors };
}
