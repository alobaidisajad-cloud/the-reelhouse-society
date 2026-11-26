import { houseIso } from '@/src/lib/houseClock';
import { byKey } from '@/src/utils/order';
import { readAllRows } from './readAllRows';

type Row = Record<string, unknown>;

/** What the house's own JSON export holds: the member's rows, each table as it is kept. */
export interface HouseArchive {
  meta: { exported_at: string; version: string };
  logs: Row[];
  private_notes: { log_id: unknown; viewing_id: unknown; notes: unknown; updated_at: unknown }[];
  watchlist: Row[];
  vault: Row[];
  lists: Row[];
}

/**
 * The member's whole archive, as the JSON export writes it and the import
 * (archiveImport's importArchiveJSON) brings it back. Each table's rows are
 * its own, read whole: a row's `id` is that row's key, never a film's; every
 * film is named by `film_id`. Throws on the first table that cannot be read,
 * as a partial export is not one.
 */
export async function readHouseArchive(userId: string): Promise<HouseArchive> {
  const [dbLogs, dbWatchlist, dbVault, dbLists, dbNotes] = await Promise.all([
    readAllRows(userId, 'logs'),
    readAllRows(userId, 'watchlists'),
    readAllRows(userId, 'physical_archive'),
    readAllRows(userId, 'lists', '*, list_items(*)'),
    // The member's private notes, one per viewing. Owner-only at the
    // database, and this export is the member asking for their own.
    readAllRows(userId, 'log_private_notes', '*', 'viewing_id'),
  ]);
  return {
    meta: { exported_at: houseIso(), version: '2.1' },
    logs: dbLogs || [],
    // Kept as their own list, keyed by viewing, because that is what a note
    // belongs to: a log with three viewings can hold three different notes,
    // and folding them onto the log would keep only one.
    private_notes: (dbNotes || []).map((n: Row) => ({
      log_id: n.log_id,
      viewing_id: n.viewing_id,
      notes: n.notes,
      updated_at: n.updated_at,
    })),
    watchlist: dbWatchlist || [],
    vault: dbVault || [],
    // Strip the embedded list_items key (it used to ship TWICE — once raw,
    // once as `films`, doubling every list's payload) and emit films in
    // rank order so a re-import restores every placement exactly. Each film
    // is a list_items row: its `id` is the row's own uuid, its film `film_id`.
    lists: (dbLists || []).map(({ list_items, ...rest }: Row) => ({
      ...rest,
      films: [...((list_items as Row[] | null) || [])].sort((a, b) =>
        Number(a.rank_position ?? 0) - Number(b.rank_position ?? 0) ||
        byKey(String(a.created_at ?? ''), String(b.created_at ?? ''))
      ),
    })),
  };
}

/** Whether an archive holds anything to export. */
export const holdsAnything = (a: HouseArchive): boolean =>
  a.logs.length + a.watchlist.length + a.vault.length + a.lists.length > 0;
