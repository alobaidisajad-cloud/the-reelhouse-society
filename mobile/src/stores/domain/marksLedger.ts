/**
 * marksLedger — every film a member has logged or keeps on the watchlist, known whole.
 *
 * The pages a phone reads of a member's logs (fifty at a time, and only when they open their
 * own file) and of their watchlist are a part, and a part is not the ledger: a film logged
 * before them was drawn NOT YET SEEN on its page, LOG THIS FILM filed it a second viewing, a
 * director's canon was counted short, and "you may also like" offered films already seen.
 * This reads the ledger whole, light — a log's film, status, rating, viewings and date; a
 * watchlist's films — at launch and at sign-in, and lays the pages' fuller records over it.
 * Until it has answered once, `marksKnown` says so, and what it does not hold is drawn as not
 * yet known, never as not done.
 *
 * It is one read in the house (get_marks_ledger), each column of the member's logs as one array
 * and the films they keep: one round trip and one pass over their records, however long the
 * record. Read page by page, a thousand rows at a time, a record of 10,000 took ten serial trips
 * and some 3 MB at every launch (round 13). It is read once a launch: the session's restore and
 * the boot both ask, and the second finds it just read.
 */
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import { monotonicNow } from '../../lib/waits';
import type { DomainLog } from '../../types';
import { getOfflineQueue } from '../../utils/offlineQueue';
import { useAuthStore } from '../auth';
import { useFilmStore } from '../films';
import { stillSignedIn } from './helpers/sessionGuard';
import { overlayQueuedLogs, type QueuedWrite } from './logSlice/helpers/logOperations';
import { marksWritten } from './marksWrites';

/** A log's columns as the ledger holds them: enough to say whether, how, and when it was seen. */
export const LEDGER_LOG_COLUMNS = ['id', 'film_id', 'film_title', 'poster_path', 'year', 'status', 'rating', 'view_count', 'watched_date'] as const;

type LedgerColumn = typeof LEDGER_LOG_COLUMNS[number];

/**
 * get_marks_ledger's answer, as rows: one a log, and one a film kept on the watchlist. Null when
 * the answer is not the ledger's shape (every column an array, all as long as the ids): a ledger
 * read wrong is a ledger not read.
 */
export function rowsOfLedger(answer: unknown): { logRows: Record<string, unknown>[]; watchRows: Record<string, unknown>[] } | null {
  if (!answer || typeof answer !== 'object') return null;
  const { logs, saved } = answer as { logs?: unknown; saved?: unknown };
  if (!logs || typeof logs !== 'object' || !Array.isArray(saved)) return null;
  const columns = logs as Partial<Record<LedgerColumn, unknown>>;
  const ids = columns.id;
  if (!Array.isArray(ids)) return null;
  const read: Partial<Record<LedgerColumn, unknown[]>> = {};
  for (const column of LEDGER_LOG_COLUMNS) {
    const values = columns[column];
    if (!Array.isArray(values) || values.length !== ids.length) return null;
    read[column] = values;
  }
  const logRows = ids.map((_, i) => {
    const row: Record<string, unknown> = {};
    for (const column of LEDGER_LOG_COLUMNS) row[column] = read[column]?.[i];
    return row;
  });
  return { logRows, watchRows: saved.map((filmId) => ({ film_id: filmId })) };
}

/** The ledger as read, the queue's writes laid over it, then the pages' fuller records. */
export function ledgerOf(
  memberId: string,
  logRows: readonly Record<string, unknown>[],
  watchRows: readonly Record<string, unknown>[],
  queue: readonly QueuedWrite[],
  pages: { logs: readonly DomainLog[]; watchlist: readonly { id: number }[] },
): { _loggedIndex: Record<number, DomainLog>; _watchlistIndex: Record<number, true> } {
  const { queuedAdds, page } = overlayQueuedLogs(memberId, logRows, queue);
  const logged: Record<number, DomainLog> = {};
  for (const l of [...page, ...queuedAdds]) if (l.filmId) logged[l.filmId] = { ...l, light: true };
  for (const l of pages.logs) if (l.filmId) logged[l.filmId] = l;

  const saved: Record<number, true> = {};
  for (const r of watchRows) saved[Number(r.film_id)] = true;
  for (const q of queue) {
    if (q.payload?.user_id !== undefined && q.payload.user_id !== memberId) continue;
    if (q.type === 'add_watchlist') saved[Number(q.payload.film_id)] = true;
    if (q.type === 'remove_watchlist') delete saved[Number(q.payload.film_id)];
  }
  for (const w of pages.watchlist) saved[w.id] = true;
  return { _loggedIndex: logged, _watchlistIndex: saved };
}

const reading = new Map<string, Promise<void>>();

/**
 * A ledger read whole this recently, for the member still signed in and still held, is not read
 * again: the launch asks twice (the session's restore, then the boot once RevenueCat answers), and
 * the second found a short record's read already done and read it all again. What the member does
 * meanwhile is laid on the held ledger as it happens.
 */
export const LEDGER_FRESH_MS = 30_000;
let lastRead: { memberId: string; at: number } | null = null;

/** Whether the ledger the store holds was read for this member a moment ago. */
export function ledgerJustRead(memberId: string, now: number = monotonicNow()): boolean {
  return lastRead !== null && lastRead.memberId === memberId && now - lastRead.at < LEDGER_FRESH_MS
    && useFilmStore.getState().marksKnown === 'held';
}

/**
 * Reads the member's ledger whole and lays it in the store. One read per member at a time (a
 * second call joins the first), and none when it was read a moment ago (ledgerJustRead); a read
 * that outlived a sign-out lands nowhere; a read a write overlapped is read again, once. Never
 * rejects: a ledger that could not be read is `failed`, and one already held stays held.
 */
export function readMarks(): Promise<void> {
  const memberId = useAuthStore.getState().user?.id;
  if (!memberId) return Promise.resolve();
  const running = reading.get(memberId);
  if (running) return running;
  if (ledgerJustRead(memberId)) return Promise.resolve();
  const read = (async () => {
    const current = () => stillSignedIn(memberId);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const before = marksWritten();
      const { data, error } = await supabase.rpc('get_marks_ledger');
      if (!current()) return;
      const rows = error ? null : rowsOfLedger(data);
      if (!rows) {
        if (!error) captureError(new Error('marks ledger answered out of shape'), { scope: 'marksLedger.readMarks' });
        useFilmStore.setState((s) => (s.marksKnown === 'held' ? s : { marksKnown: 'failed' }));
        return;
      }
      // A write landed while this read: what it read may be older than the write. Once more.
      if (marksWritten() !== before && attempt === 0) continue;
      useFilmStore.setState((s) => ({
        ...ledgerOf(memberId, rows.logRows, rows.watchRows, getOfflineQueue() as QueuedWrite[], { logs: s.logs, watchlist: s.watchlist }),
        marksKnown: 'held',
      }));
      lastRead = { memberId, at: monotonicNow() };
      return;
    }
  })().catch((e: unknown) => {
    captureError(e, { scope: 'marksLedger.readMarks' });
    if (stillSignedIn(memberId)) useFilmStore.setState((s) => (s.marksKnown === 'held' ? s : { marksKnown: 'failed' }));
  }).finally(() => { reading.delete(memberId); });
  reading.set(memberId, read);
  return read;
}
