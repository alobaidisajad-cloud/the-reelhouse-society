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
 */
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/sentry';
import type { DomainLog } from '../../types';
import { getOfflineQueue } from '../../utils/offlineQueue';
import { useAuthStore } from '../auth';
import { useFilmStore } from '../films';
import { stillSignedIn } from './helpers/sessionGuard';
import { overlayQueuedLogs, type QueuedWrite } from './logSlice/helpers/logOperations';
import { marksWritten } from './marksWrites';

/** A log as the ledger holds it: enough to say whether, how, and when it was seen. */
export const LEDGER_LOG_COLUMNS = 'id, user_id, film_id, film_title, poster_path, year, status, rating, view_count, watched_date, created_at' as const;
const PAGE = 1000;
/** Past this many pages the ledger is only part-read, and a part is not the ledger. */
const MAX_PAGES = 30;

/** One page of a table, after the id given; each read names its own table. */
type PageRead = (after: string | null) => PromiseLike<{ data: unknown; error: unknown }>;
const logPage = (memberId: string): PageRead => (after) => {
  const q = supabase.from('logs').select(LEDGER_LOG_COLUMNS).eq('user_id', memberId).order('id').limit(PAGE);
  return after ? q.gt('id', after) : q;
};
const savePage = (memberId: string): PageRead => (after) => {
  const q = supabase.from('watchlists').select('id, user_id, film_id').eq('user_id', memberId).order('id').limit(PAGE);
  return after ? q.gt('id', after) : q;
};

/** Every row of one of the member's tables, by id, a page at a time; null when a page failed. */
async function readAll(table: string, page: PageRead, current: () => boolean) {
  const rows: Record<string, unknown>[] = [];
  let after: string | null = null;
  for (let n = 0; n < MAX_PAGES; n += 1) {
    const { data, error } = await page(after);
    if (!current()) return null;
    if (error || !data) return null;
    const got = data as unknown as Record<string, unknown>[];
    rows.push(...got);
    if (got.length < PAGE) return rows;
    after = String(got[got.length - 1]?.id);
  }
  captureError(new Error('marks ledger past its page cap'), { scope: 'marksLedger.readMarks', table, pages: MAX_PAGES });
  return null;
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
 * Reads the member's ledger whole and lays it in the store. One read per member at a time (a
 * second call joins the first); a read that outlived a sign-out lands nowhere; a read a write
 * overlapped is read again, once. Never rejects: a ledger that could not be read is `failed`,
 * and one already held stays held.
 */
export function readMarks(): Promise<void> {
  const memberId = useAuthStore.getState().user?.id;
  if (!memberId) return Promise.resolve();
  const running = reading.get(memberId);
  if (running) return running;
  const read = (async () => {
    const current = () => stillSignedIn(memberId);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const before = marksWritten();
      const [logRows, watchRows] = await Promise.all([
        readAll('logs', logPage(memberId), current),
        readAll('watchlists', savePage(memberId), current),
      ]);
      if (!current()) return;
      if (!logRows || !watchRows) {
        useFilmStore.setState((s) => (s.marksKnown === 'held' ? s : { marksKnown: 'failed' }));
        return;
      }
      // A write landed while this read: what it read may be older than the write. Once more.
      if (marksWritten() !== before && attempt === 0) continue;
      useFilmStore.setState((s) => ({
        ...ledgerOf(memberId, logRows, watchRows, getOfflineQueue() as QueuedWrite[], { logs: s.logs, watchlist: s.watchlist }),
        marksKnown: 'held',
      }));
      return;
    }
  })().catch((e: unknown) => {
    captureError(e, { scope: 'marksLedger.readMarks' });
    if (stillSignedIn(memberId)) useFilmStore.setState((s) => (s.marksKnown === 'held' ? s : { marksKnown: 'failed' }));
  }).finally(() => { reading.delete(memberId); });
  reading.set(memberId, read);
  return read;
}
